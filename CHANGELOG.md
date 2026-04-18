# Changelog

## [0.1.0] — 2026-04-19

### Added
- Global session discovery across all `~/.claude/projects/*/` directories
- Sidebar tree view with Project, Date, and Flat grouping modes
- Full-text search across session content (streamed for large files)
- Session detail webview with paginated message display
- One-click resume via `claude --resume <id>` in integrated terminal
- Bookmark system with persistence to `~/.claude/backtrack-bookmarks.json`
- Markdown export for full conversations
- Auto-refresh with file system watcher (debounced)
- WSL auto-detection for Windows `.claude` directory
- Context menu with: View, Resume, Export, Bookmark, Copy ID, Reveal in Explorer
- Project context menu: Open Folder, Open in New Window
- Zero telemetry — all data stays local
