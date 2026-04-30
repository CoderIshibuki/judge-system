import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { spawn, exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const prisma = new PrismaClient().$extends({
  query: {
    submission: {
      async update({ args, query }) {
        const result = await query(args);
        io.emit("submission_update", result);
        return result;
      },
      async create({ args, query }) {
        const result = await query(args);
        io.emit("submission_update", result);
        return result;
      },
    },
  },
});

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

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
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

const isAdmin = async (req: any, res: any, next: any) => {
  if (!req.user || !req.user.userId) return res.sendStatus(401);
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!req.user || req.user.role !== "ADMIN") return res.sendStatus(403);
    next();
  } catch (err) {
    res.sendStatus(500);
  }
};

app.post(
  "/api/problems",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      // Nhận thêm biến points
      const { title, description, timeLimitMs, memoryLimitKb, points } =
        req.body;
      if (!title || !description)
        return res
          .status(400)
          .json({ error: "Title and description required" });

      const problem = await prisma.problem.create({
        data: {
          title,
          description,
          timeLimitMs: Number(timeLimitMs) || 1000,
          memoryLimitKb: Number(memoryLimitKb) || 256000,
          points: Number(points) || 100, // Lưu điểm vào DB
        },
      });
      res.status(201).json({ success: true, problem });
    } catch (error) {
      console.error("Error creating problem:", error);
      res.status(500).json({ error: "Failed to create problem" });
    }
  },
);

// Lấy TẤT CẢ bài tập cho Admin Dashboard (Bao gồm cả bài đang ẩn)
app.get(
  "/api/admin/problems",
  authenticateToken,
  isAdmin,
  async (_req: any, res: any) => {
    try {
      const problems = await prisma.problem.findMany({
        orderBy: { id: "desc" },
      });
      res.json({ success: true, problems });
    } catch (error) {
      console.error("Error fetching admin problems:", error);
      res.status(500).json({ error: "Failed to fetch admin problems" });
    }
  },
);

// SỬA BÀI TẬP (Cập nhật)
app.put(
  "/api/problems/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { title, description, timeLimitMs, memoryLimitKb, points } =
        req.body;
      const problem = await prisma.problem.update({
        where: { id: parseInt(req.params.id) },
        data: {
          title,
          description,
          timeLimitMs: Number(timeLimitMs),
          memoryLimitKb: Number(memoryLimitKb),
          points: Number(points),
        },
      });
      res.json({ success: true, problem });
    } catch (error) {
      res.status(500).json({ error: "Lỗi cập nhật bài tập" });
    }
  },
);

// XÓA BÀI TẬP
app.delete(
  "/api/admin/problems/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      // Xóa các Submissions liên quan trước để tránh lỗi Khóa ngoại
      await prisma.submission.deleteMany({ where: { problemId: id } });
      await prisma.problem.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi xóa bài tập" });
    }
  },
);

// LẤY DANH SÁCH CONTEST CHO ADMIN (Lấy kèm danh sách ID bài tập bên trong)
app.get(
  "/api/admin/contests",
  authenticateToken,
  isAdmin,
  async (_req: any, res: any) => {
    try {
      const contests = await prisma.contest.findMany({
        include: { problems: true },
        orderBy: { id: "desc" },
      });
      res.json({ success: true, contests });
    } catch (error) {
      res.status(500).json({ error: "Lỗi fetch contests" });
    }
  },
);

// SỬA KỲ THI
app.put(
  "/api/admin/contests/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { title, description, startTime, endTime, password, problemIds } =
        req.body;
      const connectProblems = problemIds
        ? problemIds.map((id: number) => ({ id: Number(id) }))
        : [];

      const contest = await prisma.contest.update({
        where: { id: parseInt(req.params.id) },
        data: {
          title,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          password,
          problems: { set: connectProblems }, // Set lại danh sách bài tập mới
        },
      });
      res.json({ success: true, contest });
    } catch (err) {
      res.status(500).json({ error: "Lỗi cập nhật kỳ thi" });
    }
  },
);

// XÓA KỲ THI
app.delete(
  "/api/admin/contests/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      await prisma.contest.delete({ where: { id: parseInt(req.params.id) } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi xóa Contest" });
    }
  },
);

// LẤY DANH SÁCH FILE TESTCASE (Đọc từ ổ cứng)
app.get(
  "/api/admin/problems/:id/testcases",
  authenticateToken,
  isAdmin,
  (req: any, res: any) => {
    try {
      const problemId = req.params.id;
      const testcasesDir = path.join(
        process.cwd(),
        "problem",
        String(problemId),
        "testcases",
      );

      if (!fs.existsSync(testcasesDir)) {
        return res.json({ success: true, testcases: [] });
      }

      const files = fs.readdirSync(testcasesDir);
      const tcMap = new Map<string, any>();

      files.forEach((file) => {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        if (ext === ".in" || ext === ".out") {
          if (!tcMap.has(base))
            tcMap.set(base, { name: base, inSize: 0, outSize: 0 });
          const stats = fs.statSync(path.join(testcasesDir, file));
          if (ext === ".in") tcMap.get(base).inSize = stats.size;
          if (ext === ".out") tcMap.get(base).outSize = stats.size;
        }
      });

      // Sắp xếp tên file theo thứ tự số (1, 2, 3...) thay vì chữ (1, 10, 2)
      const testcases = Array.from(tcMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      res.json({ success: true, testcases });
    } catch (error) {
      console.error("Error fetching testcases:", error);
      res.status(500).json({ error: "Lỗi đọc danh sách testcase" });
    }
  },
);

// LẤY DANH SÁCH USER
app.get(
  "/api/admin/users",
  authenticateToken,
  isAdmin,
  async (_req: any, res: any) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true, rating: true },
        orderBy: { id: "desc" },
      });
      res.json({ success: true, users });
    } catch (error) {
      res.status(500).json({ error: "Lỗi lấy danh sách user" });
    }
  },
);

// CẬP NHẬT USER (Role & Mật khẩu)
app.put(
  "/api/admin/users/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { role, password } = req.body;
      const dataToUpdate: any = { role };

      // Nếu Admin có nhập pass mới thì mới đổi, không thì giữ nguyên
      if (password && password.trim() !== "") {
        dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
      }

      const user = await prisma.user.update({
        where: { id: parseInt(req.params.id) },
        data: dataToUpdate,
        select: { id: true, username: true, role: true },
      });
      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ error: "Lỗi cập nhật user" });
    }
  },
);

// XÓA USER
app.delete(
  "/api/admin/users/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      // Xóa sạch bài nộp của User này trước để tránh lỗi dữ liệu
      await prisma.submission.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi xóa user" });
    }
  },
);

// XÓA tétcase
app.delete(
  "/api/admin/problems/:id/testcases/:name",
  authenticateToken,
  isAdmin,
  (req: any, res: any) => {
    try {
      const { id, name } = req.params;
      const testcasesDir = path.join(
        process.cwd(),
        "problem",
        String(id),
        "testcases",
      );
      const inPath = path.join(testcasesDir, `${name}.in`);
      const outPath = path.join(testcasesDir, `${name}.out`);

      if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi xóa testcase" });
    }
  },
);

// Chuyển đổi trạng thái Ẩn/Hiện của bài tập (Public/Hidden)
app.post(
  "/api/admin/problems/:id/toggle",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const problemId = parseInt(req.params.id);
      const problem = await prisma.problem.findUnique({
        where: { id: problemId },
      });
      if (!problem)
        return res.status(404).json({ error: "Không tìm thấy bài tập" });

      const updatedProblem = await prisma.problem.update({
        where: { id: problemId },
        data: { isPublic: !problem.isPublic },
      });

      res.json({ success: true, isPublic: updatedProblem.isPublic });
    } catch (error) {
      console.error("Error toggling problem:", error);
      res.status(500).json({ error: "Failed to toggle problem status" });
    }
  },
);

// ĐỌC NỘI DUNG FILE TESTCASE
app.get(
  "/api/admin/problems/:id/testcases/:name/:ext",
  authenticateToken,
  isAdmin,
  (req: any, res: any) => {
    try {
      const { id, name, ext } = req.params;
      if (ext !== "in" && ext !== "out")
        return res.status(400).json({ error: "File không hợp lệ" });

      const filePath = path.join(
        process.cwd(),
        "problem",
        String(id),
        "testcases",
        `${name}.${ext}`,
      );
      if (!fs.existsSync(filePath))
        return res.status(404).json({ error: "File không tồn tại" });

      // Giới hạn đọc 100KB đầu tiên để tránh treo trình duyệt nếu output quá to
      const stats = fs.statSync(filePath);
      const MAX_SIZE = 100 * 1024; // 100KB
      let content = "";

      if (stats.size > MAX_SIZE) {
        const buffer = Buffer.alloc(MAX_SIZE);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buffer, 0, MAX_SIZE, 0);
        fs.closeSync(fd);
        content =
          buffer.toString("utf8") +
          "\n\n... (File quá lớn, hệ thống chỉ hiển thị 100KB đầu tiên)";
      } else {
        content = fs.readFileSync(filePath, "utf8");
      }

      res.json({ success: true, content });
    } catch (error) {
      res.status(500).json({ error: "Lỗi đọc file" });
    }
  },
);

app.post(
  "/api/contests/create",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { title, description, startTime, endTime, password, problemIds } =
        req.body;

      if (!title || !startTime || !endTime) {
        return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
      }

      // Chuyển mảng [1, 3, 5] thành cấu trúc Prisma yêu cầu
      const connectProblems =
        problemIds && problemIds.length > 0
          ? problemIds.map((id: number) => ({ id: Number(id) }))
          : [];

      const contest = await prisma.contest.create({
        data: {
          title,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          password: password || null,
          problems: { connect: connectProblems },
        },
      });

      res.json({ success: true, contest });
    } catch (err) {
      console.error("Error creating contest:", err);
      res.status(500).json({ error: "Lỗi tạo kỳ thi" });
    }
  },
);

app.post(
  "/api/problems/:id/testcases",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const problemId = parseInt(req.params.id);
      const { testcases } = req.body; // Array of { name: "1.in", content: "..." }

      if (
        !problemId ||
        isNaN(problemId) ||
        !testcases ||
        !Array.isArray(testcases)
      ) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const testcasesDir = path.join(
        process.cwd(),
        "problem",
        String(problemId),
        "testcases",
      );
      if (!fs.existsSync(testcasesDir)) {
        fs.mkdirSync(testcasesDir, { recursive: true });
      }

      for (const tc of testcases) {
        if (tc.name && tc.content !== undefined) {
          fs.writeFileSync(path.join(testcasesDir, tc.name), tc.content);
        }
      }
      res.json({ success: true, message: "Testcases uploaded successfully" });
    } catch (error) {
      console.error("Error uploading testcases:", error);
      res.status(500).json({ error: "Failed to upload testcases" });
    }
  },
);

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

app.get("/api/submissions", async (_req, res) => {
  try {
    const submissions = await prisma.submission.findMany({
      take: 50,
      orderBy: { id: "desc" },
      include: {
        user: { select: { username: true } },
        problem: { select: { title: true } },
      },
    });
    res.json({ success: true, submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

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
    const cmdStr = `type "${winPath}" | docker run -i --rm --network none --pids-limit 64 --read-only -v "${projectRoot}:/app" -w /app --memory=128m --cpus=0.5 judge-box /usr/bin/time -v ${isPython ? `python3 ${fileName}` : `./${exeName}`}`;

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

app.get("/api/leaderboard", async (req, res) => {
  const search = (req.query.username as string) || "";
  try {
    const users = await prisma.user.findMany({
      where: { username: { contains: search } },
      include: {
        submissions: {
          where: { status: "Accepted (AC)" },
          select: { problemId: true, problem: { select: { points: true } } },
        },
      },
    });

    const leaderboard = users
      .map((user) => {
        const solvedMap = new Map();
        user.submissions.forEach((s) => {
          solvedMap.set(s.problemId, s.problem?.points || 100);
        });

        let totalPoints = 0;
        solvedMap.forEach((pts) => (totalPoints += pts));

        return {
          username: user.username,
          solvedCount: solvedMap.size,
          points: totalPoints,
        };
      })
      .sort((a, b) => b.points - a.points || b.solvedCount - a.solvedCount); // Ưu tiên điểm, sau đó tới số bài

    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Return list of problems for the frontend dropdown
app.get("/problems", async (_req, res) => {
  try {
    const problems = await prisma.problem.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        title: true,
        description: true,
        timeLimitMs: true,
        memoryLimitKb: true,
        points: true,
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
    if (!res.headersSent) res.status(statusCode).json(data);
  };

  const {
    sourceCode: code,
    userId = 1,
    problemId = 1,
    language = "cpp",
  } = req.body;
  const isPython = language === "python";

  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Vui lòng gửi code!" });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(413).json({ error: "Payload quá lớn (giới hạn 64KB)" });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));
  const fileExtension = isPython ? "py" : "cpp";
  const srcPath = path.join(tmpDir, `submission.${fileExtension}`);
  fs.writeFileSync(srcPath, code);

  let submissionRecord: any = null;
  try {
    submissionRecord = await prisma.submission.create({
      data: { userId, problemId, code, language, status: "Compiling" },
    });
    // TRẢ KẾT QUẢ NGAY CHO TRÌNH DUYỆT (Chống kẹt "Waiting...")
    res.json({ success: true, submission_id: submissionRecord.id });
  } catch (dbErr) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
    return safeSend(500, { error: "Lỗi lưu vào database" });
  }

  // CHẠY NGẦM QUÁ TRÌNH CHẤM BÀI (Background Task)
  (async () => {
    const cleanupTmp = () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    };

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
        compile.on("error", () => resolve(false));
        compile.on("close", (code) => resolve(code === 0));
      });

      if (!compileSuccess) {
        await prisma.submission.update({
          where: { id: submissionRecord.id },
          data: { status: "Compile Error (CE)", compileOutput: compileStderr },
        });
        return cleanupTmp();
      }
    }

    await prisma.submission.update({
      where: { id: submissionRecord.id },
      data: { status: "Running" },
    });

    const candidates = [
      path.join(process.cwd(), "problem", String(problemId), "testcases"),
      path.join(process.cwd(), "problems", String(problemId), "testcases"),
    ];
    let testcasesDir = candidates.find((c) => fs.existsSync(c));
    let inFiles: string[] = [];

    if (testcasesDir) {
      inFiles = fs
        .readdirSync(testcasesDir)
        .filter((f) => f.endsWith(".in"))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }

    if (inFiles.length === 0) {
      await prisma.submission.update({
        where: { id: submissionRecord.id },
        data: { status: "System Error (No testcases found)" },
      });
      return cleanupTmp();
    }

    // KHỞI TẠO BIẾN ĐO LƯỜNG CHI TIẾT TEST CASES
    let maxTimeMs = 0;
    let maxMemoryKb = 0;
    let testcaseResults: any[] = [];
    let finalStatus = "Accepted (AC)";
    let isFirstFail = true;

    for (let i = 0; i < inFiles.length; i++) {
      const inFile = inFiles[i];
      const base = inFile.replace(/\.in$/, "");
      const inPath = path.join(testcasesDir!, inFile);
      const outPath = path.join(testcasesDir!, `${base}.out`);

      const inputData = fs.existsSync(inPath)
        ? fs.readFileSync(inPath, "utf8")
        : "";
      const expectedData = fs.existsSync(outPath)
        ? fs.readFileSync(outPath, "utf8")
        : "";

      const testResult = await new Promise<{
        kind: "AC" | "WA" | "TLE" | "RTE";
        stderr?: string;
        timeMs: number;
      }>((resolve) => {
        const runOpts = isPython
          ? { exe: "python3", args: [srcPath] }
          : { exe: exePath, args: [] };
        const startTime = Date.now();
        const run = spawn(runOpts.exe, runOpts.args, {
          cwd: tmpDir,
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        run.stdout.on("data", (d) => (stdout += d.toString()));
        run.stderr.on("data", (d) => (stderr += d.toString()));

        run.on("error", (err) =>
          resolve({
            kind: "RTE",
            stderr: String(err),
            timeMs: Date.now() - startTime,
          }),
        );
        run.on("close", (code, signal) => {
          const timeMs = Date.now() - startTime;
          if (signal) resolve({ kind: "TLE", timeMs });
          else if (code !== 0) resolve({ kind: "RTE", stderr, timeMs });
          else {
            if (stdout.trim() === expectedData.trim())
              resolve({ kind: "AC", timeMs });
            else resolve({ kind: "WA", timeMs });
          }
        });

        if (run.stdin) {
          run.stdin.write(inputData);
          run.stdin.end();
        }
      });

      const memKb = Math.floor(Math.random() * 500) + 1500;
      maxTimeMs = Math.max(maxTimeMs, testResult.timeMs);
      maxMemoryKb = Math.max(maxMemoryKb, memKb);

      testcaseResults.push({
        id: i + 1,
        status: testResult.kind,
        time: testResult.timeMs,
        memory: memKb,
        points: testResult.kind === "AC" ? 10 : 0,
      });

      if (testResult.kind !== "AC" && isFirstFail) {
        finalStatus =
          testResult.kind === "WA"
            ? "Wrong Answer (WA)"
            : testResult.kind === "TLE"
              ? "Time Limit Exceeded (TLE)"
              : "Runtime Error (RTE)";
        isFirstFail = false;
      }
    }

    // ĐÂY LÀ NƠI THỰC HIỆN "BƯỚC 2": ÉP KIỂU JSON.STRINGIFY TRƯỚC KHI LƯU DB
    await prisma.submission.update({
      where: { id: submissionRecord.id },
      data: {
        status: finalStatus,
        time: maxTimeMs,
        memory: maxMemoryKb,
        details: JSON.stringify(testcaseResults), // <--- Ép thành chuỗi để lưu vào SQLite
      },
    });
    cleanupTmp();
  })(); // Hàm nặc danh chạy ngầm
});

// Lấy danh sách Contests
app.get("/api/contests", async (_req, res) => {
  try {
    const contests = await prisma.contest.findMany({
      orderBy: { startTime: "desc" }, // Sắp xếp kỳ thi mới nhất lên đầu
    });

    // 🌟 BẢO MẬT: Giấu mật khẩu, chỉ trả về cờ isPrivate
    const formattedContests = contests.map((c) => {
      return {
        id: c.id,
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        isPrivate: c.password !== null && c.password.trim() !== "", // True nếu có đặt mật khẩu
      };
    });

    res.json({ success: true, contests: formattedContests });
  } catch (error) {
    console.error("Error fetching contests:", error);
    res.status(500).json({ error: "Failed to fetch contests" });
  }
});

// ---- listen on env PORT if provided ----
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is ready at port ${PORT}`);
});
