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

io.on("connection", (socket) => {
  socket.on("camera_frame", (data) => {
    // data should contain { contestId, userId, username, frame }
    // Broadcast to admins
    io.emit("admin_camera_frame", data);
  });
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
    if (err)
      return res.status(403).json({
        error:
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!",
      });
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

app.post(
  "/api/admin/users/single",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { username, password, role } = req.body;
      if (!username) return res.status(400).json({ error: "Thiếu Username" });

      const exist = await prisma.user.findUnique({ where: { username } });
      if (exist) return res.status(400).json({ error: "Username đã tồn tại" });

      const hash = await bcrypt.hash(password || "123456", 10);
      await prisma.user.create({
        data: {
          username,
          passwordHash: hash,
          role: role || "CONTESTANT",
          rating: 1500,
        },
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Lỗi thêm user" });
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
      const { title, description, startTime, endTime, password, problemIds, requireCamera } =
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
          requireCamera: requireCamera !== undefined ? !!requireCamera : undefined,
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

// [API CHO ADMIN] THÊM HÀNG LOẠT USER TỪ FILE
app.post(
  "/api/admin/users/bulk",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const { usernames } = req.body;
      if (!usernames || !Array.isArray(usernames))
        return res.status(400).json({ error: "Dữ liệu không hợp lệ" });

      // Tạo sẵn mã băm cho mật khẩu "123456"
      const defaultPasswordHash = await bcrypt.hash("123456", 10);

      // Kiểm tra xem user nào đã tồn tại để bỏ qua (SQLite không hỗ trợ skipDuplicates)
      const existingUsers = await prisma.user.findMany({
        where: { username: { in: usernames } },
      });
      const existingNames = existingUsers.map((u: any) => u.username);

      const newUsers = usernames
        .filter((u: string) => !existingNames.includes(u))
        .map((u: string) => ({
          username: u,
          passwordHash: defaultPasswordHash,
          role: "CONTESTANT",
          rating: 1500,
        }));

      if (newUsers.length > 0) {
        await prisma.user.createMany({ data: newUsers });
      }

      res.json({
        success: true,
        added: newUsers.length,
        skipped: existingNames.length,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Lỗi thêm user hàng loạt" });
    }
  },
);

// [API CHO USER] ĐỔI MẬT KHẨU CÁ NHÂN
app.put(
  "/api/users/password",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const { oldPassword, newPassword } = req.body;
      // req.user.userId được giải mã từ JWT Token
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });
      if (!user) return res.status(404).json({ error: "Không tìm thấy user" });

      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid)
        return res.status(400).json({ error: "Mật khẩu cũ không chính xác" });

      const hash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash },
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi đổi mật khẩu" });
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

// LẤY SOURCE CODE CỦA BÀI NỘP (REPLAY)
app.get(
  "/api/submissions/:id/source",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const subId = parseInt(req.params.id);
      const submission = await prisma.submission.findUnique({
        where: { id: subId },
        include: { user: true, problem: true },
      });

      if (!submission)
        return res.status(404).json({ error: "Không tìm thấy bài nộp" });

      // 1. Mặc định: Admin hoặc chính chủ nộp thì được xem luôn
      let canView =
        req.user.role === "ADMIN" || submission.userId === req.user.userId;

      // 2. Nếu là người khác xem: Phải kiểm tra xem người xem đã AC bài này chưa
      if (!canView) {
        const hasAC = await prisma.submission.findFirst({
          where: {
            userId: req.user.userId,
            problemId: submission.problemId,
            status: { contains: "AC" }, // Chứa chữ AC (Accepted)
          },
        });
        if (hasAC) canView = true;
      }

      if (!canView) {
        return res.status(403).json({
          error:
            "Gian lận hả? Bạn phải giải đúng (AC) bài này mới được xem code của người khác!",
        });
      }

      res.json({
        success: true,
        sourceCode:
          (submission as any).sourceCode ||
          (submission as any).code ||
          "Không có nội dung code",
        username: submission.user?.username || "Unknown",
        problemTitle: submission.problem?.title || "Unknown",
      });
    } catch (error) {
      res.status(500).json({ error: "Lỗi máy chủ" });
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
      const { title, description, startTime, endTime, password, problemIds, requireCamera } =
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
          requireCamera: !!requireCamera,
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
        user: true,
        problem: true,
      },
    });
    res.json({ success: true, submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

app.post("/submit", authenticateToken, async (req: any, res: any) => {
  try {
    const { problemId, sourceCode, language, contestId } = req.body;

    // 1. LẤY USER ID TỪ MIDDLEWARE authenticateToken (đã xác thực ở trên)
    const userId = req.user?.userId || req.user?.id || null;

    // 2. KIỂM TRA HẾT GIỜ CONTEST (Từ chối bài nộp muộn)
    if (contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: Number(contestId) },
      });
      if (contest && contest.endTime) {
        const now = new Date();
        const end = new Date(contest.endTime);
        if (now > end) {
          return res.status(400).json({
            success: false,
            message:
              "Kỳ thi đã kết thúc! Bài nộp của bạn không được công nhận.",
          });
        }
      }
    }

    // 3. LƯU VÀO DATABASE
    const submission = await prisma.submission.create({
      data: {
        code: sourceCode,
        language: language || "cpp",
        status: "Pending",
        problemId: Number(problemId),
        userId: userId ? Number(userId) : null,
        score: 0,
      },
    });

    // 4. TẠO FILE RA Ổ CỨNG CHO DOCKER ĐỌC (Diệt lỗi: No such file)
    const fileExtension = language === "python" ? "py" : "cpp";
    const filePath = path.join(
      __dirname,
      `submission_${submission.id}.${fileExtension}`,
    );
    fs.writeFileSync(filePath, sourceCode);

    // 5. TRẢ DỮ LIỆU ĐẦY ĐỦ VỀ CHO GIAO DIỆN HIỂN THỊ
    const fullSubmission = await prisma.submission.findUnique({
      where: { id: submission.id },
      include: { user: true, problem: true },
    });

    res.json({
      success: true,
      submissionId: fullSubmission?.id,
      submission: fullSubmission,
    });

    // 6. GỌI HÀM CHẤM BÀI
    judgeSubmission(submission.id);
  } catch (error) {
    console.error("Lỗi nộp bài:", error);
    res
      .status(500)
      .json({ success: false, message: "Lỗi hệ thống khi nộp bài." });
  }
});

// =================== TÍNH NĂNG MỚI BỔ SUNG ===================

// 1. [ADMIN] XÓA VĨNH VIỄN 1 BÀI NỘP (SUBMISSION)
app.delete(
  "/api/admin/submissions/:id",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      await prisma.submission.delete({
        where: { id: parseInt(req.params.id) },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi khi xóa bài nộp" });
    }
  },
);

// 2. [ADMIN] LẤY DANH SÁCH THÍ SINH ĐÃ VÀO 1 KỲ THI
app.get(
  "/api/admin/contests/:id/participants",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const participants = await prisma.contestParticipant.findMany({
        where: { contestId: parseInt(req.params.id) },
        include: { user: true },
      });
      res.json({ success: true, participants });
    } catch (error) {
      res.status(500).json({ error: "Lỗi tải danh sách thí sinh" });
    }
  },
);

// 3. [ADMIN] LỆNH ĐUỔI HOẶC MỞ LẠI CHO THÍ SINH (Phát sóng qua Socket.io)
app.post(
  "/api/admin/contests/:id/user-action",
  authenticateToken,
  isAdmin,
  async (req: any, res: any) => {
    try {
      const contestId = parseInt(req.params.id);
      const { userId, action } = req.body; // action: 'kick' hoặc 'reopen'

      // Phát tín hiệu ra toàn mạng lưới để trình duyệt của thí sinh kia tự động nhận lệnh
      io.emit("contest_action", {
        contestId,
        userId: parseInt(userId),
        action,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi phát lệnh điều khiển" });
    }
  },
);
// =============================================================

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

  // Get time limit and memory limit from Problem if available
  let timeLimitMs = 1000;
  let memoryLimitKb = 256000;
  let problemPoints = 100;
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });
    if (problem && typeof problem.timeLimitMs === "number")
      timeLimitMs = problem.timeLimitMs;
    if (problem && typeof problem.memoryLimitKb === "number")
      memoryLimitKb = problem.memoryLimitKb;
    if (problem && typeof problem.points === "number")
      problemPoints = problem.points;
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
  let totalScore = 0;
  const testcaseResults: any[] = [];

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

    const runTimeout = Math.max(5000, timeLimitMs + 5000);
    const memoryMb = Math.max(32, Math.ceil(memoryLimitKb / 1024));
    const winPath = inPath.replace(/\//g, "\\");
    const cmdStr = `type "${winPath}" | docker run -i --rm --network none --pids-limit 64 --read-only -v "${projectRoot}:/app" -w /app --memory=${memoryMb}m --cpus=0.5 judge-box /usr/bin/time -v ${isPython ? `python3 ${fileName}` : `./${exeName}`}`;

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

    const pointsPerTest = Math.floor(problemPoints / inFiles.length);
    if (runRes.timedOut) {
      testcaseResults.push({
        id: testNum,
        status: "TLE",
        time: parsedUsage.timeMs || timeLimitMs,
        memory: parsedUsage.memoryKb || 0,
        points: 0,
      });
      const statusText = `Time Limit Exceeded (TLE) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: statusText,
            time: maxTimeMs,
            memory: maxMemoryKb,
            score: totalScore,
            details: JSON.stringify(testcaseResults),
          },
          include: { user: true, problem: true },
        });
      } catch (e) {
        console.error("Failed to set TLE status:", e);
      }
      cleanup();
      return;
    }

    if (runRes.code !== 0) {
      testcaseResults.push({
        id: testNum,
        status: "RTE",
        time: parsedUsage.timeMs || 0,
        memory: parsedUsage.memoryKb || 0,
        points: 0,
      });
      const statusText = `Runtime Error (RTE) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: statusText,
            time: maxTimeMs,
            memory: maxMemoryKb,
            score: totalScore,
            details: JSON.stringify(testcaseResults),
          },
          include: { user: true, problem: true },
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
      testcaseResults.push({
        id: testNum,
        status: "WA",
        time: parsedUsage.timeMs || 0,
        memory: parsedUsage.memoryKb || 0,
        points: 0,
      });
      const statusText = `Wrong Answer (WA) on test ${testNum}`;
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: statusText,
            time: maxTimeMs,
            memory: maxMemoryKb,
            score: totalScore,
            details: JSON.stringify(testcaseResults),
          },
          include: { user: true, problem: true },
        });
      } catch (e) {
        console.error("Failed to set WA status:", e);
      }
      cleanup();
      return;
    }

    // Passed testcase, add points
    totalScore += pointsPerTest;
    testcaseResults.push({
      id: testNum,
      status: "AC",
      time: parsedUsage.timeMs || 0,
      memory: parsedUsage.memoryKb || 0,
      points: pointsPerTest,
    });
  }
  // All tests passed
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "Accepted (AC)",
        time: maxTimeMs,
        memory: maxMemoryKb,
        score: problemPoints,
        details: JSON.stringify(testcaseResults),
      },
      include: { user: true, problem: true },
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

// =====================================================================
// KHU VỰC API VỪA THÊM (CHỈ ĐỂ DUY NHẤT 1 BẢN NÀY, KHÔNG ĐỂ TRÙNG LẶP)
// =====================================================================

// 1. [API ADMIN] SỬA ĐIỂM BÀI NỘP THỦ CÔNG
app.put(
  "/api/admin/submissions/:id/score",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      if (req.user.role !== "ADMIN")
        return res.status(403).json({ error: "Chỉ Admin mới có quyền!" });
      const subId = parseInt(req.params.id);
      const newScore = parseInt(req.body.score);
      await prisma.submission.update({
        where: { id: subId },
        data: { score: newScore },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi hệ thống khi cập nhật điểm" });
    }
  },
);

// 2. [API] THÍ SINH QUẸT THẺ GHI DANH VÀO PHÒNG THI
app.post(
  "/api/contests/:id/join",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const contestId = parseInt(req.params.id);
      const userId = req.user.userId || req.user.id;
      const existing = await prisma.contestParticipant.findFirst({
        where: { contestId, userId },
      });
      if (!existing) {
        await prisma.contestParticipant.create({ data: { contestId, userId } });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi hệ thống khi ghi danh" });
    }
  },
);

// 3. [API] LẤY CHI TIẾT MỘT BÀI TẬP ĐỂ HIỂN THỊ LÚC LÀM BÀI
app.get("/api/problems/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const problemId = parseInt(req.params.id);
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });
    if (!problem)
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy đề bài!" });
    res.json({ success: true, problem });
  } catch (error) {
    res.status(500).json({ success: false, error: "Lỗi hệ thống tải đề bài" });
  }
});

// 4. [API] LẤY LIVE SCOREBOARD CỦA KỲ THI
app.get("/api/contests/:id/scoreboard", async (req: any, res: any) => {
  try {
    const contestId = parseInt(req.params.id);
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: { problems: true },
    });
    if (!contest)
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy kỳ thi!" });

    const problemIds = contest.problems.map((p: any) => p.id);
    if (problemIds.length === 0)
      return res.json({ success: true, problems: [], scoreboard: [] });

    const submissions = await prisma.submission.findMany({
      where: { problemId: { in: problemIds } },
      include: { user: true },
    });

    const participants = await prisma.contestParticipant.findMany({
      where: { contestId: contestId },
      include: { user: true },
    });

    const userScores: any = {};
    participants.forEach((p: any) => {
      userScores[p.userId] = {
        username: p.user?.username || `User_${p.userId}`,
        total: 0,
        details: {},
      };
    });

    submissions.forEach((sub: any) => {
      const uid = sub.userId;
      if (!userScores[uid])
        userScores[uid] = {
          username: sub.user?.username || `User_${uid}`,
          total: 0,
          details: {},
        };
      const score =
        sub.score !== null && sub.score !== undefined
          ? sub.score
          : sub.status.includes("AC")
            ? 100
            : 0;
      if (
        userScores[uid].details[sub.problemId] === undefined ||
        score > userScores[uid].details[sub.problemId]
      ) {
        userScores[uid].details[sub.problemId] = score;
      }
    });

    const scoreboard = Object.values(userScores)
      .map((u: any) => {
        u.total = Object.values(u.details).reduce(
          (sum: any, s: any) => sum + s,
          0,
        );
        return u;
      })
      .sort((a: any, b: any) => b.total - a.total);

    res.json({ success: true, problems: contest.problems, scoreboard });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Lỗi hệ thống khi tải Bảng xếp hạng!" });
  }
});

// [API] LẤY DANH SÁCH BÀI TẬP CỦA MỘT KỲ THI
app.get(
  "/api/contests/:id/problems",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const contestId = parseInt(req.params.id);
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { problems: true }, // Phải có dòng này Prisma mới lôi bài tập ra
      });

      if (!contest)
        return res.status(404).json({ error: "Không tìm thấy kỳ thi" });

      res.json({ success: true, problems: contest.problems });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Lỗi Server khi tải đề thi" });
    }
  },
);
// [API ADMIN] XÓA BÀI TẬP
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

      const folderPath = path.join(process.cwd(), "problem", id.toString());

      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`Đã bay màu folder: ${folderPath}`);
      } catch (fsError) {
        console.error("Lỗi xóa file local:", fsError);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Lỗi khi xóa bài tập" });
    }
  },
);

// [API] XÁC THỰC MẬT KHẨU PHÒNG THI (Server-side)
app.post(
  "/api/contests/:id/verify-password",
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const contestId = parseInt(req.params.id);
      const { password } = req.body;

      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
      });

      if (!contest) {
        return res.status(404).json({ success: false, error: "Không tìm thấy kỳ thi" });
      }

      // Nếu contest không có password thì cho vào luôn
      if (!contest.password || contest.password.trim() === "") {
        return res.json({ success: true });
      }

      // So sánh password
      if (password === contest.password) {
        return res.json({ success: true });
      } else {
        return res.json({ success: false, error: "Mật khẩu không chính xác!" });
      }
    } catch (error) {
      console.error("Error verifying contest password:", error);
      res.status(500).json({ success: false, error: "Lỗi hệ thống" });
    }
  },
);

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
        isPrivate: c.password !== null && c.password.trim() !== "",
        requireCamera: !!c.requireCamera,
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
