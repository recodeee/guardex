const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vscode = require('vscode');
const {
  formatElapsedFrom,
  readActiveSessions,
  readRepoChanges,
  sanitizeBranchForFile,
} = require('./session-schema.js');

const SESSION_DECORATION_SCHEME = 'gitguardex-agent';
const IDLE_WARNING_MS = 10 * 60 * 1000;
const IDLE_ERROR_MS = 30 * 60 * 1000;
const LOCK_FILE_RELATIVE = path.join('.omx', 'state', 'agent-file-locks.json');

function sessionDecorationUri(branch) {
  return vscode.Uri.parse(`${SESSION_DECORATION_SCHEME}://${sanitizeBranchForFile(branch)}`);
}

function sessionIdleDecoration(session, now = Date.now()) {
  if (!session || session.activityKind === 'working') {
    return undefined;
  }

  const startedAtMs = Date.parse(session.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return undefined;
  }

  const elapsedMs = now - startedAtMs;
  if (elapsedMs > IDLE_ERROR_MS) {
    return {
      badge: '30m+',
      tooltip: 'idle 30m+',
      color: new vscode.ThemeColor('list.errorForeground'),
    };
  }
  if (elapsedMs > IDLE_WARNING_MS) {
    return {
      badge: '10m+',
      tooltip: 'idle 10m+',
      color: new vscode.ThemeColor('list.warningForeground'),
    };
  }

  return undefined;
}

class SessionDecorationProvider {
  constructor(nowProvider = () => Date.now()) {
    this.nowProvider = nowProvider;
    this.sessionsByUri = new Map();
    this.onDidChangeFileDecorationsEmitter = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this.onDidChangeFileDecorationsEmitter.event;
  }

  updateSessions(sessions) {
    this.sessionsByUri = new Map(
      sessions.map((session) => [sessionDecorationUri(session.branch).toString(), session]),
    );
  }

  refresh() {
    this.onDidChangeFileDecorationsEmitter.fire();
  }

  provideFileDecoration(uri) {
    if (!uri || uri.scheme !== SESSION_DECORATION_SCHEME) {
      return undefined;
    }

    return sessionIdleDecoration(this.sessionsByUri.get(uri.toString()), this.nowProvider());
  }
}

class RepoItem extends vscode.TreeItem {
  constructor(repoRoot, sessions, changes) {
    super(path.basename(repoRoot), vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repoRoot;
    this.sessions = sessions;
    this.changes = changes;
    const descriptionParts = [`${sessions.length} active`];
    const workingCount = countWorkingSessions(sessions);
    if (workingCount > 0) {
      descriptionParts.push(`${workingCount} working`);
    }
    if (changes.length > 0) {
      descriptionParts.push(`${changes.length} changed`);
    }
    this.description = descriptionParts.join(' · ');
    this.tooltip = [
      repoRoot,
      this.description,
    ].join('\n');
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'gitguardex.repo';
  }
}

class SectionItem extends vscode.TreeItem {
  constructor(label, items, options = {}) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.items = items;
    this.description = options.description
      || (items.length > 0 ? String(items.length) : '');
    this.contextValue = 'gitguardex.section';
  }
}

class SessionItem extends vscode.TreeItem {
  constructor(session) {
    const lockCount = Number.isFinite(session.lockCount) ? session.lockCount : 0;
    super(`${session.label} 🔒 ${lockCount}`, vscode.TreeItemCollapsibleState.None);
    this.session = session;
    this.resourceUri = sessionDecorationUri(session.branch);
    const descriptionParts = [session.activityLabel || 'thinking'];
    if (session.activityCountLabel) {
      descriptionParts.push(session.activityCountLabel);
    }
    descriptionParts.push(session.elapsedLabel || formatElapsedFrom(session.startedAt));
    this.description = descriptionParts.join(' · ');
    const tooltipLines = [
      session.branch,
      `${session.agentName} · ${session.taskName}`,
      `Status ${this.description}`,
      session.changeCount > 0
        ? `Changed ${session.activityCountLabel}: ${session.activitySummary}`
        : session.activitySummary,
      `Locks ${lockCount}`,
      `Started ${session.startedAt}`,
      session.worktreePath,
    ];
    this.tooltip = tooltipLines.filter(Boolean).join('\n');
    this.iconPath = session.activityKind === 'working'
      ? new vscode.ThemeIcon('edit')
      : new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'gitguardex.session';
    this.command = {
      command: 'gitguardex.activeAgents.openWorktree',
      title: 'Open Agent Worktree',
      arguments: [session],
    };
  }
}

class FolderItem extends vscode.TreeItem {
  constructor(label, relativePath, items) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.relativePath = relativePath;
    this.items = items;
    this.tooltip = relativePath;
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'gitguardex.folder';
  }
}

class ChangeItem extends vscode.TreeItem {
  constructor(change) {
    super(path.basename(change.relativePath), vscode.TreeItemCollapsibleState.None);
    this.change = change;
    this.description = change.statusLabel;
    this.tooltip = [
      change.relativePath,
      `Status ${change.statusText}`,
      change.originalPath ? `Renamed from ${change.originalPath}` : '',
      change.hasForeignLock ? `Locked by ${change.lockOwnerBranch}` : '',
      change.absolutePath,
    ].filter(Boolean).join('\n');
    this.resourceUri = vscode.Uri.file(change.absolutePath);
    if (change.hasForeignLock) {
      this.iconPath = new vscode.ThemeIcon('warning');
    }
    this.contextValue = 'gitguardex.change';
    this.command = {
      command: 'gitguardex.activeAgents.openChange',
      title: 'Open Changed File',
      arguments: [change],
    };
  }
}

function shellQuote(value) {
  const normalized = String(value || '');
  return `'${normalized.replace(/'/g, "'\"'\"'")}'`;
}

function sessionDisplayLabel(session) {
  return session?.taskName || session?.label || session?.branch || path.basename(session?.worktreePath || '') || 'session';
}

function sessionWorktreePath(session) {
  return typeof session?.worktreePath === 'string' ? session.worktreePath.trim() : '';
}

function showSessionMessage(message) {
  vscode.window.showInformationMessage?.(message);
}

function ensureSessionWorktree(session, actionLabel) {
  const worktreePath = sessionWorktreePath(session);
  if (!worktreePath) {
    showSessionMessage(`Cannot ${actionLabel}: missing worktree path.`);
    return '';
  }
  if (!fs.existsSync(worktreePath)) {
    showSessionMessage(`Cannot ${actionLabel}: worktree is no longer on disk: ${worktreePath}`);
    return '';
  }
  return worktreePath;
}

function runSessionTerminalCommand(session, actionLabel, iconId, commandText) {
  const worktreePath = ensureSessionWorktree(session, actionLabel.toLowerCase());
  if (!worktreePath) {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `GitGuardex ${actionLabel}: ${sessionDisplayLabel(session)}`,
    cwd: worktreePath,
    iconPath: new vscode.ThemeIcon(iconId),
  });
  terminal.show();
  terminal.sendText(commandText, true);
}

function finishSession(session) {
  if (!session?.branch) {
    showSessionMessage('Cannot finish session: missing branch name.');
    return;
  }
  runSessionTerminalCommand(
    session,
    'Finish',
    'check',
    `gx branch finish --branch ${shellQuote(session.branch)}`,
  );
}

function syncSession(session) {
  runSessionTerminalCommand(session, 'Sync', 'sync', 'gx sync');
}

async function stopSession(session, refresh) {
  const pid = Number(session?.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    showSessionMessage('Cannot stop session: missing pid.');
    return;
  }

  const confirmed = await vscode.window.showWarningMessage(
    `Stop ${sessionDisplayLabel(session)}?`,
    { modal: true, detail: `Send SIGTERM to pid ${pid}.` },
    'Stop',
  );
  if (confirmed !== 'Stop') {
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    refresh();
  } catch (error) {
    showSessionMessage(
      `Failed to stop session ${sessionDisplayLabel(session)}: ${error?.message || String(error)}`,
    );
  }
}

async function openSessionDiff(session) {
  const worktreePath = ensureSessionWorktree(session, 'open diff');
  if (!worktreePath) {
    return;
  }

  let diffOutput = '';
  try {
    diffOutput = cp.execFileSync('git', ['-C', worktreePath, 'diff'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = [
      error?.stdout,
      error?.stderr,
      error?.message,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) || 'git diff failed.';
    showSessionMessage(`Failed to open diff for ${sessionDisplayLabel(session)}: ${detail.trim()}`);
    return;
  }

  const document = await vscode.workspace.openTextDocument({
    language: 'diff',
    content: diffOutput,
  });
  await vscode.window.showTextDocument(document, { preview: false });
}

function repoRootFromSessionFile(filePath) {
  return path.resolve(path.dirname(filePath), '..', '..', '..');
}

function repoRootFromLockFile(filePath) {
  return path.resolve(path.dirname(filePath), '..', '..');
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function emptyLockRegistry() {
  return {
    entriesByPath: new Map(),
    countsByBranch: new Map(),
  };
}

function readLockRegistry(repoRoot) {
  const lockPath = path.join(repoRoot, LOCK_FILE_RELATIVE);
  if (!fs.existsSync(lockPath)) {
    return emptyLockRegistry();
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_error) {
    return emptyLockRegistry();
  }

  const locks = parsed?.locks;
  if (!locks || typeof locks !== 'object' || Array.isArray(locks)) {
    return emptyLockRegistry();
  }

  const entriesByPath = new Map();
  const countsByBranch = new Map();
  for (const [rawRelativePath, entry] of Object.entries(locks)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const relativePath = normalizeRelativePath(rawRelativePath);
    const branch = typeof entry.branch === 'string' ? entry.branch.trim() : '';
    if (!relativePath || !branch) {
      continue;
    }

    entriesByPath.set(relativePath, {
      branch,
      claimedAt: typeof entry.claimed_at === 'string' ? entry.claimed_at : '',
      allowDelete: Boolean(entry.allow_delete),
    });
    countsByBranch.set(branch, (countsByBranch.get(branch) || 0) + 1);
  }

  return {
    entriesByPath,
    countsByBranch,
  };
}

function readCurrentBranch(repoRoot) {
  try {
    return cp.execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_error) {
    return '';
  }
}

function decorateSession(session, lockRegistry) {
  return {
    ...session,
    lockCount: lockRegistry.countsByBranch.get(session.branch) || 0,
  };
}

function decorateChange(change, lockRegistry, owningBranch) {
  const lockEntry = lockRegistry.entriesByPath.get(normalizeRelativePath(change.relativePath));
  const lockOwnerBranch = lockEntry?.branch || '';
  return {
    ...change,
    lockOwnerBranch,
    hasForeignLock: Boolean(lockOwnerBranch) && (!owningBranch || lockOwnerBranch !== owningBranch),
  };
}

function buildChangeTreeNodes(changes) {
  const root = [];

  function sortNodes(nodes) {
    nodes.sort((left, right) => {
      const leftIsFolder = left.kind === 'folder';
      const rightIsFolder = right.kind === 'folder';
      if (leftIsFolder !== rightIsFolder) {
        return leftIsFolder ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    });

    for (const node of nodes) {
      if (node.kind === 'folder') {
        sortNodes(node.children);
      }
    }
  }

  for (const change of changes) {
    const segments = change.relativePath.split(/[\\/]+/).filter(Boolean);
    if (segments.length <= 1) {
      root.push({ kind: 'change', label: change.relativePath, change });
      continue;
    }

    let nodes = root;
    let folderPath = '';
    for (const segment of segments.slice(0, -1)) {
      folderPath = folderPath ? path.posix.join(folderPath, segment) : segment;
      let folderNode = nodes.find((node) => node.kind === 'folder' && node.relativePath === folderPath);
      if (!folderNode) {
        folderNode = {
          kind: 'folder',
          label: segment,
          relativePath: folderPath,
          children: [],
        };
        nodes.push(folderNode);
      }
      nodes = folderNode.children;
    }

    nodes.push({ kind: 'change', label: change.relativePath, change });
  }

  sortNodes(root);

  function materialize(nodes) {
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        return new FolderItem(node.label, node.relativePath, materialize(node.children));
      }
      return new ChangeItem(node.change);
    });
  }

  return materialize(root);
}

function countWorkingSessions(sessions) {
  return sessions.filter((session) => session.activityKind === 'working').length;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function pickRepoRoot() {
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  if (workspaceFolders.length === 0) {
    vscode.window.showInformationMessage?.('Open a Guardex workspace folder to start an agent.');
    return null;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0].uri.fsPath;
  }

  const picks = workspaceFolders.map((folder) => ({
    label: path.basename(folder.uri.fsPath),
    description: folder.uri.fsPath,
    repoRoot: folder.uri.fsPath,
  }));
  const selection = await vscode.window.showQuickPick?.(picks, {
    placeHolder: 'Select the Guardex repo where gx branch start should run.',
  });
  return selection?.repoRoot || null;
}

async function promptStartAgentDetails() {
  const taskName = await vscode.window.showInputBox?.({
    prompt: 'Task for gx branch start',
    placeHolder: 'vscode active agents welcome view',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : 'Task is required.',
  });
  if (!taskName) {
    return null;
  }

  const agentName = await vscode.window.showInputBox?.({
    prompt: 'Agent name for gx branch start',
    placeHolder: 'codex',
    value: 'codex',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : 'Agent name is required.',
  });
  if (!agentName) {
    return null;
  }

  return {
    taskName: taskName.trim(),
    agentName: agentName.trim(),
  };
}

async function startAgentFromPrompt(refresh) {
  const repoRoot = await pickRepoRoot();
  if (!repoRoot) {
    return;
  }

  const details = await promptStartAgentDetails();
  if (!details) {
    return;
  }

  const terminal = vscode.window.createTerminal?.({
    name: `GitGuardex: ${path.basename(repoRoot)}`,
    cwd: repoRoot,
  });
  terminal?.show(true);
  terminal?.sendText(
    `gx branch start ${shellQuote(details.taskName)} ${shellQuote(details.agentName)}`,
    true,
  );
  refresh();
}

function buildActiveAgentGroupNodes(sessions) {
  const workingSessions = sessions
    .filter((session) => session.activityKind === 'working')
    .map((session) => new SessionItem(session));
  const thinkingSessions = sessions
    .filter((session) => session.activityKind !== 'working')
    .map((session) => new SessionItem(session));
  const groups = [];

  if (workingSessions.length > 0) {
    groups.push(new SectionItem('WORKING NOW', workingSessions));
  }
  if (thinkingSessions.length > 0) {
    groups.push(new SectionItem('THINKING', thinkingSessions));
  }

  return groups;
}

class ActiveAgentsProvider {
  constructor(decorationProvider) {
    this.decorationProvider = decorationProvider;
    this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    this.treeView = null;
    this.lockRegistryByRepoRoot = new Map();
  }

  getTreeItem(element) {
    return element;
  }

  attachTreeView(treeView) {
    this.treeView = treeView;
    this.updateViewState(0, 0);
  }

  updateViewState(sessionCount, workingCount) {
    if (!this.treeView) {
      return;
    }

    this.treeView.badge = sessionCount > 0
      ? {
          value: sessionCount,
          tooltip: `${sessionCount} active agent${sessionCount === 1 ? '' : 's'}`
            + (workingCount > 0 ? ` · ${workingCount} working now` : ''),
        }
      : undefined;
    this.treeView.message = undefined;
  }

  async syncRepoEntries() {
    const repoEntries = await this.loadRepoEntries();
    const sessionCount = repoEntries.reduce((total, entry) => total + entry.sessions.length, 0);
    const workingCount = repoEntries.reduce(
      (total, entry) => total + countWorkingSessions(entry.sessions),
      0,
    );

    this.updateViewState(sessionCount, workingCount);
    this.decorationProvider?.updateSessions(repoEntries.flatMap((entry) => entry.sessions));
    return repoEntries;
  }

  async refresh() {
    await this.syncRepoEntries();
    this.onDidChangeTreeDataEmitter.fire();
    this.decorationProvider?.refresh();
  }

  readLockRegistryForRepo(repoRoot) {
    const lockRegistry = readLockRegistry(repoRoot);
    this.lockRegistryByRepoRoot.set(repoRoot, lockRegistry);
    return lockRegistry;
  }

  getLockRegistryForRepo(repoRoot) {
    return this.lockRegistryByRepoRoot.get(repoRoot) || this.readLockRegistryForRepo(repoRoot);
  }

  refreshLockRegistryForFile(filePath) {
    this.readLockRegistryForRepo(repoRootFromLockFile(filePath));
  }

  async getChildren(element) {
    if (element instanceof RepoItem) {
      const sectionItems = [
        new SectionItem('ACTIVE AGENTS', buildActiveAgentGroupNodes(element.sessions), {
          description: String(element.sessions.length),
        }),
      ];
      if (element.changes.length > 0) {
        sectionItems.push(new SectionItem('CHANGES', buildChangeTreeNodes(element.changes)));
      }
      return sectionItems;
    }

    if (element instanceof SectionItem || element instanceof FolderItem) {
      return element.items;
    }

    const repoEntries = await this.syncRepoEntries();

    if (repoEntries.length === 0) {
      return [];
    }

    return repoEntries.map((entry) => new RepoItem(entry.repoRoot, entry.sessions, entry.changes));
  }

  async loadRepoEntries() {
    const sessionFiles = await vscode.workspace.findFiles(
      '**/.omx/state/active-sessions/*.json',
      '**/{node_modules,.git,.omx/agent-worktrees,.omc/agent-worktrees}/**',
      200,
    );

    const repoRoots = new Set();
    for (const uri of sessionFiles) {
      repoRoots.add(repoRootFromSessionFile(uri.fsPath));
    }

    if (repoRoots.size === 0) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
        repoRoots.add(workspaceFolder.uri.fsPath);
      }
    }

    const repoEntries = [];
    for (const repoRoot of repoRoots) {
      const lockRegistry = this.getLockRegistryForRepo(repoRoot);
      const sessions = readActiveSessions(repoRoot).map((session) => decorateSession(session, lockRegistry));
      if (sessions.length > 0) {
        const currentBranch = readCurrentBranch(repoRoot);
        repoEntries.push({
          repoRoot,
          sessions,
          changes: readRepoChanges(repoRoot).map((change) => (
            decorateChange(change, lockRegistry, currentBranch)
          )),
        });
      }
    }

    repoEntries.sort((left, right) => left.repoRoot.localeCompare(right.repoRoot));
    return repoEntries;
  }
}

function activate(context) {
  const decorationProvider = new SessionDecorationProvider();
  const provider = new ActiveAgentsProvider(decorationProvider);
  const treeView = vscode.window.createTreeView('gitguardex.activeAgents', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  provider.attachTreeView(treeView);
  const refresh = () => {
    void provider.refresh();
  };
  const sessionWatcher = vscode.workspace.createFileSystemWatcher('**/.omx/state/active-sessions/*.json');
  const lockWatcher = vscode.workspace.createFileSystemWatcher('**/.omx/state/agent-file-locks.json');
  const interval = setInterval(refresh, 5_000);
  const refreshLockRegistry = (uri) => {
    if (uri?.fsPath) {
      provider.refreshLockRegistryForFile(uri.fsPath);
    }
    refresh();
  };

  context.subscriptions.push(
    treeView,
    vscode.window.registerFileDecorationProvider(decorationProvider),
    vscode.commands.registerCommand('gitguardex.activeAgents.startAgent', () => startAgentFromPrompt(refresh)),
    vscode.commands.registerCommand('gitguardex.activeAgents.refresh', refresh),
    vscode.commands.registerCommand('gitguardex.activeAgents.openWorktree', async (session) => {
      if (!session?.worktreePath) {
        return;
      }

      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(session.worktreePath),
        { forceNewWindow: true },
      );
    }),
    vscode.commands.registerCommand('gitguardex.activeAgents.openChange', async (change) => {
      if (!change?.absolutePath) {
        return;
      }

      if (!fs.existsSync(change.absolutePath)) {
        vscode.window.showInformationMessage?.(`Changed path is no longer on disk: ${change.relativePath}`);
        return;
      }

      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(change.absolutePath));
    }),
    vscode.commands.registerCommand('gitguardex.activeAgents.finishSession', finishSession),
    vscode.commands.registerCommand('gitguardex.activeAgents.syncSession', syncSession),
    vscode.commands.registerCommand('gitguardex.activeAgents.stopSession', (session) => stopSession(session, refresh)),
    vscode.commands.registerCommand('gitguardex.activeAgents.openSessionDiff', openSessionDiff),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    sessionWatcher,
    lockWatcher,
    { dispose: () => clearInterval(interval) },
  );

  sessionWatcher.onDidCreate(refresh, undefined, context.subscriptions);
  sessionWatcher.onDidChange(refresh, undefined, context.subscriptions);
  sessionWatcher.onDidDelete(refresh, undefined, context.subscriptions);
  lockWatcher.onDidCreate(refreshLockRegistry, undefined, context.subscriptions);
  lockWatcher.onDidChange(refreshLockRegistry, undefined, context.subscriptions);
  lockWatcher.onDidDelete(refreshLockRegistry, undefined, context.subscriptions);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
