const { path, TEMPLATE_ROOT, HOOK_NAMES, TOOL_NAME, SHORT_TOOL_NAME } = require('../context');
const {
  run,
  runPackageAsset,
  runReviewBotCommand,
  packageAssetEnv,
  extractTargetedArgs,
} = require('../core/runtime');
const { resolveRepoRoot } = require('../git');

function configureHooks(repoRoot, dryRun) {
  if (dryRun) {
    return { status: 'would-set', key: 'core.hooksPath', value: '.githooks' };
  }

  const result = run('git', ['-C', repoRoot, 'config', 'core.hooksPath', '.githooks']);
  if (result.status !== 0) {
    throw new Error(`Failed to set git hooksPath: ${(result.stderr || '').trim()}`);
  }

  return { status: 'set', key: 'core.hooksPath', value: '.githooks' };
}

function hook(rawArgs) {
  const [subcommand, ...rest] = rawArgs;
  if (subcommand === 'run') {
    const [hookName, ...hookArgs] = rest;
    if (!HOOK_NAMES.includes(hookName)) {
      throw new Error(`Unknown hook name: ${hookName || '(missing)'}`);
    }
    const { target, passthrough } = extractTargetedArgs(hookArgs);
    const hookAssetPath = path.join(TEMPLATE_ROOT, 'githooks', hookName);
    const result = run('bash', [hookAssetPath, ...passthrough], {
      cwd: resolveRepoRoot(target),
      stdio: hookName === 'pre-push' ? 'inherit' : 'pipe',
      env: packageAssetEnv(),
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status;
    return;
  }
  if (subcommand === 'install') {
    const { target, passthrough } = extractTargetedArgs(rest);
    if (passthrough.length > 0) {
      throw new Error(`Unknown hook install option: ${passthrough[0]}`);
    }
    const repoRoot = resolveRepoRoot(target);
    const hookResult = configureHooks(repoRoot, false);
    console.log(`[${TOOL_NAME}] Hook install target: ${repoRoot}`);
    console.log(`  - hooksPath    ${hookResult.status} ${hookResult.key}=${hookResult.value}`);
    process.exitCode = 0;
    return;
  }
  throw new Error(`Usage: ${SHORT_TOOL_NAME} hook <run|install> ...`);
}

function internal(rawArgs) {
  const [subcommand, assetKey, ...rest] = rawArgs;
  if (subcommand !== 'run-shell') {
    throw new Error(`Unknown internal command: ${subcommand || '(missing)'}`);
  }
  const { target, passthrough } = extractTargetedArgs(rest);
  const repoRoot = resolveRepoRoot(target);
  const result = assetKey === 'reviewBot'
    ? runReviewBotCommand(repoRoot, passthrough)
    : runPackageAsset(assetKey, passthrough, { cwd: repoRoot });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}

module.exports = {
  configureHooks,
  hook,
  internal,
};
