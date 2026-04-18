import * as vscode from 'vscode';
import { ParsedMessage, SessionMeta } from '../types';
import { parseFullMessages } from '../utils/sessionParser';
import { formatDate, formatBytes, escapeHtml, truncate } from '../utils/formatters';
import { exportToMarkdown, suggestedFilename } from '../utils/exporter';

const PAGE_SIZE = 100;

export class SessionWebviewPanel {
  private static panels = new Map<string, SessionWebviewPanel>();

  private readonly panel: vscode.WebviewPanel;
  private messages: ParsedMessage[] = [];
  private pageOffset = 0;

  private constructor(
    private readonly meta: SessionMeta,
    private readonly _context: vscode.ExtensionContext
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'backtrack.session',
      truncate(meta.title, 40),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._context.extensionUri, 'media'),
        ],
      }
    );

    this.panel.onDidDispose(() => {
      SessionWebviewPanel.panels.delete(meta.id);
    });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'loadMore':
          this.pageOffset += PAGE_SIZE;
          this.panel.webview.postMessage({
            command: 'appendMessages',
            html: this.renderMessages(this.messages, this.pageOffset, PAGE_SIZE),
            hasMore: this.pageOffset + PAGE_SIZE < this.messages.length,
          });
          break;
        case 'resume':
          vscode.commands.executeCommand('backtrack.resumeSession', { session: meta });
          break;
        case 'copyId':
          vscode.env.clipboard.writeText(meta.id);
          vscode.window.showInformationMessage(`Copied session ID: ${meta.id}`);
          break;
        case 'export':
          await this.doExport();
          break;
      }
    });
  }

  static async show(meta: SessionMeta, context: vscode.ExtensionContext): Promise<void> {
    const existing = SessionWebviewPanel.panels.get(meta.id);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const instance = new SessionWebviewPanel(meta, context);
    SessionWebviewPanel.panels.set(meta.id, instance);

    // Show loading state immediately
    instance.panel.webview.html = instance.buildLoadingHtml();

    // Parse messages then render
    try {
      instance.messages = await parseFullMessages(meta.filePath);
    } catch (err) {
      instance.panel.webview.html = instance.buildErrorHtml(String(err));
      return;
    }

    instance.pageOffset = 0;
    instance.panel.webview.html = instance.buildHtml();
  }

  private async doExport(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedFilename(this.meta)),
      filters: { Markdown: ['md'] },
    });
    if (!uri) return;
    const content = exportToMarkdown(this.meta, this.messages);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
  }

  private buildLoadingHtml(): string {
    return `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
      <p>Loading session…</p></body></html>`;
  }

  private buildErrorHtml(err: string): string {
    return `<!DOCTYPE html><html><body style="padding:1rem;font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
      <h2>Error loading session</h2><pre>${escapeHtml(err)}</pre></body></html>`;
  }

  private renderMessages(messages: ParsedMessage[], offset: number, count: number): string {
    const slice = messages.slice(offset, offset + count);
    return slice.map((msg) => this.renderMessage(msg)).join('');
  }

  private renderMessage(msg: ParsedMessage): string {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? '🧑 You' : '🤖 Claude';
    const blocks = msg.content.map((b) => {
      if (b.kind === 'text') {
        return `<div class="text-block">${renderMarkdownLike(b.text)}</div>`;
      }
      if (b.kind === 'thinking') {
        return `<details class="thinking-block"><summary>💭 Thinking</summary><div class="thinking-content">${escapeHtml(b.text)}</div></details>`;
      }
      if (b.kind === 'tool_use') {
        const input = b.inputSummary
          ? `<pre class="tool-input">${escapeHtml(b.inputSummary)}</pre>`
          : '';
        return `<details class="tool-block"><summary>🔧 <code>${escapeHtml(b.name)}</code></summary>${input}</details>`;
      }
      if (b.kind === 'tool_result') {
        return b.outputSummary
          ? `<details class="tool-result-block"><summary>📄 Tool Result</summary><pre>${escapeHtml(b.outputSummary)}</pre></details>`
          : '';
      }
      return '';
    }).join('');

    return `<div class="message ${isUser ? 'user' : 'assistant'}">
      <div class="role-label">${roleLabel}</div>
      <div class="message-body">${blocks}</div>
    </div>`;
  }

  private buildHtml(): string {
    const hasMore = this.messages.length > PAGE_SIZE;
    const initialHtml = this.renderMessages(this.messages, 0, PAGE_SIZE);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(this.meta.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 0;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-editorGroup-border);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-title {
      font-weight: 600;
      font-size: 1.1em;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .header-actions { display: flex; gap: 6px; }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 0.85em;
      font-family: var(--vscode-font-family);
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .messages { padding: 16px; max-width: 860px; margin: 0 auto; }
    .message { margin-bottom: 20px; padding: 12px 14px; border-radius: 6px; border-left: 3px solid transparent; }
    .message.user {
      background: var(--vscode-inputOption-activeBackground, rgba(0,122,204,0.08));
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .message.assistant {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.04));
      border-color: var(--vscode-editorGroup-border);
    }
    .role-label {
      font-size: 0.75em;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .text-block { white-space: pre-wrap; word-break: break-word; line-height: 1.6; }
    .text-block code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-editorGroup-border);
      border-radius: 4px;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      margin: 8px 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    details { margin: 6px 0; }
    summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      padding: 3px 0;
      user-select: none;
    }
    summary:hover { color: var(--vscode-foreground); }
    .thinking-content, .tool-input {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.88em;
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
    }
    .load-more-container { text-align: center; padding: 20px; }
    #loading-indicator { display: none; color: var(--vscode-descriptionForeground); padding: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="sticky-header">
    <div class="header-title" title="${escapeHtml(this.meta.title)}">${escapeHtml(this.meta.title)}</div>
    <div class="header-meta">
      ${escapeHtml(this.meta.projectName)} ·
      ${this.meta.messageCount} messages ·
      ${formatDate(this.meta.mtime)} ·
      ${formatBytes(this.meta.size)}
    </div>
    <div class="header-actions">
      <button class="btn" onclick="vscode.postMessage({command:'resume'})">▶ Resume</button>
      <button class="btn secondary" onclick="vscode.postMessage({command:'copyId'})">Copy ID</button>
      <button class="btn secondary" onclick="vscode.postMessage({command:'export'})">Export MD</button>
    </div>
  </div>

  <div class="messages" id="messages-container">
    ${initialHtml}
    ${hasMore ? `<div class="load-more-container"><button class="btn secondary" id="load-more-btn" onclick="loadMore()">Load more messages (${this.messages.length - PAGE_SIZE} remaining)</button></div>` : ''}
    <div id="loading-indicator">Loading…</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let remaining = ${Math.max(0, this.messages.length - PAGE_SIZE)};

    function loadMore() {
      document.getElementById('load-more-btn').style.display = 'none';
      document.getElementById('loading-indicator').style.display = 'block';
      vscode.postMessage({ command: 'loadMore' });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'appendMessages') {
        const container = document.getElementById('messages-container');
        const loadMore = container.querySelector('.load-more-container');
        const indicator = document.getElementById('loading-indicator');
        const div = document.createElement('div');
        div.innerHTML = msg.html;
        container.insertBefore(div, loadMore);
        indicator.style.display = 'none';
        if (msg.hasMore) {
          remaining = remaining - ${PAGE_SIZE};
          const btn = document.getElementById('load-more-btn');
          if (btn) { btn.style.display = ''; btn.textContent = 'Load more messages (' + remaining + ' remaining)'; }
        } else {
          if (loadMore) loadMore.remove();
        }
      }
    });

    // Keyboard shortcut: Escape closes the panel (handled by VS Code natively)
  </script>
</body>
</html>`;
  }
}

/** Very basic markdown-like renderer for text blocks (handles code fences and inline code). */
function renderMarkdownLike(text: string): string {
  // Code fences
  const fenced = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code
  const inlined = fenced.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

  // Escape remaining HTML outside of tags
  const lines = inlined.split('\n');
  const rendered = lines.map((line) => {
    // Don't double-escape lines already containing HTML tags
    if (/<[a-z]/i.test(line)) return line;
    return escapeHtml(line);
  });

  return rendered.join('\n');
}
