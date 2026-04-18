import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CacheEntry, ParsedMessage, RawContent, RawContentBlock, RawLine, SessionMeta } from '../types';
import { projectDisplayName } from './claudeDir';
import { truncate } from './formatters';

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const cache = new Map<string, CacheEntry>();

/** Extract plain text from a RawContent value (string or array of blocks). */
function extractText(content: RawContent | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) parts.push(block.text);
    else if (block.type === 'thinking' && block.thinking) parts.push(block.thinking);
  }
  return parts.join('\n');
}

/** Extract tool names and files from assistant content blocks. */
function extractToolInfo(content: RawContent | undefined): { tools: string[]; files: string[] } {
  const tools: string[] = [];
  const files: string[] = [];
  if (!content || typeof content === 'string') return { tools, files };
  for (const block of content) {
    if (block.type === 'tool_use' && block.name) {
      tools.push(block.name);
      const input = block.input as Record<string, unknown> | undefined;
      if (input) {
        const filePath =
          (input['path'] as string) ||
          (input['file_path'] as string) ||
          (input['filename'] as string);
        if (filePath && typeof filePath === 'string') files.push(filePath);
      }
    }
  }
  return { tools, files };
}

/**
 * Parse a .jsonl file and return session metadata.
 * Uses an in-memory cache keyed by file path; re-parses only when mtime changes.
 */
export async function parseSessionMeta(
  filePath: string,
  projectPath: string
): Promise<SessionMeta | null> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  const mtime = stat.mtimeMs;
  const cached = cache.get(filePath);
  if (cached && cached.mtime === mtime) return cached.meta;

  const id = path.basename(filePath, '.jsonl');
  const projectName = projectDisplayName(projectPath);

  let title = '';
  let preview = '';
  let messageCount = 0;
  const toolsUsed: string[] = [];
  const filesModified: string[] = [];

  try {
    if (stat.size > LARGE_FILE_THRESHOLD) {
      await parseStreaming(filePath, collect);
    } else {
      const data = fs.readFileSync(filePath, 'utf8');
      for (const line of data.split('\n')) {
        parseLine(line, collect);
      }
    }
  } catch {
    // Partial parse is fine — return what we have
  }

  function collect(line: RawLine) {
    const role = line.type === 'user' ? 'user' : line.type === 'assistant' ? 'assistant' : null;
    if (!role) return;

    messageCount++;
    const content = line.message?.content ?? line.content;

    if (role === 'user' && !title) {
      const text = extractText(content).trim();
      if (text) {
        title = truncate(text, 80);
        preview = truncate(text, 200);
      }
    }

    if (role === 'assistant') {
      const { tools, files } = extractToolInfo(content);
      for (const t of tools) if (!toolsUsed.includes(t)) toolsUsed.push(t);
      for (const f of files) if (!filesModified.includes(f)) filesModified.push(f);
    }
  }

  const meta: SessionMeta = {
    id,
    filePath,
    projectPath,
    projectName,
    title: title || id,
    preview,
    messageCount,
    mtime,
    size: stat.size,
    toolsUsed,
    filesModified,
  };

  cache.set(filePath, { mtime, meta });
  return meta;
}

/** Invalidate the cache entry for a given file path. */
export function invalidateCache(filePath: string): void {
  cache.delete(filePath);
}

/** Clear the entire cache. */
export function clearCache(): void {
  cache.clear();
}

/** Parse a line and invoke the collector if it's a user/assistant message. */
function parseLine(line: string, collector: (line: RawLine) => void): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const obj = JSON.parse(trimmed) as RawLine;
    if (obj.type === 'user' || obj.type === 'assistant') collector(obj);
  } catch {
    // Skip malformed JSON lines
  }
}

/** Stream-parse a large file line by line without loading it all into memory. */
function parseStreaming(filePath: string, collector: (line: RawLine) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => parseLine(line, collector));
    rl.on('close', resolve);
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

/**
 * Parse the full message list from a .jsonl file for the webview.
 * Always uses streaming to handle large files safely.
 */
export async function parseFullMessages(filePath: string): Promise<ParsedMessage[]> {
  const messages: ParsedMessage[] = [];

  await parseStreaming(filePath, (raw) => {
    const role = raw.type === 'user' ? 'user' : raw.type === 'assistant' ? 'assistant' : null;
    if (!role) return;

    const content = raw.message?.content ?? raw.content;
    const blocks = buildParsedBlocks(content, role);
    if (blocks.length === 0) return;

    messages.push({ role, content: blocks, timestamp: raw.timestamp });
  });

  return messages;
}

function buildParsedBlocks(
  content: RawContent | undefined,
  role: 'user' | 'assistant'
): ParsedMessage['content'] {
  if (!content) return [];

  if (typeof content === 'string') {
    if (!content.trim()) return [];
    return [{ kind: 'text', text: content }];
  }

  const blocks: ParsedMessage['content'] = [];
  for (const block of content as RawContentBlock[]) {
    if (block.type === 'text' && block.text?.trim()) {
      blocks.push({ kind: 'text', text: block.text });
    } else if (block.type === 'thinking' && block.thinking?.trim()) {
      // Only show thinking blocks in assistant messages
      if (role === 'assistant') {
        blocks.push({ kind: 'thinking', text: block.thinking });
      }
    } else if (block.type === 'tool_use' && block.name) {
      const inputSummary = block.input
        ? JSON.stringify(block.input).slice(0, 200)
        : '';
      blocks.push({ kind: 'tool_use', name: block.name, inputSummary });
    } else if (block.type === 'tool_result') {
      const resultContent = block.content;
      let outputSummary = '';
      if (typeof resultContent === 'string') {
        outputSummary = resultContent.slice(0, 300);
      } else if (Array.isArray(resultContent)) {
        outputSummary = extractText(resultContent).slice(0, 300);
      }
      blocks.push({ kind: 'tool_result', outputSummary });
    }
  }
  return blocks;
}

/**
 * List all .jsonl session files under a project directory.
 * Returns file paths sorted by mtime descending (newest first).
 */
export function listSessionFiles(projectDir: string): string[] {
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const files: Array<{ path: string; mtime: number }> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const full = path.join(projectDir, entry.name);
      try {
        const stat = fs.statSync(full);
        files.push({ path: full, mtime: stat.mtimeMs });
      } catch {
        // Skip unreadable
      }
    }
    return files.sort((a, b) => b.mtime - a.mtime).map((f) => f.path);
  } catch {
    return [];
  }
}
