document.addEventListener("DOMContentLoaded", () => {
  const problemSelect = document.getElementById("problemId");
  const submitBtn = document.getElementById("submit-btn");
  const resultOutput = document.getElementById("result-output");
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");

  let selectedProblemId = null;

  // Initialize Monaco Editor
  require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' }});
  require(['vs/editor/editor.main'], function() {
    window.editor = monaco.editor.create(document.getElementById('editor'), {
      value: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}',
      language: 'cpp',
      theme: 'vs-dark'
    });
  });

  // Fetch problems and populate the dropdown
  fetch("/problems")
    .then((response) => response.json())
    .then((problems) => {
      problems.forEach((problem) => {
        const option = document.createElement("option");
        option.value = problem.id;
        option.textContent = `${problem.id} - ${problem.title}`;
        problemSelect.appendChild(option);
      });
    });

  problemSelect.addEventListener("change", (e) => {
    selectedProblemId = e.target.value ? parseInt(e.target.value) : null;
  });

  // Handle code submission
  submitBtn.addEventListener("click", () => {
    if (!window.editor) {
      showToast("Editor is still loading...", "bg-red-500");
      return;
    }
    const sourceCode = window.editor.getValue();
    if (!selectedProblemId) {
      showToast("Please select a problem first.", "bg-red-500");
      return;
    }
    if (!sourceCode.trim()) {
      showToast("Please write some code.", "bg-red-500");
      return;
    }

    fetch("/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceCode,
        problemId: selectedProblemId,
        language: "cpp", // Or get this from a dropdown
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          resultOutput.innerHTML = `<p>Submission #${data.submissionId} received. Waiting for result...</p>`;
          
          const pollInterval = setInterval(() => {
            fetch(`/submission/${data.submissionId}`, { cache: "no-store" })
              .then((res) => res.json())
              .then((pollingData) => {
                if (pollingData.success) {
                  const submission = pollingData.submission;
                  const status = submission.status ? submission.status.trim() : "";
                  
                  if (
                    status === "Accepted (AC)" ||
                    status === "Wrong Answer (WA)" ||
                    status === "Compile Error (CE)" ||
                    status === "Time Limit Exceeded (TLE)" ||
                    status.includes("Runtime Error") ||
                    status.includes("Wrong Answer") ||
                    status.includes("Time Limit")
                  ) {
                    clearInterval(pollInterval);
                    
                    let statusClass = "text-red-600";
                    if (status.includes("Accepted")) statusClass = "text-green-600";
                    if (status.includes("Compile Error")) statusClass = "text-yellow-600";

                    resultOutput.innerHTML = `
                      <div class="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50 shadow-sm">
                        <div class="flex justify-between items-center mb-2">
                          <span class="font-semibold text-gray-700">Status:</span>
                          <span class="font-bold ${statusClass}">${status}</span>
                        </div>
                        <div class="flex justify-between items-center mb-2">
                          <span class="font-semibold text-gray-700">Time:</span>
                          <span class="text-gray-900">${submission.time !== null ? submission.time + ' ms' : 'N/A'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="font-semibold text-gray-700">Memory:</span>
                          <span class="text-gray-900">${submission.memory !== null ? submission.memory + ' KB' : 'N/A'}</span>
                        </div>
                      </div>
                    `;
                    showToast(
                      `Submission #${submission.id} finished with status: ${status}`
                    );
                  }
                }
              })
              .catch((err) => {
                console.error("Polling error:", err);
                clearInterval(pollInterval);
                showToast("Error checking submission status.", "bg-red-500");
              });
          }, 1000);
        } else {
          showToast(data.error || "Submission failed.", "bg-red-500");
        }
      });
  });

  function showToast(message, bgColor = "bg-green-500") {
    toastMessage.textContent = message;
    toast.className = `fixed bottom-5 right-5 text-white py-2 px-4 rounded-lg shadow-lg ${bgColor}`;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 3000);
  }
});
