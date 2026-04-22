const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ACTIVE_SESSIONS_RELATIVE_DIR = path.join('.omx', 'state', 'active-sessions');
const SESSION_SCHEMA_VERSION = 1;
const LOCK_FILE_RELATIVE = path.join('.omx', 'state', 'agent-file-locks.json');
const MAX_CHANGED_PATH_PREVIEW = 3;
const ACTIVE_SESSIONS_FILTER_PREFIX = ACTIVE_SESSIONS_RELATIVE_DIR.split(path.sep).join('/');

function toNonEmptyString(value, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : String(value || '').trim();
  return normalized || fallback;
}

function toPositiveInteger(value) {
  const normalized = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function sanitizeBranchForFile(branch) {
  const normalized = toNonEmptyString(branch, 'session');
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '__').replace(/^_+|_+$/g, '') || 'session';
}

function sessionFileNameForBranch(branch) {
  return `${sanitizeBranchForFile(branch)}.json`;
}

function activeSessionsDirForRepo(repoRoot) {
  return path.join(path.resolve(repoRoot), ACTIVE_SESSIONS_RELATIVE_DIR);
}

function sessionFilePathForBranch(repoRoot, branch) {
  return path.join(activeSessionsDirForRepo(repoRoot), sessionFileNameForBranch(branch));
}

function splitOutputLines(output) {
  if (typeof output !== 'string') {
    return null;
  }

  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function runGitLines(worktreePath, args) {
  try {
    const output = cp.execFileSync('git', ['-C', worktreePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return splitOutputLines(output);
  } catch (_error) {
    return null;
  }
}

function unquoteGitPath(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return trimmed.slice(1, -1);
  }
}

function formatFileCount(count) {
  return `${count} file${count === 1 ? '' : 's'}`;
}

function previewChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return '';
  }

  if (paths.length <= MAX_CHANGED_PATH_PREVIEW) {
    return paths.join(', ');
  }

  const preview = paths.slice(0, MAX_CHANGED_PATH_PREVIEW).join(', ');
  return `${preview}, +${paths.length - MAX_CHANGED_PATH_PREVIEW} more`;
}

function deriveRepoChangeStatus(statusPair) {
  if (statusPair === '??') {
    return {
      statusCode: '??',
      statusLabel: 'U',
      statusText: 'Untracked',
    };
  }

  const code = [statusPair[1], statusPair[0]].find((value) => value && value !== ' ') || 'M';
  const statusTextByCode = {
    A: 'Added',
    C: 'Copied',
    D: 'Deleted',
    M: 'Modified',
    R: 'Renamed',
    T: 'Type changed',
    U: 'Conflicted',
  };

  return {
    statusCode: code,
    statusLabel: code,
    statusText: statusTextByCode[code] || 'Changed',
  };
}

function parseRepoChangeLine(repoRoot, line) {
  if (typeof line !== 'string' || line.length < 4) {
    return null;
  }

  const statusPair = line.slice(0, 2);
  if (statusPair === '!!') {
    return null;
  }

  const rawPath = line.slice(3).trim();
  if (!rawPath) {
    return null;
  }

  let relativePath = rawPath;
  let originalPath = '';
  if (rawPath.includes(' -> ')) {
    const parts = rawPath.split(' -> ');
    if (parts.length === 2) {
      originalPath = unquoteGitPath(parts[0]);
      relativePath = parts[1];
    }
  }

  relativePath = unquoteGitPath(relativePath);
  if (!relativePath) {
    return null;
  }

  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  if (
    normalizedRelativePath === ACTIVE_SESSIONS_FILTER_PREFIX
    || normalizedRelativePath.startsWith(`${ACTIVE_SESSIONS_FILTER_PREFIX}/`)
  ) {
    return null;
  }

  const status = deriveRepoChangeStatus(statusPair);
  return {
    ...status,
    originalPath,
    relativePath,
    absolutePath: path.join(path.resolve(repoRoot), relativePath),
  };
}

function collectWorktreeChangedPaths(worktreePath) {
  const changedGroups = [
    runGitLines(worktreePath, ['diff', '--name-only', '--', '.', `:(exclude)${LOCK_FILE_RELATIVE}`]),
    runGitLines(worktreePath, ['diff', '--cached', '--name-only', '--', '.', `:(exclude)${LOCK_FILE_RELATIVE}`]),
    runGitLines(worktreePath, ['ls-files', '--others', '--exclude-standard']),
  ];

  if (changedGroups.some((group) => group === null)) {
    return null;
  }

  return [...new Set(changedGroups.flat())]
    .filter((relativePath) => relativePath && relativePath !== LOCK_FILE_RELATIVE)
    .sort((left, right) => left.localeCompare(right));
}

function deriveSessionActivity(session) {
  const changedPaths = collectWorktreeChangedPaths(session.worktreePath);
  if (!changedPaths) {
    return {
      activityKind: 'thinking',
      activityLabel: 'thinking',
      activityCountLabel: '',
      activitySummary: 'Worktree activity unavailable.',
      changeCount: 0,
      changedPaths: [],
    };
  }

  if (changedPaths.length === 0) {
    return {
      activityKind: 'thinking',
      activityLabel: 'thinking',
      activityCountLabel: '',
      activitySummary: 'Worktree clean.',
      changeCount: 0,
      changedPaths: [],
    };
  }

  return {
    activityKind: 'working',
    activityLabel: 'working',
    activityCountLabel: formatFileCount(changedPaths.length),
    activitySummary: previewChangedPaths(changedPaths),
    changeCount: changedPaths.length,
    changedPaths,
  };
}

function buildSessionRecord(input) {
  const repoRoot = path.resolve(toNonEmptyString(input.repoRoot));
  const worktreePath = path.resolve(toNonEmptyString(input.worktreePath));
  const branch = toNonEmptyString(input.branch);
  const pid = toPositiveInteger(input.pid);
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();

  if (!branch) {
    throw new Error('branch is required');
  }
  if (!repoRoot) {
    throw new Error('repoRoot is required');
  }
  if (!worktreePath) {
    throw new Error('worktreePath is required');
  }
  if (!pid) {
    throw new Error('pid must be a positive integer');
  }
  if (Number.isNaN(startedAt.getTime())) {
    throw new Error('startedAt must be a valid date');
  }

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    repoRoot,
    branch,
    taskName: toNonEmptyString(input.taskName, 'task'),
    agentName: toNonEmptyString(input.agentName, 'agent'),
    worktreePath,
    pid,
    cliName: toNonEmptyString(input.cliName, 'codex'),
    startedAt: startedAt.toISOString(),
  };
}

function deriveSessionLabel(branch, worktreePath) {
  const worktreeLeaf = toNonEmptyString(path.basename(worktreePath || ''));
  if (worktreeLeaf) {
    return worktreeLeaf;
  }
  return toNonEmptyString(branch).replace(/[\\/]+/g, '-') || 'unknown-agent';
}

function normalizeSessionRecord(input, options = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const repoRoot = toNonEmptyString(input.repoRoot);
  const branch = toNonEmptyString(input.branch);
  const worktreePath = toNonEmptyString(input.worktreePath);
  const startedAt = new Date(input.startedAt);
  const pid = toPositiveInteger(input.pid);

  if (!repoRoot || !branch || !worktreePath || !pid || Number.isNaN(startedAt.getTime())) {
    return null;
  }

  return {
    schemaVersion: toPositiveInteger(input.schemaVersion) || SESSION_SCHEMA_VERSION,
    repoRoot: path.resolve(repoRoot),
    branch,
    taskName: toNonEmptyString(input.taskName, 'task'),
    agentName: toNonEmptyString(input.agentName, 'agent'),
    worktreePath: path.resolve(worktreePath),
    pid,
    cliName: toNonEmptyString(input.cliName, 'codex'),
    startedAt: startedAt.toISOString(),
    filePath: toNonEmptyString(options.filePath),
    label: deriveSessionLabel(branch, worktreePath),
  };
}

function formatElapsedFrom(startedAt, now = Date.now()) {
  const startedAtMs = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return '0s';
  }

  const totalSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function isPidAlive(pid) {
  const normalizedPid = toPositiveInteger(pid);
  if (!normalizedPid) {
    return false;
  }

  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function readActiveSessions(repoRoot, options = {}) {
  const activeSessionsDir = activeSessionsDirForRepo(repoRoot);
  if (!fs.existsSync(activeSessionsDir)) {
    return [];
  }

  const now = options.now || Date.now();
  const sessions = [];
  for (const entry of fs.readdirSync(activeSessionsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(activeSessionsDir, entry.name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      continue;
    }

    const normalized = normalizeSessionRecord(parsed, { filePath });
    if (!normalized) {
      continue;
    }
    if (!options.includeStale && !isPidAlive(normalized.pid)) {
      continue;
    }

    normalized.elapsedLabel = formatElapsedFrom(normalized.startedAt, now);
    Object.assign(normalized, deriveSessionActivity(normalized));
    sessions.push(normalized);
  }

  sessions.sort((left, right) => {
    const timeDelta = Date.parse(right.startedAt) - Date.parse(left.startedAt);
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return left.label.localeCompare(right.label);
  });

  return sessions;
}

function readRepoChanges(repoRoot) {
  const statusLines = runGitLines(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!statusLines) {
    return [];
  }

  return statusLines
    .map((line) => parseRepoChangeLine(repoRoot, line))
    .filter(Boolean)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

module.exports = {
  ACTIVE_SESSIONS_RELATIVE_DIR,
  SESSION_SCHEMA_VERSION,
  activeSessionsDirForRepo,
  buildSessionRecord,
  collectWorktreeChangedPaths,
  deriveSessionLabel,
  deriveSessionActivity,
  formatElapsedFrom,
  formatFileCount,
  isPidAlive,
  normalizeSessionRecord,
  parseRepoChangeLine,
  previewChangedPaths,
  readActiveSessions,
  readRepoChanges,
  deriveRepoChangeStatus,
  sanitizeBranchForFile,
  sessionFileNameForBranch,
  sessionFilePathForBranch,
};
