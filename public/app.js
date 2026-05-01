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

    openEditContest: async function (id) {
      try {
        // Lấy lại danh sách để trích xuất data của kỳ thi này
        const res = await fetch("/api/contests", {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();
        const c = data.contests.find((x) => x.id === id);

        if (c) {
          document.getElementById("modal-contest-title").textContent =
            "Sửa Kỳ Thi #" + c.id;
          document.getElementById("admin-contest-id").value = c.id;
          document.getElementById("admin-contest-name").value =
            c.title || c.name || "";
          document.getElementById("admin-contest-desc").value =
            c.description || "";

          // Hàm nhỏ để chuyển đổi Time Zone cho input datetime-local
          const toLocal = (isoString) => {
            if (!isoString) return "";
            const date = new Date(isoString);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            return date.toISOString().slice(0, 16);
          };

          document.getElementById("admin-contest-start").value = toLocal(
            c.startTime,
          );
          document.getElementById("admin-contest-end").value = toLocal(
            c.endTime,
          );
          document.getElementById("admin-contest-pwd").value = c.password || "";

          // Lấy ra danh sách ID bài tập
          const probIds = c.problems
            ? c.problems.map((p) => p.id || p.problemId).join(", ")
            : "";
          document.getElementById("admin-contest-probs").value = probIds;

          // Hiện Modal
          const modal = document.getElementById("modal-contest");
          modal.classList.remove("hidden");
          modal.classList.add("flex");
        }
      } catch (e) {
        showToast("Lỗi khi tải thông tin Kỳ thi!", "bg-red-500");
      }
    },

    viewProblem: async function (id) {
      try {
        this.switchTab("editor-view");
        document.getElementById("active-problem-title").textContent =
          "⏳ Đang tải đề bài...";
        document.getElementById("active-problem-desc").innerHTML =
          "Vui lòng đợi trong giây lát...";

        console.log("👉 Đang gọi API lấy đề bài ID:", id);

        const res = await fetch(`/api/problems/${id}`, {
          headers: { Authorization: "Bearer " + this.token },
        });

        // 1. Lấy dữ liệu thô dưới dạng text trước (Quan trọng!)
        const text = await res.text();
        console.log("👉 Server trả về nguyên bản:", text);

        // 2. Thử giải mã JSON từ text đó
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          // Nếu server trả về lỗi HTML (404/500), hiện thẳng lên khung đề bài
          document.getElementById("active-problem-title").textContent =
            "Lỗi Server 💥";
          document.getElementById("active-problem-desc").innerHTML =
            `<pre class="text-red-500 whitespace-pre-wrap">${text}</pre>`;
          return showToast(
            "Server bị lỗi nội bộ! Xem khung đề bài.",
            "bg-red-500",
          );
        }

        if (data.success) {
          const prob = data.problem;
          document.getElementById("active-problem-title").textContent =
            prob.title || `Bài tập #${prob.id}`;
          document.getElementById("active-problem-limits").textContent =
            `Time: ${prob.timeLimitMs}ms | Mem: ${prob.memoryLimitKb}KB`;
          document.getElementById("active-problem-desc").innerHTML =
            prob.description || "Không có mô tả chi tiết.";

          // 👉 CỐ ĐỊNH BƯỚC 1: Lưu ID vào biến toàn cục để nút Submit nhận diện được bài
          app.currentProblemId = data.problem.id;
        } else {
          showToast(data.error || "Không tìm thấy đề bài!", "bg-red-500");
          this.switchTab("problems-list-view");
        }
      } catch (e) {
        console.error("Lỗi xem đề bài:", e);
        showToast("Mất kết nối hoàn toàn với Server!", "bg-red-500");
      }
    },

    openChangePwdModal: function () {
      document.getElementById("user-old-pwd").value = "";
      document.getElementById("user-new-pwd").value = "";
      document.getElementById("modal-change-pwd").classList.remove("hidden");
      document.getElementById("modal-change-pwd").classList.add("flex");
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

    // 1. HÀM MỞ MODAL THÊM USER (Làm sạch form cũ nếu có)
    openAddUserModal: function () {
      document.getElementById("add-username").value = "";
      document.getElementById("add-password").value = "";
      document.getElementById("add-role").value = "CONTESTANT";

      const modal = document.getElementById("modal-add-user");
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    },

    // 2. HÀM GỬI DATA LÊN API ĐỂ TẠO USER
    submitAddUser: async function () {
      const username = document.getElementById("add-username").value.trim();
      const password = document.getElementById("add-password").value;
      const role = document.getElementById("add-role").value;

      if (!username) return showToast("Vui lòng nhập Username!", "bg-red-500");

      try {
        const res = await fetch("/api/admin/users/single", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
          body: JSON.stringify({ username, password, role }),
        });

        const data = await res.json();

        if (data.success) {
          showToast("Đã thêm User thành công!", "bg-green-500");
          document.getElementById("modal-add-user").classList.add("hidden"); // Đóng form
          this.fetchAdminUsers(); // Load lại bảng danh sách User ngay lập tức
        } else {
          showToast(data.error || "Lỗi khi thêm user", "bg-red-500");
        }
      } catch (e) {
        console.error(e);
        showToast("Lỗi kết nối với Server!", "bg-red-500");
      }
    },

    fetchContests: async function () {
      const tbody = document.getElementById("contests-list");
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-yellow-500 animate-pulse font-medium">⏳ Đang tải danh sách kỳ thi từ Server...</td></tr>`;

      try {
        const res = await fetch("/api/contests");
        const data = await res.json();

        if (data.success) {
          tbody.innerHTML = "";
          if (!data.contests || data.contests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Hiện tại chưa có kỳ thi nào được tạo!</td></tr>`;
            return;
          }

          data.contests.forEach((contest) => {
            // Xử lý Start Time
            const startDate = new Date(contest.startTime);
            const timeString =
              startDate.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              }) +
              " - " +
              startDate.toLocaleDateString("vi-VN");

            // TÍNH DURATION TỰ ĐỘNG VÀ CHECK HẾT HẠN
            let durationMins = "--";
            let isEnded = false;
            const now = new Date(); // Lấy thời gian hiện tại lúc tải trang

            if (contest.endTime) {
              const endDate = new Date(contest.endTime);
              durationMins = Math.round((endDate - startDate) / 60000);

              // Nếu thời gian hiện tại đã vượt qua thời gian kết thúc -> Đóng cửa
              if (now > endDate) {
                isEnded = true;
              }
            }

            // CHECK LỊCH SỬ XEM ĐÃ NỘP BÀI/THOÁT CHƯA
            const isFinished = localStorage.getItem(
              `finished_contest_${contest.id}`,
            );

            // Lấy quyền Admin
            const isAdmin =
              app.role === "ADMIN" || localStorage.getItem("role") === "ADMIN";

            let actionHtml = "";

            // 1. LUẬT ADMIN: Bất tử, luôn được vào dù đã hết hạn
            if (isAdmin) {
              actionHtml = `<button onclick="app.enterContest(${contest.id}, '${contest.title || contest.name}', '${contest.startTime}')" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded font-bold transition-colors shadow-lg text-sm whitespace-nowrap w-full">Vào (Quyền Admin)</button>`;
            }
            // 2. LUẬT HẾT GIỜ: Ưu tiên check hết giờ trước
            else if (isEnded) {
              actionHtml = `<button disabled class="bg-gray-800 text-red-500 px-4 py-1.5 rounded font-semibold text-sm cursor-not-allowed border border-gray-700 w-full whitespace-nowrap">Đã kết thúc</button>`;
            }
            // 3. LUẬT NỘP SỚM: Chưa hết giờ nhưng đã tự bấm thoát
            else if (isFinished) {
              actionHtml = `<button disabled class="bg-gray-700 text-gray-400 px-4 py-1.5 rounded font-semibold text-sm cursor-not-allowed border border-gray-600 w-full whitespace-nowrap">Đã nộp bài</button>`;
            }
            // 4. BÌNH THƯỜNG: Đang trong giờ thi và chưa nộp bài
            else {
              actionHtml = `<button onclick="app.enterContest(${contest.id}, '${contest.title || contest.name}', '${contest.startTime}')" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded font-semibold transition-colors shadow-lg text-sm whitespace-nowrap w-full">Vào Thi</button>`;
            }

            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors border-b border-gray-700";
            tr.innerHTML = `
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-400 font-medium">${contest.id}</td>
                            <td class="p-3 border-r border-gray-700/50 text-blue-400 font-bold">${contest.title || contest.name || "Chưa có tên"}</td>
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-300 text-sm whitespace-nowrap">${timeString}</td>
                            <td class="p-3 text-center border-r border-gray-700/50 text-gray-400 text-sm whitespace-nowrap">${durationMins} mins</td>
                            <td class="p-3 text-center flex justify-center">
                                ${actionHtml}
                            </td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-500 font-bold">Mất kết nối với Server!</td></tr>`;
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
      app.currentProblemId = problem.id;

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

    adminAllUsers: [],

    fetchAdminUsers: async function () {
      if (this.role !== "ADMIN") return;
      try {
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();
        if (data.success) {
          this.adminAllUsers = data.users;
          const tbody = document.getElementById("admin-users-list");
          tbody.innerHTML = "";
          data.users.forEach((u) => {
            const roleHtml =
              u.role === "ADMIN"
                ? `<span class="bg-red-900/40 text-red-500 border border-red-700 px-2 py-0.5 rounded text-xs font-bold">ADMIN</span>`
                : `<span class="bg-gray-700 text-gray-300 border border-gray-600 px-2 py-0.5 rounded text-xs font-semibold">CONTESTANT</span>`;

            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors border-b border-gray-700";
            tr.innerHTML = `
                            <td class="p-3 text-center text-gray-400">${u.id}</td>
                            <td class="p-3 text-blue-400 font-semibold">${u.username}</td>
                            <td class="p-3 text-center">${roleHtml}</td>
                            <td class="p-3 flex justify-center space-x-2">
                                <button onclick="app.openUserModal(${u.id})" class="px-2 py-1 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600 hover:text-white rounded text-xs border border-yellow-700 transition">Sửa</button>
                                <button onclick="app.deleteUser(${u.id})" class="px-2 py-1 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded text-xs border border-red-700 transition">Xóa</button>
                            </td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        console.error(e);
      }
    },

    deleteUser: async function (id) {
      if (!confirm(`Xóa User #${id}? Mọi bài nộp của người này cũng sẽ mất!`))
        return;
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + this.token },
        });
        if ((await res.json()).success) {
          showToast("Đã xoá User!", "bg-red-500");
          this.fetchAdminUsers();
        }
      } catch (e) {
        showToast("Lỗi xóa user", "bg-red-500");
      }
    },

    submitCode: async function () {
      // Kiểm tra xem đã chọn bài chưa
      if (!app.currentProblemId) {
        showToast("Vui lòng chọn một bài tập trước khi nộp!", "bg-yellow-500");
        return;
      }

      // Lấy code từ editor toàn cục (window.editor an toàn hơn)
      const code = window.editor.getValue();

      const langElement = document.getElementById("language-select");
      if (!langElement) {
        console.error(
          "❌ Không tìm thấy phần tử 'language-select' trên giao diện!",
        );
        showToast("Lỗi: Thiếu ô chọn ngôn ngữ!", "bg-red-500");
        return;
      }

      const lang = langElement.value;

      try {
        const res = await fetch("/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
          body: JSON.stringify({
            problemId: app.currentProblemId,
            sourceCode: code,
            language: lang,
          }),
        });

        const data = await res.json();
        if (data.success) {
          showToast("Đã nộp bài thành công!", "bg-green-500");

          // FIX LỖI SỐ 2: Lưu lại ID bài nộp để Socket biết mà hiển thị kết quả
          // Dựa vào log Network của ông, server trả về trường 'submissionId'
          activeSubmissionId = data.submissionId;

          // FIX LỖI SỐ 1: Gọi đúng ID 'result-output' trong index.html
          const resultPanel = document.getElementById("result-output");
          if (resultPanel) {
            resultPanel.innerHTML =
              '<div class="p-4 text-yellow-500 animate-pulse">⏳ Đang chấm bài...</div>';
          }

          this.fetchSubmissions();
        } else {
          showToast(
            data.message || data.error || "Server từ chối bài nộp!",
            "bg-red-500",
          );
        }
      } catch (e) {
        console.error(e);
        showToast("Lỗi mạng khi nộp bài!", "bg-red-500");
      }
    },

    // HÀM XEM LẠI CODE (REPLAY)
    viewReplay: async function (subId) {
      if (!this.token)
        return showToast("Vui lòng đăng nhập để xem!", "bg-red-500");
      try {
        const res = await fetch(`/api/submissions/${subId}/source`, {
          headers: { Authorization: "Bearer " + this.token },
        });

        // Chuyển thành text trước để xem Server trả về cái quái gì
        const text = await res.text();

        try {
          const data = JSON.parse(text); // Ép sang JSON
          if (data.success) {
            document.getElementById("replay-username").textContent =
              data.username;
            document.getElementById("replay-problem").textContent =
              data.problemTitle;
            document.getElementById("replay-code-content").value =
              data.sourceCode;

            const modal = document.getElementById("modal-replay");
            modal.classList.remove("hidden");
            modal.classList.add("flex");
          } else {
            showToast(data.error, "bg-yellow-500 text-yellow-900");
          }
        } catch (parseErr) {
          console.error("Lỗi do Server không trả về JSON. Nội dung:", text);
          showToast("Lỗi API! F12 để xem chi tiết.", "bg-red-500");
        }
      } catch (e) {
        console.error(e);
        showToast("Mất kết nối với Server!", "bg-red-500");
      }
    },

    countdownTimer: null,

    // 1. KIỂM TRA ĐIỀU KIỆN TRƯỚC KHI VÀO THI
    enterContest: function (contestId, title, startTimeStr) {
      const startTime = new Date(startTimeStr).getTime();
      const now = new Date().getTime();

      // Lấy Role của User hiện tại (Tùy theo cách bạn lưu, thường là trong localStorage hoặc biến this.role)
      // Ở đây tôi check cả 2 cho chắc ăn:
      const isAdmin =
        this.role === "ADMIN" || localStorage.getItem("role") === "ADMIN";

      if (now < startTime && !isAdmin) {
        // Nếu là THÍ SINH và chưa tới giờ -> Nhốt vào phòng chờ
        this.showContestLobby(contestId, title, startTime);
      } else {
        // Nếu là ADMIN (bất chấp thời gian) HOẶC đã tới giờ thi -> Cho vào luôn

        if (isAdmin && now < startTime) {
          // Hiện cái Toast ngầu ngầu báo hiệu xài đặc quyền
          showToast(
            "Đặc quyền Admin: Truy cập kỳ thi trước giờ mở cửa!",
            "bg-purple-600",
          );
        }

        this.startContest(contestId, title);
      }
    },

    // 2. BẬT MÀN HÌNH KHÓA & ĐẾM NGƯỢC
    showContestLobby: function (contestId, title, startTime) {
      document.getElementById("lobby-contest-title").textContent = title;
      const lobby = document.getElementById("contest-lobby-screen");
      lobby.classList.remove("hidden");
      lobby.classList.add("flex");

      if (app.countdownTimer) clearInterval(app.countdownTimer); // Dùng app.

      app.countdownTimer = setInterval(() => {
        // Dùng app.
        const distance = startTime - new Date().getTime();

        if (distance <= 0) {
          // HẾT GIỜ CHỜ -> VÀO THI TỰ ĐỘNG
          clearInterval(app.countdownTimer); // Dùng app.
          document.getElementById("countdown-clock").textContent = "BẮT ĐẦU!";
          showToast("Kỳ thi đã mở! Chúc bạn làm bài tốt.", "bg-green-500");

          setTimeout(() => {
            app.exitContestLobby(); // CHỈ ĐÍCH DANH APP.
            app.startContest(contestId, title); // CHỈ ĐÍCH DANH APP.
          }, 1000);
        } else {
          const h = Math.floor(
            (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
          );
          const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((distance % (1000 * 60)) / 1000);
          document.getElementById("countdown-clock").textContent =
            `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }
      }, 1000);
    },

    editSubmissionScore: async function (subId, currentScore) {
      const newScore = prompt(
        `[ADMIN] Nhập điểm mới cho bài nộp #${subId}:`,
        currentScore,
      );
      if (newScore === null || newScore.trim() === "") return;

      try {
        const res = await fetch(`/api/admin/submissions/${subId}/score`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
          body: JSON.stringify({ score: parseInt(newScore) }),
        });
        const data = await res.json();

        if (data.success) {
          showToast("Sửa điểm thành công!", "bg-green-500");
          this.fetchSubmissions(); // Tải lại bảng để cập nhật màu sắc
        } else {
          showToast(data.error || "Lỗi khi sửa điểm", "bg-red-500");
        }
      } catch (e) {
        showToast("Lỗi mạng kết nối tới Server!", "bg-red-500");
      }
    },

    // BẮT ĐẦU VÀO THI (Chế độ Lockdown)
    startContest: async function (contestId, title) {
      this.currentContestId = contestId;

      try {
        await fetch(`/api/contests/${contestId}/join`, {
          method: "POST",
          headers: { Authorization: "Bearer " + this.token },
        });
      } catch (e) {
        console.error("Lỗi báo danh vào phòng thi:", e);
      }

      showToast(`Kỳ thi bắt đầu: ${title}`, "bg-green-500");

      // 1. KHÓA NAVBAR: Ẩn các menu đi
      document.querySelector("header nav").classList.add("hidden");

      // 2. HIỆN NÚT THOÁT
      document.getElementById("btn-exit-contest").classList.remove("hidden");

      // 3. Đưa sang tab Danh sách bài tập (Lưu ý: ID đúng là 'problems-list-view')
      this.switchTab("problems-list-view");

      // Gọi hàm tải đề thi của Contest đó
      this.fetchContestProblems(contestId);
    },

    // HÀM THOÁT KỲ THI (Mở khóa chức năng)
    exitContest: function () {
      if (
        !confirm(
          "CẢNH BÁO: Thoát ra bây giờ đồng nghĩa với việc NỘP BÀI SỚM. Bạn sẽ KHÔNG THỂ quay lại kỳ thi này nữa. Bạn chắc chắn chứ?",
        )
      )
        return;

      // 1. Đánh dấu "Đã hoàn thành" vào sổ đen LocalStorage
      if (this.currentContestId) {
        localStorage.setItem(
          `finished_contest_${this.currentContestId}`,
          "true",
        );
        this.currentContestId = null; // Xóa tạm nhớ
      }

      // 2. MỞ KHÓA NAVBAR & ẨN NÚT THOÁT
      document.querySelector("header nav").classList.remove("hidden");
      document.getElementById("btn-exit-contest").classList.add("hidden");

      // 3. Đá về trang danh sách Contests
      this.switchTab("contests-view");

      // 4. Refresh lại danh sách (Lúc này nút Vào thi sẽ biến thành chữ Đã nộp bài)
      this.fetchContests();
      this.fetchProblems();

      showToast("Đã nộp bài! Đang chờ kết quả...", "bg-blue-500");
    },

    // 5. TẢI ĐỀ THI CỦA RIÊNG CONTEST
    // TẢI ĐỀ THI CỦA RIÊNG CONTEST
    fetchContestProblems: async function (contestId) {
      try {
        const res = await fetch(`/api/contests/${contestId}/problems`, {
          headers: { Authorization: "Bearer " + this.token },
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          return showToast("Lỗi API tải đề thi!", "bg-red-500");
        }

        if (data.success) {
          const tbody = document.getElementById("problems-table-body");
          tbody.innerHTML = "";

          if (!data.problems || data.problems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500 italic">Kỳ thi này chưa có bài tập nào. Hãy liên hệ Admin!</td></tr>`;
            return;
          }

          // Vẽ danh sách bài tập chuẩn (chỉ có ID, Tên, Time, Mem, Điểm gốc)
          data.problems.forEach((prob) => {
            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors cursor-pointer border-b border-gray-700";

            // Fix click:
            tr.setAttribute("onclick", `app.viewProblem(${prob.id})`);

            tr.innerHTML = `
                            <td class="p-3 text-center text-gray-400 font-medium">${prob.id}</td>
                            <td class="p-3 text-blue-400 font-bold hover:underline">${prob.title || "Chưa có tên"}</td>
                            <td class="p-3 text-center text-gray-300 text-sm">${prob.timeLimitMs || 1000} ms</td>
                            <td class="p-3 text-center text-gray-300 text-sm">${prob.memoryLimitKb || 256000} KB</td>
                            <td class="p-3 text-center text-yellow-500 font-bold">${prob.points || 100}</td>
                        `;
            tbody.appendChild(tr);
          });
        } else {
          showToast(data.error || "Không lấy được đề thi", "bg-red-500");
        }
      } catch (e) {
        showToast("Lỗi mạng khi tải đề thi!", "bg-red-500");
      }
    },

    openUserModal: function (id) {
      const u = this.adminAllUsers.find((x) => x.id === id);
      if (!u) return;
      document.getElementById("admin-user-id").value = id;
      document.getElementById("admin-user-name").textContent = u.username;
      document.getElementById("admin-user-role").value = u.role;
      document.getElementById("admin-user-pwd").value = ""; // Luôn để trống pass

      const modal = document.getElementById("modal-user");
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    },

    // HÀM LOAD DANH SÁCH TESTCASE CỦA 1 BÀI
    fetchTestcases: async function (probId) {
      const tbody = document.getElementById("admin-tc-list");
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Đang quét thư mục...</td></tr>`;
      try {
        const res = await fetch(`/api/admin/problems/${probId}/testcases`, {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();
        if (data.success) {
          tbody.innerHTML = "";
          if (data.testcases.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Thư mục trống. Chưa có testcase nào.</td></tr>`;
            return;
          }
          data.testcases.forEach((tc) => {
            const inSize = (tc.inSize / 1024).toFixed(1) + " KB";
            const outSize = (tc.outSize / 1024).toFixed(1) + " KB";
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-800 transition-colors";
            tr.innerHTML = `
                            <td class="p-2 text-center font-bold text-gray-300">${tc.name}</td>
                            <td class="p-2 text-center text-gray-400 group">
                                <span class="cursor-pointer hover:text-blue-400 transition-colors flex items-center justify-center" onclick="app.viewTestcaseFile(${probId}, '${tc.name}', 'in')">
                                    ${tc.name}.in <span class="text-xs text-gray-600 ml-1">(${inSize})</span>
                                    <svg class="w-4 h-4 ml-2 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                </span>
                            </td>
                            <td class="p-2 text-center text-gray-400 group">
                                <span class="cursor-pointer hover:text-blue-400 transition-colors flex items-center justify-center" onclick="app.viewTestcaseFile(${probId}, '${tc.name}', 'out')">
                                    ${tc.name}.out <span class="text-xs text-gray-600 ml-1">(${outSize})</span>
                                    <svg class="w-4 h-4 ml-2 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                </span>
                            </td>
                            <td class="p-2 text-center">
                                <button onclick="app.deleteTestcase(${probId}, '${tc.name}')" class="text-red-500 hover:text-red-400 transition-colors bg-red-900/30 p-1.5 rounded" title="Xóa">
                                    <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Lỗi kết nối</td></tr>`;
      }
    },

    // HÀM MỞ VÀ VẼ BẢNG LIVE SCOREBOARD
    viewScoreboard: async function (contestId, title) {
      // Lưu lại ID để dùng cho nút "Làm mới"
      this.currentScoreboardId = contestId;
      this.currentScoreboardTitle = title;

      // Bật Modal lên
      const modal = document.getElementById("modal-scoreboard");
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      document.getElementById("scoreboard-title").textContent =
        "Scoreboard: " + title;
      document.getElementById("scoreboard-body").innerHTML =
        `<tr><td colspan="10" class="p-8 text-center text-yellow-500 animate-pulse text-lg">⏳ Đang tổng hợp dữ liệu...</td></tr>`;

      try {
        const res = await fetch(`/api/contests/${contestId}/scoreboard`, {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();

        if (data.success) {
          // 1. VẼ DÒNG TIÊU ĐỀ (HEADER)
          let headHtml = `
                        <tr>
                            <th class="p-3 font-bold w-16 text-center border-r border-gray-700">Top</th>
                            <th class="p-3 font-bold w-48 text-left border-r border-gray-700">Thí sinh</th>
                            <th class="p-3 font-bold w-24 text-center border-r border-gray-700 text-yellow-500">Tổng điểm</th>
                    `;
          // Thêm linh động các cột Bài 1, Bài 2...
          data.problems.forEach((p, index) => {
            headHtml += `<th class="p-3 font-bold text-center border-r border-gray-700 hover:text-blue-400 cursor-pointer" title="${p.title}">Bài ${index + 1}</th>`;
          });
          headHtml += `</tr>`;
          document.getElementById("scoreboard-head").innerHTML = headHtml;

          // 2. VẼ DANH SÁCH THÍ SINH
          let bodyHtml = "";
          if (data.scoreboard.length === 0) {
            bodyHtml = `<tr><td colspan="10" class="p-8 text-center text-gray-500 italic">Chưa có thí sinh nào nộp bài hợp lệ trong kỳ thi này.</td></tr>`;
          } else {
            data.scoreboard.forEach((user, idx) => {
              // Top 1, 2, 3 có màu mạ vàng mạ bạc cho xịn
              let rankColor = "text-gray-400";
              if (idx === 0)
                rankColor =
                  "text-yellow-400 text-lg drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]";
              else if (idx === 1) rankColor = "text-gray-300 text-lg";
              else if (idx === 2) rankColor = "text-amber-600 text-lg";

              let row = `<tr class="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                                <td class="p-3 text-center font-bold border-r border-gray-800 ${rankColor}">${idx + 1}</td>
                                <td class="p-3 text-blue-400 font-semibold border-r border-gray-800">
                                    <div class="flex items-center">
                                        <svg class="w-4 h-4 mr-2 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                                        ${user.username}
                                    </div>
                                </td>
                                <td class="p-3 text-center text-yellow-500 font-bold border-r border-gray-800 text-base">${user.total}</td>
                            `;

              // In điểm của từng bài
              data.problems.forEach((p) => {
                const pScore = user.details[p.id];
                if (pScore !== undefined) {
                  const color =
                    pScore == 100
                      ? "text-green-500"
                      : pScore > 0
                        ? "text-yellow-500"
                        : "text-red-500";
                  row += `<td class="p-3 text-center font-bold border-r border-gray-800 ${color}">${pScore}</td>`;
                } else {
                  row += `<td class="p-3 text-center text-gray-600 border-r border-gray-800">-</td>`; // Chưa làm
                }
              });

              row += `</tr>`;
              bodyHtml += row;
            });
          }
          document.getElementById("scoreboard-body").innerHTML = bodyHtml;
        } else {
          document.getElementById("scoreboard-body").innerHTML =
            `<tr><td colspan="10" class="p-8 text-center text-red-500 font-bold">${data.error}</td></tr>`;
        }
      } catch (e) {
        document.getElementById("scoreboard-body").innerHTML =
          `<tr><td colspan="10" class="p-8 text-center text-red-500 font-bold">Lỗi kết nối tới Server!</td></tr>`;
      }
    },

    // HÀM XÓA 1 BỘ TESTCASE
    deleteTestcase: async function (probId, name) {
      if (!confirm(`Xóa bộ testcase "${name}.in" và "${name}.out"?`)) return;
      try {
        const res = await fetch(
          `/api/admin/problems/${probId}/testcases/${name}`,
          {
            method: "DELETE",
            headers: { Authorization: "Bearer " + this.token },
          },
        );
        if ((await res.json()).success) {
          showToast(`Đã xóa Testcase ${name}`, "bg-red-500");
          this.fetchTestcases(probId); // Load lại bảng file ngay lập tức
        }
      } catch (e) {
        showToast("Lỗi xóa testcase", "bg-red-500");
      }
    },

    viewTestcaseFile: async function (probId, name, ext) {
      try {
        const res = await fetch(
          `/api/admin/problems/${probId}/testcases/${name}/${ext}`,
          {
            headers: { Authorization: "Bearer " + this.token },
          },
        );
        const data = await res.json();
        if (data.success) {
          document.getElementById("modal-view-file-title").textContent =
            `${name}.${ext}`;
          document.getElementById("modal-view-file-content").value =
            data.content;

          const modal = document.getElementById("modal-view-file");
          modal.classList.remove("hidden");
          modal.classList.add("flex");
        } else {
          showToast("Lỗi: " + data.error, "bg-red-500");
        }
      } catch (e) {
        showToast("Lỗi tải file", "bg-red-500");
      }
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
            const score =
              sub.score !== undefined
                ? sub.score
                : sub.status.includes("AC")
                  ? 100
                  : 0;
            const scoreColor =
              score === 100
                ? "text-green-500"
                : score > 0
                  ? "text-yellow-500"
                  : "text-red-500";
            // 1. Kiểm tra Admin để tạo nút sửa điểm
            const isAdmin =
              app.role === "ADMIN" || localStorage.getItem("role") === "ADMIN";

            let editBtn = "";
            if (isAdmin) {
              editBtn = `<button onclick="app.editSubmissionScore(${sub.id}, ${score})" class="ml-2 text-[10px] text-blue-400 hover:text-white bg-blue-900/40 hover:bg-blue-600 px-1.5 py-0.5 rounded transition-colors" title="Sửa điểm thủ công">✏️</button>`;
            }

            // 2. Nối chuỗi HTML (ĐÚNG 6 CỘT, KHÔNG THỪA KHÔNG THIẾU)
            tr.innerHTML = `
                <!-- Cột 1: STATUS -->
                <td class="p-3 text-center align-middle">
                    <div class="inline-block w-full px-2 py-1.5 rounded border text-xs font-bold ${statusColor}" title="${sub.status}">
                        ${shortStatus}
                    </div>
                </td>
                
                <!-- Cột 2: SCORE (CỘT ĐIỂM DUY NHẤT) -->
                <td class="p-3 text-center align-middle font-bold text-base ${scoreColor}">
                    ${score} ${editBtn}
                </td>
                
                <!-- Cột 3: PROBLEM / USER -->
                <td class="p-3">
                    <div class="font-semibold text-blue-400 hover:text-blue-300 cursor-pointer transition-colors" onclick="app.viewProblem(${sub.problemId})">${probTitle}</div>
                    <div class="text-xs text-gray-500 mt-1 flex items-center">
                        <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                        ${username}
                    </div>
                </td>
                
                <!-- Cột 4: TIME -->
                <td class="p-3 text-center text-gray-300 font-mono text-xs whitespace-nowrap align-middle">${timeStr}</td>
                
                <!-- Cột 5: MEMORY -->
                <td class="p-3 text-center text-gray-300 font-mono text-xs whitespace-nowrap align-middle">${memStr}</td>
                
                <!-- Cột 6: LANGUAGE & ACTION -->
                <td class="p-3 text-center flex flex-col items-center justify-center whitespace-nowrap">
                    <span class="text-gray-400 text-xs uppercase font-semibold">${sub.language}</span>
                    <button onclick="app.viewReplay(${sub.id})" class="mt-1.5 text-blue-400 hover:text-white flex items-center text-[10px] bg-blue-900/30 hover:bg-blue-600 px-2 py-1 rounded border border-blue-800 transition-colors cursor-pointer shadow-sm">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        Xem Code
                    </button>
                </td>
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

    adminAllContests: [], // Chứa dữ liệu Contest

    // HÀM XÓA BÀI TẬP
    deleteProblem: async function (id) {
      if (
        !confirm(
          `CẢNH BÁO: Xóa bài tập #${id} sẽ xóa luôn TẤT CẢ bài nộp của user liên quan tới bài này. Bạn chắc chắn chứ?`,
        )
      )
        return;
      try {
        const res = await fetch(`/api/admin/problems/${id}`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + this.token },
        });
        if ((await res.json()).success) {
          showToast("Đã xóa bài tập!", "bg-red-500");
          this.fetchAdminProblems();
          this.fetchProblems();
        }
      } catch (e) {
        showToast("Lỗi xóa bài", "bg-red-500");
      }
    },

    // HÀM LOAD BẢNG CONTEST ADMIN
    // HÀM CHO ADMIN: LẤY VÀ QUẢN LÝ KỲ THI
    fetchAdminContests: async function () {
      try {
        const res = await fetch("/api/contests", {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();

        if (data.success) {
          const tbody = document.getElementById("admin-contests-list");
          tbody.innerHTML = "";

          if (data.contests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Chưa có kỳ thi nào.</td></tr>`;
            return;
          }

          data.contests.forEach((contest) => {
            const startDate = new Date(contest.startTime).toLocaleString(
              "vi-VN",
            );
            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors border-b border-gray-700";

            tr.innerHTML = `
                            <td class="p-3 text-center text-gray-400">${contest.id}</td>
                            <td class="p-3 text-blue-400 font-semibold">${contest.title || contest.name}</td>
                            <td class="p-3 text-center text-gray-300 text-sm">${startDate}</td>
                            <td class="p-3 flex justify-center space-x-2">
                                <!-- NÚT XEM ĐIỂM (MỞ LẠI MODAL SCOREBOARD ICPC ĐÃ TẠO LÚC TRƯỚC) -->
                                <button onclick="app.viewScoreboard(${contest.id}, '${contest.title || contest.name}')" class="px-2 py-1 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded text-xs border border-green-700 transition">
                                    Xem Điểm
                                </button>
                                <button onclick="app.openEditContest(${contest.id})" class="px-2 py-1 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600 hover:text-white rounded text-xs border border-yellow-700 transition">
                                    Sửa
                                </button>
                                <button onclick="app.deleteContest(${contest.id})" class="px-2 py-1 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded text-xs border border-red-700 transition">
                                    Xóa
                                </button>
                            </td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        console.error(e);
      }
    },

    // HÀM XÓA CONTEST
    deleteContest: async function (id) {
      if (!confirm(`Xóa kỳ thi #${id}? (Không ảnh hưởng đến bài tập gốc)`))
        return;
      try {
        const res = await fetch(`/api/admin/contests/${id}`, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + this.token },
        });
        if ((await res.json()).success) {
          showToast("Đã xóa kỳ thi!", "bg-red-500");
          this.fetchAdminContests();
          this.fetchContests(); // Reset bảng ngoài
        }
      } catch (e) {
        showToast("Lỗi", "bg-red-500");
      }
    },

    // MỞ MODAL CONTEST
    openContestModal: function (id = null) {
      const modal = document.getElementById("modal-contest");
      document.getElementById("admin-contest-id").value = id || "";
      document.getElementById("modal-contest-title").textContent = id
        ? `Sửa Kỳ Thi #${id}`
        : "Tạo Kỳ Thi Mới";

      if (id) {
        const c = this.adminAllContests.find((x) => x.id === id);
        if (c) {
          // Đổ dữ liệu cũ vào form
          document.getElementById("admin-contest-name").value = c.title;
          document.getElementById("admin-contest-desc").value =
            c.description || "";
          document.getElementById("admin-contest-pwd").value = c.password || "";
          // Ép định dạng datetime-local (Bỏ phần Z và giây phía sau)
          document.getElementById("admin-contest-start").value = new Date(
            c.startTime,
          )
            .toISOString()
            .slice(0, 16);
          document.getElementById("admin-contest-end").value = new Date(
            c.endTime,
          )
            .toISOString()
            .slice(0, 16);
          // Lấy các ID bài tập hiện có
          document.getElementById("admin-contest-probs").value = c.problems
            ? c.problems.map((p) => p.id).join(", ")
            : "";
        }
      } else {
        // Form rỗng
        document.getElementById("admin-contest-name").value = "";
        document.getElementById("admin-contest-desc").value = "";
        document.getElementById("admin-contest-pwd").value = "";
        document.getElementById("admin-contest-start").value = "";
        document.getElementById("admin-contest-end").value = "";
        document.getElementById("admin-contest-probs").value = "";
      }
      modal.classList.remove("hidden");
      modal.classList.add("flex");
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

  // submitBtn.addEventListener("click", () => {
  //   if (!window.editor)
  //     return showToast("Editor is still loading...", "bg-red-500");
  //   const sourceCode = window.editor.getValue();
  //   const language = (
  //     document.getElementById("language-select") || { value: "cpp" }
  //   ).value;

  //   if (!selectedProblemId)
  //     return showToast(
  //       "Please select a problem first.",
  //       "bg-yellow-500 text-yellow-900",
  //     );
  //   if (!sourceCode.trim())
  //     return showToast(
  //       "Please write some code.",
  //       "bg-yellow-500 text-yellow-900",
  //     );

  //   // Bắt buộc đăng nhập mới được nộp bài
  //   if (!app.token) {
  //     showToast("You must login to submit code!", "bg-red-500");
  //     return app.switchTab("auth-view");
  //   }

  //   submitBtn.disabled = true;
  //   submitBtn.classList.add("opacity-50", "cursor-not-allowed");
  //   submitBtn.textContent = "Submitting...";

  //   // Lấy User ID từ token để gắn vào request (tạm dùng decode, ở thực tế nên lấy trên server)
  //   const payload = JSON.parse(atob(app.token.split(".")[1]));
  //   const userId = payload.userId;

  //   fetch("/api/submit", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: "Bearer " + app.token,
  //     },
  //     body: JSON.stringify({
  //       sourceCode,
  //       problemId: selectedProblemId,
  //       language: language,
  //       userId: userId,
  //     }),
  //   })
  //     .then((res) => res.json())
  //     .then((data) => {
  //       submitBtn.disabled = false;
  //       submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
  //       submitBtn.textContent = "Submit";

  //       if (data.status || data.success) {
  //         activeSubmissionId = data.submission_id || data.submissionId;
  //         resultOutput.innerHTML = `
  //                   <div class="animate-pulse flex space-x-3 items-center text-blue-400">
  //                       <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
  //                           <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
  //                           <path class="opacity-75" fill="currentColor" d="M4 12 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  //                       </svg>
  //                       <span>Submission sent. Waiting...</span>
  //                   </div>
  //               `;
  //         app.fetchSubmissions(); // Cập nhật lại bảng Submission ngay lập tức
  //       } else {
  //         showToast(
  //           data.error || "Submission failed.",
  //           "bg-red-500 text-white",
  //         );
  //       }
  //     })
  //     .catch((err) => {
  //       console.error(err);
  //       submitBtn.disabled = false;
  //       submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
  //       submitBtn.textContent = "Submit";
  //       showToast("Network error.", "bg-red-500 text-white");
  //     });
  // });

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
    if (activeSubmissionId === submission.id) {
      updateResultPanel(submission);
    }
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

  // === 8. QUẢN LÝ ADMIN (MODALS & TABS) ===
  const tabAdminProbs = document.getElementById("tab-admin-probs");
  const tabAdminContests = document.getElementById("tab-admin-contests");
  const viewAdminProbs = document.getElementById("admin-view-probs");
  const viewAdminContests = document.getElementById("admin-view-contests");

  // chuyen tab
  // Logic chuyển 3 Tab Admin
  const adminTabs = ["probs", "contests", "users"];
  adminTabs.forEach((tab) => {
    const btn = document.getElementById(`tab-admin-${tab}`);
    if (btn) {
      btn.addEventListener("click", () => {
        adminTabs.forEach((t) => {
          document.getElementById(`admin-view-${t}`).classList.add("hidden");
          document.getElementById(`tab-admin-${t}`).className =
            "px-4 py-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm font-medium";
        });
        document.getElementById(`admin-view-${tab}`).classList.remove("hidden");
        btn.className =
          "px-4 py-1.5 rounded bg-gray-700 text-white font-medium shadow transition-colors text-sm";
      });
    }
  });

  // Gắn thêm các hàm Quản lý Bài Tập vào `window.app`
  Object.assign(window.app, {
    adminAllProblems: [],

    // Load danh sách vào Bảng Admin
    fetchAdminProblems: async function () {
      if (this.role !== "ADMIN") return;
      try {
        const res = await fetch("/api/admin/problems", {
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();
        if (data.success) {
          this.adminAllProblems = data.problems;
          const tbody = document.getElementById("admin-probs-list");
          tbody.innerHTML = "";
          data.problems.forEach((p) => {
            const isPub = p.isPublic;
            const statusHtml = isPub
              ? `<span class="bg-green-900/40 text-green-400 border border-green-700 px-2 py-0.5 rounded text-xs font-semibold">Public</span>`
              : `<span class="bg-gray-700 text-gray-400 border border-gray-600 px-2 py-0.5 rounded text-xs font-semibold">Hidden</span>`;

            const toggleBtnText = isPub ? "Hide" : "Publish";
            const toggleBtnClass = isPub
              ? "bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600"
              : "bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white border-green-700";

            const tr = document.createElement("tr");
            tr.className =
              "hover:bg-gray-700/50 transition-colors border-b border-gray-700";
            tr.innerHTML = `
                            <td class="p-3 text-center text-gray-400">${p.id}</td>
                            <td class="p-3 text-blue-400 font-semibold">${p.title}</td>
                            <td class="p-3 text-center">${statusHtml}</td>
                            <td class="p-3 flex justify-center space-x-2">
                                <button onclick="app.openProbModal(${p.id})" class="px-2 py-1 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600 hover:text-white rounded text-xs border border-yellow-700 transition">Sửa</button>
                                <button onclick="app.openTcModal(${p.id})" class="px-2 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded text-xs border border-blue-700 transition">Testcases</button>
                                <button onclick="app.toggleProblem(${p.id})" class="px-2 py-1 ${toggleBtnClass} rounded text-xs border transition">${toggleBtnText}</button>
                                <button onclick="app.deleteProblem(${p.id})" class="px-2 py-1 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded text-xs border border-red-700 transition">Xóa</button>
                            </td>
                        `;
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        console.error(e);
      }
    },

    // API Ẩn/Hiện bài
    toggleProblem: async function (id) {
      try {
        const res = await fetch(`/api/admin/problems/${id}/toggle`, {
          method: "POST",
          headers: { Authorization: "Bearer " + this.token },
        });
        const data = await res.json();
        if (data.success) {
          showToast(
            data.isPublic ? "Đã Public bài tập!" : "Đã Ẩn bài tập!",
            data.isPublic ? "bg-green-500" : "bg-gray-600",
          );
          this.fetchAdminProblems();
          this.fetchProblems(); // Cập nhật cả list ngoài
        }
      } catch (e) {
        showToast("Lỗi kết nối", "bg-red-500");
      }
    },

    // Mở Modal Bài Tập (Dùng chung cho Tạo Mới & Sửa)
    openProbModal: function (id = null) {
      const modal = document.getElementById("modal-problem");
      document.getElementById("admin-prob-id").value = id || "";
      document.getElementById("modal-prob-title").textContent = id
        ? `Sửa Bài Tập #${id}`
        : "Tạo Bài Tập Mới";

      if (id) {
        const p = this.adminAllProblems.find((x) => x.id === id);
        if (p) {
          document.getElementById("admin-prob-name").value = p.title;
          document.getElementById("admin-prob-time").value = p.timeLimitMs;
          document.getElementById("admin-prob-mem").value = p.memoryLimitKb;
          document.getElementById("admin-prob-points").value = p.points;
          document.getElementById("admin-prob-desc").value = p.description;
        }
      } else {
        // Reset form rỗng
        document.getElementById("admin-prob-name").value = "";
        document.getElementById("admin-prob-desc").value = "";
      }
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    },

    // Mở Modal Testcase
    openTcModal: function (id) {
      const p = this.adminAllProblems.find((x) => x.id === id);
      if (!p) return;
      document.getElementById("admin-tc-prob-id").value = id;
      document.getElementById("admin-tc-prob-name").textContent = p.title;
      document.getElementById("admin-tc-files").value = "";

      const modal = document.getElementById("modal-testcase");
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      // Gọi API quét file
      this.fetchTestcases(id);
    },
  });

  // Bắt sự kiện bấm nút Tạo Bài Tập
  document
    .getElementById("btn-show-add-prob")
    ?.addEventListener("click", () => app.openProbModal());

  // Submit form Lưu Bài Tập (Tạo mới)
  document
    .getElementById("btn-save-prob")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("admin-prob-id").value;
      const title = document.getElementById("admin-prob-name").value;
      const timeLimitMs = document.getElementById("admin-prob-time").value;
      const memoryLimitKb = document.getElementById("admin-prob-mem").value;
      const points = document.getElementById("admin-prob-points").value;
      const description = document.getElementById("admin-prob-desc").value;

      if (!title || !description)
        return showToast("Tên và Đề bài không được để trống", "bg-red-500");

      // Ghi chú: Hiện tại Backend đang chỉ có API Tạo mới (POST /api/problems), nếu có id thì cần gọi API Sửa (PUT)
      // Trong gói này ta tạm dùng POST để tạo mới. (Cần bổ sung API PUT sau).
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/problems/${id}` : "/api/problems";

      if (id)
        return showToast(
          "Chức năng cập nhật bài cũ đang viết API...",
          "bg-yellow-500 text-black",
        );

      try {
        const res = await fetch(url, {
          method: method,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + app.token,
          },
          body: JSON.stringify({
            title,
            timeLimitMs,
            memoryLimitKb,
            points,
            description,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Lưu thành công!", "bg-green-500");
          document.getElementById("modal-problem").classList.add("hidden");
          app.fetchAdminProblems();
          app.fetchProblems();
        } else throw new Error(data.error);
      } catch (e) {
        showToast(e.message, "bg-red-500");
      }
    });

  // Nút Upload Testcase
  document
    .getElementById("btn-save-testcase")
    ?.addEventListener("click", async () => {
      const probId = document.getElementById("admin-tc-prob-id").value;
      const files = document.getElementById("admin-tc-files").files;
      if (files.length === 0) return showToast("Chưa chọn file!", "bg-red-500");

      document.getElementById("btn-save-testcase").textContent = "Uploading...";
      const testcases = [];
      for (const file of files) {
        const content = await file.text();
        testcases.push({ name: file.name, content: content });
      }
      try {
        const res = await fetch(`/api/problems/${probId}/testcases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + app.token,
          },
          body: JSON.stringify({ testcases }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Upload Testcases OK!", "bg-green-500");
          document.getElementById("modal-testcase").classList.add("hidden");
        } else throw new Error(data.error);
      } catch (e) {
        showToast(e.message, "bg-red-500");
      }
      document.getElementById("btn-save-testcase").textContent = "Upload";
    });

  // Nút Lưu Kỳ Thi (Thêm Mới / Cập Nhật)
  document
    .getElementById("btn-save-contest")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("admin-contest-id").value;
      const title = document.getElementById("admin-contest-name").value;
      const description = document.getElementById("admin-contest-desc").value;
      const password = document.getElementById("admin-contest-pwd").value;
      const startTime = document.getElementById("admin-contest-start").value;
      const endTime = document.getElementById("admin-contest-end").value;
      const probsInput = document.getElementById("admin-contest-probs").value;

      if (!title || !startTime || !endTime)
        return showToast("Nhập đủ Tên và Thời gian", "bg-red-500");

      const problemIds = probsInput
        .split(",")
        .map((p) => parseInt(p.trim()))
        .filter((p) => !isNaN(p));
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/admin/contests/${id}` : "/api/contests/create";

      try {
        const res = await fetch(url, {
          method: method,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + app.token,
          },
          body: JSON.stringify({
            title,
            description,
            password,
            startTime,
            endTime,
            problemIds,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Lưu Kỳ thi thành công!", "bg-green-500");
          document.getElementById("modal-contest").classList.add("hidden");
          app.fetchAdminContests();
          app.fetchContests();
        } else throw new Error(data.error);
      } catch (e) {
        showToast(e.message, "bg-red-500");
      }
    });

  document
    .getElementById("btn-show-add-contest")
    ?.addEventListener("click", () => app.openContestModal());

  // Cập nhật User
  document
    .getElementById("btn-save-user")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("admin-user-id").value;
      const role = document.getElementById("admin-user-role").value;
      const password = document.getElementById("admin-user-pwd").value;

      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + app.token,
          },
          body: JSON.stringify({ role, password }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Cập nhật quyền lực thành công!", "bg-green-500");
          document.getElementById("modal-user").classList.add("hidden");
          app.fetchAdminUsers();
        } else throw new Error(data.error);
      } catch (e) {
        showToast(e.message, "bg-red-500");
      }
    });

  // Sự kiện Nút Lưu Mật Khẩu Mới
  document
    .getElementById("btn-save-pwd")
    ?.addEventListener("click", async () => {
      const oldPassword = document.getElementById("user-old-pwd").value;
      const newPassword = document.getElementById("user-new-pwd").value;
      if (!oldPassword || !newPassword)
        return showToast("Vui lòng nhập đủ mật khẩu!", "bg-red-500");

      try {
        const res = await fetch("/api/users/password", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + app.token,
          },
          body: JSON.stringify({ oldPassword, newPassword }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Đổi mật khẩu thành công!", "bg-green-500");
          document.getElementById("modal-change-pwd").classList.add("hidden");
        } else throw new Error(data.error);
      } catch (e) {
        showToast(e.message, "bg-red-500");
      }
    });

  // Xử lý Upload CSV hàng loạt
  document
    .getElementById("admin-csv-file")
    ?.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function (event) {
        const text = event.target.result;
        // Tách dòng, xóa khoảng trắng, lọc bỏ dòng trống
        const usernames = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (usernames.length === 0)
          return showToast("File CSV trống!", "bg-red-500");
        if (
          !confirm(
            `Tìm thấy ${usernames.length} tài khoản trong file. Bạn muốn tạo tất cả với mật khẩu mặc định "123456"?`,
          )
        ) {
          e.target.value = ""; // Reset input
          return;
        }

        try {
          showToast("Đang tạo tài khoản...", "bg-blue-500");
          const res = await fetch("/api/admin/users/bulk", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + app.token,
            },
            body: JSON.stringify({ usernames }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(
              `Tạo thành công ${data.added} user. Bỏ qua ${data.skipped} user bị trùng.`,
              "bg-green-500",
            );
            app.fetchAdminUsers();
          } else throw new Error(data.error);
        } catch (err) {
          showToast(err.message, "bg-red-500");
        }

        e.target.value = ""; // Reset input
      };
      reader.readAsText(file);
    });

  // Chức năng Copy Code trong màn hình Replay
  document.getElementById("btn-copy-code")?.addEventListener("click", () => {
    const code = document.getElementById("replay-code-content").value;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        showToast("Đã copy thành công!", "bg-green-500");
      })
      .catch(() => showToast("Lỗi copy!", "bg-red-500"));
  });

  // === 7. KHỞI TẠO DỮ LIỆU BAN ĐẦU ===
  app.updateNavAuth();
  app.switchTab(app.token ? "problems-list-view" : "auth-view");
  app.fetchProblems();
  app.fetchSubmissions();
  app.fetchLeaderboard();
  app.fetchContests();
  app.fetchAdminContests();
  app.fetchAdminProblems();
  app.fetchAdminUsers();
});
