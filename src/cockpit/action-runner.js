'use strict';

const cp = require('node:child_process');
const path = require('node:path');
const { readCockpitSettings } = require('./settings');

const ACTION_ALIASES = new Map([
  ['finish-pr', 'finish'],
  ['finish / pr', 'finish'],
  ['copy path', 'copy-path'],
  ['open in editor', 'open-editor'],
  ['open-editor', 'open-editor'],
]);

const CLIPBOARD_COMMANDS = [
  { cmd: 'wl-copy', args: [] },
  { cmd: 'termux-clipboard-set', args: [] },
  { cmd: 'pbcopy', args: [], input: true },
  { cmd: 'xclip', args: ['-selection', 'clipboard'], input: true },
  { cmd: 'xsel', args: ['--clipboard', '--input'], input: true },
];

function defaultRunCommand(cmd, args = [], options = {}) {
  return cp.spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    encoding: 'utf8',
    input: options.input,
    stdio: 'pipe',
    timeout: options.timeout,
  });
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function normalizeAction(action) {
  const raw = typeof action === 'string'
    ? action
    : firstString(action && action.id, action && action.action, action && action.type, action && action.label);
  const normalized = String(raw || '').trim().toLowerCase();
  return ACTION_ALIASES.get(normalized) || normalized;
}

function normalizeResult(result) {
  const payload = result && typeof result === 'object' ? result : {};
  const status = Number.isInteger(payload.status) ? payload.status : 0;
  const ok = !payload.error && status === 0;
  return {
    ok,
    stdout: String(payload.stdout || ''),
    stderr: payload.error ? String(payload.error.message || payload.error) : String(payload.stderr || ''),
  };
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function renderCommand(cmd, args = []) {
  return [cmd, ...args].map(shellQuote).join(' ');
}

function resultShape({ ok, message, command = '', stdout = '', stderr = '' }) {
  return {
    ok: Boolean(ok),
    message: String(message || ''),
    command: String(command || ''),
    stdout: String(stdout || ''),
    stderr: String(stderr || ''),
  };
}

function selectedSession(context = {}) {
  return context.session || context.selectedSession || context.lane || {};
}

function resolveBranch(context = {}) {
  const session = selectedSession(context);
  return firstString(
    context.branch,
    session.branch,
    session.lane && session.lane.branch,
  );
}

function resolveWorktreePath(context = {}) {
  const session = selectedSession(context);
  return firstString(
    context.worktreePath,
    context.path,
    session.worktreePath,
    session.worktree && session.worktree.path,
    session.path,
  );
}

function resolvePaneId(context = {}) {
  const session = selectedSession(context);
  return firstString(
    context.paneId,
    context.tmuxPaneId,
    context.tmuxTarget,
    session.paneId,
    session.tmuxPaneId,
    session.tmuxTarget,
    session.tmux && session.tmux.paneId,
    session.pane && session.pane.id,
  );
}

function resolveRepoRoot(context = {}) {
  return path.resolve(firstString(context.repoRoot, context.repoPath, context.target, process.cwd()));
}

function runCommand(context, cmd, args = [], options = {}) {
  const runner = typeof context.runCommand === 'function' ? context.runCommand : defaultRunCommand;
  const rendered = renderCommand(cmd, args);
  const payload = normalizeResult(runner(cmd, args, options));
  const detail = payload.ok ? payload.stdout : payload.stderr || payload.stdout;
  return resultShape({
    ok: payload.ok,
    message: payload.ok ? 'Command completed.' : `Command failed: ${detail.trim() || rendered}`,
    command: rendered,
    stdout: payload.stdout,
    stderr: payload.stderr,
  });
}

function commandExists(context, cmd) {
  if (typeof context.commandExists === 'function') {
    return Boolean(context.commandExists(cmd));
  }
  const runner = typeof context.runCommand === 'function' ? context.runCommand : defaultRunCommand;
  const result = normalizeResult(runner('which', [cmd], { cwd: resolveRepoRoot(context) }));
  return result.ok && result.stdout.trim().length > 0;
}

function requireBranch(context, actionName) {
  const branch = resolveBranch(context);
  if (branch) return { branch };
  return resultShape({
    ok: false,
    message: `${actionName} requires a selected lane branch.`,
  });
}

function requireWorktreePath(context, actionName) {
  const worktreePath = resolveWorktreePath(context);
  if (worktreePath) return { worktreePath };
  return resultShape({
    ok: false,
    message: `${actionName} requires a selected lane worktree path.`,
  });
}

function runGxAgentsInspect(subcommand, context) {
  const required = requireBranch(context, subcommand);
  if (!required.branch) return required;
  return runCommand(
    context,
    context.gxCommand || 'gx',
    ['agents', subcommand, '--target', resolveRepoRoot(context), '--branch', required.branch],
    { cwd: resolveRepoRoot(context) },
  );
}

function runView(context) {
  const paneId = resolvePaneId(context);
  if (paneId) {
    return runCommand(context, context.tmuxCommand || 'tmux', ['select-pane', '-t', paneId], {
      cwd: resolveRepoRoot(context),
    });
  }

  return runGxAgentsInspect('files', context);
}

function runSync(context) {
  const required = requireWorktreePath(context, 'Sync');
  if (!required.worktreePath) return required;
  const args = ['sync', '--target', required.worktreePath];
  const base = firstString(context.base, context.baseBranch, selectedSession(context).base);
  if (base) args.push('--base', base);
  return runCommand(context, context.gxCommand || 'gx', args, { cwd: required.worktreePath });
}

function runFinish(context) {
  const required = requireBranch(context, 'Finish');
  if (!required.branch) return required;
  return runCommand(
    context,
    context.gxCommand || 'gx',
    [
      'agents',
      'finish',
      '--target',
      resolveRepoRoot(context),
      '--branch',
      required.branch,
      '--via-pr',
      '--wait-for-merge',
      '--cleanup',
    ],
    { cwd: resolveRepoRoot(context) },
  );
}

function runClose(context) {
  const paneId = resolvePaneId(context);
  if (!paneId) {
    return resultShape({
      ok: false,
      message: 'Close requires an associated tmux pane; branch, worktree, and session metadata were left untouched.',
    });
  }
  const result = runCommand(context, context.tmuxCommand || 'tmux', ['kill-pane', '-t', paneId], {
    cwd: resolveRepoRoot(context),
  });
  return {
    ...result,
    message: result.ok
      ? 'Closed associated tmux pane only; branch, worktree, and session metadata were left untouched.'
      : result.message,
  };
}

function resolveClipboardCommand(context) {
  if (context.clipboardCommand && typeof context.clipboardCommand === 'object') {
    return {
      cmd: context.clipboardCommand.cmd,
      args: Array.isArray(context.clipboardCommand.args) ? context.clipboardCommand.args : [],
      input: Boolean(context.clipboardCommand.input),
    };
  }
  if (typeof context.clipboardCommand === 'string' && context.clipboardCommand.trim()) {
    return { cmd: context.clipboardCommand.trim(), args: [], input: true };
  }
  return CLIPBOARD_COMMANDS.find((candidate) => commandExists(context, candidate.cmd)) || null;
}

function runCopyPath(context) {
  const required = requireWorktreePath(context, 'Copy Path');
  if (!required.worktreePath) return required;
  const clipboard = resolveClipboardCommand(context);
  if (!clipboard) {
    return resultShape({
      ok: true,
      message: 'No clipboard utility found; printed worktree path.',
      command: renderCommand('printf', ['%s\\n', required.worktreePath]),
      stdout: `${required.worktreePath}\n`,
    });
  }

  const args = clipboard.input ? clipboard.args : [...clipboard.args, required.worktreePath];
  const result = runCommand(context, clipboard.cmd, args, {
    cwd: required.worktreePath,
    input: clipboard.input ? required.worktreePath : undefined,
  });
  return {
    ...result,
    message: result.ok ? 'Copied worktree path.' : result.message,
  };
}

function splitCommand(rawCommand) {
  const parts = [];
  let current = '';
  let quote = '';
  let escaped = false;

  for (const char of String(rawCommand || '')) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function resolveEditorParts(context, worktreePath) {
  const settings = context.settings && typeof context.settings === 'object'
    ? context.settings
    : readCockpitSettings(resolveRepoRoot(context));
  const configured = firstString(settings.editorCommand);
  if (configured) return splitCommand(configured);
  if (commandExists(context, 'code')) return ['code'];

  return {
    printOnly: true,
    parts: ['code', worktreePath],
  };
}

function runOpenEditor(context) {
  const required = requireWorktreePath(context, 'Open in Editor');
  if (!required.worktreePath) return required;
  const resolved = resolveEditorParts(context, required.worktreePath);
  if (resolved.printOnly) {
    return resultShape({
      ok: true,
      message: 'No editor command configured and code was not found; printed editor command.',
      command: renderCommand(resolved.parts[0], resolved.parts.slice(1)),
      stdout: `${renderCommand(resolved.parts[0], resolved.parts.slice(1))}\n`,
    });
  }

  const [cmd, ...args] = resolved;
  const result = runCommand(context, cmd, [...args, required.worktreePath], {
    cwd: required.worktreePath,
  });
  return {
    ...result,
    message: result.ok ? 'Opened worktree in editor.' : result.message,
  };
}

function runCockpitAction(action, context = {}) {
  const normalized = normalizeAction(action);

  if (normalized === 'view') return runView(context);
  if (normalized === 'files') return runGxAgentsInspect('files', context);
  if (normalized === 'diff') return runGxAgentsInspect('diff', context);
  if (normalized === 'locks') return runGxAgentsInspect('locks', context);
  if (normalized === 'sync') return runSync(context);
  if (normalized === 'finish') return runFinish(context);
  if (normalized === 'close') return runClose(context);
  if (normalized === 'copy-path') return runCopyPath(context);
  if (normalized === 'open-editor') return runOpenEditor(context);

  return resultShape({
    ok: false,
    message: `Unknown cockpit action: ${normalized || '(empty)'}`,
  });
}

module.exports = {
  runCockpitAction,
  splitCommand,
  renderCommand,
};
