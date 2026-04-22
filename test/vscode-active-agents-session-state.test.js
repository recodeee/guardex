const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const sessionScript = path.join(repoRoot, 'scripts', 'agent-session-state.js');
const installScript = path.join(repoRoot, 'scripts', 'install-vscode-active-agents-extension.js');
const sessionSchema = require(path.join(
  repoRoot,
  'templates',
  'vscode',
  'guardex-active-agents',
  'session-schema.js',
));
const extensionEntry = path.join(repoRoot, 'templates', 'vscode', 'guardex-active-agents', 'extension.js');

function runNode(scriptPath, args, options = {}) {
  return cp.spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function runGit(repoPath, args, options = {}) {
  const result = cp.spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function initGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  runGit(repoPath, ['init']);
  runGit(repoPath, ['config', 'user.email', 'guardex-tests@example.com']);
  runGit(repoPath, ['config', 'user.name', 'Guardex Tests']);
}

function loadExtensionWithMockVscode(mockVscode) {
  const Module = require('node:module');
  const originalLoad = Module._load;
  delete require.cache[require.resolve(extensionEntry)];

  Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return mockVscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(extensionEntry);
  } finally {
    Module._load = originalLoad;
  }
}

function createMockVscode(tempRoot) {
  const registrations = {
    providers: [],
    treeViews: [],
  };

  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(id) {
      this.id = id;
    }
  }

  class EventEmitter {
    constructor() {
      this.event = () => {};
    }

    fire() {}
  }

  const disposable = () => ({ dispose() {} });
  const fileWatcher = {
    onDidCreate() {},
    onDidChange() {},
    onDidDelete() {},
    dispose() {},
  };

  return {
    registrations,
    vscode: {
      TreeItem,
      ThemeIcon,
      EventEmitter,
      TreeItemCollapsibleState: {
        None: 0,
        Expanded: 1,
      },
      commands: {
        executeCommand: async () => {},
        registerCommand: () => disposable(),
      },
      Uri: {
        file: (fsPath) => ({ fsPath }),
      },
      window: {
        showInformationMessage: async () => {},
        createTreeView: (viewId, options) => {
          const treeView = {
            viewId,
            options,
            badge: undefined,
            message: undefined,
            dispose() {},
          };
          registrations.treeViews.push(treeView);
          registrations.providers.push({ viewId, provider: options.treeDataProvider });
          return treeView;
        },
        registerTreeDataProvider: (viewId, provider) => {
          registrations.providers.push({ viewId, provider });
          return disposable();
        },
      },
      workspace: {
        createFileSystemWatcher: () => fileWatcher,
        findFiles: async () => [],
        onDidChangeWorkspaceFolders: () => disposable(),
        workspaceFolders: [{ uri: { fsPath: tempRoot } }],
      },
    },
  };
}

test('agent-session-state writes and removes active session records', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-active-session-'));
  const branch = 'agent/codex/demo-task';
  const worktreePath = path.join(tempRoot, '.omx', 'agent-worktrees', 'agent__codex__demo-task');
  fs.mkdirSync(worktreePath, { recursive: true });

  const start = runNode(sessionScript, [
    'start',
    '--repo',
    tempRoot,
    '--branch',
    branch,
    '--task',
    'demo-task',
    '--agent',
    'codex',
    '--worktree',
    worktreePath,
    '--pid',
    String(process.pid),
    '--cli',
    'codex',
  ]);
  assert.equal(start.status, 0, start.stderr);

  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, branch);
  assert.equal(path.basename(sessionPath), 'agent__codex__demo-task.json');
  assert.equal(fs.existsSync(sessionPath), true);

  const parsed = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  assert.equal(parsed.branch, branch);
  assert.equal(parsed.taskName, 'demo-task');
  assert.equal(parsed.agentName, 'codex');
  assert.equal(parsed.worktreePath, worktreePath);

  const sessions = sessionSchema.readActiveSessions(tempRoot);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].label, 'agent__codex__demo-task');

  const stop = runNode(sessionScript, [
    'stop',
    '--repo',
    tempRoot,
    '--branch',
    branch,
  ]);
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(fs.existsSync(sessionPath), false);
});

test('session-schema ignores stale or invalid session records', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-active-session-stale-'));
  const activeSessionsDir = sessionSchema.activeSessionsDirForRepo(tempRoot);
  fs.mkdirSync(activeSessionsDir, { recursive: true });

  const liveRecord = sessionSchema.buildSessionRecord({
    repoRoot: tempRoot,
    branch: 'agent/codex/live-task',
    taskName: 'live-task',
    agentName: 'codex',
    worktreePath: path.join(tempRoot, '.omx', 'agent-worktrees', 'live-task'),
    pid: process.pid,
    cliName: 'codex',
  });
  fs.writeFileSync(
    sessionSchema.sessionFilePathForBranch(tempRoot, liveRecord.branch),
    `${JSON.stringify(liveRecord, null, 2)}\n`,
    'utf8',
  );

  const staleRecord = sessionSchema.buildSessionRecord({
    repoRoot: tempRoot,
    branch: 'agent/codex/stale-task',
    taskName: 'stale-task',
    agentName: 'codex',
    worktreePath: path.join(tempRoot, '.omx', 'agent-worktrees', 'stale-task'),
    pid: 999999,
    cliName: 'codex',
  });
  fs.writeFileSync(
    sessionSchema.sessionFilePathForBranch(tempRoot, staleRecord.branch),
    `${JSON.stringify(staleRecord, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(activeSessionsDir, 'broken.json'), '{broken json', 'utf8');

  const sessions = sessionSchema.readActiveSessions(tempRoot);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].branch, liveRecord.branch);
});

test('session-schema derives working activity from dirty sandbox worktrees', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-active-session-working-'));
  const worktreePath = path.join(tempRoot, 'sandbox');
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);

  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\nchanged\n', 'utf8');
  fs.writeFileSync(path.join(worktreePath, 'new-file.txt'), 'new\n', 'utf8');

  const record = sessionSchema.buildSessionRecord({
    repoRoot: tempRoot,
    branch: 'agent/codex/working-task',
    taskName: 'working-task',
    agentName: 'codex',
    worktreePath,
    pid: process.pid,
    cliName: 'codex',
  });
  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, record.branch);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  const [session] = sessionSchema.readActiveSessions(tempRoot);
  assert.equal(session.activityKind, 'working');
  assert.equal(session.changeCount, 2);
  assert.equal(session.activityCountLabel, '2 files');
  assert.deepEqual(session.changedPaths, ['new-file.txt', 'tracked.txt']);
  assert.equal(session.activitySummary, 'new-file.txt, tracked.txt');
});

test('session-schema derives repo change rows from root git status', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-active-session-root-status-'));
  initGitRepo(tempRoot);
  fs.writeFileSync(path.join(tempRoot, 'tracked.txt'), 'base\n', 'utf8');
  runGit(tempRoot, ['add', 'tracked.txt']);
  runGit(tempRoot, ['commit', '-m', 'baseline']);

  fs.writeFileSync(path.join(tempRoot, 'tracked.txt'), 'base\nchanged\n', 'utf8');
  fs.writeFileSync(path.join(tempRoot, 'new-file.txt'), 'new\n', 'utf8');

  const changes = sessionSchema.readRepoChanges(tempRoot);
  assert.deepEqual(
    changes.map((change) => [change.relativePath, change.statusLabel]),
    [
      ['new-file.txt', 'U'],
      ['tracked.txt', 'M'],
    ],
  );
});

test('install-vscode-active-agents-extension installs the current extension version and prunes older copies', () => {
  const tempExtensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-ext-'));
  const staleDir = path.join(tempExtensionsDir, 'recodeee.gitguardex-active-agents-0.0.0');
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'stale.txt'), 'old', 'utf8');

  const result = runNode(installScript, ['--extensions-dir', tempExtensionsDir], {
    cwd: repoRoot,
  });
  assert.equal(result.status, 0, result.stderr);

  const installedDir = path.join(tempExtensionsDir, 'recodeee.gitguardex-active-agents-0.0.1');
  assert.equal(fs.existsSync(installedDir), true);
  assert.equal(fs.existsSync(path.join(installedDir, 'extension.js')), true);
  assert.equal(fs.existsSync(path.join(installedDir, 'session-schema.js')), true);
  assert.equal(fs.existsSync(staleDir), false);
  assert.match(result.stdout, /Reload the VS Code window/);
});

test('active-agents extension registers a provider with getTreeItem', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-view-'));
  const { registrations, vscode } = createMockVscode(tempRoot);
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  assert.equal(registrations.treeViews.length, 1);
  assert.equal(registrations.treeViews[0].viewId, 'gitguardex.activeAgents');
  assert.equal(registrations.providers.length, 1);
  assert.equal(registrations.providers[0].viewId, 'gitguardex.activeAgents');

  const provider = registrations.providers[0].provider;
  assert.equal(typeof provider.getTreeItem, 'function');

  const [rootItem] = await provider.getChildren();
  assert.equal(rootItem.label, 'No active Guardex agents');
  assert.equal(provider.getTreeItem(rootItem), rootItem);
  assert.equal(registrations.treeViews[0].badge, undefined);
  assert.equal(registrations.treeViews[0].message, 'Start a sandbox session to populate this view.');

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension groups live sessions under a repo node', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-live-view-'));
  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, 'agent/codex/live-task');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch: 'agent/codex/live-task',
      taskName: 'live-task',
      agentName: 'codex',
      worktreePath: path.join(tempRoot, '.omx', 'agent-worktrees', 'live-task'),
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [{ fsPath: sessionPath }];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  const [repoItem] = await provider.getChildren();
  assert.equal(repoItem.label, path.basename(tempRoot));
  assert.equal(repoItem.description, '1 active');

  const [agentsSection] = await provider.getChildren(repoItem);
  assert.equal(agentsSection.label, 'ACTIVE AGENTS');
  assert.equal(agentsSection.description, '1');

  const [thinkingSection] = await provider.getChildren(agentsSection);
  assert.equal(thinkingSection.label, 'THINKING');

  const [sessionItem] = await provider.getChildren(thinkingSection);
  assert.equal(sessionItem.label, 'live-task');
  assert.match(sessionItem.description, /^thinking · \d+[smhd]/);
  assert.equal(sessionItem.iconPath.id, 'loading~spin');
  assert.deepEqual(registrations.treeViews[0].badge, {
    value: 1,
    tooltip: '1 active agent',
  });
  assert.equal(registrations.treeViews[0].message, undefined);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension shows grouped repo changes beside active agents', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-working-view-'));
  initGitRepo(tempRoot);
  fs.writeFileSync(path.join(tempRoot, 'root-file.txt'), 'base\n', 'utf8');
  runGit(tempRoot, ['add', 'root-file.txt']);
  runGit(tempRoot, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(tempRoot, 'root-file.txt'), 'base\nchanged\n', 'utf8');

  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-working-session-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\nchanged\n', 'utf8');
  fs.writeFileSync(path.join(worktreePath, 'new-file.txt'), 'new\n', 'utf8');

  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, 'agent/codex/live-task');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch: 'agent/codex/live-task',
      taskName: 'live-task',
      agentName: 'codex',
      worktreePath,
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [{ fsPath: sessionPath }];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  const [repoItem] = await provider.getChildren();
  assert.equal(repoItem.description, '1 active · 1 working · 1 changed');
  const [agentsSection, changesSection] = await provider.getChildren(repoItem);
  assert.equal(agentsSection.label, 'ACTIVE AGENTS');
  assert.equal(changesSection.label, 'CHANGES');

  const [workingSection] = await provider.getChildren(agentsSection);
  assert.equal(workingSection.label, 'WORKING NOW');

  const [sessionItem] = await provider.getChildren(workingSection);
  assert.equal(sessionItem.label, path.basename(worktreePath));
  assert.match(sessionItem.description, /^working · 2 files · /);
  assert.match(sessionItem.tooltip, /Changed 2 files: new-file\.txt, tracked\.txt/);
  assert.equal(sessionItem.iconPath.id, 'edit');
  assert.deepEqual(registrations.treeViews[0].badge, {
    value: 1,
    tooltip: '1 active agent · 1 working now',
  });

  const [changeItem] = await provider.getChildren(changesSection);
  assert.equal(changeItem.label, 'root-file.txt');
  assert.equal(changeItem.description, 'M');
  assert.match(changeItem.tooltip, /Status Modified/);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension splits working and thinking sessions into separate groups', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-mixed-view-'));

  const workingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-mixed-working-'));
  initGitRepo(workingPath);
  fs.writeFileSync(path.join(workingPath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(workingPath, ['add', 'tracked.txt']);
  runGit(workingPath, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(workingPath, 'tracked.txt'), 'base\nchanged\n', 'utf8');

  const thinkingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-mixed-thinking-'));
  initGitRepo(thinkingPath);
  fs.writeFileSync(path.join(thinkingPath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(thinkingPath, ['add', 'tracked.txt']);
  runGit(thinkingPath, ['commit', '-m', 'baseline']);

  const workingSessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, 'agent/codex/working-task');
  fs.mkdirSync(path.dirname(workingSessionPath), { recursive: true });
  fs.writeFileSync(
    workingSessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch: 'agent/codex/working-task',
      taskName: 'working-task',
      agentName: 'codex',
      worktreePath: workingPath,
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const thinkingSessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, 'agent/codex/thinking-task');
  fs.writeFileSync(
    thinkingSessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch: 'agent/codex/thinking-task',
      taskName: 'thinking-task',
      agentName: 'codex',
      worktreePath: thinkingPath,
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [
    { fsPath: workingSessionPath },
    { fsPath: thinkingSessionPath },
  ];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  const [repoItem] = await provider.getChildren();
  assert.equal(repoItem.description, '2 active · 1 working');

  const [agentsSection] = await provider.getChildren(repoItem);
  const [workingSection, thinkingSection] = await provider.getChildren(agentsSection);
  assert.equal(workingSection.label, 'WORKING NOW');
  assert.equal(thinkingSection.label, 'THINKING');

  const [workingItem] = await provider.getChildren(workingSection);
  const [thinkingItem] = await provider.getChildren(thinkingSection);
  assert.match(workingItem.description, /^working · 1 file · /);
  assert.match(thinkingItem.description, /^thinking · \d+[smhd]/);
  assert.deepEqual(registrations.treeViews[0].badge, {
    value: 2,
    tooltip: '2 active agents · 1 working now',
  });

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});
