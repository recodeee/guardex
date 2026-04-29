const {
  test,
  assert,
  fs,
  path,
  runNode,
  initRepo,
  seedCommit,
} = require('./helpers/install-test-helpers');
const { createAgentSession } = require('../src/agents/sessions');

function makeRepo() {
  const repoDir = initRepo();
  seedCommit(repoDir);
  return repoDir;
}

test('agents status prints a compact empty state', () => {
  const repoDir = makeRepo();

  const result = runNode(['agents', 'status', '--target', repoDir], repoDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), `[gitguardex] Agent sessions: none (${repoDir})`);
});

test('agents status prints one canonical session with worktree and lock count', () => {
  const repoDir = makeRepo();
  const worktreePath = path.join(repoDir, '.omx', 'agent-worktrees', 'demo');
  fs.mkdirSync(worktreePath, { recursive: true });
  createAgentSession(repoDir, {
    id: 'session-1',
    agent: 'codex',
    task: 'Build status',
    branch: 'agent/codex/status',
    base: 'main',
    status: 'working',
    worktreePath,
  });
  const lockPath = path.join(repoDir, '.omx', 'state', 'agent-file-locks.json');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify({
    locks: {
      'src/a.js': { branch: 'agent/codex/status' },
      'src/b.js': { branch: 'agent/codex/status' },
      'src/other.js': { branch: 'agent/codex/other' },
    },
  }, null, 2)}\n`, 'utf8');

  const result = runNode(['agents', 'status', '--target', repoDir], repoDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(`Agent sessions: 1 \\(${repoDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
  assert.match(result.stdout, /session-1 codex working branch=agent\/codex\/status base=main/);
  assert.match(result.stdout, /worktreeExists=yes locks=2 task=Build status/);
  assert.match(result.stdout, new RegExp(`worktree=${worktreePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('agents status marks missing worktrees', () => {
  const repoDir = makeRepo();
  const missingWorktree = path.join(repoDir, '.omx', 'agent-worktrees', 'missing');
  createAgentSession(repoDir, {
    id: 'session-missing',
    agent: 'claude',
    task: 'Missing worktree',
    branch: 'agent/claude/missing',
    base: 'dev',
    status: 'stale',
    worktreePath: missingWorktree,
  });

  const result = runNode(['agents', 'status', '--target', repoDir], repoDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /session-missing claude stale branch=agent\/claude\/missing base=dev/);
  assert.match(result.stdout, /worktreeExists=no locks=0 task=Missing worktree/);
});

test('agents status --json emits stable cockpit-ready payload', () => {
  const repoDir = makeRepo();
  const worktreePath = path.join(repoDir, '.omx', 'agent-worktrees', 'json');
  fs.mkdirSync(worktreePath, { recursive: true });
  createAgentSession(repoDir, {
    id: 'session-json',
    agent: 'codex',
    task: 'JSON status',
    branch: 'agent/codex/json',
    base: 'main',
    status: 'active',
    worktreePath,
  });

  const result = runNode(['agents', 'status', '--target', repoDir, '--json'], repoDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(payload), ['schemaVersion', 'repoRoot', 'sessions']);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.repoRoot, repoDir);
  assert.deepEqual(Object.keys(payload.sessions[0]), [
    'id',
    'agent',
    'task',
    'branch',
    'base',
    'status',
    'worktreePath',
    'worktreeExists',
    'lockCount',
  ]);
  assert.deepEqual(payload.sessions[0], {
    id: 'session-json',
    agent: 'codex',
    task: 'JSON status',
    branch: 'agent/codex/json',
    base: 'main',
    status: 'active',
    worktreePath,
    worktreeExists: true,
    lockCount: 0,
  });
});
