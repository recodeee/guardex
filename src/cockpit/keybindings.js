'use strict';

const { PANE_MENU_ACTION_IDS } = require('./pane-menu');

const DEFAULT_ACTION_ROWS = Object.freeze(['new-agent', 'terminal', 'settings', 'shortcuts']);
const VALID_MODES = new Set(['main', 'menu', 'settings', 'shortcuts', 'new-agent', 'terminal', 'prompt']);

function action(type, payload = {}) {
  return { type, payload };
}

const NAVIGATION_BINDINGS = {
  j: action('next'),
  down: action('next'),
  k: action('previous'),
  up: action('previous'),
  enter: action('view-selected'),
};

const MAIN_BINDINGS = {
  n: action('new-agent'),
  t: action('terminal'),
  m: action('menu'),
  'alt-shift-m': action('menu'),
  s: action('settings'),
  '?': action('shortcuts'),
  x: action(PANE_MENU_ACTION_IDS.CLOSE),
  b: action(PANE_MENU_ACTION_IDS.CREATE_CHILD_WORKTREE),
  f: action(PANE_MENU_ACTION_IDS.BROWSE_FILES),
  h: action(PANE_MENU_ACTION_IDS.HIDE_PANE),
  P: action(PANE_MENU_ACTION_IDS.PROJECT_FOCUS),
  a: action(PANE_MENU_ACTION_IDS.ADD_AGENT),
  A: action(PANE_MENU_ACTION_IDS.ADD_TERMINAL),
  r: action(PANE_MENU_ACTION_IDS.REOPEN_CLOSED_WORKTREE),
  D: action('doctor'),
  d: action('diff'),
  l: action('locks'),
  y: action('sync'),
  F: action('finish'),
  c: action('cleanup-sessions'),
  q: action('quit'),
  ...NAVIGATION_BINDINGS,
};

const BASE_BINDINGS = {
  main: MAIN_BINDINGS,
  menu: {
    ...NAVIGATION_BINDINGS,
    esc: action('close-menu'),
    q: action('quit'),
  },
  settings: {
    ...NAVIGATION_BINDINGS,
    esc: action('close-settings'),
    q: action('quit'),
  },
  shortcuts: {
    esc: action('close-popup'),
    q: action('quit'),
  },
  'new-agent': {
    enter: action('agent:start'),
    esc: action('close-popup'),
    q: action('quit'),
  },
  terminal: {
    enter: action('terminal:open'),
    esc: action('close-popup'),
    q: action('quit'),
  },
  prompt: {},
};

function cloneAction(binding) {
  return action(binding.type, { ...binding.payload });
}

function cloneBindings(bindings) {
  return Object.fromEntries(
    Object.entries(bindings).map(([mode, modeBindings]) => [
      mode,
      Object.fromEntries(
        Object.entries(modeBindings).map(([key, binding]) => [key, cloneAction(binding)]),
      ),
    ]),
  );
}

function defaultKeybindings() {
  return cloneBindings(BASE_BINDINGS);
}

function normalizeMode(context = {}) {
  return VALID_MODES.has(context.mode) ? context.mode : 'main';
}

function normalizeKey(key) {
  if (key && typeof key === 'object') {
    if ((key.meta || key.alt) && key.shift && String(key.name || key.key || '').toLowerCase() === 'm') {
      return 'alt-shift-m';
    }
    return normalizeKey(key.name || key.sequence || key.key || '');
  }
  if (key === '\r' || key === '\n') return 'enter';
  if (key === '\x1bM' || key === '\x1bm') return 'alt-shift-m';
  if (key === '\x1b') return 'esc';
  if (typeof key !== 'string') return '';

  const normalized = key.trim();
  if (normalized === '\x1bM' || normalized === '\x1bm') return 'alt-shift-m';
  if (/^alt(?:\+|-)?shift(?:\+|-)?m$/i.test(normalized)) return 'alt-shift-m';
  if (normalized.length === 1) return normalized;

  const namedKey = normalized.toLowerCase();
  if (namedKey === 'arrowdown') return 'down';
  if (namedKey === 'arrowup') return 'up';
  if (namedKey === 'return') return 'enter';
  if (namedKey === 'escape') return 'esc';
  return namedKey;
}

function resolveKeyAction(key, context = {}) {
  const mode = normalizeMode(context);
  const normalizedKey = normalizeKey(key);
  const keybindings = context.keybindings || BASE_BINDINGS;
  const binding = keybindings[mode] && keybindings[mode][normalizedKey];

  if (!binding) {
    return action('noop', { key: normalizedKey, mode });
  }

  return action(binding.type, {
    ...binding.payload,
    key: normalizedKey,
    mode,
  });
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wrapIndex(index, length) {
  if (length <= 0) return 0;
  const next = Number.isInteger(index) ? index : 0;
  return ((next % length) + length) % length;
}

function actionRows(state = {}) {
  if (!Array.isArray(state.actionRows) || state.actionRows.length === 0) {
    return [...DEFAULT_ACTION_ROWS];
  }
  return state.actionRows.map((row) => String(row || '').trim()).filter(Boolean);
}

function moveSelection(state = {}, direction) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  if (sessions.length > 0) {
    return {
      ...state,
      selectedScope: 'lane',
      selectedIndex: wrapIndex(number(state.selectedIndex, 0) + direction, sessions.length),
      selectedSessionId: '',
    };
  }

  const rows = actionRows(state);
  return {
    ...state,
    actionRows: rows,
    selectedScope: 'action',
    selectedIndex: 0,
    actionIndex: wrapIndex(number(state.actionIndex, 0) + direction, rows.length),
    selectedSessionId: '',
  };
}

function closeMode(state = {}) {
  return {
    ...state,
    mode: 'main',
    lastIntent: null,
  };
}

function applyCockpitKey(state = {}, key) {
  const current = {
    ...state,
    mode: normalizeMode(state),
  };
  const resolved = resolveKeyAction(key, current);

  switch (resolved.type) {
    case 'next':
      return moveSelection(current, 1);
    case 'previous':
      return moveSelection(current, -1);
    case 'new-agent':
      return { ...current, mode: 'new-agent', lastIntent: null };
    case 'terminal':
      return { ...current, mode: 'terminal', lastIntent: null };
    case 'shortcuts':
      return { ...current, mode: 'shortcuts', lastIntent: null };
    case 'settings':
      return { ...current, mode: 'settings', lastIntent: null };
    case 'menu':
      return { ...current, mode: 'menu', lastIntent: null };
    case 'close-menu':
    case 'close-settings':
    case 'close-popup':
      return closeMode(current);
    case 'quit':
      return { ...current, shouldExit: true };
    default:
      return current;
  }
}

module.exports = {
  applyCockpitKey,
  defaultKeybindings,
  resolveKeyAction,
};
