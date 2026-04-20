import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BookmarkProvider } from './providers/bookmarkProvider';
import { SessionTreeItem, SessionTreeProvider } from './providers/sessionTreeProvider';
import { SessionMeta } from './types';
import { findClaudeDir } from './utils/claudeDir';
import { invalidateCache } from './utils/sessionParser';
import { searchSessions } from './utils/search';
import { exportToMarkdown, suggestedFilename } from './utils/exporter';
import { parseFullMessages } from './utils/sessionParser';
import { SessionWebviewPanel } from './views/sessionWebview';
import { runContextMap, getMapStatus } from './context/contextMapper';
import { queryContext, formatQueryResults } from './context/contextQuery';

export function activate(context: vscode.ExtensionContext): void {
  const sessionProvider = new SessionTreeProvider(context);
  const bookmarkProvider = new BookmarkProvider(context);

  // Wire up bookmark IDs into the session tree so bookmarked sessions get the bookmark icon
  sessionProvider.setBookmarkedIds(bookmarkProvider.getBookmarkedIds());

  // Register tree views
  const sessionTree = vscode.window.createTreeView('backtrack.allSessions', {
    treeDataProvider: sessionProvider,
    showCollapseAll: true,
  });

  const bookmarkTree = vscode.window.createTreeView('backtrack.bookmarks', {
    treeDataProvider: bookmarkProvider,
    showCollapseAll: false,
  });

  // Keep bookmark provider in sync when session list is refreshed
  sessionProvider.onDidChangeTreeData(() => {
    const all = sessionProvider.getAllSessions();
    bookmarkProvider.syncSessions(all);
    // Refresh bookmark icon state on session tree items
    sessionProvider.setBookmarkedIds(bookmarkProvider.getBookmarkedIds());
  });

  // ── File watcher ────────────────────────────────────────────────────────────
  let debounceTimer: NodeJS.Timeout | undefined;

  function scheduleRefresh(changed: vscode.Uri) {
    // Invalidate cache for the changed file so it gets re-parsed
    invalidateCache(changed.fsPath);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => sessionProvider.refresh(), 2000);
  }

  const claudeDir = findClaudeDir(
    vscode.workspace.getConfiguration('backtrack').get<string>('claudeDir', '')
  );

  if (claudeDir) {
    const pattern = new vscode.RelativePattern(claudeDir, 'projects/**/*.jsonl');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidDelete((uri) => {
      invalidateCache(uri.fsPath);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => sessionProvider.refresh(), 2000);
    });
    context.subscriptions.push(watcher);
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  /** Refresh the session list */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.refresh', () => {
      sessionProvider.refresh();
    })
  );

  /** Cycle group-by mode */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.toggleGroupBy', () => {
      sessionProvider.cycleGroupBy();
      const label = { project: 'By Project', date: 'By Date', flat: 'Flat' }[sessionProvider.getGroupBy()];
      vscode.window.showInformationMessage(`Backtrack: Grouping — ${label}`);
    })
  );

  /** Full-text search */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search sessions (title, content, project name)',
        placeHolder: 'Type to search…',
        value: '',
      });

      if (query === undefined) return; // cancelled
      if (!query.trim()) {
        sessionProvider.setFilter(null);
        sessionTree.title = 'All Sessions';
        return;
      }

      const all = sessionProvider.getAllSessions();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Searching ${all.length} sessions…`,
          cancellable: false,
        },
        async () => {
          const results = await searchSessions(all, query);
          sessionProvider.setFilter(results);
          sessionTree.title = `Search: "${query}" (${results.length})`;
        }
      );
    })
  );

  /** Clear search */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.clearSearch', () => {
      sessionProvider.setFilter(null);
      sessionTree.title = 'All Sessions';
    })
  );

  /** View session detail */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.viewSession', async (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;
      await SessionWebviewPanel.show(meta, context);
    })
  );

  /** Resume session in terminal */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.resumeSession', async (item: SessionTreeItem | { session: SessionMeta }) => {
      const meta = 'session' in item ? item.session : (item as SessionTreeItem).session;
      if (!meta) return;

      const isWsl = process.platform === 'linux' && fs.existsSync('/mnt/c');
      const cmd = isWsl
        ? `cmd.exe /c "claude --resume ${meta.id}"`
        : `claude --resume ${meta.id}`;

      // On WSL, open a PowerShell terminal so claude.cmd is on PATH
      let terminal = vscode.window.terminals.find((t) => t.name === 'Claude Code');
      if (!terminal) {
        const shellPath = isWsl ? 'powershell.exe' : undefined;
        const cwd = isWsl ? `C:\\${meta.projectPath.replace(/^\/mnt\/c\//, '').replace(/\//g, '\\')}` : meta.projectPath;
        terminal = vscode.window.createTerminal({ name: 'Claude Code', shellPath, cwd });
      }
      terminal.show();
      terminal.sendText(isWsl ? `claude --resume ${meta.id}` : cmd);
    })
  );

  /** Export session to Markdown */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.exportMarkdown', async (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting session…', cancellable: false },
        async () => {
          const messages = await parseFullMessages(meta.filePath);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedFilename(meta))),
            filters: { Markdown: ['md'] },
          });
          if (!uri) return;
          const content = exportToMarkdown(meta, messages);
          await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
          vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
        }
      );
    })
  );

  /** Bookmark a session */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.bookmarkSession', (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;
      bookmarkProvider.addBookmark(meta.id);
      sessionProvider.setBookmarkedIds(bookmarkProvider.getBookmarkedIds());
      sessionProvider.refresh();
      vscode.window.showInformationMessage(`Bookmarked: ${meta.title}`);
    })
  );

  /** Unbookmark a session */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.unbookmarkSession', (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;
      bookmarkProvider.removeBookmark(meta.id);
      sessionProvider.setBookmarkedIds(bookmarkProvider.getBookmarkedIds());
      sessionProvider.refresh();
      vscode.window.showInformationMessage(`Removed bookmark: ${meta.title}`);
    })
  );

  /** Copy session ID to clipboard */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.copySessionId', (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;
      vscode.env.clipboard.writeText(meta.id);
      vscode.window.showInformationMessage(`Copied: ${meta.id}`);
    })
  );

  /** Reveal .jsonl file in system explorer */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.revealInExplorer', (item: SessionTreeItem) => {
      const meta = item?.session;
      if (!meta) return;
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(meta.filePath));
    })
  );

  /** Open project folder in VS Code */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.openProjectFolder', (item) => {
      // item is a ProjectTreeItem — import from provider
      const projectPath: string | undefined = item?.group?.projectPath;
      if (!projectPath) return;
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
    })
  );

  /** Open project in new VS Code window */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.openProjectInNewWindow', (item) => {
      const projectPath: string | undefined = item?.group?.projectPath;
      if (!projectPath) return;
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), true);
    })
  );

  /** Build context map for the current workspace project */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.mapProject', async () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) {
        vscode.window.showErrorMessage('Backtrack: No workspace folder open.');
        return;
      }
      const claudeDir = findClaudeDir(
        vscode.workspace.getConfiguration('backtrack').get<string>('claudeDir', '')
      );
      if (!claudeDir) {
        vscode.window.showErrorMessage('Backtrack: Could not find ~/.claude directory.');
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Building context map…', cancellable: false },
        async (progress) => {
          try {
            const result = await runContextMap(
              { projectPath: workspacePath, claudeDir, incremental: false },
              (msg) => progress.report({ message: msg })
            );
            vscode.window.showInformationMessage(
              `Backtrack: Context map built — ${result.sessionsProcessed} sessions processed.`,
              'Open CLAUDE.md'
            ).then(sel => {
              if (sel === 'Open CLAUDE.md') {
                vscode.workspace.openTextDocument(result.claudeMdPath)
                  .then(doc => vscode.window.showTextDocument(doc));
              }
            });
          } catch (err) {
            vscode.window.showErrorMessage(`Backtrack Map: ${err}`);
          }
        }
      );
    })
  );

  /** Incremental context map update */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.updateProjectMap', async () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) return;
      const claudeDir = findClaudeDir(
        vscode.workspace.getConfiguration('backtrack').get<string>('claudeDir', '')
      );
      if (!claudeDir) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Updating context map…', cancellable: false },
        async (progress) => {
          try {
            const result = await runContextMap(
              { projectPath: workspacePath, claudeDir, incremental: true },
              (msg) => progress.report({ message: msg })
            );
            vscode.window.showInformationMessage(
              `Backtrack: Map updated — ${result.sessionsProcessed} new sessions processed.`
            );
          } catch (err) {
            vscode.window.showErrorMessage(`Backtrack Map: ${err}`);
          }
        }
      );
    })
  );

  /** Query the context map */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.queryContext', async () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) return;
      const query = await vscode.window.showInputBox({
        prompt: 'Search project context map',
        placeHolder: 'e.g. "why did we choose x402" or "auth bug"',
      });
      if (!query) return;
      const matches = queryContext(workspacePath, query);
      const formatted = formatQueryResults(matches);
      const doc = await vscode.workspace.openTextDocument({ content: formatted, language: 'markdown' });
      vscode.window.showTextDocument(doc);
    })
  );

  /** Show context map status */
  context.subscriptions.push(
    vscode.commands.registerCommand('backtrack.mapStatus', () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) return;
      const status = getMapStatus(workspacePath);
      vscode.window.showInformationMessage(status);
    })
  );

  context.subscriptions.push(sessionTree, bookmarkTree);
}

export function deactivate(): void {
  // Nothing to clean up — all subscriptions are handled by context
}
