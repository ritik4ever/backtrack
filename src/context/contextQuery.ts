import * as fs from 'fs';
import * as path from 'path';
import { loadEntityStore } from './entityStore';
import { Bug, Convention, Decision, Dependency, TimelineEvent, TodoItem } from './contextTypes';

export interface QueryMatch {
  type: 'decision' | 'bug' | 'convention' | 'todo' | 'dependency' | 'file' | 'timeline';
  title: string;
  snippet: string;
  sessionId?: string;
  score: number;
}

function score(text: string, query: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 10;
  if (t.startsWith(q)) return 8;
  if (t.includes(q)) return 5;
  // Word-level match
  const words = q.split(/\s+/);
  const matched = words.filter(w => t.includes(w)).length;
  return matched > 0 ? matched / words.length * 3 : 0;
}

function searchText(text: string, query: string): number {
  return score(text, query);
}

export function queryContext(projectPath: string, query: string): QueryMatch[] {
  const store = loadEntityStore(projectPath);
  const results: QueryMatch[] = [];

  // Decisions
  for (const d of store.decisions) {
    const s = Math.max(
      searchText(d.title, query),
      searchText(d.description, query),
      searchText(d.reason, query),
      searchText(d.tags.join(' '), query)
    );
    if (s > 0) {
      results.push({
        type: 'decision',
        title: d.title,
        snippet: d.reason || d.description,
        sessionId: d.sessionId,
        score: s,
      });
    }
  }

  // Bugs
  for (const b of store.bugs) {
    const s = Math.max(
      searchText(b.title, query),
      searchText(b.rootCause, query),
      searchText(b.fix, query),
      searchText(b.workaround, query)
    );
    if (s > 0) {
      results.push({
        type: 'bug',
        title: `[${b.status}] ${b.title}`,
        snippet: b.fix || b.rootCause || b.workaround,
        sessionId: b.sessionId,
        score: s,
      });
    }
  }

  // Conventions
  for (const c of store.conventions) {
    const s = Math.max(searchText(c.rule, query), searchText(c.reason, query));
    if (s > 0) {
      results.push({
        type: 'convention',
        title: c.rule,
        snippet: c.reason,
        sessionId: c.sessionId,
        score: s,
      });
    }
  }

  // TODOs
  for (const t of store.todos) {
    const s = Math.max(searchText(t.title, query), searchText(t.context, query));
    if (s > 0) {
      results.push({
        type: 'todo',
        title: `[${t.status}] ${t.title}`,
        snippet: t.context,
        sessionId: t.sessionId,
        score: s,
      });
    }
  }

  // Dependencies
  for (const d of store.dependencies) {
    const s = Math.max(searchText(d.name, query), searchText(d.purpose, query));
    if (s > 0) {
      results.push({
        type: 'dependency',
        title: d.name,
        snippet: d.purpose,
        sessionId: d.sessionId,
        score: s,
      });
    }
  }

  // Files
  for (const [filePath, ctx] of Object.entries(store.files)) {
    const s = Math.max(
      searchText(path.basename(filePath), query),
      searchText(filePath, query),
      searchText(ctx.purpose, query),
      searchText(ctx.context, query)
    );
    if (s > 0) {
      results.push({
        type: 'file',
        title: filePath,
        snippet: ctx.purpose || ctx.context,
        score: s,
      });
    }
  }

  // Timeline
  for (const e of store.timeline) {
    const s = searchText(e.title, query);
    if (s > 0) {
      results.push({
        type: 'timeline',
        title: `${e.date} — ${e.title}`,
        snippet: e.description ?? '',
        sessionId: e.sessionId,
        score: s,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function formatQueryResults(matches: QueryMatch[]): string {
  if (matches.length === 0) return 'No results found.';

  const lines: string[] = [];
  const grouped = new Map<string, QueryMatch[]>();
  for (const m of matches) {
    const list = grouped.get(m.type) ?? [];
    list.push(m);
    grouped.set(m.type, list);
  }

  const order = ['decision', 'bug', 'convention', 'todo', 'file', 'dependency', 'timeline'];
  for (const type of order) {
    const items = grouped.get(type);
    if (!items) continue;
    lines.push(`\n${type.toUpperCase()}S`);
    lines.push('─'.repeat(40));
    for (const item of items.slice(0, 5)) {
      lines.push(`  ${item.title}`);
      if (item.snippet) lines.push(`  ${item.snippet.slice(0, 100)}`);
      if (item.sessionId) lines.push(`  Session: ${item.sessionId.slice(0, 8)}`);
    }
  }

  return lines.join('\n');
}
