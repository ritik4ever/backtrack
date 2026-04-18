import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BookmarkStore, SessionMeta } from '../types';
import { findClaudeDir } from '../utils/claudeDir';
import { SessionTreeItem } from './sessionTreeProvider';

export class BookmarkProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private bookmarkedIds: Set<string> = new Set();
  private bookmarkFile: string | null = null;

  constructor(_context: vscode.ExtensionContext) {
    this.load();
  }

  private resolveBookmarkFile(): string | null {
    const config = vscode.workspace.getConfiguration('backtrack');
    const claudeDir = findClaudeDir(config.get<string>('claudeDir', ''));
    if (!claudeDir) return null;
    return path.join(claudeDir, 'backtrack-bookmarks.json');
  }

  private load(): void {
    const file = this.resolveBookmarkFile();
    if (!file) return;
    this.bookmarkFile = file;
    try {
      if (!fs.existsSync(file)) return;
      const raw = fs.readFileSync(file, 'utf8');
      const store = JSON.parse(raw) as BookmarkStore;
      this.bookmarkedIds = new Set(store.bookmarks ?? []);
    } catch {
      this.bookmarkedIds = new Set();
    }
  }

  private save(): void {
    const file = this.bookmarkFile ?? this.resolveBookmarkFile();
    if (!file) return;
    this.bookmarkFile = file;
    try {
      const store: BookmarkStore = { bookmarks: Array.from(this.bookmarkedIds) };
      fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      vscode.window.showErrorMessage(`Backtrack: Failed to save bookmarks — ${err}`);
    }
  }

  getBookmarkedIds(): Set<string> {
    return this.bookmarkedIds;
  }

  isBookmarked(sessionId: string): boolean {
    return this.bookmarkedIds.has(sessionId);
  }

  addBookmark(sessionId: string): void {
    this.bookmarkedIds.add(sessionId);
    this.save();
    this._onDidChangeTreeData.fire();
  }

  removeBookmark(sessionId: string): void {
    this.bookmarkedIds.delete(sessionId);
    this.save();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Called by the main provider to sync the bookmarks panel
   * when the session list is refreshed.
   */
  syncSessions(allSessions: SessionMeta[]): void {
    this.sessions = allSessions;
    this._onDidChangeTreeData.fire();
  }

  private sessions: SessionMeta[] = [];

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SessionTreeItem[] {
    const bookmarked = this.sessions.filter((s) => this.bookmarkedIds.has(s.id));
    return bookmarked.map((s) => new SessionTreeItem(s, true));
  }
}
