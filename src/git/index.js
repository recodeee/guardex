const fs = require('node:fs');
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

function resolveGitCommonDir(repoPath) {
  const result = run('git', ['-C', repoPath, 'rev-parse', '--git-common-dir'], { cwd: repoPath });
  if (result.status !== 0) return null;
  const raw = result.stdout.trim();
  if (!raw) return null;
  return path.resolve(repoPath, raw);
}

function discoverNestedGitRepos(rootPath, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth)
    ? Math.max(1, opts.maxDepth)
    : NESTED_REPO_DEFAULT_MAX_DEPTH;
  const extraSkip = new Set(Array.isArray(opts.extraSkip) ? opts.extraSkip : []);
  const includeSubmodules = Boolean(opts.includeSubmodules);
  const skipRelativeDirs = Array.isArray(opts.skipRelativeDirs) ? opts.skipRelativeDirs.filter(Boolean) : [];
  const resolvedRoot = path.resolve(rootPath);

  if (!isGitRepo(resolvedRoot)) {
    throw new Error(`Target is not inside a git repository: ${resolvedRoot}`);
  }

  const rootCommonDir = resolveGitCommonDir(resolvedRoot);
  const skipAbsolutes = skipRelativeDirs.map((relativeDir) => path.join(resolvedRoot, relativeDir));
  const found = new Set([resolvedRoot]);

  function shouldSkipDir(dirName) {
    return NESTED_REPO_DEFAULT_SKIP_DIRS.has(dirName) || extraSkip.has(dirName);
  }

  function walk(currentPath, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.name === '.git') {
        if (entry.isDirectory()) {
          if (entryPath === path.join(resolvedRoot, '.git')) continue;
          found.add(path.dirname(entryPath));
        } else if (includeSubmodules && entry.isFile()) {
          found.add(path.dirname(entryPath));
        }
        continue;
      }

      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (shouldSkipDir(entry.name)) continue;
      if (skipAbsolutes.includes(entryPath)) continue;
      walk(entryPath, depth + 1);
    }
  }

  walk(resolvedRoot, 0);

  const filtered = Array.from(found).filter((repoPath) => {
    if (repoPath === resolvedRoot || !rootCommonDir) return true;
    const childCommonDir = resolveGitCommonDir(repoPath);
    return !childCommonDir || childCommonDir !== rootCommonDir;
  });

  const [root, ...rest] = filtered;
  rest.sort((a, b) => a.localeCompare(b));
  return root ? [root, ...rest] : [];
}

module.exports = {
  DEFAULT_NESTED_REPO_MAX_DEPTH: NESTED_REPO_DEFAULT_MAX_DEPTH,
  gitRun,
  resolveRepoRoot,
  isGitRepo,
  discoverNestedGitRepos,
};
