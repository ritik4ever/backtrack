import * as path from 'path';
import * as vscode from 'vscode';
import { DateGroup, GroupBy, ProjectGroup, SessionMeta } from '../types';
import { findClaudeDir, listProjectDirs } from '../utils/claudeDir';
import { formatBytes, relativeTime, dateBucket, truncate } from '../utils/formatters';
import { parseSessionMeta, listSessionFiles } from '../utils/sessionParser';

/** Tree item for a project folder node. */
export class ProjectTreeItem extends vscode.TreeItem {
  constructor(public readonly group: ProjectGroup) {
    super(group.projectName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('folder');
    const totalMessages = group.sessions.reduce((s, m) => s + m.messageCount, 0);
    const totalSize = group.sessions.reduce((s, m) => s + m.size, 0);
    this.description = `${group.sessions.length} session${group.sessions.length !== 1 ? 's' : ''}`;
    this.tooltip = new vscode.MarkdownString(
      `**${group.projectName}**\n\n` +
      `Path: \`${group.projectPath}\`\n\n` +
      `Sessions: ${group.sessions.length} · Messages: ${totalMessages} · Size: ${formatBytes(totalSize)}`
    );
  }
}

/** Tree item for a date-bucket group node. */
export class DateGroupTreeItem extends vscode.TreeItem {
  constructor(public readonly dateGroup: DateGroup) {
    super(dateGroup.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'dateGroup';
    this.iconPath = new vscode.ThemeIcon('calendar');
    this.description = `${dateGroup.sessions.length} session${dateGroup.sessions.length !== 1 ? 's' : ''}`;
  }
}

/** Tree item for a single session. */
export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionMeta,
    public readonly bookmarked: boolean = false
  ) {
    super(session.title, vscode.TreeItemCollapsibleState.None);
    this.contextValue = bookmarked ? 'bookmarkedSession' : 'session';
    this.iconPath = new vscode.ThemeIcon(bookmarked ? 'bookmark' : 'comment-discussion');
    this.description = `${session.projectName} · ${relativeTime(session.mtime)}`;

    this.tooltip = new vscode.MarkdownString(
      `**${session.title}**\n\n` +
      `Project: \`${session.projectPath}\`\n\n` +
      `Messages: ${session.messageCount} · Size: ${formatBytes(session.size)}\n\n` +
      `Session ID: \`${session.id}\`\n\n` +
      (session.preview ? `> ${truncate(session.preview, 200)}` : '')
    );
    this.tooltip.isTrusted = true;

    // Open session detail webview on click
    this.command = {
      command: 'backtrack.viewSession',
      title: 'View Session',
      arguments: [this],
    };
  }
}

type AnyTreeItem = ProjectTreeItem | DateGroupTreeItem | SessionTreeItem;

export class SessionTreeProvider implements vscode.TreeDataProvider<AnyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AnyTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private allSessions: SessionMeta[] = [];
  private filteredSessions: SessionMeta[] | null = null;
  private groupBy: GroupBy;
  private bookmarkedIds: Set<string> = new Set();
  private loading = false;

  constructor(_context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('backtrack');
    this.groupBy = config.get<GroupBy>('groupBy', 'project');
  }

  /** Inject bookmarked IDs so session items render the bookmark icon. */
  setBookmarkedIds(ids: Set<string>): void {
    this.bookmarkedIds = ids;
  }

  setFilter(sessions: SessionMeta[] | null): void {
    this.filteredSessions = sessions;
    this._onDidChangeTreeData.fire();
  }

  setGroupBy(groupBy: GroupBy): void {
    this.groupBy = groupBy;
    const config = vscode.workspace.getConfiguration('backtrack');
    config.update('groupBy', groupBy, vscode.ConfigurationTarget.Global);
    this._onDidChangeTreeData.fire();
  }

  cycleGroupBy(): void {
    const order: GroupBy[] = ['project', 'date', 'flat'];
    const current = order.indexOf(this.groupBy);
    this.setGroupBy(order[(current + 1) % order.length]);
  }

  getGroupBy(): GroupBy {
    return this.groupBy;
  }

  getAllSessions(): SessionMeta[] {
    return this.allSessions;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.load();
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const config = vscode.workspace.getConfiguration('backtrack');
      const claudeDir = findClaudeDir(config.get<string>('claudeDir', ''));
      if (!claudeDir) {
        this.allSessions = [];
        return;
      }

      const projectDirs = listProjectDirs(claudeDir);
      const sessions: SessionMeta[] = [];

      for (const { encoded, decoded } of projectDirs) {
        const projectDir = path.join(claudeDir, 'projects', encoded);
        const files = listSessionFiles(projectDir);
        for (const file of files) {
          const meta = await parseSessionMeta(file, decoded);
          if (meta) sessions.push(meta);
        }
      }

      // Sort newest first
      this.allSessions = sessions.sort((a, b) => b.mtime - a.mtime);
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AnyTreeItem): Promise<AnyTreeItem[]> {
    if (!element) {
      // Root level — load if empty
      if (this.allSessions.length === 0 && !this.loading) {
        await this.load();
      }
      const sessions = this.filteredSessions ?? this.allSessions;
      return this.buildRootNodes(sessions);
    }

    if (element instanceof ProjectTreeItem) {
      return element.group.sessions.map(
        (s) => new SessionTreeItem(s, this.bookmarkedIds.has(s.id))
      );
    }

    if (element instanceof DateGroupTreeItem) {
      return element.dateGroup.sessions.map(
        (s) => new SessionTreeItem(s, this.bookmarkedIds.has(s.id))
      );
    }

    return [];
  }

  private buildRootNodes(sessions: SessionMeta[]): AnyTreeItem[] {
    if (this.groupBy === 'flat') {
      return sessions.map((s) => new SessionTreeItem(s, this.bookmarkedIds.has(s.id)));
    }

    if (this.groupBy === 'date') {
      return this.buildDateGroups(sessions);
    }

    return this.buildProjectGroups(sessions);
  }

  private buildProjectGroups(sessions: SessionMeta[]): ProjectTreeItem[] {
    const map = new Map<string, ProjectGroup>();
    for (const session of sessions) {
      const key = session.projectPath.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          projectPath: session.projectPath,
          projectName: session.projectName,
          sessions: [],
        });
      }
      map.get(key)!.sessions.push(session);
    }
    // Sort projects by most recent session
    return Array.from(map.values())
      .sort((a, b) => b.sessions[0].mtime - a.sessions[0].mtime)
      .map((g) => new ProjectTreeItem(g));
  }

  private buildDateGroups(sessions: SessionMeta[]): DateGroupTreeItem[] {
    const bucketOrder = ['Today', 'Yesterday', 'This Week', 'This Month'];
    const map = new Map<string, SessionMeta[]>();

    for (const session of sessions) {
      const bucket = dateBucket(session.mtime);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(session);
    }

    const groups: DateGroup[] = [];
    // Ordered buckets first
    for (const label of bucketOrder) {
      if (map.has(label)) {
        groups.push({ label, sessions: map.get(label)! });
        map.delete(label);
      }
    }
    // Remaining (month/year labels) sorted newest first
    const remaining = Array.from(map.entries()).sort((a, b) => {
      const aTime = a[1][0]?.mtime ?? 0;
      const bTime = b[1][0]?.mtime ?? 0;
      return bTime - aTime;
    });
    for (const [label, s] of remaining) {
      groups.push({ label, sessions: s });
    }

    return groups.map((g) => new DateGroupTreeItem(g));
  }
}
