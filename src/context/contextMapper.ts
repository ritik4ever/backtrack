import * as fs from 'fs';
import * as path from 'path';
import { findClaudeDir, listProjectDirs } from '../utils/claudeDir';
import { listSessionFiles, parseSessionMeta } from '../utils/sessionParser';
import { ContextMap, DiffResult, MapOptions, StackInfo } from './contextTypes';
import {
  backtrackDir, computeDiff, contextJsonPath, ensureDirs, ensureGitignore,
  formatDiff, loadEntityStore, mergeDecisions, mergeBugs, mergeConventions,
  mergeDependencies, mergeFiles, mergePeople, mergeTodos, mergeTimeline,
  resetStore, saveEntityStore, takeSnapshot, writeSummary,
} from './entityStore';
import { analyzeSession, buildSessionSummary } from './sessionAnalyzer';
import { generateClaudeMd } from './claudeMdBridge';

const CONTEXT_VERSION = 1;

// ── Find project sessions ─────────────────────────────────────────────────────

export interface ProjectSessionInfo {
  sessionFiles: string[];
  projectPath: string;
  projectName: string;
  encodedName: string;
}

export async function findProjectSessions(
  projectPath: string,
  claudeDir: string
): Promise<ProjectSessionInfo | null> {
  const projects = listProjectDirs(claudeDir);
  const normalized = projectPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');

  const match = projects.find(p => {
    const dec = p.decoded.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    return dec === normalized || dec.endsWith('/' + path.basename(normalized));
  });

  if (!match) return null;

  const projectDir = path.join(claudeDir, 'projects', match.encoded);
  const sessionFiles = listSessionFiles(projectDir);
  const projectName = path.basename(projectPath);

  return { sessionFiles, projectPath, projectName, encodedName: match.encoded };
}

// ── Load or init context.json ─────────────────────────────────────────────────

function initContextMap(projectPath: string, projectName: string): ContextMap {
  const bd = backtrackDir(projectPath);
  return {
    version: CONTEXT_VERSION,
    project: projectName,
    projectPath,
    lastUpdated: new Date().toISOString(),
    sessionsAnalyzed: 0,
    analyzedSessions: [],
    stack: { languages: [], frontend: [], backend: [], testing: [], build: [], databases: [], other: [] },
    entryPoints: {
      decisions:   path.join(bd, 'entities', 'decisions.json'),
      files:       path.join(bd, 'entities', 'files.json'),
      bugs:        path.join(bd, 'entities', 'bugs.json'),
      conventions: path.join(bd, 'entities', 'conventions.json'),
      dependencies:path.join(bd, 'entities', 'dependencies.json'),
      todos:       path.join(bd, 'entities', 'todos.json'),
      people:      path.join(bd, 'entities', 'people.json'),
      timeline:    path.join(bd, 'timeline', 'events.json'),
    },
    quickContext: { currentFocus: '', recentDecisions: [], openIssues: [], lastSession: null },
  };
}

function loadOrInitContextMap(projectPath: string, projectName: string): ContextMap {
  const ctxPath = contextJsonPath(projectPath);
  if (fs.existsSync(ctxPath)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as ContextMap;
      // Ensure people entryPoint exists on old maps
      if (!ctx.entryPoints.people) {
        ctx.entryPoints.people = path.join(backtrackDir(projectPath), 'entities', 'people.json');
      }
      return ctx;
    } catch { /* fall through */ }
  }
  return initContextMap(projectPath, projectName);
}

// ── Merge detected stack ──────────────────────────────────────────────────────

function mergeStack(existing: StackInfo, detected: Record<string, string[]>): StackInfo {
  const merge = (arr: string[], more: string[] = []) => [...new Set([...arr, ...more])];
  return {
    languages: merge(existing.languages, detected['languages']),
    frontend:  merge(existing.frontend,  detected['frontend']),
    backend:   merge(existing.backend,   detected['backend']),
    testing:   merge(existing.testing,   detected['testing']),
    build:     merge(existing.build,     detected['build']),
    databases: merge(existing.databases, detected['databases']),
    other:     merge(existing.other,     detected['other']),
  };
}

// ── Main mapper ───────────────────────────────────────────────────────────────

export interface MapResult {
  sessionsProcessed: number;
  sessionsSkipped: number;
  projectPath: string;
  contextJsonPath: string;
  claudeMdPath: string;
  diff?: DiffResult;
}

export async function runContextMap(
  options: MapOptions,
  onProgress?: (msg: string) => void
): Promise<MapResult> {
  const log = onProgress ?? (() => undefined);
  const { projectPath, incremental = false, reset = false } = options;

  const claudeDir = options.claudeDir || findClaudeDir() || '';
  if (!claudeDir) throw new Error('Could not find ~/.claude directory');

  const info = await findProjectSessions(projectPath, claudeDir);
  if (!info) throw new Error(`No Claude sessions found for project: ${projectPath}`);

  if (reset) { resetStore(projectPath); log('Reset existing context map.'); }

  ensureDirs(projectPath);
  ensureGitignore(projectPath);

  const contextMap = loadOrInitContextMap(projectPath, info.projectName);
  const store = loadEntityStore(projectPath);

  // Take snapshot before processing for diff
  const prevSnapshot = takeSnapshot(store);
  const prevSessionCount = contextMap.analyzedSessions.length;

  const toProcess = incremental
    ? info.sessionFiles.filter(f => !contextMap.analyzedSessions.includes(path.basename(f, '.jsonl')))
    : info.sessionFiles;

  log(`Found ${info.sessionFiles.length} sessions, processing ${toProcess.length}...`);

  let processed = 0;

  for (const sessionFile of toProcess) {
    const sessionId = path.basename(sessionFile, '.jsonl');
    log(`Analyzing ${sessionId.slice(0, 8)}...`);
    try {
      const meta = await parseSessionMeta(sessionFile, projectPath);
      const result = await analyzeSession(sessionFile, sessionId, projectPath);

      store.decisions    = mergeDecisions(store.decisions, result.decisions);
      store.bugs         = mergeBugs(store.bugs, result.bugs);
      store.conventions  = mergeConventions(store.conventions, result.conventions);
      store.dependencies = mergeDependencies(store.dependencies, result.dependencies);
      store.todos        = mergeTodos(store.todos, result.todos);
      store.people       = mergePeople(store.people, result.people);
      store.files        = mergeFiles(store.files, result.files);
      store.timeline     = mergeTimeline(store.timeline, result.timeline);
      contextMap.stack   = mergeStack(contextMap.stack, result.detectedStack);

      writeSummary(projectPath, sessionId, buildSessionSummary(
        sessionId, info.projectName, result, meta?.messageCount ?? 0
      ));

      if (!contextMap.analyzedSessions.includes(sessionId)) {
        contextMap.analyzedSessions.push(sessionId);
      }
      processed++;
    } catch (err) {
      log(`Warning: could not analyze ${sessionId.slice(0, 8)}: ${err}`);
    }
  }

  contextMap.quickContext.recentDecisions = store.decisions.slice(-3).map(d => d.title);
  contextMap.quickContext.openIssues = store.bugs.filter(b => b.status === 'open').slice(0, 3).map(b => b.title);

  if (info.sessionFiles.length > 0) {
    const latestFile = info.sessionFiles[0];
    const latestId = path.basename(latestFile, '.jsonl');
    const latestMeta = await parseSessionMeta(latestFile, projectPath);
    contextMap.quickContext.lastSession = {
      id: latestId,
      date: latestMeta ? new Date(latestMeta.mtime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      summary: latestMeta?.title ?? latestId,
    };
    if (!contextMap.quickContext.currentFocus && latestMeta?.title) {
      contextMap.quickContext.currentFocus = latestMeta.title.slice(0, 100);
    }
  }

  contextMap.sessionsAnalyzed = contextMap.analyzedSessions.length;
  contextMap.lastUpdated = new Date().toISOString();
  contextMap.snapshot = takeSnapshot(store);

  saveEntityStore(projectPath, store);
  fs.writeFileSync(contextJsonPath(projectPath), JSON.stringify(contextMap, null, 2), 'utf8');

  const mdContent = generateClaudeMd(contextMap, store);
  const mdPath = path.join(backtrackDir(projectPath), 'CLAUDE.md');
  fs.writeFileSync(mdPath, mdContent, 'utf8');

  const currSnapshot = takeSnapshot(store);
  const diff = computeDiff(prevSnapshot, currSnapshot, contextMap.analyzedSessions.length - prevSessionCount);

  log(`Done. Processed ${processed} sessions.`);

  return { sessionsProcessed: processed, sessionsSkipped: 0, projectPath, contextJsonPath: contextJsonPath(projectPath), claudeMdPath: mdPath, diff };
}

// ── Diff ──────────────────────────────────────────────────────────────────────

export function diffContextMap(projectPath: string): string {
  const ctxPath = contextJsonPath(projectPath);
  if (!fs.existsSync(ctxPath)) return 'No context map found. Run: backtrack map';
  try {
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as ContextMap;
    if (!ctx.snapshot) return 'No snapshot available. Run: backtrack map to create one.';
    const store = loadEntityStore(projectPath);
    const curr = takeSnapshot(store);
    const diff = computeDiff(ctx.snapshot, curr, 0);
    return formatDiff(diff);
  } catch {
    return 'Could not read context map.';
  }
}

// ── Watch mode ────────────────────────────────────────────────────────────────

export function watchContextMap(
  projectPath: string,
  claudeDir: string,
  onUpdate: (msg: string) => void
): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const watchers: fs.FSWatcher[] = [];

  async function runIncremental() {
    onUpdate('New session detected — running incremental map...');
    try {
      const result = await runContextMap({ projectPath, claudeDir, incremental: true });
      onUpdate(`Updated: ${result.sessionsProcessed} new session(s) processed.`);
      if (result.diff) onUpdate(formatDiff(result.diff));
    } catch (err) {
      onUpdate(`Watch error: ${err}`);
    }
  }

  function scheduleUpdate() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(runIncremental, 3000);
  }

  // Find sessions dir for this project and watch it
  findProjectSessions(projectPath, claudeDir).then(info => {
    if (!info) { onUpdate('Watch: project not found in Claude sessions.'); return; }

    const sessionDir = path.join(claudeDir, 'projects', info.encodedName);
    try {
      const watcher = fs.watch(sessionDir, (_event, filename) => {
        if (filename && filename.endsWith('.jsonl')) scheduleUpdate();
      });
      watchers.push(watcher);
      onUpdate(`Watching ${sessionDir} for new sessions...`);
    } catch {
      // Fallback: poll every 30 seconds
      const interval = setInterval(scheduleUpdate, 30000);
      onUpdate('Polling for new sessions every 30s (fs.watch unavailable)...');
      return () => clearInterval(interval);
    }
  }).catch(err => onUpdate(`Watch setup error: ${err}`));

  return () => {
    if (debounce) clearTimeout(debounce);
    watchers.forEach(w => w.close());
  };
}

// ── Export as markdown ────────────────────────────────────────────────────────

export function exportContextAsMarkdown(projectPath: string): string {
  const store = loadEntityStore(projectPath);
  const ctxPath = contextJsonPath(projectPath);
  let ctx: ContextMap | null = null;
  try { ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')); } catch { /* ok */ }

  const lines: string[] = [
    `# Project Context Map — ${ctx?.project ?? path.basename(projectPath)}`,
    `*Generated by Backtrack on ${new Date().toISOString().slice(0, 10)}*`,
    '',
  ];

  if (ctx?.quickContext.currentFocus) lines.push(`## Current Focus\n${ctx.quickContext.currentFocus}\n`);

  if (store.decisions.length) {
    lines.push('## Decisions');
    for (const d of store.decisions) {
      lines.push(`### ${d.title}`);
      if (d.description !== d.title) lines.push(d.description);
      if (d.reason) lines.push(`**Reason:** ${d.reason}`);
      lines.push('');
    }
  }

  if (store.bugs.length) {
    lines.push('## Bugs & Issues');
    for (const b of store.bugs) {
      lines.push(`- [${b.status.toUpperCase()}] **${b.title}**`);
      if (b.fix) lines.push(`  Fix: ${b.fix}`);
    }
    lines.push('');
  }

  if (store.todos.filter(t => t.status === 'open').length) {
    lines.push('## Open TODOs');
    for (const t of store.todos.filter(t => t.status === 'open')) lines.push(`- [${t.priority}] ${t.title}`);
    lines.push('');
  }

  if (store.conventions.length) {
    lines.push('## Conventions');
    for (const c of store.conventions) lines.push(`- ${c.rule}`);
    lines.push('');
  }

  if (store.people.length) {
    lines.push('## People');
    for (const p of store.people) lines.push(`- **${p.name}**${p.role ? ` (${p.role})` : ''}`);
    lines.push('');
  }

  if (store.timeline.length) {
    lines.push('## Timeline');
    for (const e of store.timeline) lines.push(`- ${e.date} — ${e.title}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getMapStatus(projectPath: string): string {
  const ctxPath = contextJsonPath(projectPath);
  if (!fs.existsSync(ctxPath)) return 'No context map found. Run: backtrack map';
  try {
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as ContextMap;
    const store = loadEntityStore(projectPath);
    return [
      `Project:           ${ctx.project}`,
      `Last updated:      ${ctx.lastUpdated.slice(0, 10)}`,
      `Sessions analyzed: ${ctx.sessionsAnalyzed}`,
      `Decisions:         ${store.decisions.length}`,
      `Bugs:              ${store.bugs.length} (${store.bugs.filter(b => b.status === 'open').length} open)`,
      `TODOs:             ${store.todos.filter(t => t.status === 'open').length} open`,
      `Conventions:       ${store.conventions.length}`,
      `People:            ${store.people.length}`,
      `Files mapped:      ${Object.keys(store.files).length}`,
    ].join('\n');
  } catch {
    return 'Context map exists but could not be read.';
  }
}
