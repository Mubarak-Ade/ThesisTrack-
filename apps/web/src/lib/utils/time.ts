/**
 * Shared display-time helpers (§16.5: relative deadlines and feed timestamps;
 * `overdue` is always computed at read, never stored — §5.6 discipline).
 */

function parse(value: string | number | Date): number | null {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "just now" · "5 minutes ago" · "3 hours ago" · "2 days ago" · date. */
export function formatRelative(value: string | number | Date, now: number = Date.now()): string {
  const ms = parse(value);
  if (ms === null) return '';
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${plural(days, 'day')} ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface DueLabel {
  /** "due in 3 days" | "overdue by 2 days" | "due today" | '' when unknown. */
  label: string;
  overdue: boolean;
}

/** §16.5 deadline chip text — computed against `now`, never stored. */
export function formatDue(due: string | number | Date | null, now: number = Date.now()): DueLabel {
  if (due === null) return { label: '', overdue: false };
  const ms = parse(due);
  if (ms === null) return { label: '', overdue: false };

  const diff = ms - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor(abs / 3_600_000);

  let span: string;
  if (abs < 3_600_000) {
    const minutes = Math.max(1, Math.floor(abs / 60_000));
    span = plural(minutes, 'minute');
  } else if (days < 1) {
    span = plural(Math.max(1, hours), 'hour');
  } else {
    span = plural(days, 'day');
  }

  if (overdue) return { label: `overdue by ${span}`, overdue: true };
  if (abs < 3_600_000) return { label: 'due within the hour', overdue: false };
  return { label: `due in ${span}`, overdue: false };
}
