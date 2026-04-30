document.addEventListener("DOMContentLoaded", () => {
  // === 1. KHAI BÁO BIẾN UI ===
  const toast = document.getElementById("toast");
  const connStatus = document.getElementById("conn-status");

  const authNavSec = document.getElementById("auth-nav-section");
  const userNavSec = document.getElementById("user-nav-section");
  const navGreeting = document.getElementById("nav-greeting");
  const navAdminBtn = document.getElementById("nav-admin-btn");

  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggleBtn = document.getElementById("auth-toggle-btn");
  const authTitle = document.getElementById("auth-title");
  const authToggleText = document.getElementById("auth-toggle-text");

  const languageSelect = document.getElementById("language");
  const submitBtn = document.getElementById("submit-btn");
  const resultOutput = document.getElementById("result-output");

  let isLoginMode = true;
  let selectedProblemId = null;
  let activeSubmissionId = null;

  // === 2. ĐỐI TƯỢNG APP (XỬ LÝ CHUYỂN TAB & DỮ LIỆU) ===
  window.app = {
    token: localStorage.getItem("token") || null,
    username: localStorage.getItem("username") || null,
    role: localStorage.getItem("role") || "CONTESTANT",

    switchTab: function (tabId) {
      document
        .querySelectorAll(".view-section")
        .forEach((el) => el.classList.add("hidden"));
      document.getElementById(tabId).classList.remove("hidden");

      document
        .querySelectorAll(".nav-btn")
        .forEach((btn) =>
          btn.classList.remove("border-blue-500", "text-white"),
        );
      const activeBtn = Array.from(document.querySelectorAll(".nav-btn")).find(
        (b) => b.getAttribute("onclick").includes(tabId),
      );
      if (activeBtn) activeBtn.classList.add("border-blue-500", "text-white");
    },

    updateNavAuth: function () {
      if (this.token) {
        authNavSec.classList.add("hidden");
        userNavSec.classList.remove("hidden");
        navGreeting.innerHTML = `Hello, <span class="font-bold text-white">${this.username}</span>`;
        if (this.role === "ADMIN") navAdminBtn.classList.remove("hidden");
      } else {
        authNavSec.classList.remove("hidden");
        userNavSec.classList.add("hidden");
        navAdminBtn.classList.add("hidden");
      }
    },

    logout: function () {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      localStorage.removeItem("role");
      this.token = null;
      this.username = null;
      this.role = "CONTESTANT";
      this.updateNavAuth();
      this.switchTab("auth-view");
      showToast("Logged out successfully", "bg-green-500");
    },

    allProblems: [], // Biến mới để lưu kho bài tập trên máy

    fetchProblems: async function () {
      try {
        const res = await fetch("/problems");
        this.allProblems = await res.json();
        this.renderProblems(this.allProblems); // Gọi hàm vẽ bảng
      } catch (err) {
        console.error("Error fetching problems", err);
      }
    },

    fetchContests: async function () {
      try {
        const res = await fetch("/api/contests");
        const data = await res.json();

        if (data.success) {
          const tbody = document.getElementById("contests-list");
          tbody.innerHTML = "";

          if (data.contests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Hiện tại chưa có kỳ thi nào.</td></tr>`;
            return;
          }

          data.contests.forEach((contest) => {
            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors cursor-pointer border-b border-gray-700";

            // Tính toán thời gian
            const startTime = new Date(contest.startTime);
            const endTime = new Date(contest.endTime);
            const durationMins = Math.round((endTime - startTime) / 60000); // Đổi ra phút

            // Định dạng giờ: 15:00 - 30/04/2026
            const timeStr =
              startTime.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              }) +
              " - " +
              startTime.toLocaleDateString("vi-VN");

            // Vẽ ổ khóa bảo mật
            const accessHtml = contest.isPrivate
              ? `<span class="text-red-400" title="Password Required">🔒 Private</span>`
              : `<span class="text-green-500" title="Public Contest">🔓 Public</span>`;

            tr.innerHTML = `
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-400">${contest.id}</td>
                            <td class="p-3 border-r border-gray-700/50 text-blue-400 hover:text-blue-300 font-semibold">${contest.title}</td>
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-300">${timeStr}</td>
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-400">${durationMins} mins</td>
                            <td class="p-3 text-center">${accessHtml}</td>
                        `;

            // Tạm thời hiển thị thông báo khi bấm vào
            tr.onclick = () => {
              if (contest.isPrivate) {
                const pwd = prompt(
                  "Phòng thi này yêu cầu mật khẩu. Vui lòng nhập mật khẩu:",
                );
                if (pwd)
                  app.showToast(
                    "Chức năng xác thực mật khẩu đang xây dựng!",
                    "bg-yellow-500 text-yellow-900",
                  );
              } else {
                app.showToast(
                  "Chức năng vào phòng thi Public đang xây dựng!",
                  "bg-blue-500",
                );
              }
            };

            tbody.appendChild(tr);
          });
        }
      } catch (err) {
        console.error("Error fetching contests", err);
      }
    },

    // Tách logic vẽ bảng ra hàm riêng để tái sử dụng khi Search
    renderProblems: function (problemsList) {
      const tbody = document.getElementById("problems-table-body");
      if (!tbody) return;
      tbody.innerHTML = "";

      if (problemsList.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Không tìm thấy bài tập nào.</td></tr>';
        return;
      }

      problemsList.forEach((problem) => {
        const tr = document.createElement("tr");
        tr.className =
          "hover:bg-gray-700/50 transition-colors cursor-pointer border-b border-gray-700";
        tr.onclick = () => app.openProblem(problem);

        tr.innerHTML = `
                    <td class="p-3 text-center border-r border-gray-700/50 text-gray-400">${problem.id}</td>
                    <td class="p-3 border-r border-gray-700/50">
                        <span class="text-blue-400 hover:text-blue-300 font-semibold transition-colors">${problem.title}</span>
                    </td>
                    <td class="p-3 text-center border-r border-gray-700/50 text-gray-400">${problem.timeLimitMs} ms</td>
                    <td class="p-3 text-center border-r border-gray-700/50 text-gray-400">${(problem.memoryLimitKb / 1024).toFixed(0)} MB</td>
                    <td class="p-3 text-center text-yellow-500 font-bold">${problem.points || 100}</td>
                `;
        tbody.appendChild(tr);
      });
    },

    openProblem: function (problem) {
      // Cập nhật ID bài đang làm
      selectedProblemId = problem.id;

      // Đổ nội dung đề bài vào Sidebar
      document.getElementById("active-problem-title").textContent =
        `${problem.id}. ${problem.title}`;
      document.getElementById("active-problem-limits").textContent =
        `Time: ${problem.timeLimitMs}ms | Mem: ${(problem.memoryLimitKb / 1024).toFixed(0)}MB`;
      document.getElementById("active-problem-desc").textContent =
        problem.description;

      // Chuyển sang màn hình Editor
      this.switchTab("editor-view");

      // Xóa kết quả chấm bài cũ trên màn hình
      const resultOutput = document.getElementById("result-output");
      if (resultOutput)
        resultOutput.innerHTML =
          '<div class="p-4 text-gray-500 italic">Ready to judge.</div>';
    },

    fetchSubmissions: async function () {
      try {
        const res = await fetch("/api/submissions");
        const data = await res.json();
        if (data.success) {
          const tbody = document.getElementById("submissions-list");
          tbody.innerHTML = "";
          data.submissions.forEach((sub) => {
            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors border-b border-gray-700";

            let statusColor =
              "text-yellow-400 bg-yellow-900/40 border-yellow-700";
            if (sub.status.includes("AC"))
              statusColor = "text-green-400 bg-green-900/40 border-green-700";
            else if (
              sub.status.includes("Error") ||
              sub.status.includes("WA") ||
              sub.status.includes("TLE")
            )
              statusColor = "text-red-400 bg-red-900/40 border-red-700";
            else if (
              sub.status.includes("Compiling") ||
              sub.status.includes("Running")
            )
              statusColor =
                "text-blue-400 bg-blue-900/40 border-blue-700 animate-pulse";

            const timeStr = sub.time !== null ? `${sub.time} ms` : "--";
            const memStr = sub.memory !== null ? `${sub.memory} KB` : "--";
            const probTitle = sub.problem
              ? sub.problem.title
              : `Problem #${sub.problemId}`;
            const username = sub.user
              ? sub.user.username
              : `User #${sub.userId}`;
            const shortStatus = sub.status.split(" ")[0];

            tr.innerHTML = `
                            <td class="p-3 text-center align-middle">
                                <div class="inline-block w-full px-2 py-1.5 rounded border text-xs font-bold ${statusColor}" title="${sub.status}">
                                    ${shortStatus}
                                </div>
                            </td>
                            <td class="p-3">
                                <div class="font-semibold text-blue-400 hover:text-blue-300 cursor-pointer transition-colors">${probTitle}</div>
                                <div class="text-xs text-gray-500 mt-1 flex items-center">
                                    <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                                    ${username}
                                </div>
                            </td>
                            <td class="p-3 text-center text-gray-300 font-mono text-xs">${timeStr}</td>
                            <td class="p-3 text-center text-gray-300 font-mono text-xs">${memStr}</td>
                            <td class="p-3 text-center text-gray-400 text-xs uppercase">${sub.language}</td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        console.error("Error fetching submissions", e);
      }
    },

    fetchLeaderboard: async function (searchQuery = "") {
      try {
        const res = await fetch(
          `/api/leaderboard?username=${encodeURIComponent(searchQuery)}`,
        );
        const data = await res.json();
        if (data.success) {
          const tbody = document.getElementById("leaderboard-list");
          tbody.innerHTML = "";

          if (data.leaderboard.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">No users found.</td></tr>`;
            return;
          }

          data.leaderboard.forEach((user, index) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-700/50 transition-colors";

            // Màu sắc rank giống VNOI (Top 1 Đỏ, Top 2 Cam...)
            let rankColor = "text-gray-400";
            if (index === 0) rankColor = "text-red-500 font-bold";
            else if (index === 1) rankColor = "text-orange-500 font-bold";
            else if (index === 2) rankColor = "text-yellow-500 font-bold";

            tr.innerHTML = `
                            <td class="p-3 text-center border-r border-gray-700/50 ${rankColor}">${index + 1}</td>
                            <td class="p-3 text-center border-r border-gray-700/50">
                                <div class="w-3 h-3 rounded-full bg-red-600 inline-block"></div>
                            </td>
                            <td class="p-3 border-r border-gray-700/50">
                                <span class="${rankColor} hover:underline cursor-pointer">${user.username}</span>
                            </td>
                            <td class="p-3 text-center border-r border-gray-700/50 text-blue-300">${user.points.toFixed(2)}</td>
                            <td class="p-3 text-center text-gray-400">${user.solvedCount}</td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        console.error("Error fetching leaderboard", e);
      }
    },
  };

  // === 3. XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ ===
  authToggleBtn.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authTitle.textContent = isLoginMode ? "Login" : "Register";
    authSubmitBtn.textContent = isLoginMode ? "Login" : "Register";
    authToggleText.textContent = isLoginMode
      ? "Don't have an account?"
      : "Already have an account?";
    authToggleBtn.textContent = isLoginMode ? "Register" : "Login";
  });

  authSubmitBtn.addEventListener("click", async () => {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password)
      return showToast("Vui lòng nhập đủ thông tin!", "bg-red-500");

    const endpoint = isLoginMode ? "/login" : "/register";
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "Processing...";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Thất bại");

      if (!isLoginMode) {
        showToast("Register success! Please login.", "bg-green-500");
        authToggleBtn.click();
        authPassword.value = "";
      } else {
        localStorage.setItem("token", data.token);
        const payload = JSON.parse(atob(data.token.split(".")[1]));
        localStorage.setItem("username", username);
        localStorage.setItem("role", payload.role || "CONTESTANT");

        app.token = data.token;
        app.username = username;
        app.role = payload.role || "CONTESTANT";

        app.updateNavAuth();
        app.switchTab("problems-list-view");
        showToast("Welcome back!", "bg-green-500");
      }
    } catch (err) {
      showToast(err.message, "bg-red-500");
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isLoginMode ? "Login" : "Register";
    }
  });

  // === 4. TRÌNH SOẠN THẢO CODE (MONACO) & SUBMIT BUTTON ===
  require.config({
    paths: {
      vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs",
    },
  });
  require(["vs/editor/editor.main"], function () {
    window.editor = monaco.editor.create(document.getElementById("editor"), {
      value:
        "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << (a + b) << endl;\n    return 0;\n}",
      language: "cpp",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    });

    languageSelect.addEventListener("change", (e) => {
      const lang = e.target.value;
      const model = window.editor.getModel();
      monaco.editor.setModelLanguage(model, lang);
      if (lang === "python") {
        window.editor.setValue(
          "a, b = map(int, input().split())\nprint(a + b)\n",
        );
      } else {
        window.editor.setValue(
          "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << (a + b) << endl;\n    return 0;\n}",
        );
      }
    });

    window.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        if (submitBtn) submitBtn.click();
      },
    );
  });

  submitBtn.addEventListener("click", () => {
    if (!window.editor)
      return showToast("Editor is still loading...", "bg-red-500");
    const sourceCode = window.editor.getValue();
    const language = languageSelect.value;

    if (!selectedProblemId)
      return showToast(
        "Please select a problem first.",
        "bg-yellow-500 text-yellow-900",
      );
    if (!sourceCode.trim())
      return showToast(
        "Please write some code.",
        "bg-yellow-500 text-yellow-900",
      );

    // Bắt buộc đăng nhập mới được nộp bài
    if (!app.token) {
      showToast("You must login to submit code!", "bg-red-500");
      return app.switchTab("auth-view");
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    submitBtn.textContent = "Submitting...";

    // Lấy User ID từ token để gắn vào request (tạm dùng decode, ở thực tế nên lấy trên server)
    const payload = JSON.parse(atob(app.token.split(".")[1]));
    const userId = payload.userId;

    fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + app.token,
      },
      body: JSON.stringify({
        sourceCode,
        problemId: selectedProblemId,
        language: language,
        userId: userId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.textContent = "Submit";

        if (data.status || data.success) {
          activeSubmissionId = data.submission_id || data.submissionId;
          resultOutput.innerHTML = `
                    <div class="animate-pulse flex space-x-3 items-center text-blue-400">
                        <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Submission sent. Waiting...</span>
                    </div>
                `;
          app.fetchSubmissions(); // Cập nhật lại bảng Submission ngay lập tức
        } else {
          showToast(
            data.error || "Submission failed.",
            "bg-red-500 text-white",
          );
        }
      })
      .catch((err) => {
        console.error(err);
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.textContent = "Submit";
        showToast("Network error.", "bg-red-500 text-white");
      });
  });

  // === 5. CÁC HÀM TIỆN ÍCH (HELPER) ===
  function updateResultPanel(submission) {
    const resultOutput = document.getElementById("result-output");
    if (!resultOutput) return;

    const status = submission.status ? submission.status.trim() : "Pending";
    let statusColor = status.includes("AC")
      ? "text-green-500"
      : status.includes("Pending") ||
          status.includes("Compiling") ||
          status.includes("Running")
        ? "text-blue-400"
        : "text-red-500";

    // Màn hình Loading
    if (
      status.includes("Compiling") ||
      status.includes("Running") ||
      status === "Pending"
    ) {
      resultOutput.innerHTML = `
                <div class="animate-pulse flex space-x-3 items-center text-blue-400 p-4">
                    <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>${status}...</span>
                </div>`;
      return;
    }

    // Màn hình Lỗi biên dịch (Code sai cú pháp)
    if (status.includes("Compile Error")) {
      resultOutput.innerHTML = `
                <div class="p-4">
                    <h3 class="text-lg font-semibold text-red-500 mb-2">Compile Error</h3>
                    <pre class="bg-gray-950 p-3 text-xs font-mono text-red-300 rounded overflow-x-auto border border-red-900/50 whitespace-pre-wrap">${escapeHtml(submission.compileOutput)}</pre>
                </div>`;
      return;
    }

    // Vẽ UI Testcases phong cách VNOI
    // Vẽ UI Testcases phong cách VNOI
    let iconsHtml = "";
    let listHtml = "";
    let totalPoints = 0;
    let maxPoints = 0;

    // --- ĐOẠN MỚI: DỊCH NGƯỢC CHUỖI THÀNH MẢNG JSON ---
    let parsedDetails = submission.details;
    if (typeof parsedDetails === "string") {
      try {
        parsedDetails = JSON.parse(parsedDetails);
      } catch (e) {
        parsedDetails = [];
      }
    }
    // --------------------------------------------------

    if (parsedDetails && Array.isArray(parsedDetails)) {
      parsedDetails.forEach((tc) => {
        const isAC = tc.status === "AC";
        // Vẽ dấu tick xanh hoặc dấu x đỏ
        iconsHtml += isAC
          ? `<span class="text-green-500 font-bold mx-[2px] text-lg">✔</span>`
          : `<span class="text-red-500 font-bold mx-[2px] text-lg">✘</span>`;

        const statusText = isAC
          ? "Accepted"
          : tc.status === "WA"
            ? "Wrong Answer"
            : tc.status === "TLE"
              ? "Time Limit Exceeded"
              : "Runtime Error";
        const tcColor = isAC ? "text-green-500" : "text-red-500";
        const timeS = (tc.time / 1000).toFixed(3);
        const memMB = (tc.memory / 1024).toFixed(2);

        listHtml += `
                    <div class="flex flex-wrap items-center text-sm font-mono mt-1 hover:bg-gray-800 p-1 rounded transition-colors">
                        <span class="w-24 text-gray-300 font-semibold mr-2">> Test case #${tc.id}:</span>
                        <span class="${tcColor} font-bold w-32 shrink-0">${statusText}</span>
                        <span class="text-gray-400 ml-2">[${timeS}s, ${memMB} MB]</span>
                        <span class="text-gray-500 ml-auto">(${tc.points}/10)</span>
                    </div>
                `;
        totalPoints += tc.points;
        maxPoints += 10;
      });
    }

    const finalTime =
      submission.time !== null
        ? (submission.time / 1000).toFixed(3) + "s"
        : "--";
    const finalMem =
      submission.memory !== null
        ? (submission.memory / 1024).toFixed(2) + " MB"
        : "--";

    resultOutput.innerHTML = `
            <div class="p-4 bg-gray-900 rounded-lg h-full overflow-y-auto">
                <h3 class="text-lg font-semibold text-gray-200 mb-4 border-b border-gray-700 pb-2">Execution Results</h3>
                
                <div class="mb-6 flex flex-wrap gap-1">
                    ${iconsHtml || `<span class="${statusColor} font-bold">${status}</span>`}
                </div>

                <div class="mb-6 space-y-1 bg-gray-950 p-3 rounded border border-gray-800">
                    ${listHtml || `<div class="text-gray-500 italic">No detailed testcases available.</div>`}
                </div>

                <div class="mt-6 pt-4 border-t border-gray-700 text-sm">
                    <div class="text-gray-300"><span class="font-bold text-white">Resources:</span> ${finalTime}, ${finalMem}</div>
                    <div class="text-gray-300 mt-1"><span class="font-bold text-white">Final score:</span> <span class="text-blue-400 font-bold">${totalPoints}/${maxPoints}</span> points</div>
                </div>
            </div>
        `;
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, colorClass = "bg-blue-500") {
    toast.textContent = message;
    toast.className = `fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-2xl transition-all duration-300 z-50 text-sm font-medium text-white ${colorClass}`;
    requestAnimationFrame(() =>
      toast.classList.remove("opacity-0", "translate-y-10"),
    );
    setTimeout(() => toast.classList.add("opacity-0", "translate-y-10"), 3000);
  }

  // === 6. SOCKET.IO (REAL-TIME) ===
  const socket = io();
  socket.on("connect", () => {
    connStatus.textContent = "Connected";
    connStatus.className = "text-green-500";
  });
  socket.on("disconnect", () => {
    connStatus.textContent = "Offline";
    connStatus.className = "text-red-500";
  });
  socket.on("submission_update", (submission) => {
    // Cập nhật bảng kết quả cá nhân
    if (activeSubmissionId === submission.id) {
      updateResultPanel(submission);
    }
    // Cập nhật bảng All Submissions chung
    if (typeof app.fetchSubmissions === "function") {
      app.fetchSubmissions();
    }
  });

  const searchInput = document.getElementById("search-user");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      app.fetchLeaderboard(e.target.value);
    });
  }

  // === 6.5. LOGIC TÌM KIẾM BÀI TẬP (SIDEBAR) ===
  const btnFilterGo = document.getElementById("btn-filter-go");
  const btnFilterRandom = document.getElementById("btn-filter-random");
  const searchInputFilter = document.getElementById("filter-search-text");

  if (btnFilterGo && searchInputFilter) {
    btnFilterGo.addEventListener("click", () => {
      const query = searchInputFilter.value.toLowerCase().trim();
      // Lọc ra các bài có tiêu đề hoặc ID chứa từ khóa
      const filtered = app.allProblems.filter(
        (p) =>
          p.title.toLowerCase().includes(query) || p.id.toString() === query,
      );
      app.renderProblems(filtered);
    });

    // Hỗ trợ bấm Enter trong ô tìm kiếm
    searchInputFilter.addEventListener("keypress", (e) => {
      if (e.key === "Enter") btnFilterGo.click();
    });
  }

  if (btnFilterRandom) {
    btnFilterRandom.addEventListener("click", () => {
      if (app.allProblems.length > 0) {
        // Quay sổ xố lấy 1 bài ngẫu nhiên và bay thẳng vào phòng Code
        const randomProblem =
          app.allProblems[Math.floor(Math.random() * app.allProblems.length)];
        app.openProblem(randomProblem);
      }
    });
  }

  // === 7. KHỞI TẠO DỮ LIỆU BAN ĐẦU ===
  app.updateNavAuth();
  app.switchTab(app.token ? "problems-list-view" : "auth-view");
  app.fetchProblems();
  app.fetchSubmissions();
  app.fetchLeaderboard();
  app.fetchContests();
});
