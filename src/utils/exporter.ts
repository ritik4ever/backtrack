import { ParsedMessage, SessionMeta } from '../types';
import { formatDate, formatBytes } from './formatters';

/**
 * Render a full session as a Markdown string suitable for saving to disk.
 */
export function exportToMarkdown(meta: SessionMeta, messages: ParsedMessage[]): string {
  const lines: string[] = [];

  // Header block
  lines.push(`# ${meta.title}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| **Project** | \`${meta.projectPath}\` |`);
  lines.push(`| **Session ID** | \`${meta.id}\` |`);
  lines.push(`| **Date** | ${formatDate(meta.mtime)} |`);
  lines.push(`| **Messages** | ${meta.messageCount} |`);
  lines.push(`| **File size** | ${formatBytes(meta.size)} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '**You**' : '**Claude**';
    const timestamp = msg.timestamp ? ` *(${new Date(msg.timestamp).toLocaleTimeString()})*` : '';
    lines.push(`### ${roleLabel}${timestamp}`);
    lines.push('');

    for (const block of msg.content) {
      if (block.kind === 'text') {
        lines.push(block.text);
        lines.push('');
      } else if (block.kind === 'thinking') {
        lines.push('<details>');
        lines.push('<summary>💭 Thinking</summary>');
        lines.push('');
        lines.push(block.text);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      } else if (block.kind === 'tool_use') {
        lines.push(`> 🔧 **Tool:** \`${block.name}\``);
        if (block.inputSummary) {
          lines.push('> ```');
          lines.push('> ' + block.inputSummary);
          lines.push('> ```');
        }
        lines.push('');
      } else if (block.kind === 'tool_result') {
        if (block.outputSummary) {
          lines.push('> **Result:**');
          lines.push('> ```');
          lines.push('> ' + block.outputSummary.replace(/\n/g, '\n> '));
          lines.push('> ```');
          lines.push('');
        }
      }
    }

    lines.push('---');
    lines.push('');
  }

  lines.push(`*Exported by [Backtrack](https://github.com/ritik4ever/backtrack)*`);

  return lines.join('\n');
}

/** Generate a suggested filename for the export. */
export function suggestedFilename(meta: SessionMeta): string {
  const safeName = meta.projectName.replace(/[^\w-]/g, '_');
  const shortId = meta.id.slice(0, 8);
  return `${safeName}-${shortId}.md`;
}
