'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cockpit = require('../src/cockpit');
const {
  applyCockpitAction,
  runSelectedLaneAction,
} = require('../src/cockpit/control');
const { createKittyCockpitPlan } = require('../src/cockpit/kitty-layout');
const { buildLaneMenu } = require('../src/cockpit/menu');
const {
  initRepo,
  runNodeWithEnv,
} = require('./helpers/install-test-helpers');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fakeBin(name, scriptBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `guardex-fake-${name}-`));
  const bin = path.join(dir, name);
  const log = path.join(dir, `${name}.log`);
  fs.writeFileSync(bin, `#!/usr/bin/env bash\nset -euo pipefail\nLOG=${JSON.stringify(log)}\n${scriptBody}\n`, 'utf8');
  fs.chmodSync(bin, 0o755);
  return { bin, log };
}

function fakeKitty() {
  return fakeBin('kitty', [
    'printf "%s\\n" "$PWD :: $*" >> "$LOG"',
    'if [[ "${1:-}" == "--version" ]]; then echo "kitty 0.35.0"; exit 0; fi',
    'if [[ "${1:-}" == "@" && "${2:-}" == "ls" ]]; then exit 0; fi',
    'if [[ "${1:-}" == "@" && "${2:-}" == "launch" ]]; then exit 0; fi',
    'if [[ "${1:-}" == "@" && "${2:-}" == "focus-window" ]]; then exit 0; fi',
    'exit 9',
  ].join('\n'));
}

function fakeTmux() {
  return fakeBin('tmux', [
    'printf "%s\\n" "$PWD :: $*" >> "$LOG"',
    'if [[ "${1:-}" == "-V" ]]; then echo "tmux 3.4"; exit 0; fi',
    'if [[ "${1:-}" == "has-session" ]]; then exit 1; fi',
    'if [[ "${1:-}" == "new-session" ]]; then exit 0; fi',
    'if [[ "${1:-}" == "send-keys" ]]; then exit 0; fi',
    'exit 9',
  ].join('\n'));
}

function readLogLines(log) {
  return fs.readFileSync(log, 'utf8').trim().split('\n');
}

function assertKittyLaunchLine(line, repoDir) {
  assert.match(line, / :: @ launch --type=window --cwd /);
  assert.match(line, new RegExp(`--cwd ${escapeRegExp(repoDir)}`));
  assert.match(line, /--title gx cockpit/);
  assert.match(line, /-- sh -lc gx cockpit control --target /);
}

test('gx cockpit command path opens Kitty by default when remote control answers', () => {
  const repoDir = initRepo();
  const kitty = fakeKitty();
  const missingTmux = path.join(os.tmpdir(), `guardex-missing-tmux-${process.pid}-${Date.now()}`);

  const result = runNodeWithEnv(['cockpit', '--session', 'guardex-auto', '--target', repoDir], repoDir, {
    GUARDEX_KITTY_BIN: kitty.bin,
    GUARDEX_TMUX_BIN: missingTmux,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Created kitty cockpit window 'guardex-auto'/);
  const lines = readLogLines(kitty.log);
  assert.equal(lines.length, 4);
  assert.match(lines[0], / :: --version$/);
  assert.match(lines[1], / :: @ ls$/);
  assertKittyLaunchLine(lines[2], repoDir);
  assert.match(lines[3], / :: @ focus-window --match title:gx cockpit$/);
});

test('gx cockpit --backend kitty dry-run layout plan is deterministic and does not execute Kitty', () => {
  const repoRoot = '/repo/gitguardex';
  const controlCommand = cockpit.cockpitControlCommand(repoRoot);
  const plan = createKittyCockpitPlan({
    repoRoot,
    sessionName: 'guardex-kitty',
    controlCommand,
    welcomeCommand: 'gx',
    agents: [{
      id: 'alpha',
      agent: 'codex',
      worktreePath: '/repo/.omx/agent-worktrees/alpha',
      command: 'exec codex',
    }],
    kittyBin: '/usr/bin/kitty',
    dryRun: true,
  });

  assert.equal(plan.backend, 'kitty');
  assert.equal(plan.dryRun, true);
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['launch-control', 'launch-agent-area', 'launch-agent-1', 'focus-control'],
  );
  assert.deepEqual(plan.commands[0], {
    cmd: '/usr/bin/kitty',
    args: [
      '@',
      'launch',
      '--type=window',
      '--cwd',
      repoRoot,
      '--title',
      'guardex-kitty: control',
      '--',
      'sh',
      '-lc',
      "gx cockpit control --target '/repo/gitguardex'",
    ],
  });
  assert.equal(plan.layout.agents[0].cwd, '/repo/.omx/agent-worktrees/alpha');
});

test('gx cockpit --backend tmux preserves the existing tmux control path', () => {
  const repoDir = initRepo();
  const kitty = fakeKitty();
  const tmux = fakeTmux();

  const result = runNodeWithEnv(['cockpit', '--backend', 'tmux', '--session', 'guardex-tmux', '--target', repoDir], repoDir, {
    GUARDEX_KITTY_BIN: kitty.bin,
    GUARDEX_TMUX_BIN: tmux.bin,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Created tmux session 'guardex-tmux'/);
  assert.equal(fs.existsSync(kitty.log), false, 'tmux backend must not probe or launch Kitty');
  const logged = fs.readFileSync(tmux.log, 'utf8');
  assert.match(logged, /has-session -t guardex-tmux/);
  assert.match(logged, /new-session -d -s guardex-tmux/);
  assert.match(logged, /send-keys -t guardex-tmux gx cockpit control --target .* C-m/);
});

test('cockpit pane menu opens and selects a lane terminal action', () => {
  let state = applyCockpitAction({}, {
    type: 'refresh',
    cockpitState: {
      repoPath: '/repo/gitguardex',
      baseBranch: 'main',
      sessions: [{
        id: 'pane-1',
        agentName: 'codex',
        branch: 'agent/codex/pane-1',
        worktreePath: '/repo/.omx/agent-worktrees/pane-1',
        worktreeExists: true,
      }],
    },
  });

  state = applyCockpitAction(state, { type: 'key', key: 'm' });
  assert.equal(state.mode, 'menu');

  state = applyCockpitAction(state, { type: 'key', key: 'T' });

  assert.deepEqual(state.lastIntent, {
    type: 'add-terminal',
    sessionId: 'pane-1',
    branch: 'agent/codex/pane-1',
    worktreePath: '/repo/.omx/agent-worktrees/pane-1',
  });
});

test('lane menu selected action id reaches the cockpit action dispatcher', () => {
  const session = {
    id: 'pane-1',
    branch: 'agent/codex/pane-1',
    worktreePath: '/repo/.omx/agent-worktrees/pane-1',
    worktreeExists: true,
  };
  const menu = buildLaneMenu(session);
  const selected = menu.items.find((item) => item.shortcut === 'f');
  const calls = [];

  const result = runSelectedLaneAction({ id: selected.id }, {
    repoRoot: '/repo',
    baseBranch: 'main',
    session,
    runCommand(cmd, args) {
      calls.push({ cmd, args });
      return { status: 0, stdout: `${cmd} ok\n`, stderr: '' };
    },
  });

  assert.equal(selected.id, 'browse-files');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    cmd: 'gx',
    args: [
      'agents',
      'files',
      '--target',
      '/repo',
      '--branch',
      'agent/codex/pane-1',
    ],
  }]);
});
