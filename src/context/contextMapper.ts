import * as fs from 'fs';
import * as path from 'path';
import { findClaudeDir, listProjectDirs } from '../utils/claudeDir';
import { listSessionFiles, parseSessionMeta } from '../utils/sessionParser';
import { ContextMap, MapOptions, StackInfo } from './contextTypes';
import {
  backtrackDir, contextJsonPath, ensureDirs, ensureGitignore,
  loadEntityStore, mergeDecisions, mergeBugs, mergeConventions,
  mergeDependencies, mergeFiles, mergeTodos, mergeTimeline,
  resetStore, saveEntityStore, writeSummary,
} from './entityStore';
import { analyzeSession, buildSessionSummary } from './sessionAnalyzer';
import { generateClaudeMd } from './claudeMdBridge';

const CONTEXT_VERSION = 1;

// ── Find project sessions ─────────────────────────────────────────────────────

export interface ProjectSessionInfo {
  sessionFiles: string[];
  projectPath: string;
  projectName: string;
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

  return { sessionFiles, projectPath, projectName };
}

// ── Load or init context.json ─────────────────────────────────────────────────

function loadContextMap(projectPath: string, projectName: string): ContextMap {
  const ctxPath = contextJsonPath(projectPath);
  if (fs.existsSync(ctxPath)) {
    try {
      return JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as ContextMap;
    } catch { /* fall through */ }
  }

  return {
    version: CONTEXT_VERSION,
    project: projectName,
    projectPath,
    lastUpdated: new Date().toISOString(),
    sessionsAnalyzed: 0,
    analyzedSessions: [],
    stack: { languages: [], frontend: [], backend: [], testing: [], build: [], databases: [], other: [] },
    entryPoints: {
      decisions: path.join(backtrackDir(projectPath), 'entities', 'decisions.json'),
      files: path.join(backtrackDir(projectPath), 'entities', 'files.json'),
      bugs: path.join(backtrackDir(projectPath), 'entities', 'bugs.json'),
      conventions: path.join(backtrackDir(projectPath), 'entities', 'conventions.json'),
      dependencies: path.join(backtrackDir(projectPath), 'entities', 'dependencies.json'),
      todos: path.join(backtrackDir(projectPath), 'entities', 'todos.json'),
      timeline: path.join(backtrackDir(projectPath), 'timeline', 'events.json'),
    },
    quickContext: {
      currentFocus: '',
      recentDecisions: [],
      openIssues: [],
      lastSession: null,
    },
  };
}

// ── Merge detected stack ──────────────────────────────────────────────────────

function mergeStack(existing: StackInfo, detected: Record<string, string[]>): StackInfo {
  const merge = (arr: string[], more: string[] = []) =>
    [...new Set([...arr, ...more])];

  return {
    languages: merge(existing.languages, detected['languages']),
    frontend: merge(existing.frontend, detected['frontend']),
    backend: merge(existing.backend, detected['backend']),
    testing: merge(existing.testing, detected['testing']),
    build: merge(existing.build, detected['build']),
    databases: merge(existing.databases, detected['databases']),
    other: merge(existing.other, detected['other']),
  };
}

// ── Main mapper ───────────────────────────────────────────────────────────────

export interface MapResult {
  sessionsProcessed: number;
  sessionsSkipped: number;
  projectPath: string;
  contextJsonPath: string;
  claudeMdPath: string;
}

export async function runContextMap(
  options: MapOptions,
  onProgress?: (msg: string) => void
): Promise<MapResult> {
  const log = onProgress ?? (() => undefined);
  const { projectPath, incremental = false, reset = false } = options;

  // Find .claude dir
  const claudeDir = options.claudeDir || findClaudeDir() || '';
  if (!claudeDir) throw new Error('Could not find ~/.claude directory');

  // Find sessions for this project
  const info = await findProjectSessions(projectPath, claudeDir);
  if (!info) throw new Error(`No Claude sessions found for project: ${projectPath}`);

  // Reset if requested
  if (reset) { resetStore(projectPath); log('Reset existing context map.'); }

  ensureDirs(projectPath);
  ensureGitignore(projectPath);

  const contextMap = loadContextMap(projectPath, info.projectName);
  const store = loadEntityStore(projectPath);

  const toProcess = incremental
    ? info.sessionFiles.filter(f => {
        const id = path.basename(f, '.jsonl');
        return !contextMap.analyzedSessions.includes(id);
      })
    : info.sessionFiles;

  log(`Found ${info.sessionFiles.length} sessions, processing ${toProcess.length}...`);

  let processed = 0;
  let lastSessionMeta = null;

  for (const sessionFile of toProcess) {
    const sessionId = path.basename(sessionFile, '.jsonl');
    log(`Analyzing ${sessionId.slice(0, 8)}...`);

    try {
      const meta = await parseSessionMeta(sessionFile, projectPath);
      const result = await analyzeSession(sessionFile, sessionId, projectPath);

      // Merge into store
      store.decisions = mergeDecisions(store.decisions, result.decisions);
      store.bugs = mergeBugs(store.bugs, result.bugs);
      store.conventions = mergeConventions(store.conventions, result.conventions);
      store.dependencies = mergeDependencies(store.dependencies, result.dependencies);
      store.todos = mergeTodos(store.todos, result.todos);
      store.files = mergeFiles(store.files, result.files);
      store.timeline = mergeTimeline(store.timeline, result.timeline);

      // Merge stack hints
      contextMap.stack = mergeStack(contextMap.stack, result.detectedStack);

      // Write per-session summary
      const summary = buildSessionSummary(
        sessionId, info.projectName, result, meta?.messageCount ?? 0
      );
      writeSummary(projectPath, sessionId, summary);

      if (!contextMap.analyzedSessions.includes(sessionId)) {
        contextMap.analyzedSessions.push(sessionId);
      }

      if (!lastSessionMeta && meta) lastSessionMeta = meta;
      processed++;
    } catch (err) {
      log(`Warning: could not analyze ${sessionId.slice(0, 8)}: ${err}`);
    }
  }

  // Update quick context
  contextMap.quickContext.recentDecisions = store.decisions
    .slice(-3).map(d => d.title);
  contextMap.quickContext.openIssues = store.bugs
    .filter(b => b.status === 'open').slice(0, 3).map(b => b.title);

  if (info.sessionFiles.length > 0) {
    const latestFile = info.sessionFiles[0];
    const latestId = path.basename(latestFile, '.jsonl');
    const latestMeta = await parseSessionMeta(latestFile, projectPath);
    contextMap.quickContext.lastSession = {
      id: latestId,
      date: latestMeta
        ? new Date(latestMeta.mtime).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      summary: latestMeta?.title ?? latestId,
    };
    if (!contextMap.quickContext.currentFocus && latestMeta?.title) {
      contextMap.quickContext.currentFocus = latestMeta.title.slice(0, 100);
    }
  }

  contextMap.sessionsAnalyzed = contextMap.analyzedSessions.length;
  contextMap.lastUpdated = new Date().toISOString();

  // Save everything
  saveEntityStore(projectPath, store);
  fs.writeFileSync(contextJsonPath(projectPath), JSON.stringify(contextMap, null, 2), 'utf8');

  // Generate CLAUDE.md
  const mdContent = generateClaudeMd(contextMap, store);
  const mdPath = path.join(backtrackDir(projectPath), 'CLAUDE.md');
  fs.writeFileSync(mdPath, mdContent, 'utf8');

  log(`Done. Processed ${processed} sessions.`);

  return {
    sessionsProcessed: processed,
    sessionsSkipped: toProcess.length === 0 ? info.sessionFiles.length : 0,
    projectPath,
    contextJsonPath: contextJsonPath(projectPath),
    claudeMdPath: mdPath,
  };
}

// ── Export as single markdown ─────────────────────────────────────────────────

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

  if (ctx?.quickContext.currentFocus) {
    lines.push(`## Current Focus\n${ctx.quickContext.currentFocus}\n`);
  }

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
    for (const t of store.todos.filter(t => t.status === 'open')) {
      lines.push(`- [${t.priority}] ${t.title}`);
    }
    lines.push('');
  }

  if (store.conventions.length) {
    lines.push('## Conventions');
    for (const c of store.conventions) lines.push(`- ${c.rule}`);
    lines.push('');
  }

  if (store.timeline.length) {
    lines.push('## Timeline');
    for (const e of store.timeline) lines.push(`- ${e.date} — ${e.title}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Status summary ─────────────────────────────────────────────────────────────

export function getMapStatus(projectPath: string): string {
  const ctxPath = contextJsonPath(projectPath);
  if (!fs.existsSync(ctxPath)) return 'No context map found. Run: backtrack map';

  try {
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as ContextMap;
    const store = loadEntityStore(projectPath);
    return [
      `Project: ${ctx.project}`,
      `Last updated: ${ctx.lastUpdated.slice(0, 10)}`,
      `Sessions analyzed: ${ctx.sessionsAnalyzed}`,
      `Decisions: ${store.decisions.length}`,
      `Bugs: ${store.bugs.length} (${store.bugs.filter(b => b.status === 'open').length} open)`,
      `TODOs: ${store.todos.filter(t => t.status === 'open').length} open`,
      `Conventions: ${store.conventions.length}`,
      `Files mapped: ${Object.keys(store.files).length}`,
    ].join('\n');
  } catch {
    return 'Context map exists but could not be read.';
  }
}
