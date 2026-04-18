# Backtrack

**Backtrack to any Claude Code conversation. Browse, search, and resume sessions across all projects.**

> Zero telemetry · Fully open source (MIT) · No paid tier · WSL-aware

---

## The Problem

The official Claude Code extension only shows sessions for the **currently open workspace**. If you work across many projects, your sessions are buried in `~/.claude/projects/` with no UI to find or resume them. This gap is tracked in upstream issues [#34985](https://github.com/anthropics/claude-code/issues/34985), [#46862](https://github.com/anthropics/claude-code/issues/46862), [#47581](https://github.com/anthropics/claude-code/issues/47581), and [#20687](https://github.com/anthropics/claude-code/issues/20687).

Backtrack solves this by reading those `.jsonl` files directly and surfacing them in a rich sidebar — completely locally, without any network requests.

---

## Features

- **Global session discovery** — scans all projects under `~/.claude/projects/` automatically
- **Smart path decoding** — converts encoded folder names back to readable project paths
- **Three grouping modes** — by Project, by Date (Today/Yesterday/This Week…), or Flat
- **Full-text search** — searches titles, previews, and raw file content (streamed for large files)
- **Session detail viewer** — scrollable conversation view with code highlighting, tool-use blocks, and "Load more" pagination
- **One-click resume** — runs `claude --resume <id>` in an integrated terminal
- **Bookmarks** — pin important sessions; persisted across restarts
- **Markdown export** — full conversation formatted with metadata header
- **Auto-refresh** — watches `~/.claude/projects/` for changes (debounced)
- **WSL auto-detection** — finds Windows `.claude` directory from within WSL automatically
- **No telemetry, ever** — everything stays on your machine

---

## Screenshots

| Sidebar — By Project | Session Viewer | Search |
|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## Quick Start

1. Install from the VS Code Marketplace: **Backtrack** by `ritik4ever`
2. Click the Claude icon in the Activity Bar
3. Your sessions appear automatically — click any to view, right-click for more actions

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `backtrack.claudeDir` | `""` | Custom path to `.claude` directory (leave empty for auto-detect) |
| `backtrack.groupBy` | `"project"` | Default grouping: `"project"`, `"date"`, or `"flat"` |
| `backtrack.maxSessionsPerProject` | `50` | Sessions per project (0 = unlimited) |
| `backtrack.showMessageCount` | `true` | Show message count in tooltips |

---

## Commands

All commands are under the **Backtrack** category in the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---|---|
| `Refresh` | Reload all sessions |
| `Search Sessions` | Full-text search across all sessions |
| `Toggle Group By` | Cycle between Project / Date / Flat grouping |
| `View Session Details` | Open conversation viewer |
| `Resume in Terminal` | Run `claude --resume <id>` in terminal |
| `Export to Markdown` | Save full conversation as `.md` |
| `Bookmark Session` | Pin a session |
| `Remove Bookmark` | Unpin a session |
| `Copy Session ID` | Copy UUID to clipboard |
| `Reveal .jsonl File in Explorer` | Open file location in OS explorer |
| `Open Project Folder` | Open project in current window |
| `Open Project in New Window` | Open project in new VS Code window |

---

## How It Works

Backtrack reads `.jsonl` files from `~/.claude/projects/*/` using Node.js built-in `fs` and `readline` — no external dependencies. It decodes the encoded project folder names (e.g. `c--Users-ritik-Desktop-myproject` → `C:/Users/ritik/Desktop/myproject`) and presents them in the sidebar.

**Your data never leaves your machine.** There are no analytics, no telemetry endpoints, no network requests of any kind.

---

## vs Alternatives

| Feature | Backtrack | agsoft.claude-history-viewer | doorsofperception.claude-code-history |
|---|---|---|---|
| Price | Free | Freemium | Free |
| Open source | MIT | Closed | Unknown |
| Telemetry | None | Yes | Unknown |
| WSL support | Auto-detect | Unknown | Unknown |
| Full-text search | Yes | Yes | Basic |
| Cross-project | Yes | Yes | Limited |
| Resume integration | Yes | Yes | No |

---

## Contributing

```bash
git clone https://github.com/ritik4ever/backtrack
cd backtrack
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```

Run tests:
```bash
npm test
```

Lint:
```bash
npm run lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## Roadmap

- [ ] Stats panel (total sessions, messages, active days)
- [ ] Session comparison view (diff two sessions)
- [ ] Export to JSON
- [ ] Session tagging / labels
- [ ] Keyboard shortcut to open recent session
- [ ] Settings UI webview

---

## License

[MIT](LICENSE) — Copyright © 2026 Ritik
