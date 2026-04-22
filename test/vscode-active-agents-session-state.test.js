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
    decorationProviders: [],
    treeViews: [],
    commands: new Map(),
    executedCommands: [],
    terminals: [],
    openedDocuments: [],
    shownDocuments: [],
    infoMessages: [],
    inputResponses: [],
    quickPickCalls: [],
    quickPickResponse: undefined,
    warningMessages: [],
    watchers: [],
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

  class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  }

  class EventEmitter {
    constructor() {
      this.listeners = [];
      this.event = (listener, thisArg, disposables) => {
        const boundListener = thisArg ? listener.bind(thisArg) : listener;
        this.listeners.push(boundListener);
        const registration = {
          dispose: () => {
            this.listeners = this.listeners.filter((entry) => entry !== boundListener);
          },
        };
        if (Array.isArray(disposables)) {
          disposables.push(registration);
        }
        return registration;
      };
    }

    fire(event) {
      for (const listener of [...this.listeners]) {
        listener(event);
      }
    }
  }

  const disposable = () => ({ dispose() {} });

  function createFileWatcher(pattern) {
    const listeners = {
      create: [],
      change: [],
      delete: [],
    };

    return {
      pattern,
      onDidCreate(callback, thisArg) {
        listeners.create.push({ callback, thisArg });
      },
      onDidChange(callback, thisArg) {
        listeners.change.push({ callback, thisArg });
      },
      onDidDelete(callback, thisArg) {
        listeners.delete.push({ callback, thisArg });
      },
      fireCreate(uri) {
        for (const listener of listeners.create) {
          listener.callback.call(listener.thisArg, uri);
        }
      },
      fireChange(uri) {
        for (const listener of listeners.change) {
          listener.callback.call(listener.thisArg, uri);
        }
      },
      fireDelete(uri) {
        for (const listener of listeners.delete) {
          listener.callback.call(listener.thisArg, uri);
        }
      },
      dispose() {},
    };
  }

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
        executeCommand: async (...args) => {
          registrations.executedCommands.push(args);
        },
        registerCommand: (command, handler) => {
          registrations.commands.set(command, handler);
          return disposable();
        },
      },
      Uri: {
        file: (fsPath) => ({
          scheme: 'file',
          fsPath,
          path: fsPath,
          toString() {
            return `file://${fsPath}`;
          },
        }),
        parse: (value) => {
          const parsed = new URL(value);
          return {
            scheme: parsed.protocol.replace(/:$/, ''),
            authority: parsed.host,
            path: parsed.pathname,
            toString() {
              return value;
            },
          };
        },
      },
      window: {
        showInformationMessage: async (...args) => {
          registrations.infoMessages.push(args);
          return undefined;
        },
        showWarningMessage: async (...args) => {
          registrations.warningMessages.push(args);
          return undefined;
        },
        showInputBox: async () => registrations.inputResponses.shift(),
        showQuickPick: async (items, options) => {
          registrations.quickPickCalls.push({ items, options });
          return registrations.quickPickResponse;
        },
        createTerminal: (options) => {
          const terminal = {
            options,
            shown: false,
            sentTexts: [],
            show() {
              this.shown = true;
            },
            sendText(text, addNewLine) {
              this.sentTexts.push({ text, addNewLine });
            },
            dispose() {},
          };
          registrations.terminals.push(terminal);
          return terminal;
        },
        showTextDocument: async (document, options) => {
          registrations.shownDocuments.push({ document, options });
          return { document };
        },
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
        registerFileDecorationProvider: (provider) => {
          registrations.decorationProviders.push(provider);
          return disposable();
        },
        registerTreeDataProvider: (viewId, provider) => {
          registrations.providers.push({ viewId, provider });
          return disposable();
        },
      },
      workspace: {
        openTextDocument: async (options) => {
          const document = {
            ...options,
            uri: { scheme: 'untitled' },
          };
          registrations.openedDocuments.push(document);
          return document;
        },
        createFileSystemWatcher: (pattern) => {
          const watcher = createFileWatcher(pattern);
          registrations.watchers.push(watcher);
          return watcher;
        },
        findFiles: async () => [],
        onDidChangeWorkspaceFolders: () => disposable(),
        workspaceFolders: [{ uri: { fsPath: tempRoot } }],
      },
      ThemeColor,
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

test('active-agents extension registers tree and decoration providers', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-view-'));
  const { registrations, vscode } = createMockVscode(tempRoot);
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  assert.equal(registrations.treeViews.length, 1);
  assert.equal(registrations.treeViews[0].viewId, 'gitguardex.activeAgents');
  assert.equal(registrations.providers.length, 1);
  assert.equal(registrations.providers[0].viewId, 'gitguardex.activeAgents');
  assert.equal(registrations.decorationProviders.length, 1);

  const provider = registrations.providers[0].provider;
  assert.equal(typeof provider.getTreeItem, 'function');
  assert.equal(typeof registrations.commands.get('gitguardex.activeAgents.startAgent'), 'function');

  const rootItems = await provider.getChildren();
  assert.deepEqual(rootItems, []);
  assert.equal(registrations.treeViews[0].badge, undefined);
  assert.equal(registrations.treeViews[0].message, undefined);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension startAgent command prompts and runs gx branch start in a terminal', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-start-agent-'));
  const { registrations, vscode } = createMockVscode(tempRoot);
  registrations.inputResponses.push('demo task', 'codex');
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  await registrations.commands.get('gitguardex.activeAgents.startAgent')();

  assert.equal(registrations.terminals.length, 1);
  assert.deepEqual(registrations.terminals[0].options, {
    name: `GitGuardex: ${path.basename(tempRoot)}`,
    cwd: tempRoot,
  });
  assert.equal(registrations.terminals[0].shown, true);
  assert.deepEqual(registrations.terminals[0].sentTexts, [
    {
      text: "gx branch start 'demo task' 'codex'",
      addNewLine: true,
    },
  ]);
  assert.deepEqual(registrations.quickPickCalls, []);

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
  assert.equal(sessionItem.label, 'live-task 🔒 0');
  assert.match(sessionItem.description, /^thinking · \d+[smhd]/);
  assert.equal(sessionItem.iconPath.id, 'loading~spin');
  assert.equal(sessionItem.resourceUri.scheme, 'gitguardex-agent');
  assert.equal(
    sessionItem.resourceUri.toString(),
    `gitguardex-agent://${sessionSchema.sanitizeBranchForFile('agent/codex/live-task')}`,
  );
  assert.deepEqual(registrations.treeViews[0].badge, {
    value: 1,
    tooltip: '1 active agent',
  });
  assert.equal(registrations.treeViews[0].message, undefined);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension decorates idle clean sessions without overriding working rows', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-idle-decorations-'));

  const idleWarningPath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-idle-warning-'));
  initGitRepo(idleWarningPath);
  fs.writeFileSync(path.join(idleWarningPath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(idleWarningPath, ['add', 'tracked.txt']);
  runGit(idleWarningPath, ['commit', '-m', 'baseline']);

  const idleErrorPath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-idle-error-'));
  initGitRepo(idleErrorPath);
  fs.writeFileSync(path.join(idleErrorPath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(idleErrorPath, ['add', 'tracked.txt']);
  runGit(idleErrorPath, ['commit', '-m', 'baseline']);

  const workingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-idle-working-'));
  initGitRepo(workingPath);
  fs.writeFileSync(path.join(workingPath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(workingPath, ['add', 'tracked.txt']);
  runGit(workingPath, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(workingPath, 'tracked.txt'), 'base\nchanged\n', 'utf8');

  const sessionRecords = [
    {
      branch: 'agent/codex/idle-warning',
      worktreePath: idleWarningPath,
      startedAt: new Date(Date.now() - (11 * 60 * 1000)).toISOString(),
    },
    {
      branch: 'agent/codex/idle-error',
      worktreePath: idleErrorPath,
      startedAt: new Date(Date.now() - (31 * 60 * 1000)).toISOString(),
    },
    {
      branch: 'agent/codex/working-now',
      worktreePath: workingPath,
      startedAt: new Date(Date.now() - (31 * 60 * 1000)).toISOString(),
    },
  ];

  for (const record of sessionRecords) {
    const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, record.branch);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify(sessionSchema.buildSessionRecord({
        repoRoot: tempRoot,
        branch: record.branch,
        taskName: path.basename(record.worktreePath),
        agentName: 'codex',
        worktreePath: record.worktreePath,
        pid: process.pid,
        cliName: 'codex',
        startedAt: record.startedAt,
      }), null, 2)}\n`,
      'utf8',
    );
  }

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => sessionRecords.map((record) => ({
    fsPath: sessionSchema.sessionFilePathForBranch(tempRoot, record.branch),
  }));
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  await provider.getChildren();
  const decorationProvider = registrations.decorationProviders[0];

  const warningDecoration = decorationProvider.provideFileDecoration(vscode.Uri.parse(
    `gitguardex-agent://${sessionSchema.sanitizeBranchForFile('agent/codex/idle-warning')}`,
  ));
  assert.equal(warningDecoration.badge, '10m+');
  assert.equal(warningDecoration.tooltip, 'idle 10m+');
  assert.equal(warningDecoration.color.id, 'list.warningForeground');

  const errorDecoration = decorationProvider.provideFileDecoration(vscode.Uri.parse(
    `gitguardex-agent://${sessionSchema.sanitizeBranchForFile('agent/codex/idle-error')}`,
  ));
  assert.equal(errorDecoration.badge, '30m+');
  assert.equal(errorDecoration.tooltip, 'idle 30m+');
  assert.equal(errorDecoration.color.id, 'list.errorForeground');

  const workingDecoration = decorationProvider.provideFileDecoration(vscode.Uri.parse(
    `gitguardex-agent://${sessionSchema.sanitizeBranchForFile('agent/codex/working-now')}`,
  ));
  assert.equal(workingDecoration, undefined);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents refresh also invalidates session decorations', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-decoration-refresh-'));
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-decoration-refresh-session-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);

  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, 'agent/codex/idle-refresh');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch: 'agent/codex/idle-refresh',
      taskName: 'idle-refresh',
      agentName: 'codex',
      worktreePath,
      pid: process.pid,
      cliName: 'codex',
      startedAt: new Date(Date.now() - (11 * 60 * 1000)).toISOString(),
    }), null, 2)}\n`,
    'utf8',
  );

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [{ fsPath: sessionPath }];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  await provider.getChildren();

  let decorationRefreshCount = 0;
  registrations.decorationProviders[0].onDidChangeFileDecorations(() => {
    decorationRefreshCount += 1;
  });

  await provider.refresh();
  assert.equal(decorationRefreshCount, 1);

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
  assert.equal(sessionItem.label, `${path.basename(worktreePath)} 🔒 0`);
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

test('active-agents extension decorates sessions and repo changes from the lock registry', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-lock-decorations-'));
  initGitRepo(tempRoot);
  fs.writeFileSync(path.join(tempRoot, 'root-file.txt'), 'base\n', 'utf8');
  runGit(tempRoot, ['add', 'root-file.txt']);
  runGit(tempRoot, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(tempRoot, 'root-file.txt'), 'base\nchanged\n', 'utf8');

  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-lock-worktree-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);

  const branch = 'agent/codex/live-task';
  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, branch);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch,
      taskName: 'live-task',
      agentName: 'codex',
      worktreePath,
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const lockPath = path.join(tempRoot, '.omx', 'state', 'agent-file-locks.json');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify({
    locks: {
      'owned-file.txt': {
        branch,
        claimed_at: '2026-04-22T08:55:00.000Z',
        allow_delete: false,
      },
      'root-file.txt': {
        branch: 'agent/codex/other-task',
        claimed_at: '2026-04-22T08:56:00.000Z',
        allow_delete: false,
      },
    },
  }, null, 2)}\n`, 'utf8');

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [{ fsPath: sessionPath }];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  const provider = registrations.providers[0].provider;
  const [repoItem] = await provider.getChildren();
  const [agentsSection, changesSection] = await provider.getChildren(repoItem);
  const [thinkingSection] = await provider.getChildren(agentsSection);
  const [sessionItem] = await provider.getChildren(thinkingSection);
  assert.equal(sessionItem.label, `${path.basename(worktreePath)} 🔒 1`);
  assert.match(sessionItem.tooltip, /Locks 1/);

  const [changeItem] = await provider.getChildren(changesSection);
  assert.equal(changeItem.label, 'root-file.txt');
  assert.equal(changeItem.iconPath.id, 'warning');
  assert.match(changeItem.tooltip, /Locked by agent\/codex\/other-task/);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension re-reads lock state on watcher events instead of every tree load', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-lock-watch-'));
  const branch = 'agent/codex/live-task';
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-lock-watch-worktree-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);

  const sessionPath = sessionSchema.sessionFilePathForBranch(tempRoot, branch);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify(sessionSchema.buildSessionRecord({
      repoRoot: tempRoot,
      branch,
      taskName: 'live-task',
      agentName: 'codex',
      worktreePath,
      pid: process.pid,
      cliName: 'codex',
    }), null, 2)}\n`,
    'utf8',
  );

  const lockPath = path.join(tempRoot, '.omx', 'state', 'agent-file-locks.json');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify({
    locks: {
      'owned-file.txt': {
        branch,
        claimed_at: '2026-04-22T08:57:00.000Z',
        allow_delete: false,
      },
    },
  }, null, 2)}\n`, 'utf8');

  const { registrations, vscode } = createMockVscode(tempRoot);
  vscode.workspace.findFiles = async () => [{ fsPath: sessionPath }];
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  const originalReadFileSync = fs.readFileSync;
  let lockReadCount = 0;
  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    if (path.resolve(String(filePath)) === lockPath) {
      lockReadCount += 1;
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };

  try {
    extension.activate(context);

    const provider = registrations.providers[0].provider;
    const lockWatcher = registrations.watchers.find((watcher) => watcher.pattern === '**/.omx/state/agent-file-locks.json');
    assert.ok(lockWatcher, 'expected lock watcher registration');

    const [repoItem] = await provider.getChildren();
    const [agentsSection] = await provider.getChildren(repoItem);
    const [thinkingSection] = await provider.getChildren(agentsSection);
    const [sessionItem] = await provider.getChildren(thinkingSection);
    assert.equal(sessionItem.label, `${path.basename(worktreePath)} 🔒 1`);
    assert.equal(lockReadCount, 1);

    await provider.getChildren();
    assert.equal(lockReadCount, 1);

    fs.writeFileSync(lockPath, `${JSON.stringify({
      locks: {
        'owned-file.txt': {
          branch,
          claimed_at: '2026-04-22T08:57:00.000Z',
          allow_delete: false,
        },
        'second-owned-file.txt': {
          branch,
          claimed_at: '2026-04-22T08:58:00.000Z',
          allow_delete: false,
        },
      },
    }, null, 2)}\n`, 'utf8');
    lockWatcher.fireChange({ fsPath: lockPath });
    assert.equal(lockReadCount, 2);

    const [updatedRepoItem] = await provider.getChildren();
    const [updatedAgentsSection] = await provider.getChildren(updatedRepoItem);
    const [updatedThinkingSection] = await provider.getChildren(updatedAgentsSection);
    const [updatedSessionItem] = await provider.getChildren(updatedThinkingSection);
    assert.equal(updatedSessionItem.label, `${path.basename(worktreePath)} 🔒 2`);

    await provider.getChildren();
    assert.equal(lockReadCount, 2);
  } finally {
    fs.readFileSync = originalReadFileSync;
    for (const subscription of context.subscriptions) {
      subscription.dispose?.();
    }
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

test('active-agents extension launches finish and sync commands in session terminals', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-inline-actions-'));
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-inline-worktree-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);

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
  const [agentsSection] = await provider.getChildren(repoItem);
  const [thinkingSection] = await provider.getChildren(agentsSection);
  const [sessionItem] = await provider.getChildren(thinkingSection);

  await registrations.commands.get('gitguardex.activeAgents.finishSession')(sessionItem.session);
  await registrations.commands.get('gitguardex.activeAgents.syncSession')(sessionItem.session);

  assert.equal(registrations.terminals.length, 2);
  assert.equal(registrations.terminals[0].options.cwd, worktreePath);
  assert.equal(registrations.terminals[0].options.iconPath.id, 'check');
  assert.match(registrations.terminals[0].options.name, /GitGuardex Finish: live-task/);
  assert.deepEqual(registrations.terminals[0].sentTexts, [
    { text: "gx branch finish --branch 'agent/codex/live-task'", addNewLine: true },
  ]);
  assert.equal(registrations.terminals[0].shown, true);

  assert.equal(registrations.terminals[1].options.cwd, worktreePath);
  assert.equal(registrations.terminals[1].options.iconPath.id, 'sync');
  assert.match(registrations.terminals[1].options.name, /GitGuardex Sync: live-task/);
  assert.deepEqual(registrations.terminals[1].sentTexts, [
    { text: 'gx sync', addNewLine: true },
  ]);
  assert.equal(registrations.terminals[1].shown, true);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension confirms stop and sends SIGTERM to the session pid', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-stop-session-'));
  const { registrations, vscode } = createMockVscode(tempRoot);
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };
  let refreshCount = 0;
  let killed = null;
  const originalKill = process.kill;

  vscode.window.showWarningMessage = async (...args) => {
    registrations.warningMessages.push(args);
    return 'Stop';
  };
  process.kill = (pid, signal) => {
    killed = { pid, signal };
  };

  try {
    extension.activate(context);
    const provider = registrations.providers[0].provider;
    const originalRefresh = provider.refresh.bind(provider);
    provider.refresh = () => {
      refreshCount += 1;
      return originalRefresh();
    };

    await registrations.commands.get('gitguardex.activeAgents.stopSession')({
      label: 'live-task',
      pid: 4242,
    });
  } finally {
    process.kill = originalKill;
  }

  assert.deepEqual(killed, { pid: 4242, signal: 'SIGTERM' });
  assert.equal(refreshCount, 1);
  assert.equal(registrations.warningMessages.length, 1);
  assert.match(registrations.warningMessages[0][0], /Stop live-task\?/);

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});

test('active-agents extension opens git diff output in an untitled editor', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-open-diff-'));
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'guardex-vscode-open-diff-worktree-'));
  initGitRepo(worktreePath);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\n', 'utf8');
  runGit(worktreePath, ['add', 'tracked.txt']);
  runGit(worktreePath, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(worktreePath, 'tracked.txt'), 'base\nchanged\n', 'utf8');

  const { registrations, vscode } = createMockVscode(tempRoot);
  const extension = loadExtensionWithMockVscode(vscode);
  const context = { subscriptions: [] };

  extension.activate(context);

  await registrations.commands.get('gitguardex.activeAgents.openSessionDiff')({
    label: 'live-task',
    worktreePath,
  });

  assert.equal(registrations.openedDocuments.length, 1);
  assert.equal(registrations.openedDocuments[0].language, 'diff');
  assert.match(registrations.openedDocuments[0].content, /^diff --git /);
  assert.equal(registrations.shownDocuments.length, 1);
  assert.equal(registrations.shownDocuments[0].document.uri.scheme, 'untitled');

  for (const subscription of context.subscriptions) {
    subscription.dispose?.();
  }
});
