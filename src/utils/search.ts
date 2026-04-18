import * as fs from 'fs';
import * as readline from 'readline';
import { SessionMeta } from '../types';

/**
 * Fast-pass search: checks title, preview, project name in memory.
 * Returns sessions where any field contains the query (case-insensitive).
 */
export function fastSearch(sessions: SessionMeta[], query: string): SessionMeta[] {
  const q = query.toLowerCase();
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.preview.toLowerCase().includes(q) ||
      s.projectName.toLowerCase().includes(q) ||
      s.projectPath.toLowerCase().includes(q)
  );
}

/**
 * Full-text search over the raw .jsonl file content.
 * Streams the file line by line to avoid loading large files into memory.
 * Returns true if any line in the file contains the query string.
 */
export async function fullTextMatch(filePath: string, query: string): Promise<boolean> {
  const q = query.toLowerCase();
  return new Promise((resolve) => {
    let found = false;
    try {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (found) return;
        if (line.toLowerCase().includes(q)) {
          found = true;
          rl.close();
          stream.destroy();
        }
      });

      rl.on('close', () => resolve(found));
      rl.on('error', () => resolve(false));
      stream.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Search sessions using fast-pass first, then full-text fallback for misses.
 * Reports progress via an optional callback.
 */
export async function searchSessions(
  sessions: SessionMeta[],
  query: string,
  onProgress?: (checked: number, total: number) => void
): Promise<SessionMeta[]> {
  if (!query.trim()) return sessions;

  // Fast pass
  const fastMatches = new Set(fastSearch(sessions, query).map((s) => s.id));
  const misses = sessions.filter((s) => !fastMatches.has(s.id));

  // Full-text scan of misses
  const fullMatches: SessionMeta[] = [];
  for (let i = 0; i < misses.length; i++) {
    const session = misses[i];
    if (onProgress) onProgress(i + 1, misses.length);
    if (await fullTextMatch(session.filePath, query)) {
      fullMatches.push(session);
    }
  }

  // Combine: fast matches first, then full-text matches
  return [
    ...sessions.filter((s) => fastMatches.has(s.id)),
    ...fullMatches,
  ];
}
