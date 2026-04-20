import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { RawLine, RawContent, RawContentBlock } from '../types';
import {
  Bug, Convention, Decision, Dependency,
  EntityStore, FileContext, TimelineEvent, TodoItem,
} from './contextTypes';

// ── Text extraction ───────────────────────────────────────────────────────────

function extractText(content: RawContent | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return (content as RawContentBlock[])
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n');
}

function extractFilePaths(content: RawContent | undefined): string[] {
  const files: string[] = [];
  if (!content || typeof content === 'string') return files;
  for (const block of content as RawContentBlock[]) {
    if (block.type === 'tool_use' && block.input) {
      const input = block.input as Record<string, unknown>;
      const p = (input['path'] || input['file_path'] || input['filename']) as string | undefined;
      if (p && typeof p === 'string' && p.includes('/') || (p && p.includes('\\'))) {
        files.push(p);
      } else if (p && p.includes('.')) {
        files.push(p);
      }
    }
  }
  return files;
}

// ── Pattern matchers ──────────────────────────────────────────────────────────

const DECISION_PATTERNS = [
  /(?:decided?|going)\s+(?:to|with)\s+(.{10,120})/i,
  /(?:we['']ll|let['']s)\s+use\s+(.{5,80})/i,
  /(?:chose|choosing|picked|selecting)\s+(.{5,80})/i,
  /(?:instead of|rather than|over)\s+(.{5,80})/i,
  /(?:the reason|because|rationale)\s+(?:is|was|for this)[:.]?\s*(.{10,200})/i,
];

const BUG_PATTERNS = [
  /(?:bug|error|issue|problem|broken|failing|crash)[:.]?\s+(.{10,150})/i,
  /(?:TypeError|ReferenceError|SyntaxError|Error):\s+(.{5,150})/,
  /(?:fixed?|resolved?|patched?)\s+(?:the|a|an)?\s*(?:bug|error|issue)[:.]?\s*(.{0,120})/i,
  /(?:root cause|the issue was|turned out)\s*[:.]?\s+(.{10,200})/i,
];

const CONVENTION_PATTERNS = [
  /(?:convention|rule|pattern|always|never|we should|make sure)\s*[:.]?\s+(.{10,200})/i,
  /(?:all|every)\s+\w+\s+(?:should|must|need to)\s+(.{10,150})/i,
  /(?:standard|consistent|consistently)\s+(.{5,100})/i,
];

const TODO_PATTERNS = [
  /TODO[:.]?\s+(.{5,150})/i,
  /(?:need to|should|will)\s+(?:add|implement|fix|create|build|update)\s+(.{5,150})/i,
  /(?:planned?|roadmap|future|next step)[:.]?\s+(.{5,150})/i,
  /(?:known issue|open issue|outstanding)[:.]?\s+(.{5,150})/i,
];

const MILESTONE_PATTERNS = [
  /(?:completed?|finished?|done|shipped?|deployed?|published?|released?)\s+(.{5,120})/i,
  /(?:working|works|functional|passing|green)\s*[!.]?\s*(.{0,80})/i,
  /(?:submitted?|merged?|pushed?)\s+(.{5,100})/i,
];

const DEP_PATTERNS = [
  /(?:npm install|yarn add|pip install|cargo add|go get)\s+([\w@/-]+)/i,
  /(?:using|installed?|added?)\s+([\w@/-]+)\s+(?:package|library|crate|module)/i,
  /import\s+.*?from\s+['"]([^.'"@][^'"]{2,40})['"]/,
  /require\(['"]([^.'"@][^'"]{2,40})['"]\)/,
];

const STACK_KEYWORDS: Record<string, string[]> = {
  languages: ['TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C#', 'Ruby', 'Swift', 'Kotlin', 'PHP'],
  frontend: ['React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Tailwind', 'Vite', 'Webpack'],
  backend: ['Express', 'Fastify', 'Hono', 'FastAPI', 'Django', 'Rails', 'NestJS', 'Actix'],
  databases: ['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Redis', 'Supabase', 'PlanetScale', 'Prisma'],
  testing: ['Jest', 'Vitest', 'Mocha', 'pytest', 'cargo test', 'Playwright', 'Cypress'],
  build: ['npm', 'yarn', 'pnpm', 'cargo', 'make', 'gradle', 'maven', 'webpack', 'vite'],
};

// ── Streaming parser ──────────────────────────────────────────────────────────

function streamLines(filePath: string, cb: (line: RawLine) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (raw) => {
      const t = raw.trim();
      if (!t) return;
      try {
        const obj = JSON.parse(t) as RawLine;
        if (obj.type === 'user' || obj.type === 'assistant') cb(obj);
      } catch { /* skip malformed */ }
    });
    rl.on('close', resolve);
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

// ── Main analyzer ─────────────────────────────────────────────────────────────

export interface AnalysisResult {
  decisions: Decision[];
  files: Record<string, FileContext>;
  bugs: Bug[];
  conventions: Convention[];
  dependencies: Dependency[];
  todos: TodoItem[];
  timeline: TimelineEvent[];
  stackHints: Partial<EntityStore['decisions']>;
  detectedStack: Record<string, string[]>;
}

let decCounter = 0;
let bugCounter = 0;
let todoCounter = 0;

export async function analyzeSession(
  filePath: string,
  sessionId: string,
  projectPath: string
): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    decisions: [],
    files: {},
    bugs: [],
    conventions: [],
    dependencies: [],
    todos: [],
    timeline: [],
    stackHints: [],
    detectedStack: {},
  };

  const today = new Date().toISOString().slice(0, 10);
  const texts: string[] = [];
  const allFiles: string[] = [];

  await streamLines(filePath, (line) => {
    const content = line.message?.content ?? line.content;
    const text = extractText(content);
    if (text) texts.push(text);

    const filePaths = extractFilePaths(content);
    for (const fp of filePaths) {
      if (!allFiles.includes(fp)) allFiles.push(fp);
    }
  });

  const fullText = texts.join('\n');

  // ── Decisions ───────────────────────────────────────────────────────────────
  for (const pattern of DECISION_PATTERNS) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
    for (const m of matches) {
      const title = m[1]?.trim().slice(0, 100);
      if (!title || title.length < 10) continue;
      if (result.decisions.some(d => d.title.toLowerCase() === title.toLowerCase())) continue;
      result.decisions.push({
        id: `dec-${sessionId.slice(0, 6)}-${++decCounter}`,
        date: today,
        title,
        description: title,
        alternativesConsidered: [],
        reason: '',
        filesAffected: allFiles.slice(0, 3),
        sessionId,
        status: 'active',
        tags: [],
      });
      if (result.decisions.length >= 5) break;
    }
    if (result.decisions.length >= 5) break;
  }

  // ── Bugs ────────────────────────────────────────────────────────────────────
  for (const pattern of BUG_PATTERNS) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
    for (const m of matches) {
      const title = m[1]?.trim().slice(0, 120);
      if (!title || title.length < 8) continue;
      if (result.bugs.some(b => b.title.toLowerCase() === title.toLowerCase())) continue;
      const isFixed = /fixed?|resolved?|patched?/i.test(m[0]);
      result.bugs.push({
        id: `bug-${sessionId.slice(0, 6)}-${++bugCounter}`,
        title,
        discovered: today,
        sessionId,
        rootCause: '',
        fix: isFixed ? 'See session for fix details' : '',
        status: isFixed ? 'fixed' : 'open',
        files: allFiles.slice(0, 2),
        workaround: '',
      });
      if (result.bugs.length >= 5) break;
    }
    if (result.bugs.length >= 5) break;
  }

  // ── Conventions ─────────────────────────────────────────────────────────────
  for (const pattern of CONVENTION_PATTERNS) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
    for (const m of matches) {
      const rule = m[1]?.trim().slice(0, 150);
      if (!rule || rule.length < 10) continue;
      if (result.conventions.some(c => c.rule.toLowerCase() === rule.toLowerCase())) continue;
      result.conventions.push({ rule, reason: '', established: today, sessionId });
      if (result.conventions.length >= 5) break;
    }
    if (result.conventions.length >= 5) break;
  }

  // ── TODOs ───────────────────────────────────────────────────────────────────
  for (const pattern of TODO_PATTERNS) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
    for (const m of matches) {
      const title = m[1]?.trim().slice(0, 120);
      if (!title || title.length < 5) continue;
      if (result.todos.some(t => t.title.toLowerCase() === title.toLowerCase())) continue;
      result.todos.push({
        id: `todo-${sessionId.slice(0, 6)}-${++todoCounter}`,
        title,
        priority: 'medium',
        mentioned: today,
        sessionId,
        status: 'open',
        context: '',
      });
      if (result.todos.length >= 8) break;
    }
    if (result.todos.length >= 8) break;
  }

  // ── Dependencies ─────────────────────────────────────────────────────────────
  for (const pattern of DEP_PATTERNS) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
    for (const m of matches) {
      const name = m[1]?.trim();
      if (!name || name.length < 2) continue;
      if (result.dependencies.some(d => d.name === name)) continue;
      result.dependencies.push({
        name,
        version: '',
        purpose: '',
        addedDate: today,
        sessionId,
        type: 'npm',
        alternatives: [],
      });
      if (result.dependencies.length >= 10) break;
    }
    if (result.dependencies.length >= 10) break;
  }

  // ── Files ───────────────────────────────────────────────────────────────────
  for (const fp of allFiles) {
    const normalized = fp.replace(/\\/g, '/');
    const ext = path.extname(fp);
    if (!ext) continue;
    result.files[normalized] = {
      purpose: '',
      created: today,
      lastDiscussed: today,
      sessionCount: 1,
      context: `Mentioned in session ${sessionId.slice(0, 8)}`,
      dependencies: [],
      relatedFiles: allFiles.filter(f => f !== fp).slice(0, 3).map(f => f.replace(/\\/g, '/')),
      knownIssues: [],
      conventions: '',
    };
  }

  // ── Timeline milestone ───────────────────────────────────────────────────────
  for (const pattern of MILESTONE_PATTERNS) {
    const m = pattern.exec(fullText);
    if (m && m[1] && m[1].trim().length > 5) {
      result.timeline.push({
        date: today,
        type: 'milestone',
        title: m[1].trim().slice(0, 100),
        sessionId,
      });
      break;
    }
  }

  // ── Stack detection ──────────────────────────────────────────────────────────
  for (const [category, keywords] of Object.entries(STACK_KEYWORDS)) {
    const found: string[] = [];
    for (const kw of keywords) {
      if (fullText.includes(kw)) found.push(kw);
    }
    if (found.length) result.detectedStack[category] = found;
  }

  return result;
}

export function buildSessionSummary(
  sessionId: string,
  projectName: string,
  result: AnalysisResult,
  messageCount: number
): string {
  const lines: string[] = [
    `# Session ${sessionId.slice(0, 8)}`,
    `**Project:** ${projectName}  `,
    `**Messages:** ${messageCount}  `,
    `**Analyzed:** ${new Date().toISOString().slice(0, 10)}`,
    '',
  ];

  if (result.decisions.length) {
    lines.push('## Decisions');
    for (const d of result.decisions) lines.push(`- ${d.title}`);
    lines.push('');
  }

  if (result.bugs.length) {
    lines.push('## Bugs');
    for (const b of result.bugs) lines.push(`- [${b.status}] ${b.title}`);
    lines.push('');
  }

  if (result.todos.length) {
    lines.push('## TODOs');
    for (const t of result.todos) lines.push(`- ${t.title}`);
    lines.push('');
  }

  return lines.join('\n');
}
