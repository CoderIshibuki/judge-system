"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (_, res) => {
  res.send('<h1 style="color: green;">🚀 Judge Server đang hoạt động!</h1>');
});
app.post("/submit", async (req, res) => {
  console.log("Received Body:", req.body);
  const { sourceCode } = req.body;
  let problemIdRaw = req.body && req.body.problemId;
  let problemId = undefined;
  if (typeof problemIdRaw !== "undefined" && problemIdRaw !== null) {
    const parsed = Number(problemIdRaw);
    if (!Number.isNaN(parsed)) problemId = parsed;
  }
  if (typeof sourceCode !== "string") {
    return res
      .status(400)
      .json({ error: "Invalid or missing sourceCode string" });
  }
  try {
    const createData = { code: sourceCode, status: "Pending" };
    if (typeof problemId !== "undefined") createData.problemId = problemId;
    const submission = await prisma.submission.create({
      data: createData,
    });
    res.json({
      success: true,
      submissionId: submission.id,
      message: "Submission created",
    });

    const filePath = path_1.default.join(
      __dirname,
      "submission_" + submission.id + ".cpp",
    );
    fs_1.default.writeFileSync(filePath, sourceCode);
    console.log("Saved submission file at", filePath);

    judgeSubmission(submission.id).catch((err) =>
      console.error("judgeSubmission error:", err),
    );
  } catch (error) {
    console.error("Error creating submission:", error);
    res.status(500).json({ error: "Failed to create submission" });
  }
});
async function judgeSubmission(submissionId) {
  const fileName = `submission_${submissionId}.cpp`;
  const exeName = `submission_${submissionId}_run.exe`;
  const filePath = path_1.default.join(__dirname, fileName);
  const exePath = path_1.default.join(__dirname, exeName);
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Compiling" },
    });
  } catch (err) {
    console.error("Failed to set status Compiling:", err);
  }

  const compileCmd = `g++ "${filePath}" -o "${exePath}"`;
  const compileSuccess = await new Promise((resolve) => {
    (0, child_process_1.exec)(
      compileCmd,
      { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 },
      async (error, _stdout, stderr) => {
        if (stderr) console.error("Compiler Stderr:", stderr);
        if (error) {
          try {
            await prisma.submission.update({
              where: { id: submissionId },
              data: { status: "Compile Error (CE)" },
            });
          } catch (e) {
            console.error("Failed to set CE status:", e);
          }
          return resolve(false);
        }
        return resolve(true);
      },
    );
  });
  if (!compileSuccess) {
    return;
  }
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Running" },
    });
  } catch (err) {
    console.error("Failed to set status Running:", err);
  }
  const inputPath = path_1.default.join(__dirname, "input.txt");
  const expectedPath = path_1.default.join(__dirname, "expected.txt");
  let inputData = "";
  let expectedData = "";
  try {
    if (fs_1.default.existsSync(inputPath))
      inputData = fs_1.default.readFileSync(inputPath, "utf8");
  } catch (e) {
    inputData = "";
  }
  try {
    if (fs_1.default.existsSync(expectedPath))
      expectedData = fs_1.default.readFileSync(expectedPath, "utf8");
  } catch (e) {
    expectedData = "";
  }
  await new Promise((resolve) => {
    const runProc = (0, child_process_1.exec)(
      `"${exePath}"`,
      { cwd: __dirname, timeout: 1000, maxBuffer: 10 * 1024 * 1024 },
      async (error, stdout, _stderr) => {
        try {
          if (error) {
            const errAny = error;
            const isTimeout =
              !!errAny.killed ||
              errAny.signal === "SIGTERM" ||
              (errAny.message && errAny.message.includes("timed out"));
            if (isTimeout) {
              try {
                await prisma.submission.update({
                  where: { id: submissionId },
                  data: { status: "Time Limit Exceeded (TLE)" },
                });
              } catch (e) {
                console.error("Failed to set TLE status:", e);
              }
            } else {
              try {
                await prisma.submission.update({
                  where: { id: submissionId },
                  data: { status: "Runtime Error (RTE)" },
                });
              } catch (e) {
                console.error("Failed to set RTE status:", e);
              }
            }
          } else {
            const trimTrailing = (s) => s.replace(/[\s\n\r]+$/, "");
            const outTrim = trimTrailing(stdout || "");
            const expTrim = trimTrailing(expectedData || "");
            try {
              if (outTrim === expTrim) {
                await prisma.submission.update({
                  where: { id: submissionId },
                  data: { status: "Accepted (AC)" },
                });
              } else {
                await prisma.submission.update({
                  where: { id: submissionId },
                  data: { status: "Wrong Answer (WA)" },
                });
              }
            } catch (e) {
              console.error("Failed to set final status:", e);
            }
          }
        } catch (e) {
          console.error("Error handling run result:", e);
        } finally {

          resolve();
        }
      },
    );
    if (runProc && runProc.stdin) {
      try {
        runProc.stdin.write(inputData);
        runProc.stdin.end();
      } catch (e) {}
    }
  });
}
app.get("/submission/:id", async (req, res) => {
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: "Invalid submission ID" });
  }
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }
    res.json({ success: true, submission });
  } catch (error) {
    console.error("Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

const MAX_CODE_BYTES = 64 * 1024;
app.post("/api/submit", async (req, res) => {
  const safeSend = (statusCode, data) => {
    if (!res.headersSent) {
      res.status(statusCode).json(data);
    }
  };
  const { code, userId = 1, problemId = 1 } = req.body;

  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Vui lòng gửi code!" });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(413).json({ error: "Payload quá lớn (giới hạn 64KB)" });
  }
  if (!Number.isInteger(userId) || !Number.isInteger(problemId)) {
    return res.status(400).json({ error: "userId / problemId không hợp lệ" });
  }

  const tmpDir = fs_1.default.mkdtempSync(
    path_1.default.join(os_1.default.tmpdir(), "judge-"),
  );
  const srcPath = path_1.default.join(tmpDir, "submission.cpp");
  fs_1.default.writeFileSync(srcPath, code);
  console.log("📝 Đang chấm bài...");

  let submissionRecord = null;
  try {
    submissionRecord = await prisma.submission.create({
      data: { userId, problemId, code, status: "Compiling" },
    });
  } catch (dbErr) {
    console.error("DB create error:", dbErr);
    try {
      fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    return safeSend(500, { error: "Lỗi lưu vào database" });
  }

  const exePath = path_1.default.join(tmpDir, "submission.exe");
  const compile = (0, child_process_1.spawn)("g++", [srcPath, "-o", exePath], {
    cwd: tmpDir,
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let compileStderr = "";
  compile.stderr.on("data", (data) => (compileStderr += data.toString()));
  const compileSuccess = await new Promise((resolve) => {
    compile.on("error", (err) => {
      console.error("Compile error:", err);
      resolve(false);
    });
    compile.on("close", (code) => {
      resolve(code === 0);
    });
  });
  if (!compileSuccess) {
    console.error("g++ exited with errors:", compileStderr);
    try {
      await prisma.submission.update({
        where: { id: submissionRecord.id },
        data: { status: "Compile Error (CE)" },
      });
    } catch (e) {
      console.error("Failed to set CE status:", e);
    }
    try {
      fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    return safeSend(200, {
      status: "Compile Error (CE)",
      submission_id: submissionRecord.id,
      details: compileStderr,
    });
  }
  try {
    await prisma.submission.update({
      where: { id: submissionRecord.id },
      data: { status: "Running" },
    });
  } catch (e) {
    console.error("Failed to set Running status:", e);
  }

  const testcasesDir = path_1.default.join(
    __dirname,
    "problems",
    String(problemId),
    "testcases",
  );
  let inFiles = [];
  if (fs_1.default.existsSync(testcasesDir)) {
    inFiles = fs_1.default
      .readdirSync(testcasesDir)
      .filter((f) => f.endsWith(".in"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  if (inFiles.length === 0) {
    const inputPath = path_1.default.join(__dirname, "input.txt");
    const expectedPath = path_1.default.join(__dirname, "expected.txt");
    if (
      fs_1.default.existsSync(inputPath) &&
      fs_1.default.existsSync(expectedPath)
    ) {
      inFiles = ["__single__"];
    } else {
      try {
        await prisma.submission.update({
          where: { id: submissionRecord.id },
          data: { status: "Wrong Answer (WA)" },
        });
      } catch (e) {
        console.error("Failed to set WA status:", e);
      }
      try {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
      return safeSend(200, {
        status: "Wrong Answer (WA)",
        submission_id: submissionRecord.id,
        message: "No testcases found",
      });
    }
  }
  const cleanupTmp = () => {
    try {
      fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };

  for (const inFile of inFiles) {
    let inPath;
    let outPath;
    if (inFile === "__single__") {
      inPath = path_1.default.join(__dirname, "input.txt");
      outPath = path_1.default.join(__dirname, "expected.txt");
    } else {
      const base = inFile.replace(/\.in$/, "");
      inPath = path_1.default.join(testcasesDir, inFile);
      outPath = path_1.default.join(testcasesDir, `${base}.out`);
    }
    const inputData = fs_1.default.existsSync(inPath)
      ? fs_1.default.readFileSync(inPath, "utf8")
      : "";
    const expectedData = fs_1.default.existsSync(outPath)
      ? fs_1.default.readFileSync(outPath, "utf8")
      : "";
    const testResult = await new Promise((resolve) => {
      const run = (0, child_process_1.spawn)(exePath, {
        cwd: tmpDir,
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      run.stdout.on("data", (d) => (stdout += d.toString()));
      run.stderr.on("data", (d) => (stderr += d.toString()));
      run.on("error", (err) => {
        console.error("Judge spawn error:", err);
        resolve({ kind: "RTE", stderr: String(err) });
      });
      run.on("close", (code, signal) => {
        if (signal) {
          resolve({ kind: "TLE", stdout, stderr });
        } else if (code !== 0) {
          resolve({ kind: "RTE", stdout, stderr });
        } else {
          const trimTrailing = (s) => s.replace(/[\s\n\r]+$/, "");
          if (trimTrailing(stdout || "") === trimTrailing(expectedData || "")) {
            resolve({ kind: "AC", stdout });
          } else {
            resolve({ kind: "WA", stdout });
          }
        }
      });
      try {
        if (run.stdin) {
          run.stdin.write(inputData);
          run.stdin.end();
        }
      } catch (e) {}
    });
    if (testResult.kind !== "AC") {
      const dbStatus =
        testResult.kind === "WA"
          ? "Wrong Answer (WA)"
          : testResult.kind === "TLE"
            ? "Time Limit Exceeded (TLE)"
            : "Runtime Error (RTE)";
      try {
        await prisma.submission.update({
          where: { id: submissionRecord.id },
          data: { status: dbStatus },
        });
      } catch (e) {
        console.error("Failed to set failure status:", e);
      }
      cleanupTmp();
      return safeSend(200, {
        status: dbStatus,
        submission_id: submissionRecord.id,
        details: testResult.stderr || undefined,
      });
    }
  }
  // All tests passed
  try {
    await prisma.submission.update({
      where: { id: submissionRecord.id },
      data: { status: "Accepted (AC)" },
    });
  } catch (e) {
    console.error("Failed to set AC status:", e);
  }
  cleanupTmp();
  return safeSend(200, {
    status: "Accepted (AC)",
    submission_id: submissionRecord.id,
  });
});
// ---- listen on env PORT if provided ----
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => console.log(`🚀 Server sẵn sàng tại cổng ${PORT}`));
