# Backtrack

**Backtrack to any Claude Code conversation. Browse, search, and resume sessions across all your projects.**

> Zero telemetry · Fully open source (MIT) · No paid tier · Works as VS Code extension AND terminal CLI · macOS · Windows · WSL · Linux

---

## The Problem

Claude Code doesn't let you browse or resume sessions from other projects. Your conversation history is buried in `~/.claude/projects/` as `.jsonl` files with no UI to find them — unless you already know the exact session UUID.

This affects both the **VS Code extension** and the **terminal CLI**. Backtrack solves it for both.

Tracked upstream: [#34985](https://github.com/anthropics/claude-code/issues/34985) · [#46862](https://github.com/anthropics/claude-code/issues/46862) · [#47581](https://github.com/anthropics/claude-code/issues/47581) · [#20687](https://github.com/anthropics/claude-code/issues/20687)

---

## Platform Support

| Platform | VS Code Extension | Terminal CLI |
|---|---|---|
| **macOS** | Native — works out of the box | Native — works out of the box |
| **Windows** | Native | Native (PowerShell / cmd) |
| **WSL** | Auto-detects Windows `.claude` | Needs `claude` installed in WSL |
| **Linux** | Native | Native |

---

## Two Ways to Use Backtrack

| | VS Code Extension | Terminal CLI |
|---|---|---|
| **Best for** | Visual browsing, reading conversations | SSH, terminal-first workflow |
| **How to launch** | Click icon in Activity Bar | `backtrack` in any terminal |
| **Search** | Click search icon in sidebar | Type to filter in real time |
| **Resume** | Right-click → Resume | Press Enter on selected session |
| **Install** | VS Code Marketplace | `npm link` after cloning |

---

## VS Code Extension

### Install

**macOS / Windows / Linux:**
1. Open VS Code
2. `Cmd+Shift+X` (macOS) or `Ctrl+Shift+X` (Windows/Linux) → search **Backtrack** → Install (publisher: `ritik4ever`)
3. Click the **Backtrack icon** in the Activity Bar (left sidebar)

### Features

- **All Sessions** panel — every session across every project, grouped by Project / Date / Flat
- **Bookmarked** panel — pinned sessions that persist across restarts
- **Full-text search** — searches titles, previews, and raw `.jsonl` file content
- **Session viewer** — full conversation with code blocks, tool-use, collapsible thinking blocks
- **Resume** — right-click any session → Resume in Terminal → runs `claude --resume <id>`
- **Export to Markdown** — save full conversation with metadata header
- **Auto-refresh** — watches `~/.claude/projects/` for new sessions (debounced 2s)
- **WSL auto-detection** — finds Windows `.claude` when running inside WSL

### Sidebar Controls

```
BACKTRACK
├── ALL SESSIONS          🔍 search  ⇄ group  🔄 refresh
│   ├── 📁 stellarhack  (2 sessions)
│   │   ├── 💬 i was working on lodestar...     5d ago
│   │   └── 💬 Build a production-grade Web3…   1w ago
│   ├── 📁 connow  (1 session)
│   │   └── 💬 # ConnectNow — Complete Claude…  2w ago
│   └── ...
└── BOOKMARKED
    └── 💬 Pinned session title
```

### Context Menu (right-click a session)

| Action | Description |
|---|---|
| View Session Details | Open full conversation viewer |
| Resume in Terminal | Run `claude --resume <id>` |
| Export to Markdown | Save conversation as `.md` file |
| Bookmark / Remove Bookmark | Pin/unpin the session |
| Copy Session ID | Copy UUID to clipboard |
| Reveal .jsonl File in Explorer | Open file location in OS |

### Configuration

Open `Settings` → search **Backtrack**:

| Setting | Default | Description |
|---|---|---|
| `backtrack.claudeDir` | `""` | Custom `.claude` path (leave empty for auto-detect) |
| `backtrack.groupBy` | `"project"` | Grouping mode: `project` · `date` · `flat` |
| `backtrack.maxSessionsPerProject` | `50` | Sessions shown per project (0 = unlimited) |
| `backtrack.showMessageCount` | `true` | Show message count in tooltips |

### Commands (Command Palette)

- macOS: `Cmd+Shift+P`
- Windows/Linux: `Ctrl+Shift+P`

All commands are under the **Backtrack** category:

| Command | Description |
|---|---|
| `Backtrack: Search Sessions` | Full-text search |
| `Backtrack: Refresh` | Reload all sessions |
| `Backtrack: Toggle Group By` | Cycle Project → Date → Flat |
| `Backtrack: Resume in Terminal` | Resume selected session |
| `Backtrack: Export to Markdown` | Export conversation |
| `Backtrack: Bookmark Session` | Pin a session |
| `Backtrack: Copy Session ID` | Copy UUID |
| `Backtrack: Reveal .jsonl File in Explorer` | Open file in OS |
| `Backtrack: Open Project Folder` | Open project in VS Code |

---

## Terminal CLI

### Install

```bash
# Clone and set up
git clone https://github.com/ritik4ever/backtrack
cd backtrack
npm install
npm run compile
npm link          # makes 'backtrack' available globally in your terminal
```

Works on **macOS**, **Windows** (PowerShell/cmd), **WSL**, and **Linux** — no extra setup needed.

### Usage

```bash
backtrack                    # Interactive fuzzy picker (recommended)
backtrack list               # List all sessions grouped by project
backtrack search <query>     # Filter sessions by keyword
backtrack resume <id>        # Resume a specific session by ID or prefix
backtrack --help             # Show help
```

### Interactive Picker

Run `backtrack` with no arguments to open the interactive picker:

```
 BACKTRACK  18 sessions · 12 projects
 ──────────────────────────────────────────────────────────────────────────────────
  / stellarhack▌  3 matches
 ──────────────────────────────────────────────────────────────────────────────────
  ▶ stellarhack    i was working on lodestar with the h…      5d ago    1241msg
    stellarhack    Build a production-grade Web3 app…         1w ago     410msg
    session        # Claude Code Prompt — Build Backtrack…   just now   342msg

  ↑↓ navigate · Enter resume · Esc/q quit · Type to search
```

**Controls:**

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate sessions |
| `Page Up` / `Page Down` | Scroll faster |
| Type anything | Filter in real time |
| `Enter` | Resume selected session with `claude --resume` |
| `Esc` or `q` | Quit |

### Examples

```bash
# Find sessions about a specific project
backtrack search myproject

# Resume using just the first 8 chars of the ID
backtrack resume c7e9dcfe

# List sessions and pipe to grep
backtrack list | grep "1w ago"
```

---

## How It Works

Backtrack reads `.jsonl` files from `~/.claude/projects/*/` using only Node.js built-ins (`fs`, `readline`, `path`) — **zero npm runtime dependencies**.

It decodes encoded folder names back to readable paths:
```
c--Users-ritik-Desktop-stellarhack  →  C:/Users/ritik/Desktop/stellarhack  (Windows)
-home-ritik-projects-myapp          →  /home/ritik/projects/myapp           (macOS/Linux)
-Users-ritik-projects-myapp         →  /Users/ritik/projects/myapp          (macOS)
```

**Your data never leaves your machine.** No analytics, no telemetry, no network requests.

Bookmarks are saved to `~/.claude/backtrack-bookmarks.json`.

---

## macOS Notes

Backtrack works natively on macOS — no WSL, no extra setup. Just install Claude Code and run Backtrack.

```bash
# macOS: install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Install Backtrack CLI
git clone https://github.com/ritik4ever/backtrack
cd backtrack && npm install && npm run compile && npm link

# Run
backtrack
```

Sessions are found automatically at `~/.claude/projects/`.

---

## WSL Notes

If running inside WSL without `~/.claude` on the Linux side, Backtrack automatically scans `/mnt/c/Users/<name>/.claude/` for your Windows sessions.

For the CLI resume to work in WSL, install Claude Code CLI inside WSL:
```bash
npm install -g @anthropic-ai/claude-code
```

---

## vs Alternatives

| Feature | **Backtrack** | agsoft.claude-history-viewer | doorsofperception.claude-code-history |
|---|---|---|---|
| Price | Free | Freemium | Free |
| Open source | MIT | Closed | Unknown |
| Telemetry | None | Yes | Unknown |
| Terminal CLI | Yes | No | No |
| macOS support | Yes | Unknown | Unknown |
| WSL auto-detect | Yes | Unknown | Unknown |
| Full-text search | Yes | Yes | Basic |
| Cross-project | Yes | Yes | Limited |
| Resume integration | Yes | Yes | No |
| Zero dependencies | Yes | Unknown | Unknown |

---

## Contributing

```bash
git clone https://github.com/ritik4ever/backtrack
cd backtrack
npm install
npm run compile

# VS Code extension: press F5 to launch Extension Development Host
# CLI: node bin/backtrack.js list
```

```bash
npm run lint      # ESLint
npm test          # unit tests
npm run compile   # TypeScript compile
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## Project Structure

```
src/
  extension.ts              VS Code activation + command registration
  cli/index.ts              Terminal CLI entry point
  providers/
    sessionTreeProvider.ts  Sidebar tree (All Sessions)
    bookmarkProvider.ts     Sidebar tree (Bookmarked)
  views/sessionWebview.ts   Session conversation viewer
  utils/
    claudeDir.ts            ~/.claude detection + path decoding
    sessionParser.ts        .jsonl parsing with mtime cache
    search.ts               Fast + full-text search
    exporter.ts             Markdown export
    formatters.ts           Date, bytes, text helpers
  types/index.ts            All TypeScript interfaces
bin/
  backtrack.js              CLI shebang wrapper
```

---

## Project Context Mapping

Backtrack can build a structured knowledge base from your session history, giving Claude Code full project context on every new session.

### What it does

Running `backtrack map` inside your project analyses all Claude Code sessions for that project and produces a `.backtrack/` folder:

```
.backtrack/
├── context.json              # Master index
├── CLAUDE.md                 # Auto-generated project summary
├── entities/
│   ├── decisions.json        # Architectural decisions
│   ├── files.json            # File-level context
│   ├── bugs.json             # Bugs found + fixes
│   ├── conventions.json      # Code style / patterns
│   ├── dependencies.json     # Packages and why they were added
│   └── todos.json            # Open items and planned features
├── timeline/
│   └── events.json           # Chronological milestones
└── sessions/
    └── summaries/            # One-paragraph summary per session
```

### CLI Usage

```bash
cd my-project
backtrack map                    # Full analysis (all sessions)
backtrack map --incremental      # Only process new sessions
backtrack map --export           # Print context as markdown
backtrack map --reset            # Delete and regenerate
backtrack map status             # Show what's mapped
backtrack map query "why x402"   # Search the context map
```

### VS Code Commands (`Ctrl+Shift+P`)

| Command | Description |
|---|---|
| `Backtrack: Map Project Context` | Full context map generation |
| `Backtrack: Update Project Map` | Incremental — only new sessions |
| `Backtrack: Query Context Map` | Search decisions, bugs, todos |
| `Backtrack: Show Context Map Status` | Summary of what's mapped |

### Using with Claude Code

After running `backtrack map`, add one line to your project's `CLAUDE.md`:

```markdown
See .backtrack/CLAUDE.md for full project context (decisions, bugs, conventions, todos).
```

Claude Code will then load the full knowledge map at the start of every session — no more re-explaining your stack, past decisions, or open issues.

### How it extracts information

Backtrack uses regex pattern matching on session text (no API calls, no tokens):
- **Decisions** — "decided to", "going with", "we chose", "instead of"
- **Bugs** — error/stack traces, "fixed", "root cause", "the issue was"
- **Conventions** — "always", "never", "rule", "make sure", "pattern"
- **TODOs** — "TODO:", "need to add", "planned", "known issue"
- **Stack** — package names, import statements, framework mentions
- **Files** — paths from tool_use blocks (Read/Edit/Write calls)

`.backtrack/` is automatically added to `.gitignore`. The `CLAUDE.md` file is **not** gitignored so your whole team benefits.

---

## Roadmap

- [ ] Stats panel (total sessions, messages, active days heatmap)
- [ ] Session comparison / diff view
- [ ] Export to JSON
- [ ] Session tagging / labels
- [ ] AI-powered extraction mode (opt-in, uses Claude API for higher quality)
- [ ] Context map webview — visual knowledge graph
- [ ] `backtrack` in PATH via VS Code extension (no separate install)

---

## License

[MIT](LICENSE) — Copyright © 2026 Ritik
