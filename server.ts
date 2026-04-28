import "dotenv/config";
import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

const app = express();

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.send('<h1 style="color: green;">🚀 Judge Server đang hoạt động!</h1>');
});

// Maximum allowed source code size (64 KiB)
const MAX_CODE_BYTES = 64 * 1024;

app.post("/api/submit", async (req, res) => {
  const safeSend = (statusCode: number, data: any) => {
    if (!res.headersSent) {
      res.status(statusCode).json(data);
    }
  };

  const { code, userId = 1, problemId = 1 } = req.body;

  // ---- basic validation ----
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Vui lòng gửi code!" });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(413).json({ error: "Payload quá lớn (giới hạn 64KB)" });
  }
  if (!Number.isInteger(userId) || !Number.isInteger(problemId)) {
    return res.status(400).json({ error: "userId / problemId không hợp lệ" });
  }

  // ---- write to a unique temp folder ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));
  const srcPath = path.join(tmpDir, "submission.cpp");
  fs.writeFileSync(srcPath, code);
  console.log("📝 Đang chấm bài...");

  // ---- compile submission.cpp with g++ and run the resulting executable ----
  const exePath = path.join(tmpDir, "submission.exe");
  const compile = spawn("g++", [srcPath, "-o", exePath], {
    cwd: tmpDir,
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let compileStderr = "";
  compile.stderr.on("data", (data) => (compileStderr += data.toString()));

  compile.on("error", (err) => {
    console.error("Compile error:", err);
    safeSend(500, { error: "Compilation failed" });
  });

  compile.on("close", (closeCode) => {
    if (closeCode !== 0) {
      console.error("g++ exited with", closeCode, compileStderr);
      safeSend(500, { error: "Compilation failed", details: compileStderr });
      return;
    }
    // Run the compiled executable
    const judge = spawn(exePath, { cwd: tmpDir, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    judge.stdout.on("data", (data) => (stdout += data.toString()));
    judge.stderr.on("data", (data) => (stderr += data.toString()));
    judge.on("error", (err) => {
      console.error("Judge spawn error:", err);
      safeSend(500, { error: "Judge execution failed" });
    });
    judge.on("close", async (exitCode) => {
      if (exitCode !== 0) {
        console.error("Judge exited with code", exitCode, "stderr:", stderr);
        safeSend(500, { error: "Judge execution failed", details: stderr });
        return;
      }
      const statusLine = stdout
        .split("\n")
        .find((l) => l.includes("STATUS:"))
        ?.replace("STATUS:", "")
        .trim();
      const finalStatus = statusLine || "CE";
      try {
        const newSubmission = await prisma.submission.create({
          data: { userId, problemId, sourceCode: code, status: finalStatus },
        });
        safeSend(200, { status: finalStatus, submission_id: newSubmission.id });
      } catch (dbError) {
        console.error("DB error:", dbError);
        safeSend(500, { error: "Lỗi lưu vào database" });
      }
    });
  });
});

// ---- listen on env PORT if provided ----
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => console.log(`🚀 Server sẵn sàng tại cổng ${PORT}`));
