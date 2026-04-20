import * as vscode from 'vscode';
import * as path from 'path';
import { loadEntityStore } from '../context/entityStore';
import { contextJsonPath } from '../context/entityStore';
import { ContextMap, EntityStore } from '../context/contextTypes';
import * as fs from 'fs';

export class ContextMapWebviewPanel {
  static readonly viewType = 'backtrack.contextMap';
  private static panel: vscode.WebviewPanel | undefined;

  static show(projectPath: string, context: vscode.ExtensionContext): void {
    if (ContextMapWebviewPanel.panel) {
      ContextMapWebviewPanel.panel.reveal();
      ContextMapWebviewPanel.panel.webview.html = ContextMapWebviewPanel.buildHtml(projectPath);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ContextMapWebviewPanel.viewType,
      'Context Map',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = ContextMapWebviewPanel.buildHtml(projectPath);
    panel.onDidDispose(() => { ContextMapWebviewPanel.panel = undefined; }, null, context.subscriptions);
    ContextMapWebviewPanel.panel = panel;
  }

  private static buildHtml(projectPath: string): string {
    const store = loadEntityStore(projectPath);
    const ctxPath = contextJsonPath(projectPath);
    let ctx: ContextMap | null = null;
    try { ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')); } catch { /* ok */ }

    const projectName = ctx?.project ?? path.basename(projectPath);
    const lastUpdated = ctx?.lastUpdated?.slice(0, 10) ?? '—';
    const sessionsAnalyzed = ctx?.sessionsAnalyzed ?? 0;

    const stack = ctx?.stack;
    const stackItems = stack ? [
      ...stack.languages, ...stack.frontend, ...stack.backend,
      ...stack.databases, ...stack.testing, ...stack.build,
    ].filter(Boolean) : [];

    const openBugs = store.bugs.filter(b => b.status === 'open');
    const fixedBugs = store.bugs.filter(b => b.status === 'fixed');
    const openTodos = store.todos.filter(t => t.status === 'open');
    const highTodos = openTodos.filter(t => t.priority === 'high');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Context Map — ${projectName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 13px;
    background: var(--vscode-editor-background, #1e1e2e);
    color: var(--vscode-editor-foreground, #cdd6f4);
    padding: 20px;
    line-height: 1.5;
  }
  h1 { font-size: 20px; font-weight: 700; color: var(--vscode-textLink-foreground, #89dceb); margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground, #a6adc8); font-size: 11px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card {
    background: var(--vscode-sideBar-background, #181825);
    border: 1px solid var(--vscode-panel-border, #313244);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .card h2 {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-textLink-foreground, #89dceb);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .card h2 .count {
    background: var(--vscode-badge-background, #313244);
    color: var(--vscode-badge-foreground, #cdd6f4);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: 600;
  }
  .item { padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border, #313244); font-size: 12px; }
  .item:last-child { border-bottom: none; }
  .item .title { font-weight: 500; }
  .item .sub { color: var(--vscode-descriptionForeground, #a6adc8); font-size: 11px; margin-top: 2px; }
  .badge {
    display: inline-block; border-radius: 4px; padding: 1px 6px;
    font-size: 10px; font-weight: 600; margin-right: 4px;
  }
  .badge-open   { background: #f38ba830; color: #f38ba8; }
  .badge-fixed  { background: #a6e3a130; color: #a6e3a1; }
  .badge-high   { background: #fab38730; color: #fab387; }
  .badge-medium { background: #f9e2af30; color: #f9e2af; }
  .badge-low    { background: #89dceb30; color: #89dceb; }
  .badge-active { background: #a6e3a130; color: #a6e3a1; }
  .tag {
    display: inline-block; background: var(--vscode-badge-background, #313244);
    color: var(--vscode-badge-foreground, #cdd6f4);
    border-radius: 4px; padding: 2px 8px; font-size: 11px; margin: 2px;
  }
  .stat-row { display: flex; justify-content: space-between; padding: 5px 0; }
  .stat-row .label { color: var(--vscode-descriptionForeground, #a6adc8); }
  .stat-row .value { font-weight: 600; }
  .empty { color: var(--vscode-descriptionForeground, #6c7086); font-style: italic; font-size: 11px; padding: 6px 0; }
  .timeline-line { display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border, #313244); }
  .timeline-line:last-child { border-bottom: none; }
  .tl-date { color: var(--vscode-descriptionForeground, #a6adc8); font-size: 11px; min-width: 75px; padding-top: 1px; }
  .focus-card {
    background: var(--vscode-textLink-foreground, #89dceb)18;
    border: 1px solid var(--vscode-textLink-foreground, #89dceb)44;
    border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;
  }
  .focus-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-textLink-foreground, #89dceb); margin-bottom: 4px; }
  .focus-card .text { font-size: 13px; font-weight: 500; }
  .wide { grid-column: span 2; }
  @media (max-width: 600px) { .wide { grid-column: span 1; } }
</style>
</head>
<body>
<h1>⚡ ${escHtml(projectName)}</h1>
<div class="meta">
  ${sessionsAnalyzed} sessions analyzed &nbsp;·&nbsp; Last updated: ${lastUpdated} &nbsp;·&nbsp;
  ${store.decisions.length} decisions &nbsp;·&nbsp;
  ${store.bugs.length} bugs &nbsp;·&nbsp;
  ${openTodos.length} open todos &nbsp;·&nbsp;
  ${store.people.length} people
</div>

${ctx?.quickContext.currentFocus ? `
<div class="focus-card">
  <div class="label">Current Focus</div>
  <div class="text">${escHtml(ctx.quickContext.currentFocus)}</div>
</div>` : ''}

<div class="grid">

<!-- Stats -->
<div class="card">
  <h2>📊 Overview</h2>
  ${statRow('Sessions analyzed', sessionsAnalyzed)}
  ${statRow('Decisions', store.decisions.length)}
  ${statRow('Bugs (open / total)', `${openBugs.length} / ${store.bugs.length}`)}
  ${statRow('TODOs (open / total)', `${openTodos.length} / ${store.todos.length}`)}
  ${statRow('Conventions', store.conventions.length)}
  ${statRow('People', store.people.length)}
  ${statRow('Files mapped', Object.keys(store.files).length)}
  ${statRow('Dependencies', store.dependencies.length)}
</div>

<!-- Stack -->
<div class="card">
  <h2>🛠 Stack <span class="count">${stackItems.length}</span></h2>
  ${stackItems.length
    ? stackItems.map(s => `<span class="tag">${escHtml(s)}</span>`).join('')
    : '<div class="empty">No stack detected yet</div>'}
</div>

<!-- Decisions -->
<div class="card wide">
  <h2>🧭 Key Decisions <span class="count">${store.decisions.length}</span></h2>
  ${store.decisions.length === 0 ? '<div class="empty">No decisions recorded yet</div>' :
    store.decisions.slice(-8).reverse().map(d => `
    <div class="item">
      <div class="title">
        <span class="badge badge-${d.status}">${d.status}</span>
        ${escHtml(d.title)}
      </div>
      ${d.reason ? `<div class="sub">${escHtml(d.reason.slice(0, 100))}</div>` : ''}
      <div class="sub">Session: ${d.sessionId.slice(0, 8)} &nbsp;·&nbsp; ${d.date}</div>
    </div>`).join('')}
</div>

<!-- Bugs -->
<div class="card">
  <h2>🐛 Bugs <span class="count">${store.bugs.length}</span></h2>
  ${store.bugs.length === 0 ? '<div class="empty">No bugs recorded</div>' :
    store.bugs.slice(0, 8).map(b => `
    <div class="item">
      <div class="title"><span class="badge badge-${b.status}">${b.status}</span>${escHtml(b.title.slice(0, 60))}</div>
      ${b.fix ? `<div class="sub">Fix: ${escHtml(b.fix.slice(0, 80))}</div>` : ''}
    </div>`).join('')}
  ${openBugs.length === 0 && fixedBugs.length > 0 ? '<div class="sub" style="margin-top:8px;color:#a6e3a1">All bugs resolved ✓</div>' : ''}
</div>

<!-- TODOs -->
<div class="card">
  <h2>✅ TODOs <span class="count">${openTodos.length} open</span></h2>
  ${openTodos.length === 0 ? '<div class="empty">No open TODOs</div>' :
    [...highTodos, ...openTodos.filter(t => t.priority !== 'high')].slice(0, 8).map(t => `
    <div class="item">
      <div class="title">
        <span class="badge badge-${t.priority}">${t.priority}</span>
        ${escHtml(t.title.slice(0, 70))}
      </div>
    </div>`).join('')}
</div>

<!-- Conventions -->
<div class="card">
  <h2>📐 Conventions <span class="count">${store.conventions.length}</span></h2>
  ${store.conventions.length === 0 ? '<div class="empty">No conventions recorded</div>' :
    store.conventions.slice(0, 8).map(c => `
    <div class="item">
      <div class="title">${escHtml(c.rule.slice(0, 80))}</div>
      ${c.reason ? `<div class="sub">${escHtml(c.reason.slice(0, 60))}</div>` : ''}
    </div>`).join('')}
</div>

<!-- People -->
<div class="card">
  <h2>👥 People <span class="count">${store.people.length}</span></h2>
  ${store.people.length === 0 ? '<div class="empty">No people detected yet</div>' :
    store.people.map(p => `
    <div class="item">
      <div class="title">${escHtml(p.name)}${p.role ? ` <span style="color:var(--vscode-descriptionForeground)">· ${escHtml(p.role)}</span>` : ''}</div>
      <div class="sub">${p.sessionIds.length} session${p.sessionIds.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Last: ${p.lastMentioned}</div>
    </div>`).join('')}
</div>

<!-- Dependencies -->
<div class="card">
  <h2>📦 Dependencies <span class="count">${store.dependencies.length}</span></h2>
  ${store.dependencies.length === 0 ? '<div class="empty">No dependencies detected</div>' :
    store.dependencies.slice(0, 10).map(d => `
    <div class="item">
      <div class="title">${escHtml(d.name)}${d.version ? ` <span style="color:var(--vscode-descriptionForeground)">${escHtml(d.version)}</span>` : ''}</div>
      ${d.purpose ? `<div class="sub">${escHtml(d.purpose.slice(0, 60))}</div>` : ''}
    </div>`).join('')}
</div>

<!-- Timeline -->
<div class="card wide">
  <h2>📅 Timeline <span class="count">${store.timeline.length}</span></h2>
  ${store.timeline.length === 0 ? '<div class="empty">No timeline events yet</div>' :
    store.timeline.slice().reverse().slice(0, 12).map(e => `
    <div class="timeline-line">
      <div class="tl-date">${e.date}</div>
      <div>
        <span class="tag">${e.type}</span>
        ${escHtml(e.title)}
      </div>
    </div>`).join('')}
</div>

</div>
</body>
</html>`;
  }
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statRow(label: string, value: string | number): string {
  return `<div class="stat-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}
