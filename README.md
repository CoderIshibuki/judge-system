# CodeJudge - Online Judge Platform

A powerful, sleek, and real-time Online Judge platform built with Node.js, Socket.IO, and Prisma. This platform allows users to participate in programming contests, submit code, and allows administrators to manage problems and monitor participants via live camera feeds.

## 🚀 Features

### For Contestants
- **Real-time Submissions**: Submit code and see results (AC, WA, TLE, etc.) instantly.
- **Contest Participation**: Join scheduled contests with password protection.
- **Live Scoreboard**: Track your ranking and progress in real-time.
- **Problem Filtering**: Search and filter problems by title or difficulty.
- **Profile & Rating**: View your performance and current rating.

### For Administrators
- **Problem Management**: Create, edit, and delete problems with custom time and memory limits.
- **Testcase Management**: Upload input/output pairs for automated grading.
- **Contest Management**: Schedule contests, assign problems, and set proctoring requirements.
- **Live Camera Supervision**: Monitor contestants' webcams in real-time to prevent cheating.
- **Submission Oversight**: View and manage all submissions across the platform.

### Anti-Cheat System
- **Camera Proctoring**: Contests can be configured to require camera access.
- **Admin Dashboard**: Real-time grid view of all active contestants' camera feeds.
- **Disconnection Alerts**: Instant notification if a contestant's camera is disconnected.

## 🛠 Tech Stack

- **Backend**: Node.js, Express, TypeScript, Socket.IO.
- **Database**: SQLite (via Prisma ORM).
- **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS 4.
- **Infrastructure**: Docker (for isolated code execution).

## 📦 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/) (for judging code)
- npm or yarn

### 1. Clone the repository
```bash
git clone https://github.com/CoderIshibuki/judge-system
cd online-judge
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory:
```env
JWT_SECRET=your_secret_key
DATABASE_URL="file:./dev.db"
PORT=3000
```

### 4. Setup Database
```bash
npx prisma migrate dev --name init
npx prisma db seed # Optional: seed initial data
```

### 5. Running the Application
**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm run build
npm start
```

## 📸 Camera Permission Note
When accessing the platform via a local IP (e.g., `http://192.168.1.5:3000`), modern browsers may block camera access due to insecure context. To fix this:
1. Use **HTTPS** (recommended).
2. Or in Chrome, go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enable it, and add your IP.

## 📄 License
This project is licensed under the MIT License.
