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
  assert.deepEqual(kitty.buildVersionCommand(), {
    cmd: 'kitty',
    args: ['--version'],
  });
  assert.deepEqual(kitty.buildAvailabilityCommand(), {
    cmd: 'kitty',
    args: ['@', 'ls'],
  });

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

function fakeRuntime(results) {
  const calls = [];
  return {
    calls,
    run(cmd, args, options) {
      calls.push({ cmd, args, options });
      const result = results.shift();
      if (typeof result === 'function') return result(cmd, args, options);
      return result || { status: 0, stdout: '', stderr: '' };
    },
  };
}

test('kitty backend is unavailable when kitty binary is missing', () => {
  const runtime = fakeRuntime([
    { status: 127, error: new Error('spawn kitty ENOENT') },
    { status: 127, error: new Error('spawn kitty ENOENT') },
  ]);
  const backend = kitty.createKittyBackend({ runtime });

  assert.equal(backend.isAvailable(), false);
  const status = backend.describe();
  assert.equal(status.available, false);
  assert.equal(status.installed, false);
  assert.match(status.message, /Kitty is not installed/);
  assert.match(status.error, /ENOENT/);
  assert.deepEqual(runtime.calls.map((call) => call.args), [
    ['--version'],
    ['--version'],
  ]);
});

test('kitty backend is unavailable when remote control probe fails', () => {
  const runtime = fakeRuntime([
    { status: 0, stdout: 'kitty 0.34.1\n', stderr: '' },
    { status: 1, stdout: '', stderr: 'The remote control feature is disabled\n' },
    { status: 0, stdout: 'kitty 0.34.1\n', stderr: '' },
    { status: 1, stdout: '', stderr: 'The remote control feature is disabled\n' },
  ]);
  const backend = kitty.createKittyBackend({ runtime });

  const status = backend.describe();
  assert.equal(status.available, false);
  assert.equal(status.installed, true);
  assert.equal(status.remoteControl, false);
  assert.equal(status.message, kitty.KITTY_REMOTE_CONTROL_MESSAGE);
  assert.match(status.error, /remote control feature is disabled/);
  assert.equal(backend.isAvailable(), false);
});

test('kitty backend is available when version and remote control probes pass', () => {
  const runtime = fakeRuntime([
    { status: 0, stdout: 'kitty 0.34.1\n', stderr: '' },
    { status: 0, stdout: '[{\"id\":1}]\n', stderr: '' },
  ]);
  const backend = kitty.createKittyBackend({ runtime });

  const status = backend.describe();
  assert.equal(status.available, true);
  assert.equal(status.installed, true);
  assert.equal(status.remoteControl, true);
  assert.equal(status.version, 'kitty 0.34.1');
  assert.equal(status.checks.length, 2);
});

test('kitty backend execute path delegates commands to the runtime', () => {
  const runtime = fakeRuntime([
    { status: 0, stdout: '', stderr: '' },
  ]);
  const backend = kitty.createKittyBackend({ runtime });

  assert.equal(backend.sendText({ id: '12' }, 'gx status', { submit: true }).status, 0);
  assert.deepEqual(runtime.calls, [
    {
      cmd: 'kitty',
      args: ['@', 'send-text', '--match', 'id:12', '--stdin'],
      options: {
        input: 'gx status\n',
        stdio: 'pipe',
        env: undefined,
      },
    },
  ]);
});

test('kitty backend dry-run returns planned commands without executing', () => {
  const runtime = fakeRuntime([]);
  const backend = kitty.createKittyBackend({
    runtime,
    dryRun: true,
    env: { GUARDEX_KITTY_BIN: '/opt/kitty/bin/kitty' },
  });

  assert.deepEqual(backend.isAvailable(), {
    dryRun: true,
    action: 'check-availability',
    commands: [
      { cmd: '/opt/kitty/bin/kitty', args: ['--version'] },
      { cmd: '/opt/kitty/bin/kitty', args: ['@', 'ls'] },
    ],
  });
  assert.deepEqual(
    backend.openCockpitLayout({
      repoRoot: '/repo/gitguardex',
      command: 'gx cockpit control',
    }),
    {
      dryRun: true,
      action: 'open-cockpit-layout',
      commands: [
        {
          cmd: '/opt/kitty/bin/kitty',
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
            'gx cockpit control',
          ],
        },
      ],
      cwd: '/repo/gitguardex',
    },
  );
  assert.deepEqual(backend.dryRunPlan('custom-check', kitty.buildAvailabilityCommand()), {
    dryRun: true,
    action: 'custom-check',
    commands: [
      { cmd: 'kitty', args: ['@', 'ls'] },
    ],
  });
  assert.deepEqual(runtime.calls, []);
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
