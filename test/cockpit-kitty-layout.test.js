'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const cockpit = require('../src/cockpit');
const {
  buildKittyCockpitPlan,
  openKittyCockpit,
} = require('../src/cockpit/kitty-layout');

function session(id, extra = {}) {
  return {
    id,
    agent: 'codex',
    branch: `agent/codex/${id}`,
    status: 'active',
    worktreePath: `/repo/.omx/agent-worktrees/${id}`,
    worktreeExists: true,
    metadata: {
      'colony.task': id,
    },
    launchCommand: 'exec codex',
    ...extra,
  };
}

function state(sessions) {
  return {
    repoPath: '/repo/gitguardex',
    baseBranch: 'main',
    agentsStatus: {
      schemaVersion: 1,
      repoRoot: '/repo/gitguardex',
      sessions,
    },
  };
}

test('empty state opens welcome/control only in dry-run mode', () => {
  let called = false;
  const result = openKittyCockpit({
    repoRoot: '/repo/gitguardex',
    state: state([]),
    settings: {},
    readSettings: () => ({}),
    sessionName: 'guardex-dev',
    dryRun: true,
    runner() {
      called = true;
    },
  });

  assert.equal(called, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.welcome, true);
  assert.deepEqual(
    result.plan.steps.map((step) => step.id),
    ['launch-control', 'focus-control'],
  );
  assert.equal(result.plan.layout.control.title, 'guardex-dev: welcome');
  assert.deepEqual(result.plan.layout.agents, []);
  assert.equal(result.plan.controlPaneCommand, "gx cockpit control --target '/repo/gitguardex'");
  assert.deepEqual(result.plan.titles, ['guardex-dev: welcome']);
  assert.deepEqual(result.execution.commands, result.plan.commands);
});

test('one agent gets one safe lane pane without launching an agent', () => {
  const plan = buildKittyCockpitPlan(state([session('alpha')]), {
    sessionName: 'guardex-dev',
    dryRun: true,
  });

  assert.equal(plan.backend, 'kitty');
  assert.equal(plan.dryRun, true);
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['launch-control', 'launch-agent-1', 'focus-control'],
  );
  assert.equal(plan.welcome, false);
  assert.equal(plan.layout.agents.length, 1);
  assert.equal(plan.layout.agents[0].title, '01: codex alpha');
  assert.equal(plan.layout.agents[0].cwd, '/repo/.omx/agent-worktrees/alpha');
  assert.equal(plan.layout.agents[0].metadata['colony.task'], 'alpha');
  assert.equal(plan.layout.agents[0].launchCommand, 'exec codex');
  assert.match(plan.layout.agents[0].command, /exec \$\{SHELL:-bash\}/);
  assert.doesNotMatch(plan.layout.agents[0].command, /exec codex/);
  assert.deepEqual(plan.steps[1].command.args, [
    '@',
    'launch',
    '--type=window',
    '--location=vsplit',
    '--cwd',
    '/repo/.omx/agent-worktrees/alpha',
    '--title',
    '01: codex alpha',
    '--',
    'sh',
    '-lc',
    "printf '%s\\n' 'GitGuardex cockpit lane: agent/codex/alpha'; exec ${SHELL:-bash}",
  ]);
});

test('two agents create one pane per active lane with stable titles and cwd', () => {
  const plan = buildKittyCockpitPlan(state([
    session('alpha'),
    session('beta', { agent: 'claude' }),
  ]), {
    sessionName: 'guardex',
    dryRun: true,
  });

  assert.equal(plan.layout.agentArea.panes, 2);
  assert.deepEqual(
    plan.titles,
    ['guardex: control', '01: codex alpha', '02: claude beta'],
  );
  assert.deepEqual(
    plan.agentPaneCommands.map((pane) => ({ title: pane.title, cwd: pane.cwd, worktree: pane.worktree })),
    [
      {
        title: '01: codex alpha',
        cwd: '/repo/.omx/agent-worktrees/alpha',
        worktree: '/repo/.omx/agent-worktrees/alpha',
      },
      {
        title: '02: claude beta',
        cwd: '/repo/.omx/agent-worktrees/beta',
        worktree: '/repo/.omx/agent-worktrees/beta',
      },
    ],
  );
  assert.equal(plan.layout.agents[0].location, 'vsplit');
  assert.equal(plan.layout.agents[1].location, 'hsplit');
  assert.deepEqual(
    plan.workingDirectories.map((entry) => [entry.role, entry.cwd]),
    [
      ['control', '/repo/gitguardex'],
      ['agent', '/repo/.omx/agent-worktrees/alpha'],
      ['agent', '/repo/.omx/agent-worktrees/beta'],
    ],
  );
});

test('missing worktree falls back to repo root cwd', () => {
  const plan = buildKittyCockpitPlan(state([
    session('missing', {
      worktreePath: '/repo/.omx/agent-worktrees/missing',
      worktreeExists: false,
    }),
  ]), {
    sessionName: 'guardex',
    dryRun: true,
  });

  assert.equal(plan.layout.control.cwd, '/repo/gitguardex');
  assert.equal(plan.layout.agents[0].cwd, '/repo/gitguardex');
  assert.equal(plan.layout.agents[0].worktree, '/repo/.omx/agent-worktrees/missing');
  assert.equal(plan.layout.agents[0].missingWorktree, true);
  assert.deepEqual(plan.agentPaneCommands[0], {
    id: 'missing',
    title: '01: codex missing',
    cwd: '/repo/gitguardex',
    worktree: '/repo/.omx/agent-worktrees/missing',
    command: "printf '%s\\n' 'GitGuardex cockpit lane: agent/codex/missing'; exec ${SHELL:-bash}",
    missingWorktree: true,
  });
  assert.deepEqual(plan.steps[1].command.args.slice(4, 6), ['--cwd', '/repo/gitguardex']);
});

test('cockpit index exports Kitty opener and parses --kitty', () => {
  const stdout = [];
  const result = cockpit.openCockpit(['--kitty', '--target', '/repo/gitguardex'], {
    resolveRepoRoot: (target) => target,
    toolName: 'gx',
    stdout: {
      write(chunk) {
        stdout.push(String(chunk));
      },
    },
    dryRun: true,
    readState: () => state([session('alpha')]),
    readSettings: () => ({}),
  });

  assert.equal(result.action, 'created');
  assert.equal(result.backend, 'kitty');
  assert.equal(result.plan.layout.agents.length, 1);
  assert.equal(typeof cockpit.openKittyCockpit, 'function');
  assert.match(stdout.join(''), /Created kitty cockpit window 'guardex'/);
});
