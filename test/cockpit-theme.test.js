'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { renderLaneMenu, buildLaneMenu } = require('../src/cockpit/menu');
const { renderSidebar } = require('../src/cockpit/sidebar');
const { colorize, getCockpitTheme, stripAnsi } = require('../src/cockpit/theme');
const { renderWelcomePage } = require('../src/cockpit/welcome');
const { renderControlFrame, applyCockpitAction } = require('../src/cockpit/control');

test('getCockpitTheme resolves supported themes and default blue alias', () => {
  assert.equal(getCockpitTheme('blue').name, 'blue');
  assert.equal(getCockpitTheme('amber').name, 'amber');
  assert.equal(getCockpitTheme('dim').name, 'dim');
  assert.equal(getCockpitTheme('high-contrast').name, 'high-contrast');
  assert.equal(getCockpitTheme('none').name, 'none');
  assert.equal(getCockpitTheme('default').name, 'blue');
  assert.equal(getCockpitTheme('missing').name, 'blue');

  const blue = getCockpitTheme('blue', { env: {} });
  assert.equal(blue.tokens.accent, '\x1b[36m');
  assert.equal(blue.tokens.success, '\x1b[32m');
  assert.equal(blue.tokens.warning, '\x1b[33m');
  assert.equal(blue.tokens.danger, '\x1b[31m');
  assert.equal(blue.tokens.secondary, '\x1b[2;90m');
});

test('colorize applies tokens and stripAnsi removes color', () => {
  const output = colorize('guarded', 'success', getCockpitTheme('blue', { env: {} }));

  assert.match(output, /^\x1b\[32mguarded\x1b\[0m$/);
  assert.equal(stripAnsi(output), 'guarded');
});

test('NO_COLOR and --no-color disable theme color output', () => {
  const noColorTheme = getCockpitTheme('blue', { env: { NO_COLOR: '' } });
  const argvTheme = getCockpitTheme('blue', { env: {}, argv: ['node', 'gx', '--no-color'] });

  assert.equal(noColorTheme.color, false);
  assert.equal(argvTheme.color, false);
  assert.equal(colorize('plain', 'accent', noColorTheme), 'plain');
  assert.equal(colorize('plain', 'accent', argvTheme), 'plain');
});

test('sidebar stays readable with no color', () => {
  const output = renderSidebar({
    repoPath: '/work/gitguardex',
    selectedSessionId: 's1',
    settings: { theme: 'blue' },
    sessions: [{
      id: 's1',
      agentName: 'codex',
      branch: 'agent/codex/theme',
      task: 'ship blue guard terminal theme',
      status: 'working',
      lockCount: 2,
      worktreeExists: true,
    }],
  }, { noColor: true, width: 38 });

  assert.equal(stripAnsi(output), output);
  assert.match(output, /gx cockpit/);
  assert.match(output, /> ship blue guard ter\.\.\. \[cx\] \(active\)/);
});

test('menu stays readable with no color and monochrome box drawing', () => {
  const menu = buildLaneMenu({
    agent: 'codex',
    branch: 'agent/codex/theme',
    worktreePath: '/repo/.omx/agent-worktrees/theme',
    worktreeExists: true,
  });
  const output = renderLaneMenu(menu, { ascii: true, noColor: true });

  assert.equal(stripAnsi(output), output);
  assert.match(output, /^\+/);
  assert.match(output, /\| Menu: codex/);
  assert.match(output, /Close\s+\[x\]/);
  assert.match(output, /Create GitHub PR/);
});

test('welcome stays readable with no color', () => {
  const output = renderWelcomePage({
    repoPath: '/work/gitguardex',
    currentBranch: 'agent/codex/theme',
    baseBranch: 'main',
    safetyStatus: 'guarded',
    lockCount: 1,
  }, { noColor: true, width: 60, theme: 'blue' });

  assert.equal(stripAnsi(output), output);
  assert.match(output, /^\+/);
  assert.match(output, /gitguardex \| gx cockpit/);
  assert.match(output, /Safety:\s+guarded/);
  assert.match(output, /n new agent/);
});

test('control frame respects no color environment', () => {
  const state = applyCockpitAction({}, {
    type: 'refresh',
    cockpitState: {
      repoPath: '/repo/gitguardex',
      baseBranch: 'main',
      sessions: [{
        id: 'theme',
        agentName: 'codex',
        branch: 'agent/codex/theme',
        task: 'blue theme',
        status: 'working',
        worktreePath: '/tmp/theme',
        worktreeExists: true,
      }],
    },
    settings: { theme: 'blue', sidebarWidth: 36 },
  });

  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  try {
    const output = renderControlFrame(state);
    assert.equal(stripAnsi(output), output);
    assert.match(output, /blue theme\s+\[cx\] \(active\)/);
    assert.match(output, /keys: up\/down select/);
  } finally {
    if (previous === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previous;
    }
  }
});
