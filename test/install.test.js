const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const cliPath = path.resolve(__dirname, '..', 'bin', 'multiagent-safety.js');

function run(args, cwd) {
  return cp.spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('install provisions workflow files and repo config', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-safety-'));
  const repoDir = path.join(tempDir, 'repo');
  fs.mkdirSync(repoDir);

  let result = cp.spawnSync('git', ['init', '-b', 'dev'], { cwd: repoDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  fs.writeFileSync(
    path.join(repoDir, 'package.json'),
    JSON.stringify({ name: 'demo', private: true, scripts: {} }, null, 2) + '\n',
  );

  result = run(['install', '--target', repoDir], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const requiredFiles = [
    'scripts/agent-branch-start.sh',
    'scripts/agent-branch-finish.sh',
    'scripts/agent-file-locks.py',
    'scripts/install-agent-git-hooks.sh',
    '.githooks/pre-commit',
    '.omx/state/agent-file-locks.json',
    'AGENTS.md',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(fs.existsSync(path.join(repoDir, relativePath)), true, `${relativePath} missing`);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['agent:branch:start'], 'bash ./scripts/agent-branch-start.sh');
  assert.equal(packageJson.scripts['agent:locks:claim'], 'python3 ./scripts/agent-file-locks.py claim');

  const agentsContent = fs.readFileSync(path.join(repoDir, 'AGENTS.md'), 'utf8');
  assert.equal(agentsContent.includes('<!-- multiagent-safety:START -->'), true);

  result = cp.spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '.githooks');

  const secondRun = run(['install', '--target', repoDir], repoDir);
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
});
