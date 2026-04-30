document.addEventListener("DOMContentLoaded", () => {
  const problemSelect = document.getElementById("problemId");
  const submitBtn = document.getElementById("submit-btn");
  const resultOutput = document.getElementById("result-output");
  const languageSelect = document.getElementById("language");
  const toast = document.getElementById("toast");
  const leaderboardList = document.getElementById("leaderboard-list");
  const connStatus = document.getElementById("conn-status");

  let selectedProblemId = null;
  let activeSubmissionId = null;

  // Initialize Socket.io
  const socket = io();

  socket.on("connect", () => {
    connStatus.textContent = "Connected";
    connStatus.className = "text-green-500 font-medium";
  });

  socket.on("disconnect", () => {
    connStatus.textContent = "Disconnected";
    connStatus.className = "text-red-500 font-medium";
  });

  socket.on("submission_update", (submission) => {
    if (activeSubmissionId === submission.id) {
      updateResultPanel(submission);
    }
    
    // If it's an Accepted state, refetch the leaderboard
    if (submission.status === "Accepted (AC)") {
      fetchLeaderboard();
    }
  });

  // Initialize Monaco Editor
  require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' }});
  require(['vs/editor/editor.main'], function() {
    window.editor = monaco.editor.create(document.getElementById('editor'), {
      value: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << (a + b) << endl;\n    return 0;\n}',
      language: 'cpp',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    });

    languageSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      const model = window.editor.getModel();
      monaco.editor.setModelLanguage(model, lang);
      if (lang === 'python') {
        window.editor.setValue('a, b = map(int, input().split())\nprint(a + b)\n');
      } else {
        window.editor.setValue('#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << (a + b) << endl;\n    return 0;\n}');
      }
    });

    // Add keyboard shortcut for submitting
    window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      submitBtn.click();
    });
  });

  function fetchProblems() {
    fetch("/problems")
      .then((res) => res.json())
      .then((problems) => {
        problemSelect.innerHTML = '<option value="">Select a problem...</option>';
        problems.forEach((problem) => {
          const option = document.createElement("option");
          option.value = problem.id;
          option.textContent = `${problem.id}. ${problem.title}`;
          problemSelect.appendChild(option);
        });
      })
      .catch(err => console.error("Error fetching problems:", err));
  }

  function fetchLeaderboard() {
    fetch("/leaderboard")
      .then((res) => res.json())
      .then((leaderboard) => {
        leaderboardList.innerHTML = "";
        if (leaderboard.length === 0) {
          leaderboardList.innerHTML = '<li class="text-gray-500 text-sm italic">No ranking available yet.</li>';
          return;
        }
        leaderboard.forEach((user, index) => {
          const li = document.createElement("li");
          li.className = "flex justify-between items-center p-2 rounded hover:bg-gray-700 transition-colors";
          
          let rankColor = "text-gray-400";
          if (index === 0) rankColor = "text-yellow-400 font-bold";
          else if (index === 1) rankColor = "text-gray-300 font-semibold";
          else if (index === 2) rankColor = "text-orange-400 font-medium";

          li.innerHTML = `
            <div class="flex items-center space-x-3">
              <span class="${rankColor} w-4 text-center">${index + 1}</span>
              <span class="text-gray-200">${user.username}</span>
            </div>
            <span class="bg-blue-900/50 text-blue-300 text-xs py-1 px-2 rounded-full font-bold">
              ${user.solvedCount} <span class="font-normal opacity-75">AC</span>
            </span>
          `;
          leaderboardList.appendChild(li);
        });
      })
      .catch(err => console.error("Error fetching leaderboard:", err));
  }

  problemSelect.addEventListener("change", (e) => {
    selectedProblemId = e.target.value ? parseInt(e.target.value) : null;
  });

  submitBtn.addEventListener("click", () => {
    if (!window.editor) {
      showToast("Editor is still loading...", "bg-red-500");
      return;
    }
    const sourceCode = window.editor.getValue();
    const language = languageSelect.value;
    
    if (!selectedProblemId) {
      showToast("Please select a problem first.", "bg-yellow-500 text-yellow-900");
      return;
    }
    if (!sourceCode.trim()) {
      showToast("Please write some code.", "bg-yellow-500 text-yellow-900");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    submitBtn.textContent = "Submitting...";

    fetch("/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceCode,
        problemId: selectedProblemId,
        language: language,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.textContent = "Submit Code";

        if (data.success) {
          activeSubmissionId = data.submissionId;
          resultOutput.innerHTML = `
            <div class="animate-pulse flex space-x-3 items-center text-blue-400">
              <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Submission #${data.submissionId} sent. Waiting...</span>
            </div>
          `;
        } else {
          showToast(data.error || "Submission failed.", "bg-red-500 text-white");
        }
      })
      .catch(err => {
        console.error(err);
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.textContent = "Submit Code";
        showToast("Network error.", "bg-red-500 text-white");
      });
  });

  function updateResultPanel(submission) {
    const status = submission.status ? submission.status.trim() : "Pending";
    
    let statusClass = "text-yellow-400";
    let bgClass = "bg-yellow-900/20 border-yellow-700";
    
    if (status.includes("Accepted")) {
      statusClass = "text-green-400";
      bgClass = "bg-green-900/20 border-green-700";
    } else if (status.includes("Wrong Answer") || status.includes("Runtime Error") || status.includes("Time Limit") || status.includes("Compile Error")) {
      statusClass = "text-red-400";
      bgClass = "bg-red-900/20 border-red-700";
    } else if (status.includes("Compiling") || status.includes("Running")) {
      statusClass = "text-blue-400";
      bgClass = "bg-blue-900/20 border-blue-700";
    }

    const timeStr = submission.time !== null ? submission.time + ' ms' : '--';
    const memoryStr = submission.memory !== null ? submission.memory + ' KB' : '--';

    let html = `
    <div class="border ${bgClass} rounded-lg p-4 transition-all duration-300">
      <div class="flex justify-between items-center mb-4">
        <span class="font-medium text-gray-400">Status</span>
        <span class="font-bold ${statusClass}">${status}</span>
      </div>
      
      <div class="grid grid-cols-2 gap-4 text-center">
        <div class="bg-gray-800/50 rounded p-2 border border-gray-700">
           <div class="text-xs text-gray-500 uppercase">Time</div>
           <div class="font-mono text-gray-300 mt-1">${timeStr}</div>
        </div>
        <div class="bg-gray-800/50 rounded p-2 border border-gray-700">
           <div class="text-xs text-gray-500 uppercase">Memory</div>
           <div class="font-mono text-gray-300 mt-1">${memoryStr}</div>
        </div>
      </div>
  `;

  if (submission.compileOutput && status.includes("Compile Error")) {
    html += `
      <div class="mt-4">
        <div class="text-xs text-red-400 mb-1">Compiler Output:</div>
        <pre class="bg-gray-950 p-2 text-xs font-mono text-red-300 rounded overflow-x-auto border border-red-900/50 whitespace-pre-wrap">${escapeHtml(submission.compileOutput)}</pre>
      </div>
    `;
  }

    html += `</div>`;
    resultOutput.innerHTML = html;
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

  function showToast(message, colorClass = "bg-blue-500 text-white") {
    toast.textContent = message;
    toast.className = \`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-2xl transition-all duration-300 z-50 text-sm font-medium \${colorClass}\`;
    
    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-10");
    });

    setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-10");
    }, 3000);
  }

  fetchProblems();
  fetchLeaderboard();
});