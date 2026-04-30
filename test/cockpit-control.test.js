'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const cockpit = require('../src/cockpit');
const {
  applyCockpitAction,
  renderControlFrame,
  startCockpitControl,
} = require('../src/cockpit/control');

function snapshot(sessions, overrides = {}) {
  return {
    repoPath: '/repo/gitguardex',
    baseBranch: 'main',
    sessions,
    ...overrides,
  };
}

function session(id, overrides = {}) {
  return {
    id,
    agentName: 'codex',
    branch: `agent/codex/${id}`,
    task: `${id} task`,
    status: 'working',
    lockCount: 1,
    worktreePath: `/tmp/${id}`,
    worktreeExists: true,
    ...overrides,
  };
}

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawModes = [];
    this.encodings = [];
    this.resumed = false;
  }

  setEncoding(encoding) {
    this.encodings.push(encoding);
  }

  setRawMode(enabled) {
    this.rawModes.push(enabled);
  }

  resume() {
    this.resumed = true;
  }
}

test('applyCockpitAction selects sessions and preserves selection across refresh', () => {
  let state = applyCockpitAction({}, {
    type: 'refresh',
    cockpitState: snapshot([session('one'), session('two')]),
    settings: { refreshMs: 750, defaultAgent: 'claude', defaultBase: 'dev' },
    at: 'now',
  });

  assert.equal(state.selectedIndex, 0);
  assert.equal(state.selectedSessionId, 'one');

  state = applyCockpitAction(state, { type: 'key', key: 'down' });
  assert.equal(state.selectedIndex, 1);
  assert.equal(state.selectedSessionId, 'two');

  state = applyCockpitAction(state, {
    type: 'refresh',
    cockpitState: snapshot([session('two'), session('one')]),
  });
  assert.equal(state.selectedIndex, 0);
  assert.equal(state.selectedSessionId, 'two');
});

test('applyCockpitAction returns menu intents without launching agents', () => {
  let state = applyCockpitAction({}, {
    type: 'refresh',
    cockpitState: snapshot([session('one')]),
    settings: { defaultAgent: 'claude', defaultBase: 'main' },
  });

  state = applyCockpitAction(state, { type: 'key', key: 'm' });
  assert.equal(state.mode, 'menu');

  state = applyCockpitAction(state, { type: 'key', key: '\r' });
  assert.deepEqual(state.lastIntent, {
    type: 'agent:start',
    agent: 'claude',
    base: 'main',
  });
  assert.equal(state.shouldExit, false);
});

test('renderControlFrame renders sidebar with details, menu, and settings modes', () => {
  const baseState = applyCockpitAction({}, {
    type: 'refresh',
    cockpitState: snapshot([session('one')]),
    settings: { sidebarWidth: 34, theme: 'dim' },
  });

  const details = renderControlFrame(baseState);
  assert.match(details, /gx cockpit/);
  assert.match(details, /details/);
  assert.match(details, /session: one/);

  const menu = renderControlFrame(applyCockpitAction(baseState, { type: 'key', key: 'm' }));
  assert.match(menu, /menu/);
  assert.match(menu, /> Start agent/);
  assert.match(menu, /Open terminal/);

  const settings = renderControlFrame(applyCockpitAction(baseState, { type: 'key', key: 's' }));
  assert.match(settings, /gx cockpit settings/);
  assert.match(settings, /> Theme: dim/);
});

test('startCockpitControl reads state/settings, refreshes, and handles TTY keys', () => {
  const input = new FakeInput();
  const writes = [];
  let intervalCallback = null;
  let cleared = false;
  let readCount = 0;
  const states = [
    snapshot([session('first')]),
    snapshot([session('second')]),
  ];

  const controller = startCockpitControl({
    repoPath: '/repo/gitguardex',
    stdin: input,
    stdout: {
      isTTY: false,
      write(chunk) {
        writes.push(String(chunk));
      },
    },
    refreshMs: 100,
    readState() {
      const state = states[Math.min(readCount, states.length - 1)];
      readCount += 1;
      return state;
    },
    readSettings() {
      return { refreshMs: 100, sidebarWidth: 40, defaultAgent: 'codex', defaultBase: 'main' };
    },
    setInterval(fn, ms) {
      intervalCallback = fn;
      return { ms, unref() {} };
    },
    clearInterval() {
      cleared = true;
    },
  });

  assert.equal(readCount, 1);
  assert.equal(input.resumed, true);
  assert.deepEqual(input.encodings, ['utf8']);
  assert.deepEqual(input.rawModes, [true]);
  assert.match(writes.join(''), /session: first/);

  intervalCallback();
  assert.equal(readCount, 2);
  assert.match(writes.join(''), /session: second/);

  input.emit('data', 'm');
  input.emit('data', '\r');
  assert.equal(controller.getState().lastIntent.type, 'agent:start');

  input.emit('data', 'q');
  assert.equal(controller.getState().shouldExit, true);
  assert.equal(cleared, true);
  assert.deepEqual(input.rawModes, [true, false]);
});

test('openCockpit sends the control loop command into the tmux control pane', () => {
  const stdout = [];
  const sent = [];
  const result = cockpit.openCockpit(['--target', '/repo/gitguardex'], {
    resolveRepoRoot: (target) => target,
    toolName: 'gx',
    stdout: {
      write(chunk) {
        stdout.push(String(chunk));
      },
    },
    tmux: {
      ensureTmuxAvailable() {},
      sessionExists() {
        return false;
      },
      createSession() {
        return { status: 0 };
      },
      sendKeys(_sessionName, command) {
        sent.push(command);
        return { status: 0 };
      },
      attachSession() {},
    },
  });

  assert.equal(result.action, 'created');
  assert.deepEqual(sent, ["gx cockpit control --target '/repo/gitguardex'"]);
  assert.match(stdout.join(''), /Control pane: gx cockpit control --target '\/repo\/gitguardex'/);
});
