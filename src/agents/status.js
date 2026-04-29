const { fs, path, LOCK_FILE_RELATIVE, TOOL_NAME } = require('../context');
const { listAgentSessions } = require('./sessions');

function readLockCounts(repoRoot) {
  const lockPath = path.join(repoRoot, LOCK_FILE_RELATIVE);
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_error) {
    parsed = null;
  }

  const locks = parsed?.locks && typeof parsed.locks === 'object' && !Array.isArray(parsed.locks)
    ? parsed.locks
    : {};
  const counts = new Map();
  for (const entry of Object.values(locks)) {
    const branch = typeof entry?.branch === 'string' ? entry.branch : '';
    if (!branch) continue;
    counts.set(branch, (counts.get(branch) || 0) + 1);
  }
  return counts;
}

function normalizeSessionForStatus(session, lockCounts) {
  const branch = session.branch || '';
  const worktreePath = session.worktreePath || '';
  return {
    id: session.id || '',
    agent: session.agent || '',
    task: session.task || '',
    branch,
    base: session.base || '',
    status: session.status || '',
    worktreePath,
    worktreeExists: worktreePath ? fs.existsSync(worktreePath) : false,
    lockCount: lockCounts.get(branch) || 0,
  };
}

function buildAgentsStatus(repoRoot) {
  const lockCounts = readLockCounts(repoRoot);
  return {
    schemaVersion: 1,
    repoRoot,
    sessions: listAgentSessions(repoRoot).map((session) => normalizeSessionForStatus(session, lockCounts)),
  };
}

function formatValue(value) {
  const text = String(value || '');
  return text || '-';
}

function renderAgentsStatus(payload, options = {}) {
  if (options.json) return `${JSON.stringify(payload, null, 2)}\n`;

  if (payload.sessions.length === 0) {
    return `[${TOOL_NAME}] Agent sessions: none (${payload.repoRoot})\n`;
  }

  const lines = [`[${TOOL_NAME}] Agent sessions: ${payload.sessions.length} (${payload.repoRoot})`];
  for (const session of payload.sessions) {
    lines.push(
      `- ${formatValue(session.id)} ${formatValue(session.agent)} ${formatValue(session.status)} ` +
      `branch=${formatValue(session.branch)} base=${formatValue(session.base)} ` +
      `worktreeExists=${session.worktreeExists ? 'yes' : 'no'} locks=${session.lockCount} ` +
      `task=${formatValue(session.task)} worktree=${formatValue(session.worktreePath)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function runStatusCommand(repoRoot, options = {}) {
  return renderAgentsStatus(buildAgentsStatus(repoRoot), options);
}

module.exports = {
  buildAgentsStatus,
  renderAgentsStatus,
  runStatusCommand,
};
