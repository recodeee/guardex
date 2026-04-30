'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyCockpitKey,
  defaultKeybindings,
  resolveKeyAction,
} = require('../src/cockpit/keybindings');

test('defaultKeybindings exposes dmux-style cockpit commands for main mode', () => {
  const bindings = defaultKeybindings();

  assert.equal(bindings.main.j.type, 'next');
  assert.equal(bindings.main.down.type, 'next');
  assert.equal(bindings.main.k.type, 'previous');
  assert.equal(bindings.main.up.type, 'previous');
  assert.equal(bindings.main.enter.type, 'view-selected');
  assert.equal(bindings.main.n.type, 'new-agent');
  assert.equal(bindings.main.t.type, 'terminal');
  assert.equal(bindings.main.m.type, 'menu');
  assert.equal(bindings.main['alt-shift-m'].type, 'menu');
  assert.equal(bindings.main.s.type, 'settings');
  assert.equal(bindings.main['?'].type, 'shortcuts');
  assert.equal(bindings.main.x.type, 'close');
  assert.equal(bindings.main.b.type, 'create-child-worktree');
  assert.equal(bindings.main.f.type, 'browse-files');
  assert.equal(bindings.main.h.type, 'hide-pane');
  assert.equal(bindings.main.P.type, 'project-focus');
  assert.equal(bindings.main.a.type, 'add-agent');
  assert.equal(bindings.main.A.type, 'add-terminal');
  assert.equal(bindings.main.d.type, 'diff');
  assert.equal(bindings.main.l.type, 'locks');
  assert.equal(bindings.main.y.type, 'sync');
  assert.equal(bindings.main.F.type, 'finish');
  assert.equal(bindings.main.c.type, 'cleanup-sessions');
  assert.equal(bindings.main.r.type, 'reopen-closed-worktree');
  assert.equal(bindings.main.q.type, 'quit');
  assert.equal(bindings.shortcuts.esc.type, 'close-popup');
  assert.equal(bindings['new-agent'].esc.type, 'close-popup');
  assert.equal(bindings.terminal.esc.type, 'close-popup');
});

test('resolveKeyAction maps main mode keys to structured actions', () => {
  assert.deepEqual(resolveKeyAction('j', { mode: 'main' }), {
    type: 'next',
    payload: { key: 'j', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('ArrowUp', { mode: 'main' }), {
    type: 'previous',
    payload: { key: 'up', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('n', { mode: 'main' }), {
    type: 'new-agent',
    payload: { key: 'n', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('t', { mode: 'main' }), {
    type: 'terminal',
    payload: { key: 't', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('m', { mode: 'main' }), {
    type: 'menu',
    payload: { key: 'm', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('s', { mode: 'main' }), {
    type: 'settings',
    payload: { key: 's', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('?', { mode: 'main' }), {
    type: 'shortcuts',
    payload: { key: '?', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('q', { mode: 'main' }), {
    type: 'quit',
    payload: { key: 'q', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('F', { mode: 'main' }), {
    type: 'finish',
    payload: { key: 'F', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('x', { mode: 'main' }), {
    type: 'close',
    payload: { key: 'x', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('A', { mode: 'main' }), {
    type: 'add-terminal',
    payload: { key: 'A', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('P', { mode: 'main' }), {
    type: 'project-focus',
    payload: { key: 'P', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('r', { mode: 'main' }), {
    type: 'reopen-closed-worktree',
    payload: { key: 'r', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('ArrowDown', { mode: 'main' }), {
    type: 'next',
    payload: { key: 'down', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction({ name: 'down' }, { mode: 'main' }), {
    type: 'next',
    payload: { key: 'down', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('\r', { mode: 'main' }), {
    type: 'view-selected',
    payload: { key: 'enter', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('\u001bM', { mode: 'main' }), {
    type: 'menu',
    payload: { key: 'alt-shift-m', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('\u001bm', { mode: 'main' }), {
    type: 'menu',
    payload: { key: 'alt-shift-m', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('Alt+Shift+M', { mode: 'main' }), {
    type: 'menu',
    payload: { key: 'alt-shift-m', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction({ name: 'm', meta: true, shift: true }, { mode: 'main' }), {
    type: 'menu',
    payload: { key: 'alt-shift-m', mode: 'main' },
  });
});

test('resolveKeyAction keeps menu mode focused on navigation and closing', () => {
  assert.deepEqual(resolveKeyAction('j', { mode: 'menu' }), {
    type: 'next',
    payload: { key: 'j', mode: 'menu' },
  });
  assert.deepEqual(resolveKeyAction('up', { mode: 'menu' }), {
    type: 'previous',
    payload: { key: 'up', mode: 'menu' },
  });
  assert.deepEqual(resolveKeyAction('enter', { mode: 'menu' }), {
    type: 'view-selected',
    payload: { key: 'enter', mode: 'menu' },
  });
  assert.deepEqual(resolveKeyAction('esc', { mode: 'menu' }), {
    type: 'close-menu',
    payload: { key: 'esc', mode: 'menu' },
  });
  assert.deepEqual(resolveKeyAction('n', { mode: 'menu' }), {
    type: 'noop',
    payload: { key: 'n', mode: 'menu' },
  });
  assert.deepEqual(resolveKeyAction('q', { mode: 'menu' }), {
    type: 'quit',
    payload: { key: 'q', mode: 'menu' },
  });
});

test('resolveKeyAction keeps settings mode focused on navigation and closing', () => {
  assert.deepEqual(resolveKeyAction('k', { mode: 'settings' }), {
    type: 'previous',
    payload: { key: 'k', mode: 'settings' },
  });
  assert.deepEqual(resolveKeyAction('down', { mode: 'settings' }), {
    type: 'next',
    payload: { key: 'down', mode: 'settings' },
  });
  assert.deepEqual(resolveKeyAction('enter', { mode: 'settings' }), {
    type: 'view-selected',
    payload: { key: 'enter', mode: 'settings' },
  });
  assert.deepEqual(resolveKeyAction('escape', { mode: 'settings' }), {
    type: 'close-settings',
    payload: { key: 'esc', mode: 'settings' },
  });
  assert.deepEqual(resolveKeyAction('f', { mode: 'settings' }), {
    type: 'noop',
    payload: { key: 'f', mode: 'settings' },
  });
  assert.deepEqual(resolveKeyAction('q', { mode: 'settings' }), {
    type: 'quit',
    payload: { key: 'q', mode: 'settings' },
  });
});

test('resolveKeyAction closes secondary modes with escape', () => {
  for (const mode of ['shortcuts', 'new-agent', 'terminal']) {
    assert.deepEqual(resolveKeyAction('esc', { mode }), {
      type: 'close-popup',
      payload: { key: 'esc', mode },
    });
    assert.deepEqual(resolveKeyAction('q', { mode }), {
      type: 'quit',
      payload: { key: 'q', mode },
    });
  }
});

test('resolveKeyAction defaults unknown modes to main and unknown keys to noop', () => {
  assert.deepEqual(resolveKeyAction('q', { mode: 'sideways' }), {
    type: 'quit',
    payload: { key: 'q', mode: 'main' },
  });
  assert.deepEqual(resolveKeyAction('z', { mode: 'main' }), {
    type: 'noop',
    payload: { key: 'z', mode: 'main' },
  });
});

test('applyCockpitKey wraps lane navigation', () => {
  const state = {
    mode: 'main',
    sessions: [{ id: 'one' }, { id: 'two' }],
    selectedIndex: 1,
    selectedSessionId: 'two',
  };

  const next = applyCockpitKey(state, 'j');
  assert.equal(next.selectedIndex, 0);
  assert.equal(next.selectedSessionId, '');
  assert.equal(next.selectedScope, 'lane');

  const previous = applyCockpitKey(next, 'k');
  assert.equal(previous.selectedIndex, 1);
  assert.equal(previous.selectedScope, 'lane');
});

test('applyCockpitKey keeps empty-lane navigation on action rows', () => {
  const state = {
    mode: 'main',
    sessions: [],
    actionRows: ['new-agent', 'terminal', 'settings', 'shortcuts'],
    actionIndex: 0,
  };

  const next = applyCockpitKey(state, 'down');
  assert.equal(next.selectedScope, 'action');
  assert.equal(next.selectedIndex, 0);
  assert.equal(next.actionIndex, 1);

  const previous = applyCockpitKey(state, 'up');
  assert.equal(previous.selectedScope, 'action');
  assert.equal(previous.actionIndex, 3);
});

test('applyCockpitKey opens modes without launching actions', () => {
  assert.equal(applyCockpitKey({ mode: 'main' }, 'n').mode, 'new-agent');
  assert.equal(applyCockpitKey({ mode: 'main' }, 't').mode, 'terminal');
  assert.equal(applyCockpitKey({ mode: 'main' }, 'm').mode, 'menu');
  assert.equal(applyCockpitKey({ mode: 'main' }, 's').mode, 'settings');
  assert.equal(applyCockpitKey({ mode: 'main' }, '?').mode, 'shortcuts');
  assert.equal(applyCockpitKey({ mode: 'settings' }, 'esc').mode, 'main');
  assert.equal(applyCockpitKey({ mode: 'menu' }, '\u001b').mode, 'main');
  assert.equal(applyCockpitKey({ mode: 'shortcuts' }, 'escape').mode, 'main');
  assert.equal(applyCockpitKey({ mode: 'main' }, 'q').shouldExit, true);
});
