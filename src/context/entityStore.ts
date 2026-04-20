import * as fs from 'fs';
import * as path from 'path';
import {
  Bug, Convention, ContextMap, ContextSnapshot, Decision, Dependency,
  DiffResult, EntityStore, FileContext, Person, TimelineEvent, TodoItem,
} from './contextTypes';

export const BACKTRACK_DIR = '.backtrack';

export function backtrackDir(projectPath: string): string {
  return path.join(projectPath, BACKTRACK_DIR);
}

function entityPath(projectPath: string, name: string): string {
  return path.join(backtrackDir(projectPath), 'entities', name);
}

function timelinePath(projectPath: string): string {
  return path.join(backtrackDir(projectPath), 'timeline', 'events.json');
}

export function contextJsonPath(projectPath: string): string {
  return path.join(backtrackDir(projectPath), 'context.json');
}

export function claudeMdPath(projectPath: string): string {
  return path.join(backtrackDir(projectPath), 'CLAUDE.md');
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureDirs(projectPath: string): void {
  const base = backtrackDir(projectPath);
  fs.mkdirSync(path.join(base, 'entities'), { recursive: true });
  fs.mkdirSync(path.join(base, 'timeline'), { recursive: true });
  fs.mkdirSync(path.join(base, 'sessions', 'summaries'), { recursive: true });
}

export function loadEntityStore(projectPath: string): EntityStore {
  return {
    decisions: readJson<Decision[]>(entityPath(projectPath, 'decisions.json'), []),
    files: readJson<Record<string, FileContext>>(entityPath(projectPath, 'files.json'), {}),
    bugs: readJson<Bug[]>(entityPath(projectPath, 'bugs.json'), []),
    conventions: readJson<Convention[]>(entityPath(projectPath, 'conventions.json'), []),
    dependencies: readJson<Dependency[]>(entityPath(projectPath, 'dependencies.json'), []),
    todos: readJson<TodoItem[]>(entityPath(projectPath, 'todos.json'), []),
    people: readJson<Person[]>(entityPath(projectPath, 'people.json'), []),
    timeline: readJson<TimelineEvent[]>(timelinePath(projectPath), []),
  };
}

export function saveEntityStore(projectPath: string, store: EntityStore): void {
  writeJson(entityPath(projectPath, 'decisions.json'), store.decisions);
  writeJson(entityPath(projectPath, 'files.json'), store.files);
  writeJson(entityPath(projectPath, 'bugs.json'), store.bugs);
  writeJson(entityPath(projectPath, 'conventions.json'), store.conventions);
  writeJson(entityPath(projectPath, 'dependencies.json'), store.dependencies);
  writeJson(entityPath(projectPath, 'todos.json'), store.todos);
  writeJson(entityPath(projectPath, 'people.json'), store.people);
  writeJson(timelinePath(projectPath), store.timeline);
}

// ── Snapshot & Diff ───────────────────────────────────────────────────────────

export function takeSnapshot(store: EntityStore): ContextSnapshot {
  return {
    decisionsCount: store.decisions.length,
    bugsCount: store.bugs.length,
    openBugsCount: store.bugs.filter(b => b.status === 'open').length,
    todosCount: store.todos.length,
    openTodosCount: store.todos.filter(t => t.status === 'open').length,
    conventionsCount: store.conventions.length,
    filesCount: Object.keys(store.files).length,
    dependenciesCount: store.dependencies.length,
    peopleCount: store.people.length,
    timelineCount: store.timeline.length,
    takenAt: new Date().toISOString(),
  };
}

export function computeDiff(prev: ContextSnapshot, curr: ContextSnapshot, sessionsAdded: number): DiffResult {
  return {
    decisions: { added: Math.max(0, curr.decisionsCount - prev.decisionsCount), removed: 0 },
    bugs: {
      added: Math.max(0, curr.bugsCount - prev.bugsCount),
      fixed: Math.max(0, prev.openBugsCount - curr.openBugsCount),
    },
    todos: {
      added: Math.max(0, curr.todosCount - prev.todosCount),
      completed: Math.max(0, prev.openTodosCount - curr.openTodosCount),
    },
    conventions: { added: Math.max(0, curr.conventionsCount - prev.conventionsCount) },
    files: { added: Math.max(0, curr.filesCount - prev.filesCount) },
    people: { added: Math.max(0, curr.peopleCount - prev.peopleCount) },
    timeline: { added: Math.max(0, curr.timelineCount - prev.timelineCount) },
    sessionsAdded,
  };
}

export function formatDiff(diff: DiffResult): string {
  const lines: string[] = ['Context map diff since last run:\n'];
  if (diff.sessionsAdded) lines.push(`  Sessions:     +${diff.sessionsAdded}`);
  if (diff.decisions.added) lines.push(`  Decisions:    +${diff.decisions.added}`);
  if (diff.bugs.added || diff.bugs.fixed) {
    const parts = [];
    if (diff.bugs.added) parts.push(`+${diff.bugs.added} new`);
    if (diff.bugs.fixed) parts.push(`${diff.bugs.fixed} fixed`);
    lines.push(`  Bugs:         ${parts.join(', ')}`);
  }
  if (diff.todos.added || diff.todos.completed) {
    const parts = [];
    if (diff.todos.added) parts.push(`+${diff.todos.added} new`);
    if (diff.todos.completed) parts.push(`${diff.todos.completed} completed`);
    lines.push(`  TODOs:        ${parts.join(', ')}`);
  }
  if (diff.conventions.added) lines.push(`  Conventions:  +${diff.conventions.added}`);
  if (diff.files.added) lines.push(`  Files:        +${diff.files.added}`);
  if (diff.people.added) lines.push(`  People:       +${diff.people.added}`);
  if (diff.timeline.added) lines.push(`  Timeline:     +${diff.timeline.added} events`);
  if (lines.length === 1) lines.push('  No changes detected.');
  return lines.join('\n');
}

// ── Merge functions ───────────────────────────────────────────────────────────

export function mergeDecisions(existing: Decision[], incoming: Decision[]): Decision[] {
  const map = new Map(existing.map(d => [d.id, d]));
  for (const d of incoming) {
    if (!map.has(d.id)) map.set(d.id, d);
  }
  return Array.from(map.values());
}

export function mergeBugs(existing: Bug[], incoming: Bug[]): Bug[] {
  const map = new Map(existing.map(b => [b.id, b]));
  for (const b of incoming) {
    if (!map.has(b.id)) map.set(b.id, b);
    else {
      const ex = map.get(b.id)!;
      if (ex.status === 'open' && b.status !== 'open') map.set(b.id, { ...ex, ...b });
    }
  }
  return Array.from(map.values());
}

export function mergeConventions(existing: Convention[], incoming: Convention[]): Convention[] {
  const seen = new Set(existing.map(c => c.rule.toLowerCase().trim()));
  const result = [...existing];
  for (const c of incoming) {
    if (!seen.has(c.rule.toLowerCase().trim())) {
      result.push(c);
      seen.add(c.rule.toLowerCase().trim());
    }
  }
  return result;
}

export function mergeDependencies(existing: Dependency[], incoming: Dependency[]): Dependency[] {
  const map = new Map(existing.map(d => [d.name, d]));
  for (const d of incoming) {
    if (!map.has(d.name)) map.set(d.name, d);
  }
  return Array.from(map.values());
}

export function mergeTodos(existing: TodoItem[], incoming: TodoItem[]): TodoItem[] {
  const map = new Map(existing.map(t => [t.id, t]));
  for (const t of incoming) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values());
}

export function mergePeople(existing: Person[], incoming: Person[]): Person[] {
  const map = new Map(existing.map(p => [p.name.toLowerCase(), p]));
  for (const p of incoming) {
    const key = p.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, p);
    } else {
      const ex = map.get(key)!;
      map.set(key, {
        ...ex,
        lastMentioned: p.lastMentioned > ex.lastMentioned ? p.lastMentioned : ex.lastMentioned,
        sessionIds: [...new Set([...ex.sessionIds, ...p.sessionIds])],
        role: ex.role || p.role,
        context: ex.context || p.context,
      });
    }
  }
  return Array.from(map.values());
}

export function mergeFiles(
  existing: Record<string, FileContext>,
  incoming: Record<string, FileContext>
): Record<string, FileContext> {
  const result = { ...existing };
  for (const [filePath, ctx] of Object.entries(incoming)) {
    if (!result[filePath]) {
      result[filePath] = ctx;
    } else {
      result[filePath] = {
        ...result[filePath],
        lastDiscussed: ctx.lastDiscussed > result[filePath].lastDiscussed
          ? ctx.lastDiscussed : result[filePath].lastDiscussed,
        sessionCount: result[filePath].sessionCount + 1,
        knownIssues: [...new Set([...result[filePath].knownIssues, ...ctx.knownIssues])],
        relatedFiles: [...new Set([...result[filePath].relatedFiles, ...ctx.relatedFiles])],
      };
    }
  }
  return result;
}

export function mergeTimeline(existing: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set(existing.map(e => `${e.date}:${e.sessionId}:${e.title}`));
  const result = [...existing];
  for (const e of incoming) {
    const key = `${e.date}:${e.sessionId}:${e.title}`;
    if (!seen.has(key)) { result.push(e); seen.add(key); }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function resetStore(projectPath: string): void {
  const dir = backtrackDir(projectPath);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function ensureGitignore(projectPath: string): void {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const entry = '.backtrack/';
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n# Backtrack context maps\n${entry}\n`);
      }
    }
  } catch { /* non-critical */ }
}

export function writeSummary(projectPath: string, sessionId: string, summary: string): void {
  const summaryPath = path.join(
    backtrackDir(projectPath), 'sessions', 'summaries', `${sessionId}.md`
  );
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, summary, 'utf8');
}

export function loadContextMap(filePath: string): ContextMap | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ContextMap;
  } catch {
    return null;
  }
}
