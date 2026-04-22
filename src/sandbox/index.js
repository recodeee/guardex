function createSandboxApi(deps) {
  const {
    protectedBaseWriteBlock,
    runInstallInternal,
    ensureSetupProtectedBranches,
    ensureParentWorkspaceView,
    buildParentWorkspaceView,
    runFixInternal,
  } = deps;

  function assertProtectedMainWriteAllowed(options, commandName) {
    const blocked = protectedBaseWriteBlock(options);
    if (!blocked) {
      return;
    }

    throw new Error(
      `${commandName} blocked on protected branch '${blocked.branch}' in an initialized repo.\n` +
      `Keep local '${blocked.branch}' pull-only: start an agent branch/worktree first:\n` +
      `  gx branch start "<task>" "codex"\n` +
      `Override once only when intentional: --allow-protected-base-write`,
    );
  }

  function runSetupBootstrapInternal(options) {
    const installPayload = runInstallInternal(options);
    installPayload.operations.push(
      ensureSetupProtectedBranches(installPayload.repoRoot, Boolean(options.dryRun)),
    );

    let parentWorkspace = null;
    if (options.parentWorkspaceView) {
      installPayload.operations.push(
        ensureParentWorkspaceView(installPayload.repoRoot, Boolean(options.dryRun)),
      );
      if (!options.dryRun) {
        parentWorkspace = buildParentWorkspaceView(installPayload.repoRoot);
      }
    }

    const fixPayload = runFixInternal({
      target: installPayload.repoRoot,
      dryRun: options.dryRun,
      force: options.force,
      forceManagedPaths: options.forceManagedPaths,
      dropStaleLocks: true,
      skipAgents: options.skipAgents,
      skipPackageJson: options.skipPackageJson,
      skipGitignore: options.skipGitignore,
      allowProtectedBaseWrite: options.allowProtectedBaseWrite,
    });

    return {
      installPayload,
      fixPayload,
      parentWorkspace,
    };
  }

  return {
    assertProtectedMainWriteAllowed,
    runSetupBootstrapInternal,
  };
}

module.exports = {
  createSandboxApi,
};
