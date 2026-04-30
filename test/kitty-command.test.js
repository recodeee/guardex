'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const kittyCommand = require('../src/kitty/command');

function withEnv(key, value, callback) {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    callback();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

test('runKitty delegates to a runner with argv arrays', () => {
  const calls = [];
  const result = kittyCommand.runKitty(['@', 'ls'], {
    cwd: '/tmp/project',
    runner(cmd, args, options) {
      calls.push({ cmd, args, options });
      return { status: 0, stdout: '[]\n', stderr: '' };
    },
  });

  assert.equal(result.status, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'kitty');
  assert.deepEqual(calls[0].args, ['@', 'ls']);
  assert.equal(calls[0].options.cwd, '/tmp/project');
  assert.equal(calls[0].options.stdio, 'pipe');
});

test('runKitty respects GUARDEX_KITTY_BIN', () => {
  withEnv('GUARDEX_KITTY_BIN', '/opt/kitty/bin/kitty', () => {
    const calls = [];
    kittyCommand.runKitty(['--version'], {
      runner(cmd, args) {
        calls.push({ cmd, args });
        return { status: 0, stdout: 'kitty 0.36\n', stderr: '' };
      },
    });

    assert.deepEqual(calls, [
      { cmd: '/opt/kitty/bin/kitty', args: ['--version'] },
    ]);
  });
});

test('runKitty dry-run returns command without executing', () => {
  const calls = [];
  const result = kittyCommand.runKitty(['@', 'ls'], {
    dryRun: true,
    cwd: '/repo',
    runner() {
      calls.push('unexpected');
      return { status: 1 };
    },
  });

  assert.deepEqual(result, {
    dryRun: true,
    commands: [
      {
        cmd: 'kitty',
        args: ['@', 'ls'],
      },
    ],
    options: {
      cwd: '/repo',
    },
  });
  assert.deepEqual(calls, []);
});

test('runKitty rejects unsafe args shapes', () => {
  assert.throws(() => kittyCommand.runKitty('kitty @ ls'), /args must be an array/);
  assert.throws(() => kittyCommand.runKitty(['@', 7]), /only strings/);
});

test('isKittyAvailable probes Kitty remote control', () => {
  const calls = [];
  const available = kittyCommand.isKittyAvailable({
    runner(cmd, args, options) {
      calls.push({ cmd, args, options });
      return { status: 0, stdout: '[]\n', stderr: '' };
    },
  });

  assert.equal(available, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['@', 'ls']);
  assert.equal(calls[0].options.stdio, 'pipe');
});

test('isKittyAvailable returns false when probe fails', () => {
  assert.equal(
    kittyCommand.isKittyAvailable({
      runner() {
        return { status: 1, stderr: 'remote control disabled\n' };
      },
    }),
    false,
  );
});
