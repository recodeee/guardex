const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_SHADOW_CLEANUP_IDLE_MINUTES,
} = require('../src/context');
const {
  parseSetupArgs,
  parseDoctorArgs,
  parseAgentsArgs,
  parseCleanupArgs,
  parseMergeArgs,
  parseFinishArgs,
} = require('../src/cli/args');
const {
  maybeSuggestCommand,
  normalizeCommandOrThrow,
  warnDeprecatedAlias,
  extractFlag,
} = require('../src/cli/dispatch');

const repoRoot = path.resolve(__dirname, '..');

function captureConsole(methodName, fn) {
  const original = console[methodName];
  const calls = [];
  console[methodName] = (...args) => {
    calls.push(args.join(' '));
  };

  try {
    return { result: fn(), calls };
  } finally {
    console[methodName] = original;
  }
}

test('parseDoctorArgs keeps doctor-specific flags while reusing repo traversal parsing', () => {
  const options = parseDoctorArgs([
    '--current',
    '--force',
    'AGENTS.md',
    '.gitignore',
    '--verbose-auto-finish',
    '--skip-package-json',
    '--no-gitignore',
  ]);

  assert.equal(options.target, process.cwd());
  assert.equal(options.recursive, false);
  assert.equal(options.force, true);
  assert.deepEqual(options.forceManagedPaths, ['AGENTS.md', '.gitignore']);
  assert.equal(options.verboseAutoFinish, true);
  assert.equal(options.skipPackageJson, true);
  assert.equal(options.skipGitignore, true);
  assert.equal(options.waitForMerge, true);
});

test('parseSetupArgs keeps nested traversal and parent workspace view flags', () => {
  const options = parseSetupArgs([
    '--target',
    '/tmp/guardex-repo',
    '--no-recursive',
    '--max-depth',
    '4',
    '--skip-nested',
    'vendor',
    '--include-submodules',
    '--parent-workspace-view',
  ], {
    force: false,
    dryRun: false,
    dropStaleLocks: true,
  });

  assert.equal(options.target, '/tmp/guardex-repo');
  assert.equal(options.recursive, false);
  assert.equal(options.nestedMaxDepth, 4);
  assert.deepEqual(options.nestedSkipDirs, ['vendor']);
  assert.equal(options.includeSubmodules, true);
  assert.equal(options.parentWorkspaceView, true);
});

test('parseAgentsArgs applies interval overrides and validates the subcommand', () => {
  const options = parseAgentsArgs([
    'start',
    '--target',
    '/tmp/guardex-repo',
    '--review-interval',
    '15',
    '--cleanup-interval',
    '45',
    '--idle-minutes',
    '12',
  ]);

  assert.deepEqual(options, {
    target: '/tmp/guardex-repo',
    subcommand: 'start',
    reviewIntervalSeconds: 15,
    cleanupIntervalSeconds: 45,
    idleMinutes: 12,
  });
});

test('parseCleanupArgs defaults idle minutes when watch mode is enabled', () => {
  const options = parseCleanupArgs(['--watch']);
  assert.equal(options.watch, true);
  assert.equal(options.idleMinutes, DEFAULT_SHADOW_CLEANUP_IDLE_MINUTES);
});

test('parseMergeArgs requires at least one agent branch', () => {
  assert.throws(
    () => parseMergeArgs(['--base', 'dev']),
    /merge requires at least one --branch <agent\/\*> input/,
  );
});

test('parseFinishArgs rejects non-agent branches and preserves explicit overrides', () => {
  assert.throws(
    () => parseFinishArgs(['--branch', 'feature/not-agent']),
    /--branch must reference an agent\/\* branch/,
  );

  const options = parseFinishArgs([
    '--branch',
    'agent/codex/example',
    '--no-cleanup',
    '--no-wait-for-merge',
    '--direct-only',
    '--keep-remote',
    '--no-auto-commit',
    '--fail-fast',
    '--commit-message',
    'Finish the active lane',
  ]);

  assert.equal(options.branch, 'agent/codex/example');
  assert.equal(options.cleanup, false);
  assert.equal(options.waitForMerge, false);
  assert.equal(options.mergeMode, 'direct');
  assert.equal(options.keepRemote, true);
  assert.equal(options.noAutoCommit, true);
  assert.equal(options.failFast, true);
  assert.equal(options.commitMessage, 'Finish the active lane');
});

test('dispatch helpers preserve suggestion, alias, deprecation, and flag extraction behavior', () => {
  assert.equal(maybeSuggestCommand('docto'), 'doctor');

  const alias = captureConsole('log', () => normalizeCommandOrThrow('doctro'));
  assert.equal(alias.result, 'doctor');
  assert.match(alias.calls.join('\n'), /\[gitguardex\] Interpreting 'doctro' as 'doctor'\./);

  const deprecation = captureConsole('error', () => warnDeprecatedAlias('init'));
  assert.match(deprecation.calls.join('\n'), /\[gitguardex\] 'init' is deprecated/);
  assert.match(deprecation.calls.join('\n'), /gx setup/);

  assert.deepEqual(
    extractFlag(['status', '--strict', '--json'], '--strict'),
    { found: true, remaining: ['status', '--json'] },
  );
});

test('cli main no longer keeps local copies of extracted parser and dispatch helpers', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'cli', 'main.js'), 'utf8');

  assert.match(source, /require\('\.\/args'\)/);
  assert.match(source, /require\('\.\/dispatch'\)/);
  assert.match(source, /require\('\.\.\/git'\)/);
  assert.doesNotMatch(source, /function parseDoctorArgs\(rawArgs\)/);
  assert.doesNotMatch(source, /function parseSetupArgs\(rawArgs, defaults\)/);
  assert.doesNotMatch(source, /function parseCleanupArgs\(rawArgs\)/);
  assert.doesNotMatch(source, /function parseFinishArgs\(rawArgs, defaults = \{\}\)/);
  assert.doesNotMatch(source, /function gitRun\(repoRoot, args, \{ allowFailure = false \} = \{\}\)/);
  assert.doesNotMatch(source, /function resolveRepoRoot\(targetPath\)/);
  assert.doesNotMatch(source, /function isGitRepo\(targetPath\)/);
  assert.doesNotMatch(source, /function discoverNestedGitRepos\(rootPath, opts = \{\}\)/);
  assert.doesNotMatch(source, /function maybeSuggestCommand\(command\)/);
  assert.doesNotMatch(source, /function normalizeCommandOrThrow\(command\)/);
  assert.doesNotMatch(source, /function warnDeprecatedAlias\(aliasName\)/);
  assert.doesNotMatch(source, /function extractFlag\(args, \.\.\.names\)/);
});
