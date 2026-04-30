const path = require('node:path');

const DEFAULT_WIDTH = 36;
const MIN_WIDTH = 12;

const STATUS_STATES = new Map([
  ['active', 'active'],
  ['running', 'active'],
  ['working', 'active'],
  ['thinking', 'waiting'],
  ['idle', 'waiting'],
  ['ready', 'waiting'],
  ['waiting', 'waiting'],
  ['done', 'done'],
  ['complete', 'done'],
  ['completed', 'done'],
  ['merged', 'done'],
  ['blocked', 'blocked'],
  ['error', 'failed'],
  ['failed', 'failed'],
  ['stalled', 'stalled'],
  ['dead', 'stalled'],
]);

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  inverse: '\x1b[7m',
};

const AGENT_LABELS = new Map([
  ['codex', 'cx'],
  ['claude', 'cc'],
  ['claude-code', 'cc'],
  ['claudecode', 'cc'],
  ['cursor', 'cu'],
  ['gemini', 'gm'],
]);

function text(value, fallback = '') {
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value).trim() || fallback;
}

function sidebarWidth(options = {}) {
  const width = Number(options.width);
  if (!Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }
  return Math.max(MIN_WIDTH, Math.floor(width));
}

function truncate(value, width) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (width <= 0) {
    return '';
  }
  if (raw.length <= width) {
    return raw;
  }
  if (width <= 3) {
    return raw.slice(0, width);
  }
  return `${raw.slice(0, width - 3)}...`;
}

function boundLine(value, width) {
  return truncate(value, width);
}

function repoName(state = {}, options = {}) {
  const explicit = text(options.repoName || state.repoName || state.projectName || state.repo);
  if (explicit) {
    return explicit;
  }

  const repoPath = text(state.repoPath);
  if (!repoPath) {
    return '-';
  }
  return path.basename(repoPath) || repoPath;
}

function agentLabel(agentName) {
  const raw = text(agentName, 'agent').toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, '');
  if (AGENT_LABELS.has(raw)) {
    return AGENT_LABELS.get(raw);
  }
  if (AGENT_LABELS.has(compact)) {
    return AGENT_LABELS.get(compact);
  }
  if (compact.includes('codex')) {
    return 'cx';
  }
  if (compact.includes('claude')) {
    return 'cc';
  }

  const parts = raw.match(/[a-z0-9]+/g) || [];
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return truncate(parts[0] || compact || 'ag', 2).padEnd(2, 'g');
}

function statusDot(session = {}) {
  const status = laneState(session);
  if (status === 'active') {
    return '*';
  }
  if (status === 'waiting') {
    return 'o';
  }
  if (status === 'done') {
    return '+';
  }
  if (status === 'missing') {
    return 'x';
  }
  if (status === 'blocked' || status === 'failed' || status === 'stalled') {
    return '!';
  }
  return '.';
}

function laneState(session = {}) {
  const status = text(session.status, 'unknown').toLowerCase();
  if (session.hidden === true || session.visible === false || status === 'hidden') {
    return 'hidden';
  }
  if (session.closed === true || session.closedAt || status === 'closed') {
    return 'closed';
  }
  if (session.worktreeExists === false || session.worktreeMissing === true || status === 'missing' || status === 'missing-worktree') {
    return 'missing';
  }
  return STATUS_STATES.get(status) || status || 'unknown';
}

function sessionId(session = {}) {
  return text(session.id || session.sessionId || session.branch);
}

function isSelected(session, index, state = {}, options = {}) {
  const selectedId = text(options.selectedId || options.selectedSessionId || state.selectedId || state.selectedSessionId);
  if (selectedId && sessionId(session) === selectedId) {
    return true;
  }

  const selectedBranch = text(options.selectedBranch || state.selectedBranch);
  if (selectedBranch && text(session.branch) === selectedBranch) {
    return true;
  }

  const selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : state.selectedIndex;
  return Number.isInteger(selectedIndex) && selectedIndex === index;
}

function colorEnabled(options = {}) {
  const env = options.env && typeof options.env === 'object' ? options.env : process.env;
  return options.color === true && !options.noColor && !env.NO_COLOR;
}

function colorize(value, color, options = {}) {
  if (!colorEnabled(options)) {
    return value;
  }
  const code = ANSI[color];
  return code ? `${code}${value}${ANSI.reset}` : value;
}

function statusColor(status) {
  if (status === 'active' || status === 'done') {
    return 'green';
  }
  if (status === 'waiting') {
    return 'yellow';
  }
  if (status === 'blocked' || status === 'failed' || status === 'stalled' || status === 'missing') {
    return 'red';
  }
  if (status === 'hidden' || status === 'closed') {
    return 'dim';
  }
  return 'cyan';
}

function laneName(session = {}) {
  const task = text(session.task || session.name || session.title);
  if (task) {
    return task;
  }

  const branch = text(session.branch);
  if (!branch) {
    return '(no task)';
  }
  return path.basename(branch);
}

function fitRow(left, right, width) {
  if (width <= 0) {
    return '';
  }

  if (right.length >= width - 2) {
    return truncate(`${left}${right}`, width);
  }

  const leftWidth = width - right.length;
  return `${truncate(left, leftWidth).padEnd(leftWidth, ' ')}${right}`;
}

function renderShortcutRows(width, options) {
  const rows = [
    '  [n]ew agent  [t]erminal',
    '  [s]ettings   [?] shortcuts',
  ];
  return rows.map((row) => colorize(boundLine(row, width), 'dim', options));
}

function renderSessionRow(session, index, state, options) {
  const width = sidebarWidth(options);
  const selected = isSelected(session, index, state, options);
  const marker = selected ? '>' : ' ';
  const status = laneState(session);
  const badge = `[${agentLabel(session.agentName || session.agent || session.owner)}] (${status})`;
  const row = fitRow(`${marker} ${laneName(session)}`, ` ${badge}`, width);

  return selected
    ? colorize(row, 'inverse', options)
    : colorize(row, statusColor(status), options);
}

function renderSidebar(state = {}, options = {}) {
  const width = sidebarWidth(options);
  const title = text(options.title || state.title, 'gx cockpit').toLowerCase() === 'gitguardex'
    ? 'gitguardex'
    : text(options.title || state.title, 'gx cockpit');
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const lines = [
    colorize(boundLine(title, width), 'cyan', options),
    colorize(boundLine(repoName(state, options), width), 'dim', options),
  ];

  if (sessions.length === 0) {
    lines.push(boundLine('  no agent lanes', width));
  } else {
    sessions.forEach((session, index) => {
      lines.push(renderSessionRow(session, index, state, options));
    });
  }

  lines.push(...renderShortcutRows(width, options));

  return `${lines.join('\n')}\n`;
}

module.exports = {
  renderSidebar,
  agentLabel,
  laneState,
  statusDot,
  truncate,
};
