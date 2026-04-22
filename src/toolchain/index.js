function createToolchainApi(deps) {
  const {
    TOOL_NAME,
    NPM_BIN,
    NPX_BIN,
    packageJson,
    OPENSPEC_PACKAGE,
    OPENSPEC_BIN,
    GLOBAL_TOOLCHAIN_PACKAGES,
    parseAutoApproval,
    isInteractiveTerminal,
    promptYesNoStrict,
    run,
    checkForGuardexUpdate,
    printUpdateAvailableBanner,
    readInstalledGuardexVersion,
    restartIntoUpdatedGuardex,
    checkForOpenSpecPackageUpdate,
    printOpenSpecUpdateAvailableBanner,
    resolveGlobalInstallApproval,
    detectGlobalToolchainPackages,
    detectOptionalLocalCompanionTools,
    formatGlobalToolchainServiceName,
    askGlobalInstallForMissing,
  } = deps;

  function maybeSelfUpdateBeforeStatus() {
    const check = checkForGuardexUpdate();
    if (!check.checked || !check.updateAvailable) {
      return;
    }

    printUpdateAvailableBanner(check.current, check.latest);

    const autoApproval = parseAutoApproval('GUARDEX_AUTO_UPDATE_APPROVAL');
    const interactive = isInteractiveTerminal();

    if (!interactive && autoApproval == null) {
      console.log(`[${TOOL_NAME}] Non-interactive shell; skipping auto-update prompt.`);
      return;
    }

    const shouldUpdate = interactive
      ? promptYesNoStrict(
        `Update now? (${NPM_BIN} i -g ${packageJson.name}@latest)`,
      )
      : autoApproval;

    if (!shouldUpdate) {
      console.log(`[${TOOL_NAME}] Skipped update.`);
      return;
    }

    const installResult = run(NPM_BIN, ['i', '-g', `${packageJson.name}@latest`], { stdio: 'inherit' });
    if (installResult.status !== 0) {
      console.log(`[${TOOL_NAME}] ⚠️ Update failed. You can retry manually.`);
      return;
    }

    const postInstallVersion = readInstalledGuardexVersion();
    if (postInstallVersion != null && postInstallVersion !== check.latest) {
      console.log(
        `[${TOOL_NAME}] Installed version is still ${postInstallVersion} (expected ${check.latest}). ` +
          `Retrying with pinned version ${check.latest}…`,
      );
      const pinnedResult = run(
        NPM_BIN,
        ['i', '-g', `${packageJson.name}@${check.latest}`],
        { stdio: 'inherit' },
      );
      if (pinnedResult.status !== 0) {
        console.log(
          `[${TOOL_NAME}] ⚠️ Pinned retry failed. Run manually: ${NPM_BIN} i -g ${packageJson.name}@${check.latest}`,
        );
        return;
      }
      const pinnedVersion = readInstalledGuardexVersion();
      if (pinnedVersion != null && pinnedVersion !== check.latest) {
        console.log(
          `[${TOOL_NAME}] ⚠️ On-disk version still ${pinnedVersion} after pinned retry. ` +
            `Investigate: ${NPM_BIN} root -g && ${NPM_BIN} cache verify`,
        );
        return;
      }
    }

    console.log(`[${TOOL_NAME}] ✅ Updated to latest published version.`);
    restartIntoUpdatedGuardex(check.latest);
  }

  function maybeOpenSpecUpdateBeforeStatus() {
    const check = checkForOpenSpecPackageUpdate();
    if (!check.checked || !check.updateAvailable) {
      return;
    }

    printOpenSpecUpdateAvailableBanner(check.current, check.latest);

    const autoApproval = parseAutoApproval('GUARDEX_AUTO_OPENSPEC_UPDATE_APPROVAL');
    const interactive = isInteractiveTerminal();

    if (!interactive && autoApproval == null) {
      console.log(`[${TOOL_NAME}] Non-interactive shell; skipping OpenSpec update prompt.`);
      return;
    }

    const shouldUpdate = interactive
      ? promptYesNoStrict(
        `Update OpenSpec now? (${NPM_BIN} i -g ${OPENSPEC_PACKAGE}@latest && ${OPENSPEC_BIN} update)`,
      )
      : autoApproval;

    if (!shouldUpdate) {
      console.log(`[${TOOL_NAME}] Skipped OpenSpec update.`);
      return;
    }

    const installResult = run(NPM_BIN, ['i', '-g', `${OPENSPEC_PACKAGE}@latest`], { stdio: 'inherit' });
    if (installResult.status !== 0) {
      console.log(`[${TOOL_NAME}] ⚠️ OpenSpec npm install failed. You can retry manually.`);
      return;
    }

    const toolUpdateResult = run(OPENSPEC_BIN, ['update'], { stdio: 'inherit' });
    if (toolUpdateResult.status !== 0) {
      console.log(`[${TOOL_NAME}] ⚠️ OpenSpec tool update failed. Run '${OPENSPEC_BIN} update' manually.`);
      return;
    }

    console.log(`[${TOOL_NAME}] ✅ OpenSpec updated to latest package and tool plugins refreshed.`);
  }

  function installGlobalToolchain(options) {
    const approval = resolveGlobalInstallApproval(options);
    if (approval.source === 'flag' && !approval.approved) {
      return {
        status: 'skipped',
        reason: approval.source,
        missingPackages: [],
        missingLocalTools: [],
      };
    }

    if (options.dryRun) {
      return { status: 'dry-run-skip' };
    }

    const detection = detectGlobalToolchainPackages();
    const localCompanionTools = detectOptionalLocalCompanionTools();
    if (!detection.ok) {
      console.log(`[${TOOL_NAME}] ⚠️ Could not detect global packages: ${detection.error}`);
    } else {
      if (detection.installed.length > 0) {
        console.log(
          `[${TOOL_NAME}] Already installed globally: ` +
          `${detection.installed.map((pkg) => formatGlobalToolchainServiceName(pkg)).join(', ')}`,
        );
      }
      const installedLocalTools = localCompanionTools
        .filter((tool) => tool.status === 'active')
        .map((tool) => tool.name);
      if (installedLocalTools.length > 0) {
        console.log(`[${TOOL_NAME}] Already installed locally: ${installedLocalTools.join(', ')}`);
      }
      if (detection.missing.length === 0 && localCompanionTools.every((tool) => tool.status === 'active')) {
        return { status: 'already-installed' };
      }
    }

    const missingPackages = detection.ok ? detection.missing : [...GLOBAL_TOOLCHAIN_PACKAGES];
    const missingLocalTools = localCompanionTools.filter((tool) => tool.status !== 'active');
    const installApproval = askGlobalInstallForMissing(options, missingPackages, missingLocalTools);
    if (!installApproval.approved) {
      return {
        status: 'skipped',
        reason: installApproval.source,
        missingPackages,
        missingLocalTools,
      };
    }

    const installed = [];
    if (missingPackages.length > 0) {
      console.log(
        `[${TOOL_NAME}] Installing global toolchain: npm i -g ${missingPackages.join(' ')}`,
      );
      const result = run(NPM_BIN, ['i', '-g', ...missingPackages], { stdio: 'inherit' });
      if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        return {
          status: 'failed',
          reason: stderr || 'npm global install failed',
        };
      }
      installed.push(...missingPackages);
    }

    for (const tool of missingLocalTools) {
      console.log(`[${TOOL_NAME}] Installing local companion tool: ${tool.installCommand}`);
      const result = run(NPX_BIN, tool.installArgs, { stdio: 'inherit' });
      if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        return {
          status: 'failed',
          reason: stderr || `${tool.name} install failed`,
        };
      }
      installed.push(tool.name);
    }

    return { status: 'installed', packages: installed };
  }

  return {
    maybeSelfUpdateBeforeStatus,
    maybeOpenSpecUpdateBeforeStatus,
    installGlobalToolchain,
  };
}

module.exports = {
  createToolchainApi,
};
