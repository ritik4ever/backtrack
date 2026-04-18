# Contributing to Backtrack

Thank you for your interest in contributing! This project is MIT-licensed and welcomes PRs, bug reports, and feature ideas.

## Development Setup

```bash
git clone https://github.com/ritik4ever/backtrack
cd backtrack
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

## Project Structure

```
src/
  extension.ts          # Entry point — activation & command registration
  types/index.ts        # All TypeScript interfaces
  utils/
    claudeDir.ts        # .claude directory detection & path decoding
    sessionParser.ts    # JSONL parsing with caching
    search.ts           # Fast + full-text search
    exporter.ts         # Markdown export
    formatters.ts       # Date, bytes, text helpers
  providers/
    sessionTreeProvider.ts  # Main sidebar tree
    bookmarkProvider.ts     # Bookmarks tree
  views/
    sessionWebview.ts   # Session detail webview
```

## Guidelines

- **No external dependencies** — only VS Code API + Node.js built-ins
- **No telemetry** — never add network calls or analytics
- **TypeScript strict mode** — no `any` except at VS Code API boundaries
- **Defensive parsing** — the `.jsonl` format is undocumented; handle unknown shapes gracefully
- Keep individual files under ~400 lines; split into helpers if growing larger

## Running Tests

```bash
npm test
```

Tests use Node's built-in `assert` module with a lightweight hand-rolled runner — no test framework to install.

## Submitting a PR

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and add tests if adding new utility logic
4. Run `npm run lint && npm run compile && npm test`
5. Open a PR with a clear description

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include your OS, VS Code version, and any errors from `Help > Toggle Developer Tools`.
