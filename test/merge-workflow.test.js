const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const cliPath = path.resolve(__dirname, '..', 'bin', 'multiagent-safety.js');
const defaultGuardexHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-merge-home-'));

function withGuardexHome(extraEnv = {}) {
  return {
    ...process.env,
    GUARDEX_HOME_DIR: extraEnv.GUARDEX_HOME_DIR || defaultGuardexHomeDir,
    ...extraEnv,
  };
}

function runNode(args, cwd, extraEnv = {}) {
  return cp.spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: withGuardexHome(extraEnv),
  });
}

function runCmd(cmd, args, cwd, extraEnv = {}) {
  const sanitizedEnv = { ...process.env };
  delete sanitizedEnv.CODEX_THREAD_ID;
  delete sanitizedEnv.OMX_SESSION_ID;
  delete sanitizedEnv.CODEX_CI;
  delete sanitizedEnv.CLAUDECODE;
  delete sanitizedEnv.CLAUDE_CODE_SESSION_ID;

  const pushBypassEnv =
    cmd === 'git' && Array.isArray(args) && args[0] === 'push'
      ? { ALLOW_PUSH_ON_PROTECTED_BRANCH: '1' }
      : {};

  return cp.spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: { ...sanitizedEnv, ...pushBypassEnv, ...extraEnv },
  });
}

function initRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-merge-'));
  const repoDir = path.join(tempDir, 'repo');
  fs.mkdirSync(repoDir);

  let result = runCmd('git', ['init', '-b', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['config', 'user.email', 'bot@example.com'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['config', 'user.name', 'Bot'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  fs.writeFileSync(
    path.join(repoDir, 'package.json'),
    JSON.stringify({ name: path.basename(repoDir), private: true, scripts: {} }, null, 2) + '\n',
    'utf8',
  );

  return repoDir;
}

function seedCommit(repoDir) {
  let result = runCmd('git', ['add', '.'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['commit', '-m', 'seed'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function commitSetup(repoDir) {
  let result = runCmd('git', ['add', '.'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['commit', '-m', 'apply gx setup'], repoDir, {
    ALLOW_COMMIT_ON_PROTECTED_BRANCH: '1',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function commitFile(repoDir, relativePath, contents, message, options = {}) {
  const filePath = path.join(repoDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');

  const currentBranch = runCmd('git', ['branch', '--show-current'], repoDir);
  assert.equal(currentBranch.status, 0, currentBranch.stderr || currentBranch.stdout);
  const branchName = currentBranch.stdout.trim();
  const lockScriptPath = path.join(repoDir, 'scripts', 'agent-file-locks.py');
  if (branchName.startsWith('agent/') && fs.existsSync(lockScriptPath)) {
    const claim = runCmd(
      'python3',
      ['scripts/agent-file-locks.py', 'claim', '--branch', branchName, relativePath],
      repoDir,
    );
    if (!options.allowLockConflict) {
      assert.equal(claim.status, 0, claim.stderr || claim.stdout);
    }
  }

  let result = runCmd('git', ['add', relativePath], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const commitEnv = ['dev', 'main', 'master'].includes(branchName)
    ? { ALLOW_COMMIT_ON_PROTECTED_BRANCH: '1' }
    : {};
  const commitArgs = options.noVerify ? ['commit', '--no-verify', '-m', message] : ['commit', '-m', message];
  result = runCmd('git', commitArgs, repoDir, commitEnv);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function combinedOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function extractMergeTargetBranch(output) {
  const match = String(output || '').match(/\[agent-branch-merge\] Target branch: (.+)/);
  assert.ok(match, `missing merge target branch in output: ${output}`);
  return match[1].trim();
}

function extractMergeTargetWorktree(output) {
  const match = String(output || '').match(/\[agent-branch-merge\] Target worktree: (.+)/);
  assert.ok(match, `missing merge target worktree in output: ${output}`);
  return match[1].trim();
}

test('setup installs the managed merge workflow script and package entry', () => {
  const repoDir = initRepo();
  seedCommit(repoDir);

  const result = runNode(['setup', '--target', repoDir, '--no-global-install'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const mergeScriptPath = path.join(repoDir, 'scripts', 'agent-branch-merge.sh');
  assert.equal(fs.existsSync(mergeScriptPath), true, 'merge script should be installed');
  fs.accessSync(mergeScriptPath, fs.constants.X_OK);

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['agent:branch:merge'], 'bash ./scripts/agent-branch-merge.sh');
});

test('merge command creates an integration lane, reports overlaps, and merges cleanly', () => {
  const repoDir = initRepo();
  seedCommit(repoDir);

  let result = runNode(['setup', '--target', repoDir, '--no-global-install'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitSetup(repoDir);

  commitFile(repoDir, 'shared.txt', 'alpha\nbeta\ngamma\n', 'add shared baseline');

  result = runCmd('git', ['checkout', '-b', 'agent/test-merge-a'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitFile(repoDir, 'shared.txt', 'alpha-one\nbeta\ngamma\n', 'agent a update');

  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['checkout', '-b', 'agent/test-merge-b'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitFile(repoDir, 'shared.txt', 'alpha\nbeta\ngamma-two\n', 'agent b update', {
    allowLockConflict: true,
    noVerify: true,
  });

  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runNode(
    [
      'merge',
      '--target',
      repoDir,
      '--task',
      'merge-shared-smoke',
      '--branch',
      'agent/test-merge-a',
      '--branch',
      'agent/test-merge-b',
    ],
    repoDir,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = combinedOutput(result);
  assert.match(output, /Overlapping changed files detected across requested branches/);
  assert.match(output, /shared\.txt <- agent\/test-merge-a, agent\/test-merge-b/);

  const targetBranch = extractMergeTargetBranch(output);
  const targetWorktree = extractMergeTargetWorktree(output);
  assert.match(targetBranch, /^agent\/codex\/merge-shared-smoke-/);

  const mergedFile = fs.readFileSync(path.join(targetWorktree, 'shared.txt'), 'utf8');
  assert.equal(mergedFile, 'alpha-one\nbeta\ngamma-two\n');

  let ancestry = runCmd('git', ['merge-base', '--is-ancestor', 'agent/test-merge-a', targetBranch], repoDir);
  assert.equal(ancestry.status, 0, ancestry.stderr || ancestry.stdout);
  ancestry = runCmd('git', ['merge-base', '--is-ancestor', 'agent/test-merge-b', targetBranch], repoDir);
  assert.equal(ancestry.status, 0, ancestry.stderr || ancestry.stdout);

  assert.match(output, /OpenSpec change workspace: .+openspec\/changes\/agent-codex-merge-shared-smoke-/);
  assert.match(output, /OpenSpec plan workspace: .+openspec\/plan\/agent-codex-masterplan-merge-shared-smoke-/);
});

test('merge command reuses an owner lane and stops with resumable guidance on conflict', () => {
  const repoDir = initRepo();
  seedCommit(repoDir);

  let result = runNode(['setup', '--target', repoDir, '--no-global-install'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitSetup(repoDir);

  commitFile(repoDir, 'shared.txt', 'base-line\n', 'add shared conflict baseline');

  result = runCmd('git', ['checkout', '-b', 'agent/test-owner'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCmd('git', ['checkout', '-b', 'agent/test-helper-a'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitFile(repoDir, 'shared.txt', 'helper-a-line\n', 'helper a change');

  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['checkout', '-b', 'agent/test-helper-b'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitFile(repoDir, 'shared.txt', 'helper-b-line\n', 'helper b conflicting change', {
    allowLockConflict: true,
    noVerify: true,
  });

  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = runCmd('git', ['checkout', '-b', 'agent/test-helper-c'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  commitFile(repoDir, 'later.txt', 'later branch\n', 'helper c later branch');

  result = runCmd('git', ['checkout', 'dev'], repoDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runNode(
    [
      'merge',
      '--target',
      repoDir,
      '--into',
      'agent/test-owner',
      '--branch',
      'agent/test-helper-a',
      '--branch',
      'agent/test-helper-b',
      '--branch',
      'agent/test-helper-c',
    ],
    repoDir,
  );
  assert.equal(result.status, 1, 'merge should stop on conflict');

  const output = combinedOutput(result);
  assert.match(output, /Merge conflict detected while merging 'agent\/test-helper-b' into 'agent\/test-owner'/);
  assert.match(output, /Remaining branches:/);
  assert.match(output, /agent\/test-helper-c/);
  assert.match(output, /Resume after resolving with: gx merge --into agent\/test-owner --base dev --branch agent\/test-helper-c/);

  const targetWorktree = extractMergeTargetWorktree(output);
  let mergeHead = runCmd('git', ['-C', targetWorktree, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], repoDir);
  assert.equal(mergeHead.status, 0, mergeHead.stderr || mergeHead.stdout);

  let ancestry = runCmd('git', ['merge-base', '--is-ancestor', 'agent/test-helper-a', 'agent/test-owner'], repoDir);
  assert.equal(ancestry.status, 0, ancestry.stderr || ancestry.stdout);
  ancestry = runCmd('git', ['merge-base', '--is-ancestor', 'agent/test-helper-b', 'agent/test-owner'], repoDir);
  assert.notEqual(ancestry.status, 0, 'conflicting branch should not be fully integrated yet');
});
