'use strict';

const { readCockpitState } = require('./state');
const { renderSidebar } = require('./sidebar');
const { renderSettingsScreen } = require('./settings-render');
const { runCockpitAction } = require('./action-runner');

const DEFAULT_REFRESH_MS = 2000;
const DEFAULT_SETTINGS = {
  sidebarWidth: 32,
  refreshMs: DEFAULT_REFRESH_MS,
  defaultAgent: 'codex',
  defaultBase: 'main',
};

const MODES = new Set(['details', 'menu', 'settings']);
const SETTINGS_FIELDS = [
  'theme',
  'sidebarWidth',
  'refreshMs',
  'showWorktreePaths',
  'defaultAgent',
  'defaultBase',
  'autopilotDefault',
  'showLocks',
  'editorCommand',
];

const MENU_ITEMS = [
  { id: 'start-agent', label: 'Start agent', intent: 'agent:start' },
  { id: 'terminal', label: 'Open terminal', intent: 'terminal:open' },
  { id: 'refresh', label: 'Refresh now', intent: 'refresh' },
  { id: 'settings', label: 'Settings', mode: 'settings' },
  { id: 'quit', label: 'Quit', intent: 'quit' },
];

function text(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function wrapIndex(index, length) {
  if (length <= 0) return 0;
  const next = Number.isInteger(index) ? index : 0;
  return ((next % length) + length) % length;
}

function sessionId(session = {}) {
  return text(session.id || session.sessionId || session.branch);
}

function selectedSession(state = {}) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  if (sessions.length === 0) return null;
  return sessions[clampIndex(state.selectedIndex, sessions.length)] || null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function cockpitSessions(state = {}) {
  if (Array.isArray(state.sessions)) return state.sessions;
  if (state.agentsStatus && Array.isArray(state.agentsStatus.sessions)) return state.agentsStatus.sessions;
  return [];
}

function resolveSelectedSession(state = {}, options = {}) {
  if (options.session) return options.session;
  if (options.selectedSession) return options.selectedSession;

  const sessions = cockpitSessions(state);
  const requestedSessionId = firstString(options.sessionId, state.selectedSessionId);
  if (requestedSessionId) {
    return sessions.find((session) => sessionId(session) === requestedSessionId) || null;
  }

  const requestedBranch = firstString(options.branch, state.selectedBranch);
  if (requestedBranch) {
    return sessions.find((session) => firstString(session.branch, session.lane && session.lane.branch) === requestedBranch) || null;
  }

  const selectedIndex = Number.isInteger(options.selectedIndex)
    ? options.selectedIndex
    : Number.isInteger(state.selectedIndex)
      ? state.selectedIndex
      : 0;
  return sessions[selectedIndex] || null;
}

function buildCockpitActionContext(state = {}, options = {}) {
  return {
    ...options,
    session: resolveSelectedSession(state, options),
    repoRoot: firstString(options.repoRoot, options.repoPath, state.repoPath),
    baseBranch: firstString(options.baseBranch, state.baseBranch),
  };
}

function runCockpitControlAction(action, state = {}, options = {}) {
  return runCockpitAction(action, buildCockpitActionContext(state, options));
}

function runSelectedLaneAction(action, context = {}) {
  if (context.state) {
    return runCockpitControlAction(action, context.state, context);
  }
  return runCockpitAction(action, context);
}

function normalizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

function normalizeMode(mode) {
  return MODES.has(mode) ? mode : 'details';
}

function normalizeControlState(state = {}) {
  const cockpitState = state.cockpitState && typeof state.cockpitState === 'object'
    ? state.cockpitState
    : state;
  const sessions = Array.isArray(state.sessions)
    ? state.sessions
    : Array.isArray(cockpitState.sessions)
      ? cockpitState.sessions
      : [];
  const selectedIndex = clampIndex(number(state.selectedIndex, 0), sessions.length);
  const selected = sessions[selectedIndex] || null;

  return {
    ...state,
    cockpitState,
    repoPath: text(state.repoPath || cockpitState.repoPath),
    baseBranch: text(state.baseBranch || cockpitState.baseBranch),
    sessions,
    selectedIndex,
    selectedSessionId: text(state.selectedSessionId || (selected && sessionId(selected))),
    mode: normalizeMode(state.mode),
    menuIndex: wrapIndex(number(state.menuIndex, 0), MENU_ITEMS.length),
    settingsIndex: wrapIndex(number(state.settingsIndex, 0), SETTINGS_FIELDS.length),
    settings: normalizeSettings(state.settings),
    lastIntent: state.lastIntent || null,
    shouldExit: Boolean(state.shouldExit),
    error: state.error || null,
  };
}

function mergeCockpitSnapshot(state, snapshot, settings, at) {
  const current = normalizeControlState(state);
  const cockpitState = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const sessions = Array.isArray(cockpitState.sessions) ? cockpitState.sessions : [];
  const previousId = text(current.selectedSessionId);
  const byId = previousId ? sessions.findIndex((session) => sessionId(session) === previousId) : -1;
  const selectedIndex = byId >= 0 ? byId : clampIndex(current.selectedIndex, sessions.length);
  const selected = sessions[selectedIndex] || null;

  return normalizeControlState({
    ...current,
    cockpitState,
    repoPath: text(cockpitState.repoPath, current.repoPath),
    baseBranch: text(cockpitState.baseBranch, current.baseBranch),
    sessions,
    selectedIndex,
    selectedSessionId: selected ? sessionId(selected) : '',
    settings: normalizeSettings(settings || current.settings),
    lastRefreshAt: at || current.lastRefreshAt,
    lastIntent: null,
    error: null,
  });
}

function buildIntent(state, kind) {
  const current = normalizeControlState(state);
  const session = selectedSession(current);
  if (kind === 'quit') {
    return { type: 'quit' };
  }
  if (kind === 'refresh') {
    return { type: 'refresh' };
  }
  if (kind === 'agent:start') {
    return {
      type: 'agent:start',
      agent: current.settings.defaultAgent,
      base: current.settings.defaultBase,
    };
  }
  if (kind === 'terminal:open') {
    return {
      type: 'terminal:open',
      sessionId: session ? sessionId(session) : '',
      branch: session ? text(session.branch) : '',
      worktreePath: session ? text(session.worktreePath) : '',
    };
  }
  if (kind === 'settings:edit') {
    const field = SETTINGS_FIELDS[current.settingsIndex] || SETTINGS_FIELDS[0];
    return {
      type: 'settings:edit',
      field,
      value: current.settings[field],
    };
  }
  return { type: kind };
}

function chooseMenuItem(state) {
  const current = normalizeControlState(state);
  const item = MENU_ITEMS[current.menuIndex] || MENU_ITEMS[0];
  if (item.mode) {
    return normalizeControlState({
      ...current,
      mode: item.mode,
      lastIntent: null,
    });
  }
  const intent = buildIntent(current, item.intent);
  return normalizeControlState({
    ...current,
    shouldExit: intent.type === 'quit',
    lastIntent: intent,
  });
}

function normalizeKey(value) {
  if (!value) return '';
  const raw = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  if (raw === '\u0003') return 'ctrl-c';
  if (raw === '\u001b') return 'escape';
  if (raw === '\r' || raw === '\n') return 'enter';
  if (raw === '\u001b[A') return 'up';
  if (raw === '\u001b[B') return 'down';
  if (raw === '\t') return 'tab';
  return raw.toLowerCase();
}

function applyKey(state, rawKey) {
  const current = normalizeControlState(state);
  const key = normalizeKey(rawKey);
  const mode = current.mode;

  if (key === 'ctrl-c' || key === 'q') {
    return normalizeControlState({
      ...current,
      shouldExit: true,
      lastIntent: buildIntent(current, 'quit'),
    });
  }
  if (key === 'escape') {
    return normalizeControlState({
      ...current,
      mode: 'details',
      lastIntent: null,
    });
  }
  if (key === 's') {
    return normalizeControlState({
      ...current,
      mode: 'settings',
      lastIntent: null,
    });
  }
  if (key === 'm' || key === 'tab') {
    return normalizeControlState({
      ...current,
      mode: 'menu',
      lastIntent: null,
    });
  }
  if (key === 'r') {
    return normalizeControlState({
      ...current,
      lastIntent: buildIntent(current, 'refresh'),
    });
  }
  if (key === 'enter') {
    if (mode === 'menu') return chooseMenuItem(current);
    if (mode === 'settings') {
      return normalizeControlState({
        ...current,
        lastIntent: buildIntent(current, 'settings:edit'),
      });
    }
    return normalizeControlState({
      ...current,
      mode: 'menu',
      lastIntent: null,
    });
  }
  if (key === 'down' || key === 'j') {
    if (mode === 'menu') {
      return normalizeControlState({ ...current, menuIndex: current.menuIndex + 1, lastIntent: null });
    }
    if (mode === 'settings') {
      return normalizeControlState({ ...current, settingsIndex: current.settingsIndex + 1, lastIntent: null });
    }
    return normalizeControlState({ ...current, selectedIndex: current.selectedIndex + 1, selectedSessionId: '', lastIntent: null });
  }
  if (key === 'up' || key === 'k') {
    if (mode === 'menu') {
      return normalizeControlState({ ...current, menuIndex: current.menuIndex - 1, lastIntent: null });
    }
    if (mode === 'settings') {
      return normalizeControlState({ ...current, settingsIndex: current.settingsIndex - 1, lastIntent: null });
    }
    return normalizeControlState({ ...current, selectedIndex: current.selectedIndex - 1, selectedSessionId: '', lastIntent: null });
  }

  return current;
}

function applyCockpitAction(state, action = {}) {
  const current = normalizeControlState(state);
  const type = action.type || action.kind;

  if (type === 'refresh' || type === 'state:refresh') {
    return mergeCockpitSnapshot(current, action.cockpitState || action.state, action.settings, action.at);
  }
  if (type === 'key') {
    return applyKey(current, action.key || action.input || action.sequence || action.name);
  }
  if (type === 'mode') {
    return normalizeControlState({ ...current, mode: action.mode, lastIntent: null });
  }
  if (type === 'select') {
    return normalizeControlState({ ...current, selectedIndex: number(action.index, current.selectedIndex), selectedSessionId: '', lastIntent: null });
  }
  if (type === 'menu:choose') {
    return chooseMenuItem(current);
  }
  if (type === 'intent:clear') {
    return normalizeControlState({ ...current, lastIntent: null });
  }
  if (type === 'error') {
    return normalizeControlState({ ...current, error: action.error || action.message || 'Unknown cockpit error' });
  }
  if (type === 'quit') {
    return normalizeControlState({ ...current, shouldExit: true, lastIntent: buildIntent(current, 'quit') });
  }

  return current;
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function splitLines(value) {
  return String(value || '').replace(/\n$/, '').split('\n');
}

function padAnsi(value, width) {
  const raw = String(value || '');
  const visible = stripAnsi(raw).length;
  return visible >= width ? raw : `${raw}${' '.repeat(width - visible)}`;
}

function selectedField(state) {
  const current = normalizeControlState(state);
  return SETTINGS_FIELDS[current.settingsIndex] || SETTINGS_FIELDS[0];
}

function renderDetailsPanel(state) {
  const current = normalizeControlState(state);
  const session = selectedSession(current);
  const lines = [
    'details',
    `repo: ${current.repoPath || '-'}`,
    `base: ${current.baseBranch || '-'}`,
    `mode: ${current.mode}`,
    `refresh: ${current.settings.refreshMs}ms`,
    '',
  ];

  if (!session) {
    lines.push('No session selected.');
  } else {
    lines.push(
      `session: ${sessionId(session) || '-'}`,
      `agent: ${text(session.agentName, 'agent')}`,
      `status: ${text(session.status, 'unknown')}`,
      `branch: ${text(session.branch, '-')}`,
      `worktree: ${text(session.worktreePath, '-')}`,
    );
    if (session.task) lines.push(`task: ${session.task}`);
    lines.push(`locks: ${Number.isFinite(session.lockCount) ? session.lockCount : 0}`);
  }

  lines.push('', 'keys: up/down select  m menu  s settings  r refresh  q quit');
  if (current.error) {
    lines.push('', `error: ${text(current.error)}`);
  }
  if (current.lastIntent) {
    lines.push('', `intent: ${current.lastIntent.type}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderMenuPanel(state) {
  const current = normalizeControlState(state);
  const lines = [
    'menu',
    '',
  ];

  MENU_ITEMS.forEach((item, index) => {
    const marker = index === current.menuIndex ? '>' : ' ';
    lines.push(`${marker} ${item.label}`);
  });

  lines.push('', 'keys: up/down move  enter choose  esc details');
  if (current.lastIntent) {
    lines.push('', `intent: ${current.lastIntent.type}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderSettingsPanel(state) {
  const current = normalizeControlState(state);
  return renderSettingsScreen(current.settings, {
    selectedField: selectedField(current),
  });
}

function renderPanel(state) {
  const current = normalizeControlState(state);
  if (current.mode === 'menu') return renderMenuPanel(current);
  if (current.mode === 'settings') return renderSettingsPanel(current);
  return renderDetailsPanel(current);
}

function renderControlFrame(state) {
  const current = normalizeControlState(state);
  const width = number(current.settings.sidebarWidth, DEFAULT_SETTINGS.sidebarWidth);
  const sidebar = splitLines(renderSidebar(current, { width, noColor: true }));
  const panel = splitLines(renderPanel(current));
  const leftWidth = Math.max(width, ...sidebar.map((line) => stripAnsi(line).length));
  const max = Math.max(sidebar.length, panel.length);
  const lines = [];

  for (let index = 0; index < max; index += 1) {
    lines.push(`${padAnsi(sidebar[index] || '', leftWidth)}  ${panel[index] || ''}`.trimEnd());
  }

  return `${lines.join('\n')}\n`;
}

function optionalSettingsModule() {
  try {
    return require('./settings');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND' && String(error.message || '').includes('./settings')) {
      return null;
    }
    throw error;
  }
}

function readCockpitSettings(repoPath = process.cwd(), deps = {}) {
  if (typeof deps.readSettings === 'function') return deps.readSettings(repoPath);
  if (typeof deps.readCockpitSettings === 'function') return deps.readCockpitSettings(repoPath);

  const settingsModule = optionalSettingsModule();
  if (!settingsModule) return {};
  if (typeof settingsModule.readCockpitSettings === 'function') return settingsModule.readCockpitSettings(repoPath);
  if (typeof settingsModule.readSettings === 'function') return settingsModule.readSettings(repoPath);
  if (typeof settingsModule.loadSettings === 'function') return settingsModule.loadSettings(repoPath);
  return {};
}

function readControlSnapshot(options = {}, previousState) {
  const repoPath = options.repoPath || process.cwd();
  const stateReader = typeof options.readState === 'function' ? options.readState : readCockpitState;
  const cockpitState = stateReader(repoPath);
  const settings = readCockpitSettings(repoPath, options);
  const at = typeof options.now === 'function' ? options.now() : new Date().toISOString();
  return applyCockpitAction(previousState || { repoPath }, {
    type: 'refresh',
    cockpitState,
    settings,
    at,
  });
}

function refreshMsFrom(options, state) {
  if (options.refreshMs === false || options.refreshMs === 0) return 0;
  const requested = number(options.refreshMs, number(state && state.settings && state.settings.refreshMs, DEFAULT_REFRESH_MS));
  return requested > 0 ? requested : DEFAULT_REFRESH_MS;
}

function startCockpitControl(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const setTimer = options.setInterval || setInterval;
  const clearTimer = options.clearInterval || clearInterval;
  const clearScreen = options.clearScreen !== false;
  let state = readControlSnapshot(options);
  let interval = null;
  let stopped = false;
  let rawModeEnabled = false;

  const paint = () => {
    if (stdout && typeof stdout.write === 'function') {
      if (clearScreen && stdout.isTTY) stdout.write('\x1b[H\x1b[2J\x1b[3J');
      stdout.write(renderControlFrame(state));
    }
  };

  const refresh = () => {
    try {
      state = readControlSnapshot(options, state);
    } catch (error) {
      state = applyCockpitAction(state, {
        type: 'error',
        error: error && error.message ? error.message : String(error),
      });
    }
    paint();
    return state;
  };

  const dispatch = (action) => {
    state = applyCockpitAction(state, action);
    const intent = state.lastIntent;
    if (intent && intent.type === 'refresh') {
      state = applyCockpitAction(state, { type: 'intent:clear' });
      refresh();
    } else {
      paint();
    }
    if (state.shouldExit) stop();
    return intent;
  };

  const onData = (chunk) => dispatch({ type: 'key', key: chunk });

  function stop() {
    if (stopped) return state;
    stopped = true;
    if (interval) {
      clearTimer(interval);
      interval = null;
    }
    if (stdin && typeof stdin.off === 'function') {
      stdin.off('data', onData);
    } else if (stdin && typeof stdin.removeListener === 'function') {
      stdin.removeListener('data', onData);
    }
    if (rawModeEnabled && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(false);
    }
    return state;
  }

  paint();

  const ms = refreshMsFrom(options, state);
  if (ms > 0) {
    interval = setTimer(refresh, ms);
    if (interval && typeof interval.unref === 'function') interval.unref();
  }

  if (stdin && stdin.isTTY && typeof stdin.on === 'function') {
    if (typeof stdin.setEncoding === 'function') stdin.setEncoding('utf8');
    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
      rawModeEnabled = true;
    }
    if (typeof stdin.resume === 'function') stdin.resume();
    stdin.on('data', onData);
  }

  return {
    dispatch,
    refresh,
    stop,
    getState: () => state,
  };
}

if (require.main === module) {
  startCockpitControl({
    repoPath: process.argv[2] || process.cwd(),
    refreshMs: Number.parseInt(process.env.GUARDEX_COCKPIT_REFRESH_MS || String(DEFAULT_REFRESH_MS), 10),
  });
}

module.exports = {
  MENU_ITEMS,
  SETTINGS_FIELDS,
  applyCockpitAction,
  buildCockpitActionContext,
  normalizeControlState,
  normalizeKey,
  readCockpitSettings,
  renderControlFrame,
  resolveSelectedSession,
  runCockpitAction,
  runCockpitControlAction,
  runSelectedLaneAction,
  startCockpitControl,
};
