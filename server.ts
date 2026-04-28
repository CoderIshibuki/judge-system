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

app.post("/api/submit", async (req, res) => {
  const { code, userId = 1, problemId = 1 } = req.body;

  // ---- basic validation ----
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Vui lòng gửi code!" });
  }
  if (!Number.isInteger(userId) || !Number.isInteger(problemId)) {
    return res.status(400).json({ error: "userId / problemId không hợp lệ" });
  }

  // ---- write to a unique temp file to avoid race conditions ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));
  const srcPath = path.join(tmpDir, "submission.cpp");
  fs.writeFileSync(srcPath, code);
  console.log("📝 Đang chấm bài...");

  // ---- run judge.exe safely ----
  const judge = spawn("./judge.exe", [], {
    cwd: process.cwd(),
    timeout: 15_000, // 15 s timeout
    stdio: ["ignore", "pipe", "pipe"],
  });

  // pipe the temp file into judge.exe (if it reads stdin)
  // If judge.exe expects the file on disk, we already wrote it.
  // No stdin is needed here.

  let stdout = "";
  let stderr = "";

  judge.stdout.on("data", (data) => (stdout += data.toString()));
  judge.stderr.on("data", (data) => (stderr += data.toString()));

  judge.on("error", (err) => {
    console.error("Judge spawn error:", err);
    cleanup();
    return res
      .status(500)
      .json({ error: "Judge execution failed", details: err.message });
  });

  judge.on("close", async (code) => {
    cleanup();

    if (code !== 0) {
      console.error("Judge exited with code", code, "stderr:", stderr);
      return res
        .status(500)
        .json({ error: "Judge execution failed", details: stderr });
    }

    // ---- robust status extraction ----
    const statusLine = stdout
      .split("\n")
      .find((l) => l.includes("STATUS:"))
      ?.replace("STATUS:", "")
      .trim();
    const finalStatus = statusLine || "CE";

    try {
      const newSubmission = await prisma.submission.create({
        data: {
          userId,
          problemId,
          sourceCode: code,
          status: finalStatus,
        },
      });
      res.json({ status: finalStatus, submission_id: newSubmission.id });
    } catch (dbError) {
      console.error("Lỗi lưu DB:", dbError);
      res.status(500).json({ error: "Lỗi lưu vào database" });
    }
  });

  // ---- cleanup temp directory ----
  function cleanup() {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  }
});

// ---- listen on env PORT if provided ----
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => console.log(`🚀 Server sẵn sàng tại cổng ${PORT}`));
