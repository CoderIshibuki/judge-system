import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create Admin User
  const adminPasswordHash = await bcrypt.hash("admin", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN" },
    create: {
      username: "admin",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });
  console.log("Admin user created (username: admin, password: admin).");

  // 2. Create Contestant User
  const contestantPasswordHash = await bcrypt.hash("contestant", 10);
  await prisma.user.upsert({
    where: { username: "contestant" },
    update: {},
    create: {
      username: "contestant",
      passwordHash: contestantPasswordHash,
      role: "CONTESTANT",
    },
  });
  console.log("Contestant user created (username: contestant, password: contestant).");

  const problemsData = [
    {
      title: "Binary Search",
      description: "Given a sorted array of integers and a target integer, write a function to search the target in the array. If the target exists, output its index (0-indexed). Otherwise, output -1. The array elements are unique. First line of input contains N and target. Second line contains N integers.",
      timeLimitMs: 1000,
      memoryLimitKb: 128000,
      testcases: [
        { in: "6 9\n-1 0 3 5 9 12\n", out: "4\n" },
        { in: "6 2\n-1 0 3 5 9 12\n", out: "-1\n" },
        { in: "1 5\n5\n", out: "0\n" },
        { in: "2 1\n1 2\n", out: "0\n" },
        { in: "5 100\n10 20 30 40 50\n", out: "-1\n" }
      ]
    },
    {
      title: "Quick Sort",
      description: "Implement Quick Sort. You will be given an array of N integers. Sort them in non-decreasing order and output them separated by a space. First line is N. Second line contains N integers.",
      timeLimitMs: 2000,
      memoryLimitKb: 256000,
      testcases: [
        { in: "5\n5 2 3 1 4\n", out: "1 2 3 4 5\n" },
        { in: "5\n5 1 1 2 0\n", out: "0 1 1 2 5\n" },
        { in: "1\n10\n", out: "10\n" },
        { in: "3\n-1 -3 -2\n", out: "-3 -2 -1\n" },
        { in: "6\n9 8 7 6 5 4\n", out: "4 5 6 7 8 9\n" }
      ]
    },
    {
      title: "N-Queens",
      description: "The n-queens puzzle is the problem of placing n queens on an n x n chessboard such that no two queens attack each other. Given an integer n, return the number of distinct solutions to the n-queens puzzle. First line is n.",
      timeLimitMs: 2000,
      memoryLimitKb: 256000,
      testcases: [
        { in: "4\n", out: "2\n" },
        { in: "1\n", out: "1\n" },
        { in: "8\n", out: "92\n" },
        { in: "2\n", out: "0\n" },
        { in: "9\n", out: "352\n" }
      ]
    }
  ];

  for (const p of problemsData) {
    const existing = await prisma.problem.findFirst({ where: { title: p.title } });
    if (!existing) {
      const created = await prisma.problem.create({
        data: {
          title: p.title,
          description: p.description,
          timeLimitMs: p.timeLimitMs,
          memoryLimitKb: p.memoryLimitKb,
        }
      });
      
      const tcDir = path.join(process.cwd(), "problem", String(created.id), "testcases");
      fs.mkdirSync(tcDir, { recursive: true });
      
      let index = 1;
      for (const tc of p.testcases) {
        fs.writeFileSync(path.join(tcDir, `${index}.in`), tc.in);
        fs.writeFileSync(path.join(tcDir, `${index}.out`), tc.out);
        index++;
      }
      console.log(`Created problem: ${created.title} with testcases.`);
    } else {
      console.log(`Problem ${p.title} already exists.`);
    }
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });