const { path } = require('../context');
const { run } = require('../core/runtime');

function gitRun(repoRoot, args, { allowFailure = false } = {}) {
  const result = run('git', ['-C', repoRoot, ...args]);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result;
}

function resolveRepoRoot(targetPath) {
  const resolvedTarget = path.resolve(targetPath || process.cwd());
  const result = run('git', ['-C', resolvedTarget, 'rev-parse', '--show-toplevel']);
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(
      `Target is not inside a git repository: ${resolvedTarget}${stderr ? `\n${stderr}` : ''}`,
    );
  }
  return result.stdout.trim();
}

function isGitRepo(targetPath) {
  const resolvedTarget = path.resolve(targetPath || process.cwd());
  const result = run('git', ['-C', resolvedTarget, 'rev-parse', '--show-toplevel']);
  return result.status === 0;
}

const NESTED_REPO_DEFAULT_MAX_DEPTH = 6;
const NESTED_REPO_DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'target',
  'vendor',
  '.venv',
  '.pnpm-store',
]);

function discoverNestedGitRepos(rootPath, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth)
    ? Math.max(1, opts.maxDepth)
    : NESTED_REPO_DEFAULT_MAX_DEPTH;
  const extraSkip = new Set(Array.isArray(opts.extraSkip) ? opts.extraSkip : []);
  const includeSubmodules = Boolean(opts.includeSubmodules);
  const resolvedRoot = path.resolve(rootPath);

  if (!isGitRepo(resolvedRoot)) {
    throw new Error(`Target is not inside a git repository: ${resolvedRoot}`);
  }

  const results = [];
  const seen = new Set();

  function visit(directoryPath, depth) {
    const repoRoot = resolveRepoRoot(directoryPath);
    if (!seen.has(repoRoot)) {
      seen.add(repoRoot);
      results.push(repoRoot);
    }

    if (depth >= maxDepth) {
      return;
    }

    let entries = [];
    try {
      entries = require('node:fs').readdirSync(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (NESTED_REPO_DEFAULT_SKIP_DIRS.has(entry.name) || extraSkip.has(entry.name)) {
        continue;
      }

      const childPath = path.join(directoryPath, entry.name);
      const gitDir = path.join(childPath, '.git');
      if (require('node:fs').existsSync(gitDir)) {
        if (!includeSubmodules) {
          const gitInfo = require('node:fs').lstatSync(gitDir);
          if (gitInfo.isFile()) {
            continue;
          }
        }
        visit(childPath, depth + 1);
        continue;
      }

      visit(childPath, depth + 1);
    }
  }

  visit(resolvedRoot, 0);
  return results;
}

module.exports = {
  DEFAULT_NESTED_REPO_MAX_DEPTH: NESTED_REPO_DEFAULT_MAX_DEPTH,
  gitRun,
  resolveRepoRoot,
  isGitRepo,
  discoverNestedGitRepos,
};
