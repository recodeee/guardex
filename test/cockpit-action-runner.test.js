'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { runCockpitAction } = require('../src/cockpit/action-runner');
const {
  buildCockpitActionContext,
  resolveSelectedSession,
  runCockpitControlAction,
} = require('../src/cockpit/control');

function mockContext(overrides = {}) {
  const calls = [];
  const context = {
    repoRoot: '/repo',
    baseBranch: 'main',
    session: {
      id: 'session-1',
      branch: 'agent/codex/example',
      worktreePath: '/repo/.omx/agent-worktrees/example',
      paneId: '%7',
    },
    settings: {},
    runCommand(cmd, args, options) {
      calls.push({ cmd, args, options });
      if (cmd === 'which') {
        return { status: 1, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: `${cmd} ok\n`, stderr: '' };
    },
    ...overrides,
  };
  return { context, calls };
}

test('runCockpitAction maps files, diff, and locks to gx agents inspect commands', () => {
  const { context, calls } = mockContext();

  assert.equal(runCockpitAction('files', context).ok, true);
  assert.equal(runCockpitAction('diff', context).ok, true);
  assert.equal(runCockpitAction('locks', context).ok, true);

  assert.deepEqual(calls.map((call) => [call.cmd, call.args]), [
    ['gx', ['agents', 'files', '--target', '/repo', '--branch', 'agent/codex/example']],
    ['gx', ['agents', 'diff', '--target', '/repo', '--branch', 'agent/codex/example']],
    ['gx', ['agents', 'locks', '--target', '/repo', '--branch', 'agent/codex/example']],
  ]);
});

test('runCockpitAction maps sync and finish without weakening PR-only safety', () => {
  const { context, calls } = mockContext();

  assert.equal(runCockpitAction('sync', context).ok, true);
  assert.equal(runCockpitAction('finish-pr', context).ok, true);

  assert.deepEqual(calls.map((call) => [call.cmd, call.args]), [
    ['gx', ['sync', '--target', '/repo/.omx/agent-worktrees/example', '--base', 'main']],
    [
      'gx',
      [
        'agents',
        'finish',
        '--target',
        '/repo',
        '--branch',
        'agent/codex/example',
        '--via-pr',
        '--wait-for-merge',
        '--cleanup',
      ],
    ],
  ]);
});

test('view selects the associated pane and close kills only that pane', () => {
  const { context, calls } = mockContext();

  const view = runCockpitAction('view', context);
  const close = runCockpitAction('close', context);

  assert.equal(view.ok, true);
  assert.equal(close.ok, true);
  assert.match(close.message, /tmux pane only/);
  assert.deepEqual(calls.map((call) => [call.cmd, call.args]), [
    ['tmux', ['select-pane', '-t', '%7']],
    ['tmux', ['kill-pane', '-t', '%7']],
  ]);
});

test('close refuses to delete branch, worktree, or metadata without a pane', () => {
  const { context, calls } = mockContext({
    session: {
      branch: 'agent/codex/example',
      worktreePath: '/repo/.omx/agent-worktrees/example',
    },
  });

  const result = runCockpitAction('close', context);

  assert.equal(result.ok, false);
  assert.match(result.message, /metadata were left untouched/);
  assert.deepEqual(calls, []);
});

test('copy path uses clipboard when available and prints the path otherwise', () => {
  const available = mockContext({
    runCommand(cmd, args, options) {
      available.calls.push({ cmd, args, options });
      if (cmd === 'which' && args[0] === 'wl-copy') {
        return { status: 0, stdout: '/usr/bin/wl-copy\n', stderr: '' };
      }
      if (cmd === 'which') return { status: 1, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(runCockpitAction('copy-path', available.context).ok, true);
  assert.deepEqual(available.calls.at(-1).cmd, 'wl-copy');
  assert.deepEqual(available.calls.at(-1).args, ['/repo/.omx/agent-worktrees/example']);

  const unavailable = mockContext();
  const fallback = runCockpitAction('copy-path', unavailable.context);
  assert.equal(fallback.ok, true);
  assert.equal(fallback.stdout, '/repo/.omx/agent-worktrees/example\n');
  assert.match(fallback.message, /printed worktree path/);
});

test('open in editor uses settings editorCommand and falls back to printing code command', () => {
  const configured = mockContext({
    settings: { editorCommand: 'code --reuse-window' },
  });
  assert.equal(runCockpitAction('open-editor', configured.context).ok, true);
  assert.deepEqual(configured.calls.at(-1).cmd, 'code');
  assert.deepEqual(configured.calls.at(-1).args, ['--reuse-window', '/repo/.omx/agent-worktrees/example']);

  const fallback = mockContext();
  const result = runCockpitAction('open-editor', fallback.context);
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "code /repo/.omx/agent-worktrees/example\n");
  assert.match(result.message, /code was not found/);
});

test('open in editor defaults to code when code is available', () => {
  const { context, calls } = mockContext({
    runCommand(cmd, args, options) {
      calls.push({ cmd, args, options });
      if (cmd === 'which' && args[0] === 'code') {
        return { status: 0, stdout: '/usr/bin/code\n', stderr: '' };
      }
      if (cmd === 'which') return { status: 1, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  const result = runCockpitAction('Open in Editor', context);

  assert.equal(result.ok, true);
  assert.deepEqual(calls.at(-1).cmd, 'code');
  assert.deepEqual(calls.at(-1).args, ['/repo/.omx/agent-worktrees/example']);
});

test('control resolves selected lane state before running an action', () => {
  const state = {
    repoPath: '/repo',
    baseBranch: 'main',
    sessions: [
      { id: 'first', branch: 'agent/codex/first', worktreePath: '/repo/first' },
      { id: 'second', branch: 'agent/codex/second', worktreePath: '/repo/second' },
    ],
  };
  const calls = [];

  assert.equal(resolveSelectedSession(state, { sessionId: 'second' }).branch, 'agent/codex/second');
  assert.deepEqual(buildCockpitActionContext(state, { selectedIndex: 1 }).session, state.sessions[1]);

  const result = runCockpitControlAction('files', state, {
    selectedIndex: 1,
    runCommand(cmd, args) {
      calls.push({ cmd, args });
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['gx', ['agents', 'files', '--target', '/repo', '--branch', 'agent/codex/second']],
  ].map(([cmd, args]) => ({ cmd, args })));
});

test('unknown actions and missing selected data return the standard result shape', () => {
  assert.deepEqual(runCockpitAction('nope', {}), {
    ok: false,
    message: 'Unknown cockpit action: nope',
    command: '',
    stdout: '',
    stderr: '',
  });

  assert.deepEqual(runCockpitAction('files', { repoRoot: '/repo' }), {
    ok: false,
    message: 'files requires a selected lane branch.',
    command: '',
    stdout: '',
    stderr: '',
  });
});
