const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const { formatElapsedFrom, readActiveSessions, readRepoChanges } = require('./session-schema.js');

class InfoItem extends vscode.TreeItem {
  constructor(label, description = '') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon('info');
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
      change.absolutePath,
    ].filter(Boolean).join('\n');
    this.resourceUri = vscode.Uri.file(change.absolutePath);
    this.contextValue = 'gitguardex.change';
    this.command = {
      command: 'gitguardex.activeAgents.openChange',
      title: 'Open Changed File',
      arguments: [change],
    };
  }
}

function repoRootFromSessionFile(filePath) {
  return path.resolve(path.dirname(filePath), '..', '..', '..');
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
    this.treeView.message = sessionCount > 0
      ? undefined
      : 'Start a sandbox session to populate this view.';
  }

  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
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

    const repoEntries = await this.loadRepoEntries();
    const sessionCount = repoEntries.reduce((total, entry) => total + entry.sessions.length, 0);
    const workingCount = repoEntries.reduce(
      (total, entry) => total + countWorkingSessions(entry.sessions),
      0,
    );
    this.updateViewState(sessionCount, workingCount);

    if (repoEntries.length === 0) {
      return [new InfoItem('No active Guardex agents', 'Open or start a sandbox session.')];
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
      const sessions = readActiveSessions(repoRoot);
      if (sessions.length > 0) {
        repoEntries.push({
          repoRoot,
          sessions,
          changes: readRepoChanges(repoRoot),
        });
      }
    }

    repoEntries.sort((left, right) => left.repoRoot.localeCompare(right.repoRoot));
    return repoEntries;
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
