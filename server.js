const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Load problems (simple JSON file)
const PROBLEMS_PATH = path.join(__dirname, 'problems.json');
let problems = [];
if (fs.existsSync(PROBLEMS_PATH)) {
  problems = JSON.parse(fs.readFileSync(PROBLEMS_PATH, 'utf8'));
}

app.get('/api/problems', (req, res) => {
  res.json(problems);
});

// Endpoint to submit code
app.post('/api/submit', (req, res) => {
  const { language, code, problemId } = req.body;
  if (!language || !code || !problemId) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const problem = problems.find(p => p.id === problemId);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }
  // Write submission to a temporary directory
  const workDir = path.join(__dirname, 'tmp', `${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const sourceFile = path.join(workDir, `Main${getExtension(language)}`);
  fs.writeFileSync(sourceFile, code);

  // Run sandboxed Docker container
  const cmd = `./run_submission.sh ${language} ${sourceFile} ${workDir} '${JSON.stringify(problem)}'`;
  exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
    // Clean up workspace
    fs.rmSync(workDir, { recursive: true, force: true });
    if (error) {
      return res.json({ success: false, error: stderr || error.message });
    }
    try {
      const result = JSON.parse(stdout);
      res.json({ success: true, result });
    } catch (e) {
      res.json({ success: false, error: 'Invalid response from sandbox' });
    }
  });
});

function getExtension(lang) {
  switch (lang) {
    case 'python': return '.py';
    case 'cpp': return '.cpp';
    case 'java': return '.java';
    default: return '.txt';
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
