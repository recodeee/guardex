const path = require('node:path');
const vscode = require('vscode');
const { formatElapsedFrom, readActiveSessions } = require('./session-schema.js');

class InfoItem extends vscode.TreeItem {
  constructor(label, description = '') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

class RepoItem extends vscode.TreeItem {
  constructor(repoRoot, sessions) {
    super(path.basename(repoRoot), vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repoRoot;
    this.sessions = sessions;
    this.description = `${sessions.length} active`;
    this.tooltip = repoRoot;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'gitguardex.repo';
  }
}

class SessionItem extends vscode.TreeItem {
  constructor(session) {
    super(session.label, vscode.TreeItemCollapsibleState.None);
    this.session = session;
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
      `Started ${session.startedAt}`,
      session.worktreePath,
    ];
    this.tooltip = tooltipLines.filter(Boolean).join('\n');
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'gitguardex.session';
    this.command = {
      command: 'gitguardex.activeAgents.openWorktree',
      title: 'Open Agent Worktree',
      arguments: [session],
    };
  }
}

function repoRootFromSessionFile(filePath) {
  return path.resolve(path.dirname(filePath), '..', '..', '..');
}

class ActiveAgentsProvider {
  constructor() {
    this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    this.treeView = null;
  }

  getTreeItem(element) {
    return element;
  }

  attachTreeView(treeView) {
    this.treeView = treeView;
    this.updateViewState(0);
  }

  updateViewState(sessionCount) {
    if (!this.treeView) {
      return;
    }

    this.treeView.badge = sessionCount > 0
      ? {
          value: sessionCount,
          tooltip: `${sessionCount} active agent${sessionCount === 1 ? '' : 's'}`,
        }
      : undefined;
    this.treeView.message = sessionCount > 0
      ? undefined
      : 'Start a sandbox session to populate this view.';
  }

  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }

  async getChildren(element) {
    if (element instanceof RepoItem) {
      return element.sessions.map((session) => new SessionItem(session));
    }

    const sessionsByRepo = await this.loadSessionsByRepo();
    const sessionCount = [...sessionsByRepo.values()].reduce((total, sessions) => total + sessions.length, 0);
    this.updateViewState(sessionCount);
    const repos = [...sessionsByRepo.entries()]
      .map(([repoRoot, sessions]) => ({ repoRoot, sessions }))
      .filter((entry) => entry.sessions.length > 0)
      .sort((left, right) => left.repoRoot.localeCompare(right.repoRoot));

    if (repos.length === 0) {
      return [new InfoItem('No active Guardex agents', 'Open or start a sandbox session.')];
    }

    if (repos.length === 1) {
      return repos[0].sessions.map((session) => new SessionItem(session));
    }

    return repos.map((entry) => new RepoItem(entry.repoRoot, entry.sessions));
  }

  async loadSessionsByRepo() {
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

    const sessionsByRepo = new Map();
    for (const repoRoot of repoRoots) {
      const sessions = readActiveSessions(repoRoot);
      if (sessions.length > 0) {
        sessionsByRepo.set(repoRoot, sessions);
      }
    }

    return sessionsByRepo;
  }
}

function activate(context) {
  const provider = new ActiveAgentsProvider();
  const treeView = vscode.window.createTreeView('gitguardex.activeAgents', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  provider.attachTreeView(treeView);
  const refresh = () => provider.refresh();
  const watcher = vscode.workspace.createFileSystemWatcher('**/.omx/state/active-sessions/*.json');
  const interval = setInterval(refresh, 5_000);

  context.subscriptions.push(
    treeView,
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
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    watcher,
    { dispose: () => clearInterval(interval) },
  );

  watcher.onDidCreate(refresh, undefined, context.subscriptions);
  watcher.onDidChange(refresh, undefined, context.subscriptions);
  watcher.onDidDelete(refresh, undefined, context.subscriptions);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
