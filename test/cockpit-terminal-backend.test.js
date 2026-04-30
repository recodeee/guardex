'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const cockpit = require('../src/cockpit');
const {
  normalizeBackendName,
  selectTerminalBackend,
  kitty,
} = require('../src/terminal');

function cockpitBackendHarness({ kittyAvailable = true } = {}) {
  const stdout = [];
  const calls = {
    kitty: [],
    tmux: [],
  };

  const backend = (name) => ({
    name,
    isAvailable: () => (name === 'kitty' ? kittyAvailable : true),
    openCockpitLayout(options) {
      calls[name].push(options);
      return { action: 'created' };
    },
  });

  return {
    stdout,
    calls,
    deps: {
      resolveRepoRoot: (target) => target,
      toolName: 'gx',
      stdout: {
        write(chunk) {
          stdout.push(String(chunk));
        },
      },
      terminalBackends: {
        kitty: backend('kitty'),
        tmux: backend('tmux'),
      },
    },
  };
}

test('backend selection prefers kitty for auto when remote control is available', () => {
  const backend = selectTerminalBackend('auto', {
    kittyBackend: {
      name: 'kitty',
      isAvailable: () => true,
    },
    tmuxBackend: {
      name: 'tmux',
      isAvailable: () => true,
    },
  });

  assert.equal(backend.name, 'kitty');
});

test('backend selection falls back to tmux when kitty is unavailable', () => {
  const backend = selectTerminalBackend('auto', {
    kittyBackend: {
      name: 'kitty',
      isAvailable: () => false,
    },
    tmuxBackend: {
      name: 'tmux',
      isAvailable: () => true,
    },
  });

  assert.equal(backend.name, 'tmux');
});

test('backend names reject unsupported cockpit backends', () => {
  assert.equal(normalizeBackendName('kitty'), 'kitty');
  assert.equal(normalizeBackendName('tmux'), 'tmux');
  assert.equal(normalizeBackendName('auto'), 'auto');
  assert.throws(() => normalizeBackendName('screen'), /--backend requires auto, kitty, or tmux/);
});

test('kitty command construction is stable', () => {
  assert.deepEqual(
    kitty.buildOpenCockpitLayoutCommand({
      repoRoot: '/repo/gitguardex',
      command: "gx cockpit control --target '/repo/gitguardex'",
    }),
    {
      cmd: 'kitty',
      args: [
        '@',
        'launch',
        '--type=window',
        '--cwd',
        '/repo/gitguardex',
        '--title',
        'gx cockpit',
        '--',
        'sh',
        '-lc',
        "gx cockpit control --target '/repo/gitguardex'",
      ],
    },
  );

  assert.deepEqual(
    kitty.buildLaunchAgentPaneCommand({
      session: { id: 'agent-1' },
      worktree: '/repo/worktree',
      command: 'gx status',
      title: 'agent one',
    }),
    {
      cmd: 'kitty',
      args: [
        '@',
        'launch',
        '--type=window',
        '--location=vsplit',
        '--cwd',
        '/repo/worktree',
        '--title',
        'agent one',
        '--',
        'sh',
        '-lc',
        'gx status',
      ],
    },
  );

  assert.deepEqual(kitty.buildFocusPaneCommand({ id: '12' }), {
    cmd: 'kitty',
    args: ['@', 'focus-window', '--match', 'id:12'],
  });
  assert.deepEqual(kitty.buildClosePaneCommand('12'), {
    cmd: 'kitty',
    args: ['@', 'close-window', '--match', 'id:12'],
  });
  assert.deepEqual(kitty.buildSendTextCommand({ windowId: '12' }), {
    cmd: 'kitty',
    args: ['@', 'send-text', '--match', 'id:12', '--stdin'],
  });
  assert.equal(kitty.sendTextInput('gx status', { submit: true }), 'gx status\n');
});

test('cockpit --backend kitty opens through the selected backend', () => {
  const { stdout, calls, deps } = cockpitBackendHarness();
  const result = cockpit.openCockpit(['--backend', 'kitty', '--session', 'guardex-dev', '--target', '/repo/gitguardex'], {
    ...deps,
  });

  assert.equal(result.backend, 'kitty');
  assert.equal(result.sessionName, 'guardex-dev');
  assert.deepEqual(calls.kitty, [
    {
      repoRoot: '/repo/gitguardex',
      sessionName: 'guardex-dev',
      command: "gx cockpit control --target '/repo/gitguardex'",
      attach: false,
    },
  ]);
  assert.match(stdout.join(''), /Created kitty cockpit window 'guardex-dev'/);
  assert.match(stdout.join(''), /Control pane: gx cockpit control --target '\/repo\/gitguardex'/);
});

test('cockpit --backend tmux opens through the tmux backend when kitty is available', () => {
  const { stdout, calls, deps } = cockpitBackendHarness();
  const result = cockpit.openCockpit(['--backend=tmux', '--session', 'guardex-dev', '--target', '/repo/gitguardex'], {
    ...deps,
  });

  assert.equal(result.backend, 'tmux');
  assert.equal(result.sessionName, 'guardex-dev');
  assert.deepEqual(calls.kitty, []);
  assert.deepEqual(calls.tmux, [
    {
      repoRoot: '/repo/gitguardex',
      sessionName: 'guardex-dev',
      command: "gx cockpit control --target '/repo/gitguardex'",
      attach: false,
    },
  ]);
  assert.match(stdout.join(''), /Created tmux session 'guardex-dev'/);
});

test('cockpit --backend auto prefers kitty through the CLI option', () => {
  const { calls, deps } = cockpitBackendHarness({ kittyAvailable: true });
  const result = cockpit.openCockpit(['--backend', 'auto', '--target', '/repo/gitguardex'], {
    ...deps,
  });

  assert.equal(result.backend, 'kitty');
  assert.equal(calls.kitty.length, 1);
  assert.equal(calls.tmux.length, 0);
});

test('cockpit --backend auto falls back to tmux when kitty is unavailable', () => {
  const { calls, deps } = cockpitBackendHarness({ kittyAvailable: false });
  const result = cockpit.openCockpit(['--backend', 'auto', '--target', '/repo/gitguardex'], {
    ...deps,
  });

  assert.equal(result.backend, 'tmux');
  assert.equal(calls.kitty.length, 0);
  assert.equal(calls.tmux.length, 1);
});
