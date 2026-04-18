export type GroupBy = 'project' | 'date' | 'flat';

export interface SessionMeta {
  /** UUID from filename, e.g. "c7e9dcfe-7bc6-4594-a959-ecc9db399501" */
  id: string;
  /** Absolute path to the .jsonl file */
  filePath: string;
  /** Decoded project path, e.g. "C:/Users/ritik/Desktop/stellarhack" */
  projectPath: string;
  /** Short display name (last path segment) */
  projectName: string;
  /** Title derived from first user message (max 80 chars) */
  title: string;
  /** First 200 chars of first user message */
  preview: string;
  /** Total user + assistant message count */
  messageCount: number;
  /** File modification time (ms since epoch) */
  mtime: number;
  /** File size in bytes */
  size: number;
  /** Tool names used in this session */
  toolsUsed: string[];
  /** Files touched by tool_use blocks */
  filesModified: string[];
}

export interface ProjectGroup {
  /** Decoded project path */
  projectPath: string;
  /** Short display name */
  projectName: string;
  sessions: SessionMeta[];
}

export interface DateGroup {
  label: string;
  sessions: SessionMeta[];
}

/** Raw JSONL line shapes — parsed defensively */
export interface RawLine {
  type?: string;
  role?: string;
  message?: {
    role?: string;
    content?: RawContent;
  };
  content?: RawContent;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
}

export type RawContent = string | RawContentBlock[];

export interface RawContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: RawContent;
}

/** A parsed message for the webview */
export interface ParsedMessage {
  role: 'user' | 'assistant';
  content: ParsedBlock[];
  timestamp?: string;
}

export type ParsedBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; name: string; inputSummary: string }
  | { kind: 'tool_result'; outputSummary: string };

export interface BookmarkStore {
  bookmarks: string[];
}

export interface CacheEntry {
  mtime: number;
  meta: SessionMeta;
}
