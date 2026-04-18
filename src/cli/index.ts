/**
 * Backtrack CLI — interactive session picker for Claude Code.
 * Reuses the same parsing/search utilities as the VS Code extension.
 *
 * Usage:
 *   backtrack                  interactive fuzzy picker
 *   backtrack list             list all sessions
 *   backtrack search <query>   filter sessions
 *   backtrack resume <id>      resume session directly
 */

import * as path from 'path';
import { spawnSync } from 'child_process';
import { findClaudeDir, listProjectDirs } from '../utils/claudeDir';
import { listSessionFiles, parseSessionMeta } from '../utils/sessionParser';
import { fastSearch } from '../utils/search';
import { relativeTime, truncate } from '../utils/formatters';
import { SessionMeta } from '../types';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const R  = '\x1B[0m';   // reset
const B  = '\x1B[1m';   // bold
const D  = '\x1B[2m';   // dim
const FG = {
  cyan:    '\x1B[36m',
  green:   '\x1B[32m',
  yellow:  '\x1B[33m',
  gray:    '\x1B[90m',
  white:   '\x1B[97m',
  red:     '\x1B[31m',
  blue:    '\x1B[34m',
};
const CL  = '\x1B[2K\r';               // clear line + carriage return
const UP  = (n: number) => n > 0 ? `\x1B[${n}A` : '';
const HIDE = '\x1B[?25l';
const SHOW = '\x1B[?25h';

// ── Session loading ───────────────────────────────────────────────────────────

async function loadAllSessions(): Promise<SessionMeta[]> {
  const claudeDir = findClaudeDir();
  if (!claudeDir) {
    die('Could not find ~/.claude directory. Is Claude Code installed?');
  }

  const projects = listProjectDirs(claudeDir);
  if (projects.length === 0) {
    die('No project sessions found under ~/.claude/projects/');
  }

  const sessions: SessionMeta[] = [];
  for (const { encoded, decoded } of projects) {
    const projectDir = path.join(claudeDir, 'projects', encoded);
    const files = listSessionFiles(projectDir);
    for (const file of files) {
      const meta = await parseSessionMeta(file, decoded);
      if (meta) sessions.push(meta);
    }
  }

  return sessions.sort((a, b) => b.mtime - a.mtime);
}

// ── Resume a session (hands terminal to claude process) ───────────────────────

function resumeSession(meta: SessionMeta): never {
  process.stdout.write(SHOW + '\n');
  console.log(`${FG.cyan}${B}Resuming:${R} ${meta.title}`);
  console.log(`${D}Project: ${meta.projectPath}${R}\n`);

  const result = spawnSync('claude', ['--resume', meta.id], {
    stdio: 'inherit',
    cwd: meta.projectPath,
    shell: true,
  });

  if (result.error) {
    console.error(`\n${FG.red}Error:${R} claude command not found.`);
    console.error(`Install it with: ${B}npm install -g @anthropic-ai/claude-code${R}`);
    console.error(`Or copy the session ID and run: ${B}claude --resume ${meta.id}${R}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

// ── List command (non-interactive) ────────────────────────────────────────────

async function cmdList(query?: string): Promise<void> {
  process.stdout.write(`${D}Loading sessions…${R}\r`);
  const sessions = await loadAllSessions();
  process.stdout.write(CL);

  const filtered = query ? fastSearch(sessions, query) : sessions;

  if (filtered.length === 0) {
    console.log(query ? `No sessions matching "${query}"` : 'No sessions found.');
    return;
  }

  const uniqueProjects = new Set(filtered.map(s => s.projectPath)).size;
  console.log(`\n${B}${FG.cyan}BACKTRACK${R}  ${D}${filtered.length} session${filtered.length !== 1 ? 's' : ''} across ${uniqueProjects} project${uniqueProjects !== 1 ? 's' : ''}${R}\n`);

  let lastProject = '';
  for (const s of filtered) {
    if (s.projectPath !== lastProject) {
      lastProject = s.projectPath;
      console.log(`${B}${FG.cyan}${s.projectName}${R}  ${D}${s.projectPath}${R}`);
    }
    const shortId = `${FG.gray}${s.id.slice(0, 8)}${R}`;
    const title   = truncate(s.title, 58);
    const time    = `${D}${relativeTime(s.mtime)}${R}`;
    const msgs    = `${D}${s.messageCount}msg${R}`;
    console.log(`  ${shortId}  ${title.padEnd(60)}  ${time.padEnd(10)}  ${msgs}`);
  }
  console.log();
}

// ── Interactive picker ────────────────────────────────────────────────────────

async function interactivePicker(initialQuery = ''): Promise<void> {
  if (!process.stdout.isTTY) {
    // Not a real terminal — fall back to list
    await cmdList(initialQuery || undefined);
    return;
  }

  process.stdout.write(`${D}Loading sessions…${R}`);
  const sessions = await loadAllSessions();
  process.stdout.write(CL);

  if (sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  let query      = initialQuery;
  let filtered   = query ? fastSearch(sessions, query) : sessions;
  let selected   = 0;
  let scroll     = 0;
  let lastLines  = 0;

  const VISIBLE  = Math.min((process.stdout.rows ?? 24) - 7, 18);

  process.stdout.write(HIDE);

  function clamp() {
    if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
    if (selected < scroll) scroll = selected;
    if (selected >= scroll + VISIBLE) scroll = selected - VISIBLE + 1;
  }

  function sessionLine(s: SessionMeta, isSelected: boolean): string {
    const arrow = isSelected ? `${FG.cyan}${B}▶${R}` : ' ';
    const proj  = `${isSelected ? FG.cyan : FG.gray}${s.projectName.slice(0, 12).padEnd(12)}${R}`;
    const title = isSelected
      ? `${B}${FG.white}${truncate(s.title, 52)}${R}`
      : truncate(s.title, 52);
    const time  = `${D}${relativeTime(s.mtime).padEnd(9)}${R}`;
    const msgs  = `${D}${String(s.messageCount).padStart(4)}msg${R}`;
    return `${CL} ${arrow} ${proj}  ${title.padEnd(52)}  ${time}  ${msgs}`;
  }

  function render() {
    const uniqProjects = new Set(sessions.map(s => s.projectPath)).size;
    const lines: string[] = [];

    lines.push(`${CL}${B}${FG.cyan} BACKTRACK${R}  ${D}${sessions.length} sessions · ${uniqProjects} projects${R}`);
    lines.push(`${CL}${D}${'─'.repeat(82)}${R}`);
    lines.push(`${CL}  ${B}/${R} ${FG.white}${query}${FG.cyan}▌${R}  ${D}${filtered.length} match${filtered.length !== 1 ? 'es' : ''}${R}`);
    lines.push(`${CL}${D}${'─'.repeat(82)}${R}`);

    if (filtered.length === 0) {
      lines.push(`${CL}  ${FG.gray}No sessions match "${query}"${R}`);
      // pad to VISIBLE lines
      for (let i = 1; i < VISIBLE; i++) lines.push(CL);
    } else {
      const slice = filtered.slice(scroll, scroll + VISIBLE);
      for (let i = 0; i < VISIBLE; i++) {
        const s = slice[i];
        if (s) {
          lines.push(sessionLine(s, scroll + i === selected));
        } else {
          lines.push(CL);
        }
      }
      if (filtered.length > VISIBLE) {
        const remaining = filtered.length - scroll - VISIBLE;
        lines.push(`${CL}  ${D}${remaining > 0 ? `↓ ${remaining} more` : '─ end of list'}${R}`);
      } else {
        lines.push(CL);
      }
    }

    lines.push(CL);
    lines.push(`${CL}  ${D}↑↓ navigate · Enter resume · Esc/q quit · Type to search${R}`);

    const out = (lastLines > 0 ? UP(lastLines) : '') + lines.join('\r\n');
    process.stdout.write(out);
    lastLines = lines.length - 1;
  }

  function cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\r\n' + SHOW);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  render();

  process.stdin.on('data', (key: string) => {
    // Quit
    if (key === '\x03' || key === '\x1B' || key === 'q') {
      cleanup();
      process.exit(0);
    }

    // Enter → resume selected
    if (key === '\r' || key === '\n') {
      if (filtered.length > 0) {
        cleanup();
        resumeSession(filtered[selected]);
      }
      return;
    }

    // Arrow up
    if (key === '\x1B[A') {
      selected = Math.max(0, selected - 1);
      clamp(); render(); return;
    }

    // Arrow down
    if (key === '\x1B[B') {
      selected = Math.min(filtered.length - 1, selected + 1);
      clamp(); render(); return;
    }

    // Page up
    if (key === '\x1B[5~') {
      selected = Math.max(0, selected - VISIBLE);
      clamp(); render(); return;
    }

    // Page down
    if (key === '\x1B[6~') {
      selected = Math.min(filtered.length - 1, selected + VISIBLE);
      clamp(); render(); return;
    }

    // Backspace
    if (key === '\x7F' || key === '\x08') {
      query = query.slice(0, -1);
      filtered = query ? fastSearch(sessions, query) : sessions;
      selected = 0; scroll = 0;
      render(); return;
    }

    // Printable character → update search
    if (key.length === 1 && key >= ' ') {
      query += key;
      filtered = query ? fastSearch(sessions, query) : sessions;
      selected = 0; scroll = 0;
      render(); return;
    }
  });
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${B}${FG.cyan}backtrack${R} — Browse and resume Claude Code sessions

${B}Usage:${R}
  backtrack                    Interactive fuzzy picker
  backtrack list               List all sessions grouped by project
  backtrack search <query>     Search and list matching sessions
  backtrack resume <id>        Resume a specific session by ID (or prefix)

${B}In the picker:${R}
  ↑ / ↓                        Navigate sessions
  Page Up / Down               Scroll faster
  Type                         Filter sessions in real time
  Enter                        Resume selected session
  Esc / q                      Quit

${B}Examples:${R}
  backtrack search stellarhack
  backtrack resume c7e9dcfe

${D}Sessions are read from ~/.claude/projects/ — no data leaves your machine.${R}
`);
}

// ── Main entry ────────────────────────────────────────────────────────────────

function die(msg: string): never {
  console.error(`${FG.red}Error:${R} ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd  = args[0];

  if (cmd === '--help' || cmd === '-h')    { printHelp(); return; }
  if (cmd === '--version' || cmd === '-v') { console.log('0.1.0'); return; }

  if (cmd === 'list')   { await cmdList(); return; }

  if (cmd === 'search') {
    const q = args.slice(1).join(' ');
    if (!q) die('Usage: backtrack search <query>');
    await cmdList(q);
    return;
  }

  if (cmd === 'resume') {
    const id = args[1];
    if (!id) die('Usage: backtrack resume <session-id>');
    const sessions = await loadAllSessions();
    const meta = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!meta) die(`Session not found: ${id}`);
    resumeSession(meta);
  }

  // Default: interactive picker (optional initial query)
  await interactivePicker(cmd ?? '');
}

main().catch(err => {
  process.stderr.write(`${FG.red}Fatal:${R} ${err}\n`);
  process.exit(1);
});
