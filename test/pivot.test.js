const {
  test,
  assert,
  fs,
  path,
  cp,
  canSpawnChildProcesses,
  spawnUnavailableReason,
  runNode,
  runCmd,
  initRepoOnBranch,
  attachOriginRemoteForBranch,
  seedCommit,
  extractCreatedWorktree,
  extractCreatedBranch,
} = require('./helpers/install-test-helpers');

if (!canSpawnChildProcesses) {
  test.skip(`pivot test skipped: ${spawnUnavailableReason}`, () => {});
} else {
  test('gx pivot from a protected branch creates an agent worktree and emits machine-parseable trailer', () => {
    const repoDir = initRepoOnBranch('main');
    seedCommit(repoDir);
    attachOriginRemoteForBranch(repoDir, 'main');

    let result = runNode(['setup', '--target', repoDir, '--no-global-install'], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    result = runCmd('git', ['add', '.'], repoDir);
    assert.equal(result.status, 0, result.stderr);
    result = runCmd('git', ['commit', '-m', 'apply gx setup'], repoDir, {
      ALLOW_COMMIT_ON_PROTECTED_BRANCH: '1',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    result = runCmd('git', ['push', 'origin', 'main'], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    result = runNode(['pivot', 'pivot-smoke', 'claude-test', '--target', repoDir], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const worktreePathMatch = result.stdout.match(/^WORKTREE_PATH=(.+)$/m);
    const branchMatch = result.stdout.match(/^BRANCH=(.+)$/m);
    const nextStepMatch = result.stdout.match(/^NEXT_STEP=cd "(.+)"$/m);
    assert.ok(worktreePathMatch, `expected WORKTREE_PATH= trailer in output:\n${result.stdout}`);
    assert.ok(branchMatch, `expected BRANCH= trailer in output:\n${result.stdout}`);
    assert.ok(nextStepMatch, `expected NEXT_STEP= trailer in output:\n${result.stdout}`);

    const wtPath = worktreePathMatch[1].trim();
    const branchName = branchMatch[1].trim();
    assert.equal(nextStepMatch[1].trim(), wtPath);
    assert.match(branchName, /^agent\//);
    assert.equal(fs.existsSync(wtPath), true, `worktree path should exist: ${wtPath}`);

    const reportedWorktree = extractCreatedWorktree(result.stdout);
    assert.equal(reportedWorktree, wtPath);
    assert.equal(extractCreatedBranch(result.stdout), branchName);
  });

  test('gx pivot inside an existing agent worktree short-circuits without creating a new branch', () => {
    const repoDir = initRepoOnBranch('main');
    seedCommit(repoDir);
    attachOriginRemoteForBranch(repoDir, 'main');

    let result = runNode(['setup', '--target', repoDir, '--no-global-install'], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    result = runCmd('git', ['add', '.'], repoDir);
    assert.equal(result.status, 0, result.stderr);
    result = runCmd('git', ['commit', '-m', 'apply gx setup'], repoDir, {
      ALLOW_COMMIT_ON_PROTECTED_BRANCH: '1',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    result = runCmd('git', ['push', 'origin', 'main'], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    result = runNode(['pivot', 'pivot-existing', 'claude-test', '--target', repoDir], repoDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const wtPath = result.stdout.match(/^WORKTREE_PATH=(.+)$/m)[1].trim();
    const branchName = result.stdout.match(/^BRANCH=(.+)$/m)[1].trim();

    // Re-invoke pivot from inside the new worktree — should short-circuit.
    const second = runNode(['pivot'], wtPath);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /Already on agent branch/);
    const secondPath = second.stdout.match(/^WORKTREE_PATH=(.+)$/m);
    const secondBranch = second.stdout.match(/^BRANCH=(.+)$/m);
    assert.ok(secondPath);
    assert.ok(secondBranch);
    assert.equal(secondBranch[1].trim(), branchName);
    assert.equal(path.resolve(secondPath[1].trim()), path.resolve(wtPath));
  });
}
