import "dotenv/config";
import express from "express";
import { spawn, exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key";

app.use(cors());
app.use(express.json());

// Serve static frontend files from the public folder
app.use(express.static(path.join(__dirname, "public")));

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashedPassword,
      },
    });
    res.status(201).json({ success: true, userId: user.id });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ success: true, token });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Failed to log in" });
  }
});

const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.get(
  "/api/profile/submissions",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const submissions = await prisma.submission.findMany({
        where: {
          userId: req.user.userId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  },
);

app.post("/submit", async (req, res) => {
  console.log("Received Body:", req.body);
  const { sourceCode, language = "cpp" } = req.body;
  // Ensure problemId is captured and converted to a Number if provided
  let problemIdRaw = (req.body && req.body.problemId) as any;
  let problemId: number | undefined = undefined;
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
    const createData: any = {
      code: sourceCode,
      status: "Pending",
      language,
    };
    if (typeof problemId !== "undefined") createData.problemId = problemId;
    const submission = await prisma.submission.create({
      data: createData,
    });

    res.json({
      success: true,
      submissionId: submission.id,
      message: "Submission created",
    });
    // Save source file for background judging (use absolute path)
    const fileExtension = language === "python" ? "py" : "cpp";
    const filePath = path.join(
      __dirname,
      `submission_${submission.id}.${fileExtension}`,
    );
    fs.writeFileSync(filePath, sourceCode);
    console.log("Saved submission file at", filePath);

    // Kick off background judge (do not await)
    judgeSubmission(submission.id).catch((err) =>
      console.error("judgeSubmission error:", err),
    );
  } catch (error) {
    console.error("Error creating submission:", error);
    res.status(500).json({ error: "Failed to create submission" });
  }
});

async function judgeSubmission(submissionId: number): Promise<void> {
  // Fetch submission to get problemId and related info
  let submissionRecord: any = null;
  try {
    submissionRecord = await prisma.submission.findUnique({
      where: { id: submissionId },
    });
  } catch (e) {
    console.error("Failed to fetch submission record:", e);
  }

  const language = submissionRecord?.language || "cpp"; // Default to cpp
  const isPython = language === "python";

  const fileName = `submission_${submissionId}.${isPython ? "py" : "cpp"}`;
  const exeName = `submission_${submissionId}_run`;
  const filePath = path.join(__dirname, fileName);
  const exePath = path.join(__dirname, exeName);

  const problemId = submissionRecord?.problemId;
  if (!problemId) {
    try {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "Runtime Error (RTE)" },
      });
    } catch (e) {
      console.error("Failed to set RTE status (missing problemId):", e);
    }
    return;
  }

  // Get time limit from Problem if available
  let timeLimitMs = 1000;
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });
    if (problem && typeof problem.timeLimitMs === "number")
      timeLimitMs = problem.timeLimitMs;
  } catch (e) {
    console.error("Failed to fetch problem info:", e);
  }

  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Compiling" },
    });
  } catch (err) {
    console.error("Failed to set status Compiling:", err);
  }

  const projectRoot = process.cwd();

  // helper to run docker commands and capture output + timeout
  const runDocker = (
    args: string[],
    input?: string,
    timeoutMs?: number,
  ): Promise<{
    code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }> => {
    return new Promise((resolve) => {
      const child = spawn("docker", args, {
        cwd: projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let timer: NodeJS.Timeout | null = null;

      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGKILL");
          } catch (e) {}
        }, timeoutMs);
      }

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({
          code: null,
          signal: null,
          stdout,
          stderr: stderr + String(err),
          timedOut,
        });
      });

      child.on("close", (code, signal) => {
        if (timer) clearTimeout(timer);
        resolve({ code, signal, stdout, stderr, timedOut });
      });

      try {
        if (input && child.stdin) {
          child.stdin.write(input);
          child.stdin.end();
        } else if (child.stdin) {
          child.stdin.end();
        }
      } catch (e) {}
    });
  };

  // Compile inside Docker (mount project root to /app and run in /app)
  if (!isPython) {
    const compileArgs = [
      "run",
      "--rm",
      "-v",
      `${projectRoot}:/app`,
      "-w",
      "/app",
      "judge-box",
      "g++",
      fileName,
      "-o",
      exeName,
    ];

    const compileRes = await runDocker(compileArgs, undefined, 20000);
    if (compileRes.timedOut || compileRes.code !== 0) {
      const compileOut = compileRes.stderr || compileRes.stdout || "";
      console.error("Compile failed:", compileOut);
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: "Compile Error (CE)", compileOutput: compileOut },
        });
      } catch (e) {
        console.error("Failed to set CE status:", e);
      }
      return;
    }
  }

  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Running" },
    });
  } catch (err) {
    console.error("Failed to set status Running:", err);
  }

  // Locate testcases directory (try plural and singular folder names)
  const candidates = [
    path.join(projectRoot, "problems", String(problemId), "testcases"),
    path.join(projectRoot, "problem", String(problemId), "testcases"),
  ];
  let testcasesDir: string | null = null;
  for (const c of candidates)
    if (fs.existsSync(c)) {
      testcasesDir = c;
      break;
    }

  let inFiles: string[] = [];
  if (testcasesDir) {
    inFiles = fs
      .readdirSync(testcasesDir)
      .filter((f) => f.endsWith(".in"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } else {
    const inputPath = path.join(__dirname, "input.txt");
    const expectedPath = path.join(__dirname, "expected.txt");
    if (fs.existsSync(inputPath) && fs.existsSync(expectedPath)) {
      inFiles = ["__single__"];
    } else {
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: "Wrong Answer (WA)" },
        });
      } catch (e) {
        console.error("Failed to set WA status (no testcases):", e);
      }
      return;
    }
  }

  // Helper to cleanup generated files
  const cleanup = () => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
    try {
      const hostExe = path.join(projectRoot, exeName);
      if (fs.existsSync(hostExe)) fs.unlinkSync(hostExe);
    } catch (e) {}
  };

  // Track max time and memory across tests
  let maxTimeMs = 0;
  let maxMemoryKb = 0;

  function parseTimeAndMemory(stderr: string): {
    timeMs: number | null;
    memoryKb: number | null;
  } {
    if (!stderr) return { timeMs: null, memoryKb: null };
    let timeMs: number | null = null;
    let memoryKb: number | null = null;
    const lines = stderr.split(/\r?\n/);
    for (const raw of lines) {
      const s = raw.trim();
      if (!s) continue;

      // Elapsed (wall clock) time (h:mm:ss or m:ss): 0:00.01
      const mElapsed = s.match(/Elapsed.*time.*:\s*(.+)$/i);
      if (mElapsed) {
        const tstr = mElapsed[1].trim();
        const parts = tstr.split(":").map((p) => p.trim());
        let seconds = NaN;
        if (parts.length === 3) {
          const h = parseFloat(parts[0]) || 0;
          const m = parseFloat(parts[1]) || 0;
          const sec = parseFloat(parts[2]) || 0;
          seconds = h * 3600 + m * 60 + sec;
        } else if (parts.length === 2) {
          const m = parseFloat(parts[0]) || 0;
          const sec = parseFloat(parts[1]) || 0;
          seconds = m * 60 + sec;
        } else {
          seconds = parseFloat(tstr);
        }
        if (!Number.isNaN(seconds)) timeMs = Math.round(seconds * 1000);
      }

      // User time (seconds): 0.01
      const mUser = s.match(/User time \(seconds\):\s*([0-9.]+)/i);
      if (mUser) {
        const secs = parseFloat(mUser[1]);
        if (!Number.isNaN(secs))
          timeMs = Math.max(timeMs || 0, Math.round(secs * 1000));
      }

      // Maximum resident set size (kbytes): 12345
      const mMem =
        s.match(/Maximum resident set size .*:\s*([0-9]+)/i) ||
        s.match(/Maximum resident set size \(kbytes\):\s*([0-9]+)/i);
      if (mMem) {
        const kb = parseInt(mMem[1], 10);
        if (!Number.isNaN(kb)) memoryKb = Math.max(memoryKb || 0, kb);
      }
    }
    return { timeMs, memoryKb };
  }

  // Run each testcase inside Docker
  for (let i = 0; i < inFiles.length; ++i) {
    const inFile = inFiles[i];
    let inPath: string;
    let outPath: string;
    if (inFile === "__single__") {
      inPath = path.join(__dirname, "input.txt");
      outPath = path.join(__dirname, "expected.txt");
    } else {
      const base = inFile.replace(/\.in$/, "");
      inPath = path.join(testcasesDir as string, inFile);
      outPath = path.join(testcasesDir as string, `${base}.out`);
    }

    const inputData = fs.existsSync(inPath)
      ? fs.readFileSync(inPath, "utf8")
      : "";
    const expectedData = fs.existsSync(outPath)
      ? fs.readFileSync(outPath, "utf8")
      : "";

    const runTimeout = Math.max(1000, timeLimitMs + 200);
    const winPath = inPath.replace(/\//g, "\\");
    const cmdStr = `type "${winPath}" | docker run -i --rm -v "${projectRoot}:/app" -w /app --memory=128m --cpus=0.5 judge-box /usr/bin/time -v ${isPython ? `python3 ${fileName}` : `./${exeName}`}`;

    const runRes = await new Promise<{
      code: number | null;
      signal: string | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      exec(cmdStr, { timeout: runTimeout }, (error: any, stdout, stderr) => {
        resolve({
          code: error ? (error.code !== undefined ? error.code : null) : 0,
          signal: error
            ? error.signal !== undefined
              ? error.signal
              : null
            : null,
          stdout: stdout ? stdout.toString() : "",
          stderr: stderr ? stderr.toString() : "",
          timedOut: error ? !!error.killed : false,
        });
      });
    });

    const testNum = i + 1;
    // Log raw outputs to help debug whitespace/newline issues
    const userOutputRaw = runRes.stdout || "";
    const expectedRaw = expectedData || "";
    console.log(
      "Test Case:",
      inFile,
      "User Output:",
      [userOutputRaw],
      "Expected:",
      [expectedRaw],
    );

    // parse time & memory from stderr (time -v output is written to stderr)
    const parsedUsage = parseTimeAndMemory(runRes.stderr || "");
    if (parsedUsage.timeMs) maxTimeMs = Math.max(maxTimeMs, parsedUsage.timeMs);
    if (parsedUsage.memoryKb)
      maxMemoryKb = Math.max(maxMemoryKb, parsedUsage.memoryKb);

    if (runRes.timedOut) {
      const statusText = `Time Limit Exceeded (TLE) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: statusText, time: maxTimeMs, memory: maxMemoryKb },
        });
      } catch (e) {
        console.error("Failed to set TLE status:", e);
      }
      cleanup();
      return;
    }

    if (runRes.code !== 0) {
      const statusText = `Runtime Error (RTE) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: statusText, time: maxTimeMs, memory: maxMemoryKb },
        });
      } catch (e) {
        console.error("Failed to set RTE status:", e);
      }
      cleanup();
      return;
    }

    // Compare trimmed outputs to ignore leading/trailing whitespace differences
    const outTrim = userOutputRaw.trim();
    const expTrim = expectedRaw.trim();
    if (outTrim !== expTrim) {
      const statusText = `Wrong Answer (WA) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: statusText, time: maxTimeMs, memory: maxMemoryKb },
        });
      } catch (e) {
        console.error("Failed to set WA status:", e);
      }
      cleanup();
      return;
    }
  }

  // All tests passed
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Accepted (AC)", time: maxTimeMs, memory: maxMemoryKb },
    });
  } catch (e) {
    console.error("Failed to set AC status:", e);
  }
  cleanup();
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

app.get("/leaderboard", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        submissions: {
          where: {
            status: "Accepted (AC)",
          },
          select: {
            problemId: true,
          },
        },
      },
    });

    const leaderboard = users
      .map((user) => {
        const solvedProblems = new Set(
          user.submissions.map((s) => s.problemId),
        );
        return {
          username: user.username,
          solvedCount: solvedProblems.size,
        };
      })
      .sort((a, b) => b.solvedCount - a.solvedCount);

    res.json(leaderboard);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Return list of problems for the frontend dropdown
app.get("/problems", async (_req, res) => {
  try {
    const problems = await prisma.problem.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        timeLimitMs: true,
        memoryLimitKb: true,
      },
    });
    return res.json(problems);
  } catch (err) {
    console.error("Failed to fetch problems:", err);
    return res.status(500).json({ error: "Failed to fetch problems" });
  }
});

// Maximum allowed source code size (64 KiB)
const MAX_CODE_BYTES = 64 * 1024;

app.post("/api/submit", async (req, res) => {
  const safeSend = (statusCode: number, data: any) => {
    if (!res.headersSent) {
      res.status(statusCode).json(data);
    }
  };

  const { code, userId = 1, problemId = 1, language = "cpp" } = req.body;
  const isPython = language === "python";

  // ---- basic validation ----
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({
      error:
        "Vui lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ng gÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­i code!",
    });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(413).json({
      error:
        "Payload quÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Âºn (giÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Âºi hÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡n 64KB)",
    });
  }
  if (!Number.isInteger(userId) || !Number.isInteger(problemId)) {
    return res.status(400).json({
      error:
        "userId / problemId khÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´ng hÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£p lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡",
    });
  }

  // ---- write to a unique temp folder ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));
  const fileExtension = isPython ? "py" : "cpp";
  const srcPath = path.join(tmpDir, `submission.${fileExtension}`);
  fs.writeFileSync(srcPath, code);
  console.log(
    "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âang chÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥m bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â i...",
  );

  // Create DB record early so we can update status mid-judging
  let submissionRecord: any = null;
  try {
    submissionRecord = await prisma.submission.create({
      data: { userId, problemId, code, language, status: "Compiling" },
    });
  } catch (dbErr) {
    console.error("DB create error:", dbErr);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
    return safeSend(500, {
      error:
        "LÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Âi lÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°u vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â o database",
    });
  }

  // ---- compile submission.cpp with g++ ----
  const exePath = path.join(tmpDir, "submission.exe");
  if (!isPython) {
    const compile = spawn("g++", [srcPath, "-o", exePath], {
      cwd: tmpDir,
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let compileStderr = "";
    compile.stderr.on("data", (data) => (compileStderr += data.toString()));

    const compileSuccess = await new Promise<boolean>((resolve) => {
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
          data: { status: "Compile Error (CE)", compileOutput: compileStderr },
        });
      } catch (e) {
        console.error("Failed to set CE status:", e);
      }
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {}
      }
      return safeSend(200, {
        status: "Compile Error (CE)",
        submission_id: submissionRecord.id,
        details: compileStderr,
      });
    }
  }

  try {
    await prisma.submission.update({
      where: { id: submissionRecord.id },
      data: { status: "Running" },
    });
  } catch (e) {
    console.error("Failed to set Running status:", e);
  }

  // Locate testcases directory for the problem
  const testcasesDir = path.join(
    __dirname,
    "problems",
    String(problemId),
    "testcases",
  );
  let inFiles: string[] = [];
  if (fs.existsSync(testcasesDir)) {
    inFiles = fs
      .readdirSync(testcasesDir)
      .filter((f) => f.endsWith(".in"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  // Fallback to single input/expected in repo root if no testcases found
  if (inFiles.length === 0) {
    const inputPath = path.join(__dirname, "input.txt");
    const expectedPath = path.join(__dirname, "expected.txt");
    if (fs.existsSync(inputPath) && fs.existsSync(expectedPath)) {
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
        fs.rmSync(tmpDir, { recursive: true, force: true });
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
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };

  // Loop through testcases
  for (const inFile of inFiles) {
    let inPath: string;
    let outPath: string;
    if (inFile === "__single__") {
      inPath = path.join(__dirname, "input.txt");
      outPath = path.join(__dirname, "expected.txt");
    } else {
      const base = inFile.replace(/\.in$/, "");
      inPath = path.join(testcasesDir, inFile);
      outPath = path.join(testcasesDir, `${base}.out`);
    }

    const inputData = fs.existsSync(inPath)
      ? fs.readFileSync(inPath, "utf8")
      : "";
    const expectedData = fs.existsSync(outPath)
      ? fs.readFileSync(outPath, "utf8")
      : "";

    const testResult = await new Promise<{
      kind: "AC" | "WA" | "TLE" | "RTE";
      stdout?: string;
      stderr?: string;
    }>((resolve) => {
      const runOpts = isPython
        ? { exe: "python3", args: [srcPath] }
        : { exe: exePath, args: [] };

      const run = spawn(runOpts.exe, runOpts.args, {
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
          const userOutputRaw = stdout || "";
          const expectedRaw = expectedData || "";
          console.log(
            "Test Case:",
            inFile,
            "User Output:",
            [userOutputRaw],
            "Expected:",
            [expectedRaw],
          );
          const outTrim = userOutputRaw.trim();
          const expTrim = expectedRaw.trim();
          if (outTrim === expTrim) {
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
app.listen(PORT, () => {
  console.log(`🚀 Server is ready at port ${PORT}`);
});
