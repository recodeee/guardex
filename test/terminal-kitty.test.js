'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const kitty = require('../src/terminal/kitty');

test('Kitty launch command uses argv arrays and preserves cwd/title spaces', () => {
  const command = kitty.buildKittyLaunchCommand({
    role: 'control',
    cwd: '/tmp/repo with spaces',
    title: 'gx cockpit control',
    env: {
      GX_MODE: 'agent mode',
      PATH_WITH_SPACE: '/tmp/bin dir',
    },
    argv: ['gx', 'cockpit', 'control', '--target', '/tmp/repo with spaces'],
  });

  assert.equal(command.cmd, 'kitty');
  assert.ok(Array.isArray(command.args));
  assert.deepEqual(command.args, [
    '@',
    'launch',
    '--type=window',
    '--cwd',
    '/tmp/repo with spaces',
    '--title',
    'gx cockpit control',
    '--env',
    'GX_MODE=agent mode',
    '--env',
    'PATH_WITH_SPACE=/tmp/bin dir',
    '--',
    'gx',
    'cockpit',
    'control',
    '--target',
    '/tmp/repo with spaces',
  ]);
});

test('Kitty launch command supports deterministic agent pane construction', () => {
  const command = kitty.buildKittyLaunchCommand({
    role: 'agent',
    pane: true,
    cwd: '/tmp/work tree',
    title: 'agent one',
    commandArgv: ['codex', '--resume', 'session with spaces'],
  });

  assert.deepEqual(command.args, [
    '@',
    'launch',
    '--type=window',
    '--location=vsplit',
    '--cwd',
    '/tmp/work tree',
    '--title',
    'agent one',
    '--',
    'codex',
    '--resume',
    'session with spaces',
  ]);
});

test('Kitty focus and close commands match windows by id', () => {
  assert.deepEqual(kitty.buildKittyFocusCommand({ id: '12' }), {
    cmd: 'kitty',
    args: ['@', 'focus-window', '--match', 'id:12'],
  });

  assert.deepEqual(kitty.buildKittyCloseCommand({ windowId: '12' }), {
    cmd: 'kitty',
    args: ['@', 'close-window', '--match', 'id:12'],
  });
});

test('Kitty target matching supports titles without shell quoting', () => {
  assert.deepEqual(kitty.buildKittyFocusCommand({ title: 'Agent Window 1' }), {
    cmd: 'kitty',
    args: ['@', 'focus-window', '--match', 'title:Agent Window 1'],
  });
});

test('Kitty send-text uses stdin input instead of unsafe shell quoting', () => {
  const input = 'echo "hello world"; printf done';
  const command = kitty.buildKittySendTextCommand({ id: '12' }, {
    input,
    submit: true,
  });

  assert.deepEqual(command.args, ['@', 'send-text', '--match', 'id:12', '--stdin']);
  assert.equal(command.input, `${input}\n`);
  assert.equal(command.args.includes(input), false);
});

test('Kitty ls and version probes are dry-run command builders', () => {
  assert.deepEqual(kitty.buildKittyLsCommand(), {
    cmd: 'kitty',
    args: ['@', 'ls'],
  });

  assert.deepEqual(kitty.buildKittyVersionCommand(), {
    cmd: 'kitty',
    args: ['--version'],
  });
});
