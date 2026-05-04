const {
  test,
  assert,
  fs,
  os,
  path,
  runNodeWithEnv,
  initRepo,
} = require('./helpers/install-test-helpers');
const cockpit = require('../src/cockpit');

function fakeTmux(scriptBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-fake-tmux-'));
  const bin = path.join(dir, 'tmux');
  const log = path.join(dir, 'tmux.log');
  fs.writeFileSync(bin, `#!/usr/bin/env bash\nset -euo pipefail\nLOG=${JSON.stringify(log)}\n${scriptBody}\n`, 'utf8');
  fs.chmodSync(bin, 0o755);
  return { bin, log };
}

function fakeKitty(scriptBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-fake-kitty-'));
  const bin = path.join(dir, 'kitty');
  const log = path.join(dir, 'kitty.log');
  fs.writeFileSync(bin, `#!/usr/bin/env bash\nset -euo pipefail\nLOG=${JSON.stringify(log)}\n${scriptBody}\n`, 'utf8');
  fs.chmodSync(bin, 0o755);
  return { bin, log };
}

function captureStdout() {
  const chunks = [];
  return {
    stdout: {
      isTTY: false,
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
    output() {
      return chunks.join('');
    },
  };
}

test('cockpit opens Kitty by default when remote control is available', () => {
  const repoDir = initRepo();
  const { bin, log } = fakeKitty(
    'printf "%s\\n" "$PWD :: $*" >> "$LOG"\n' +
      'if [[ "${1:-}" == "--version" ]]; then echo "kitty 0.35.0"; exit 0; fi\n' +
      'if [[ "${1:-}" == "@" && "${2:-}" == "ls" ]]; then exit 0; fi\n' +
      'if [[ "${1:-}" == "@" && "${2:-}" == "launch" ]]; then exit 0; fi\n' +
      'if [[ "${1:-}" == "@" && "${2:-}" == "focus-window" ]]; then exit 0; fi\n' +
      'exit 9\n',
  );
  const missingTmux = path.join(os.tmpdir(), `missing-tmux-${process.pid}-${Date.now()}`);

  const result = runNodeWithEnv(['cockpit', '--target', repoDir], repoDir, {
    GUARDEX_KITTY_BIN: bin,
    GUARDEX_TMUX_BIN: missingTmux,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Created kitty cockpit window 'guardex'/);
  assert.match(result.stdout, /Control pane: gx cockpit control --target/);
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.match(lines[0], /^.* :: --version$/);
  assert.match(lines[1], /^.* :: @ ls$/);
  assert.match(lines[2], /^.* :: @ launch --type=window --cwd .* --title gx cockpit -- sh -lc gx cockpit control --target .*$/);
  assert.match(lines[3], /^.* :: @ focus-window --match title:gx cockpit$/);
});

test('cockpit attaches when the tmux session already exists', () => {
  const repoDir = initRepo();
  const { bin, log } = fakeTmux(
    'printf "%s\\n" "$PWD :: $*" >> "$LOG"\n' +
      'if [[ "$1" == "-V" ]]; then exit 0; fi\n' +
      'if [[ "$1" == "has-session" ]]; then exit 0; fi\n' +
      'if [[ "$1" == "attach-session" ]]; then exit 0; fi\n' +
      'exit 9\n',
  );

  const result = runNodeWithEnv(['cockpit', '--backend', 'tmux', '--session', 'guardex-dev', '--target', repoDir], repoDir, {
    GUARDEX_TMUX_BIN: bin,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Attaching tmux session 'guardex-dev'/);
  const logged = fs.readFileSync(log, 'utf8');
  assert.match(logged, /has-session -t guardex-dev/);
  assert.match(logged, /attach-session -t guardex-dev/);
  assert.doesNotMatch(logged, /new-session/);
});

test('cockpit --attach creates then attaches when the session is missing', () => {
  const repoDir = initRepo();
  const { bin, log } = fakeTmux(
    'printf "%s\\n" "$PWD :: $*" >> "$LOG"\n' +
      'if [[ "$1" == "-V" ]]; then exit 0; fi\n' +
      'if [[ "$1" == "has-session" ]]; then exit 1; fi\n' +
      'if [[ "$1" == "new-session" ]]; then exit 0; fi\n' +
      'if [[ "$1" == "send-keys" ]]; then exit 0; fi\n' +
      'if [[ "$1" == "attach-session" ]]; then exit 0; fi\n' +
      'exit 9\n',
  );

  const result = runNodeWithEnv(['cockpit', '--backend=tmux', '--session=guardex-dev', '--attach', '--target', repoDir], repoDir, {
    GUARDEX_TMUX_BIN: bin,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const logged = fs.readFileSync(log, 'utf8');
  assert.match(logged, /new-session -d -s guardex-dev/);
  assert.match(logged, /send-keys -t guardex-dev gx cockpit control --target .* C-m/);
  assert.match(logged, /attach-session -t guardex-dev/);
});

test('cockpit reports a helpful error when tmux is unavailable', () => {
  const repoDir = initRepo();
  const missingTmux = path.join(os.tmpdir(), `missing-tmux-${process.pid}-${Date.now()}`);

  const result = runNodeWithEnv(['cockpit', '--target', repoDir], repoDir, {
    GUARDEX_KITTY_BIN: path.join(os.tmpdir(), `missing-kitty-${process.pid}-${Date.now()}`),
    GUARDEX_TMUX_BIN: missingTmux,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tmux is required for gx cockpit\. Install tmux and retry\./);
});

test('cockpit reports a clear error for an invalid backend', () => {
  const repoDir = initRepo();

  const result = runNodeWithEnv(['cockpit', '--backend', 'screen', '--target', repoDir], repoDir, {});

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--backend requires auto, kitty, or tmux/);
});

test('default cockpit launcher prefers Kitty when remote control is available', () => {
  const repoDir = initRepo();
  const { stdout, output } = captureStdout();
  const calls = [];
  const kittyBackend = {
    name: 'kitty',
    isAvailable: () => true,
    openCockpitLayout(config) {
      calls.push({ backend: 'kitty', config });
      return { status: 0 };
    },
  };
  const tmuxBackend = {
    name: 'tmux',
    openCockpitLayout() {
      throw new Error('tmux should not be used when Kitty is available');
    },
  };

  const result = cockpit.openDefaultCockpit({
    target: repoDir,
    resolveRepoRoot: (target) => target,
    terminalBackends: { kitty: kittyBackend, tmux: tmuxBackend },
    stdout,
    dryRun: true,
    readState: () => ({
      repoPath: repoDir,
      baseBranch: 'main',
      sessions: [],
    }),
    readSettings: () => ({}),
    env: {},
  });

  assert.equal(result.backend, 'kitty');
  assert.equal(calls.length, 0);
  assert.equal(result.plan.repoRoot, repoDir);
  assert.match(result.plan.controlPaneCommand, /gx cockpit control --target /);
  assert.match(output(), /Created kitty cockpit window 'guardex'/);
});

test('default cockpit launcher falls back to tmux when Kitty is unavailable', () => {
  const repoDir = initRepo();
  const { stdout, output } = captureStdout();
  const kittyBackend = {
    name: 'kitty',
    isAvailable: () => false,
    openCockpitLayout() {
      throw new Error('unavailable Kitty should not be opened');
    },
  };
  const tmuxBackend = {
    name: 'tmux',
    openCockpitLayout(config) {
      return { action: 'created', sessionName: config.sessionName };
    },
  };

  const result = cockpit.openDefaultCockpit({
    target: repoDir,
    resolveRepoRoot: (target) => target,
    terminalBackends: { kitty: kittyBackend, tmux: tmuxBackend },
    stdout,
    env: {},
  });

  assert.equal(result.backend, 'tmux');
  assert.match(output(), /Created tmux session 'guardex'/);
});

test('default cockpit launcher renders inline when terminal backends fail', () => {
  const repoDir = initRepo();
  const { stdout, output } = captureStdout();
  const tmuxBackend = {
    name: 'tmux',
    openCockpitLayout() {
      throw new Error('tmux unavailable');
    },
  };

  const result = cockpit.openDefaultCockpit({
    target: repoDir,
    resolveRepoRoot: (target) => target,
    terminalBackends: {
      kitty: { name: 'kitty', isAvailable: () => false },
      tmux: tmuxBackend,
    },
    stdout,
    stdin: { isTTY: false },
    readState: () => ({
      repoPath: repoDir,
      baseBranch: 'main',
      sessions: [],
    }),
    readSettings: () => ({ refreshMs: 0 }),
    env: {},
  });

  result.control.stop();
  assert.equal(result.backend, 'inline');
  assert.deepEqual(result.failures, [{ backend: 'tmux', message: 'tmux unavailable' }]);
  assert.match(output(), /gx cockpit/);
  assert.match(output(), /No active agent lanes|no agent lanes/);
});
