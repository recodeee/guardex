'use strict';

const cp = require('node:child_process');

const DEFAULT_KITTY_BIN = 'kitty';
const DEFAULT_COCKPIT_TITLE = 'gx cockpit';
const DEFAULT_AGENT_TITLE = 'agent';
const DEFAULT_TERMINAL_TITLE = 'terminal';

function text(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function requireText(value, name) {
  const normalized = text(value);
  if (!normalized) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return normalized;
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return '';
}

function kittyBin(config = {}, options = {}) {
  const envValue = options.allowEnv ? process.env.GUARDEX_KITTY_BIN : '';
  return text(config.kittyBin || envValue, DEFAULT_KITTY_BIN);
}

function commandShape(args, config = {}) {
  return {
    cmd: kittyBin(config),
    args,
  };
}

function commandShapeWithEnv(args, config = {}) {
  return {
    cmd: kittyBin(config, { allowEnv: true }),
    args,
  };
}

function appendOption(args, flag, value) {
  const normalized = text(value);
  if (normalized) args.push(flag, normalized);
  return args;
}

function normalizeEnvEntries(env = {}) {
  if (!env) return [];
  if (Array.isArray(env)) {
    return env.map((entry) => {
      if (Array.isArray(entry)) {
        const key = requireText(entry[0], 'kitty env key');
        const value = entry.length > 1 && entry[1] !== undefined && entry[1] !== null ? String(entry[1]) : '';
        return `${key}=${value}`;
      }
      return requireText(entry, 'kitty env');
    });
  }
  if (typeof env !== 'object') {
    throw new TypeError('kitty env must be an object, array, or undefined');
  }
  return Object.keys(env)
    .sort()
    .map((key) => `${requireText(key, 'kitty env key')}=${env[key] === undefined || env[key] === null ? '' : String(env[key])}`);
}

function appendEnv(args, env) {
  for (const entry of normalizeEnvEntries(env)) {
    args.push('--env', entry);
  }
  return args;
}

function normalizeCommandArgv(options = {}) {
  const commandArgv = options.argv || options.commandArgv || (Array.isArray(options.command) ? options.command : undefined);
  if (commandArgv === undefined || commandArgv === null) return [];
  if (!Array.isArray(commandArgv)) {
    throw new TypeError('kitty command argv must be an array');
  }
  return commandArgv.map((arg) => {
    if (arg === undefined || arg === null) {
      throw new TypeError('kitty command argv values must be strings');
    }
    return String(arg);
  });
}

function appendCommandArgv(args, options = {}) {
  const commandArgv = normalizeCommandArgv(options);
  if (commandArgv.length > 0) args.push('--', ...commandArgv);
  return args;
}

function shellCommandArgv(command) {
  const normalized = text(command);
  return normalized ? ['sh', '-lc', normalized] : [];
}

function launchTitle(options = {}) {
  const session = options.session && typeof options.session === 'object' ? options.session : {};
  return firstText(
    options.title,
    options.control || options.role === 'control' ? DEFAULT_COCKPIT_TITLE : '',
    options.agent || options.role === 'agent' || options.session ? agentTitle(session) : '',
    options.terminal || options.role === 'terminal' ? DEFAULT_TERMINAL_TITLE : '',
  );
}

function launchCwd(options = {}) {
  const session = options.session && typeof options.session === 'object' ? options.session : {};
  return firstText(options.cwd, options.repoRoot, options.worktree, session.worktreePath, session.path);
}

function buildKittyLaunchCommand(options = {}) {
  const args = ['@', 'launch'];
  const type = text(options.type, 'window');
  const location = firstText(options.location, options.pane ? 'vsplit' : '');
  const cwd = launchCwd(options);
  const title = launchTitle(options);

  if (type) args.push(`--type=${type}`);
  if (location) args.push(`--location=${location}`);
  appendOption(args, '--cwd', cwd);
  appendOption(args, '--title', title);
  appendEnv(args, options.env);
  appendCommandArgv(args, options);

  const shape = commandShape(args, options);
  if (Object.prototype.hasOwnProperty.call(options, 'input')) {
    shape.input = options.input === undefined || options.input === null ? '' : String(options.input);
  }
  return shape;
}

function buildKittyLsCommand(options = {}) {
  return commandShape(['@', 'ls'], options);
}

function buildKittyVersionCommand(options = {}) {
  return commandShape(['--version'], options);
}

function buildAvailabilityCommand(config = {}) {
  return commandShapeWithEnv(buildKittyLsCommand().args, config);
}

function buildOpenCockpitLayoutCommand(options = {}, config = {}) {
  const repoRoot = requireText(options.repoRoot, 'kitty cockpit repoRoot');
  return buildKittyLaunchCommand({
    role: 'control',
    cwd: repoRoot,
    title: text(options.title, DEFAULT_COCKPIT_TITLE),
    argv: shellCommandArgv(options.command),
    kittyBin: kittyBin(config, { allowEnv: true }),
  });
}

function agentTitle(session = {}, title) {
  return firstText(
    title,
    session.title,
    session.agentName,
    session.sessionId,
    session.id,
    session.branch,
    DEFAULT_AGENT_TITLE,
  );
}

function buildLaunchAgentPaneCommand(options = {}, config = {}) {
  const session = options.session && typeof options.session === 'object' ? options.session : {};
  const cwd = requireText(firstText(options.worktree, session.worktreePath, session.path), 'kitty agent worktree');
  return buildKittyLaunchCommand({
    role: 'agent',
    pane: true,
    cwd,
    title: agentTitle(session, options.title),
    argv: shellCommandArgv(options.command),
    kittyBin: kittyBin(config, { allowEnv: true }),
  });
}

function buildLaunchTerminalPaneCommand(options = {}, config = {}) {
  const cwd = requireText(options.cwd, 'kitty terminal cwd');
  return buildKittyLaunchCommand({
    role: 'terminal',
    pane: true,
    cwd,
    title: text(options.title, DEFAULT_TERMINAL_TITLE),
    argv: shellCommandArgv(options.command),
    kittyBin: kittyBin(config, { allowEnv: true }),
  });
}

function targetMatch(target) {
  if (target && typeof target === 'object') {
    const explicitMatch = firstText(target.match, target.kittyMatch);
    if (explicitMatch) return explicitMatch;

    const id = firstText(target.id, target.windowId, target.kittyWindowId, target.paneId, target.target);
    if (id) return `id:${id}`;

    const title = firstText(target.title, target.windowTitle, target.kittyTitle);
    if (title) return `title:${title}`;
  } else {
    const id = text(target);
    if (id) return `id:${id}`;
  }
  throw new TypeError('kitty target must include id, title, or match');
}

function buildKittyFocusCommand(target, options = {}) {
  return commandShape(['@', 'focus-window', '--match', targetMatch(target)], options);
}

function buildKittyCloseCommand(target, options = {}) {
  return commandShape(['@', 'close-window', '--match', targetMatch(target)], options);
}

function buildKittySendTextCommand(target, options = {}) {
  const shape = commandShape(['@', 'send-text', '--match', targetMatch(target), '--stdin'], options);
  if (Object.prototype.hasOwnProperty.call(options, 'input') || Object.prototype.hasOwnProperty.call(options, 'text') || options.submit) {
    shape.input = sendTextInput(
      Object.prototype.hasOwnProperty.call(options, 'input') ? options.input : options.text,
      { submit: options.submit },
    );
  }
  return shape;
}

function buildFocusPaneCommand(target, config = {}) {
  return buildKittyFocusCommand(target, { kittyBin: kittyBin(config, { allowEnv: true }) });
}

function buildClosePaneCommand(target, config = {}) {
  return buildKittyCloseCommand(target, { kittyBin: kittyBin(config, { allowEnv: true }) });
}

function buildSendTextCommand(target, config = {}) {
  return buildKittySendTextCommand(target, { kittyBin: kittyBin(config, { allowEnv: true }) });
}

function sendTextInput(value, options = {}) {
  const body = value === undefined || value === null ? '' : String(value);
  return options.submit ? `${body}\n` : body;
}

function defaultRunner(cmd, args, options = {}) {
  return cp.spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    encoding: 'utf8',
    input: options.input,
    stdio: options.stdio || 'pipe',
    timeout: options.timeout,
  });
}

function assertResult(result, message) {
  if (result && result.error) throw result.error;
  if (!result || result.status === 0) return result;
  const detail = String(result.stderr || result.stdout || '').trim();
  throw new Error(`${message}${detail ? `: ${detail}` : '.'}`);
}

function createBackend(config = {}) {
  const runner = typeof config.runner === 'function' ? config.runner : defaultRunner;
  const run = (shape, options = {}) => runner(shape.cmd, shape.args, options);

  return {
    name: 'kitty',
    isAvailable() {
      const result = run(buildAvailabilityCommand(config), { stdio: 'pipe' });
      return Boolean(result && result.status === 0 && !result.error);
    },
    openCockpitLayout(options = {}) {
      const result = run(buildOpenCockpitLayoutCommand(options, config), { cwd: options.repoRoot });
      return assertResult(result, 'kitty could not open cockpit layout');
    },
    launchAgentPane(options = {}) {
      const result = run(buildLaunchAgentPaneCommand(options, config), { cwd: options.worktree });
      return assertResult(result, 'kitty could not launch agent pane');
    },
    launchTerminalPane(options = {}) {
      const result = run(buildLaunchTerminalPaneCommand(options, config), { cwd: options.cwd });
      return assertResult(result, 'kitty could not launch terminal pane');
    },
    focusPane(target) {
      const result = run(buildFocusPaneCommand(target, config));
      return assertResult(result, 'kitty could not focus pane');
    },
    closePane(target) {
      const result = run(buildClosePaneCommand(target, config));
      return assertResult(result, 'kitty could not close pane');
    },
    sendText(target, value, options = {}) {
      const result = run(buildSendTextCommand(target, config), {
        input: sendTextInput(value, options),
        stdio: 'pipe',
      });
      return assertResult(result, 'kitty could not send text');
    },
  };
}

module.exports = {
  DEFAULT_KITTY_BIN,
  buildKittyLaunchCommand,
  buildKittyFocusCommand,
  buildKittyCloseCommand,
  buildKittySendTextCommand,
  buildKittyLsCommand,
  buildKittyVersionCommand,
  buildAvailabilityCommand,
  buildOpenCockpitLayoutCommand,
  buildLaunchAgentPaneCommand,
  buildLaunchTerminalPaneCommand,
  buildFocusPaneCommand,
  buildClosePaneCommand,
  buildSendTextCommand,
  createBackend,
  sendTextInput,
  targetMatch,
};
