'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const kitty = require('../src/kitty/runtime');

function callsRunner(calls, result = { status: 0, stdout: '', stderr: '' }) {
  return (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return result;
  };
}

test('buildKittyLaunchCommand creates deterministic argv launch command', () => {
  const command = kitty.buildKittyLaunchCommand({
    type: 'tab',
    cwd: '/repo with spaces',
    title: 'agent tab',
    env: {
      ZED: 'last',
      ALPHA: 'first',
    },
    argv: ['gx', 'status', '--strict'],
  });

  assert.deepEqual(command, {
    cmd: 'kitty',
    args: [
      '@',
      'launch',
      '--type',
      'tab',
      '--cwd',
      '/repo with spaces',
      '--title',
      'agent tab',
      '--env',
      'ALPHA=first',
      '--env',
      'ZED=last',
      '--',
      'gx',
      'status',
      '--strict',
    ],
  });
});

test('buildKittyLaunchCommand rejects string command payloads', () => {
  assert.throws(
    () => kitty.buildKittyLaunchCommand({ command: 'gx status' }),
    /command argv must be an array/,
  );
});

test('launchKittyWindow runs a Kitty window launch', () => {
  const calls = [];
  const result = kitty.launchKittyWindow({
    cwd: '/repo',
    title: 'agent window',
    argv: ['gx', 'status'],
    runner: callsRunner(calls),
  });

  assert.equal(result.status, 0);
  assert.deepEqual(calls.map((call) => ({ cmd: call.cmd, args: call.args })), [
    {
      cmd: 'kitty',
      args: [
        '@',
        'launch',
        '--type',
        'window',
        '--cwd',
        '/repo',
        '--title',
        'agent window',
        '--',
        'gx',
        'status',
      ],
    },
  ]);
});

test('launchKittyTab and launchKittyPane choose tab and split-pane launch forms', () => {
  const calls = [];
  kitty.launchKittyTab({
    cwd: '/repo',
    title: 'agent tab',
    argv: ['gx'],
    runner: callsRunner(calls),
  });
  kitty.launchKittyPane({
    cwd: '/repo/worktree',
    title: 'agent pane',
    location: 'hsplit',
    argv: ['codex'],
    runner: callsRunner(calls),
  });

  assert.deepEqual(calls.map((call) => call.args), [
    [
      '@',
      'launch',
      '--type',
      'tab',
      '--cwd',
      '/repo',
      '--title',
      'agent tab',
      '--',
      'gx',
    ],
    [
      '@',
      'launch',
      '--type',
      'window',
      '--location',
      'hsplit',
      '--cwd',
      '/repo/worktree',
      '--title',
      'agent pane',
      '--',
      'codex',
    ],
  ]);
});

test('launchKittyPane defaults to a vertical split location', () => {
  const result = kitty.launchKittyPane({
    dryRun: true,
    cwd: '/repo',
    title: 'pane',
    argv: ['gx'],
  });

  assert.deepEqual(result.commands, [
    {
      cmd: 'kitty',
      args: [
        '@',
        'launch',
        '--type',
        'window',
        '--location',
        'vsplit',
        '--cwd',
        '/repo',
        '--title',
        'pane',
        '--',
        'gx',
      ],
    },
  ]);
});

test('sendTextToKitty uses stdin and never embeds text in argv', () => {
  const calls = [];
  kitty.sendTextToKitty({ windowId: '12' }, 'gx status; echo literal', {
    runner: callsRunner(calls),
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['@', 'send-text', '--match', 'id:12', '--stdin']);
  assert.equal(calls[0].options.input, 'gx status; echo literal');
  assert.equal(calls[0].args.includes('gx status; echo literal'), false);
});

test('setKittyWindowTitle targets a Kitty window without shell quoting', () => {
  const calls = [];
  kitty.setKittyWindowTitle({ title: 'old title' }, 'new title with spaces', {
    runner: callsRunner(calls),
  });

  assert.deepEqual(calls.map((call) => call.args), [
    ['@', 'set-window-title', '--match', 'title:old title', 'new title with spaces'],
  ]);
});

test('runtime exports command helpers', () => {
  assert.equal(typeof kitty.runKitty, 'function');
  assert.equal(typeof kitty.isKittyAvailable, 'function');
});
