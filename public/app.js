document.addEventListener('DOMContentLoaded', () => {
  const problemsDiv = document.getElementById('problems');
  const submissionSection = document.getElementById('submission');
  const titleEl = document.getElementById('problem-title');
  const descEl = document.getElementById('problem-desc');
  const codeArea = document.getElementById('code');
  const langSelect = document.getElementById('lang');
  const runBtn = document.getElementById('run');
  const outputEl = document.getElementById('output');

  // Load problem list
  fetch('/api/problems')
    .then(r => r.json())
    .then(problems => {
      problemsDiv.innerHTML = '';
      problems.forEach(p => {
        const div = document.createElement('div');
        div.className = 'problem';
        div.textContent = p.title;
        div.dataset.id = p.id;
        div.addEventListener('click', () => showProblem(p));
        problemsDiv.appendChild(div);
      });
    })
    .catch(err => {
      problemsDiv.textContent = 'Failed to load problems';
    });

  function showProblem(problem) {
    titleEl.textContent = problem.title;
    descEl.textContent = `${problem.description}\n\nInput: ${problem.input}\nOutput: ${problem.output}`;
    codeArea.value = '';
    outputEl.textContent = '';
    submissionSection.style.display = 'block';
    submissionSection.dataset.problemId = problem.id;
  }

  runBtn.addEventListener('click', () => {
    const problemId = submissionSection.dataset.problemId;
    const payload = {
      language: langSelect.value,
      code: codeArea.value,
      problemId,
    };
    outputEl.textContent = 'Running...';
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          outputEl.textContent = JSON.stringify(res.result, null, 2);
        } else {
          outputEl.textContent = `Error: ${res.error}`;
        }
      })
      .catch(err => {
        outputEl.textContent = `Request failed: ${err.message}`;
      });
  });
});
