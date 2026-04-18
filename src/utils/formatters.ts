/**
 * Human-readable relative time from a timestamp in ms.
 * e.g. "2h ago", "3d ago", "just now"
 */
export function relativeTime(mtime: number): string {
  const diff = Date.now() - mtime;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Human-readable file size. e.g. "1.2 MB", "340 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Truncate a string with ellipsis at maxLen characters. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/** Format a timestamp (ms) as "Apr 19, 2026 14:32" */
export function formatDate(mtime: number): string {
  return new Date(mtime).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Date bucket label for grouping: today/yesterday/this week/etc. */
export function dateBucket(mtime: number): string {
  const now = new Date();
  const d = new Date(mtime);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  if (mtime >= todayStart) return 'Today';
  if (mtime >= yesterdayStart) return 'Yesterday';
  if (mtime >= weekStart) return 'This Week';
  if (mtime >= monthStart) return 'This Month';
  // Show "Month Year" for older items
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

/** Normalize line endings and collapse excessive whitespace for preview text. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Escape HTML special chars for use inside webview HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
