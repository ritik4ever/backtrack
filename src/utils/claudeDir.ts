import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Locate the .claude directory for the current environment.
 *
 * Priority:
 *  1. User-configured override (backtrack.claudeDir setting)
 *  2. Standard ~/.claude on the host OS
 *  3. WSL fallback: scan /mnt/c/Users/<user>/.claude when on Linux without ~/.claude
 *
 * Returns null if nothing is found.
 */
export function findClaudeDir(configOverride?: string): string | null {
  if (configOverride && configOverride.trim()) {
    const p = configOverride.trim();
    if (fs.existsSync(p)) return p;
  }

  // Standard location
  const standard = path.join(os.homedir(), '.claude');
  if (fs.existsSync(standard)) return standard;

  // WSL fallback: only applies when running inside WSL (Linux kernel on /mnt/c)
  if (process.platform === 'linux' && fs.existsSync('/mnt/c/Users')) {
    const wslPath = findWslClaudeDir();
    if (wslPath) return wslPath;
  }

  return null;
}

/** Scan /mnt/c/Users/<name>/.claude for the first directory that contains a .claude folder. */
function findWslClaudeDir(): string | null {
  const usersRoot = '/mnt/c/Users';
  try {
    const entries = fs.readdirSync(usersRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip system folders
      if (['Public', 'Default', 'Default User', 'All Users'].includes(entry.name)) continue;
      const candidate = path.join(usersRoot, entry.name, '.claude');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // /mnt/c/Users not accessible — ignore
  }
  return null;
}

/**
 * Decode an encoded Claude project folder name back to a filesystem path.
 *
 * Encoding rules observed in the wild:
 *  - Each path separator (/ or \) becomes `-`
 *  - Drive letter colons on Windows: `C:` → `C-` → appears as `c--Users-...`
 *    (the double dash before Users indicates a Windows drive root)
 *  - Folder names with spaces: spaces become `-` too
 *  - Case may vary (c-- vs C--)
 *
 * Examples:
 *  c--Users-ritik-Desktop-stellarhack  → C:/Users/ritik/Desktop/stellarhack
 *  -home-ritik-projects-lodestar       → /home/ritik/projects/lodestar
 */
export function decodeProjectPath(encoded: string): string {
  // Windows drive pattern: starts with a letter followed by -- (letter + colon encoded as -)
  const windowsDrive = /^([a-zA-Z])--(.+)$/;
  const m = windowsDrive.exec(encoded);
  if (m) {
    const drive = m[1].toUpperCase();
    const rest = m[2].replace(/-/g, '/');
    return `${drive}:/${rest}`;
  }

  // Linux/Mac absolute path: starts with - (encoding of leading /)
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }

  // Relative or unknown — just replace dashes with separators
  return encoded.replace(/-/g, path.sep);
}

/** Get the short display name (last non-empty segment) of a decoded project path. */
export function projectDisplayName(decoded: string): string {
  const segments = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments[segments.length - 1] || decoded;
}

/**
 * Return all project directories under a .claude dir as { encoded, decoded } pairs.
 * Deduplicates folders that decode to the same path (case-insensitive on Windows).
 */
export function listProjectDirs(claudeDir: string): Array<{ encoded: string; decoded: string }> {
  const projectsRoot = path.join(claudeDir, 'projects');
  if (!fs.existsSync(projectsRoot)) return [];

  const seen = new Map<string, string>(); // normalized decoded → first encoded
  try {
    const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const decoded = decodeProjectPath(entry.name);
      const key = decoded.toLowerCase();
      if (!seen.has(key)) seen.set(key, entry.name);
    }
  } catch {
    return [];
  }

  return Array.from(seen.entries()).map(([_key, encoded]) => ({
    encoded,
    decoded: decodeProjectPath(encoded),
  }));
}
