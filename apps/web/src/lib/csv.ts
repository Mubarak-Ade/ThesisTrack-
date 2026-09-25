/**
 * Shared CSV helpers (spec §4): Export/Template/Report downloads are client
 * blobs — no endpoint. Kept in lib/ so features and components share one
 * RFC-4180-ish serializer (quotes, embedded commas/newlines/quotes).
 */

function escapeCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return lines.join('\r\n');
}

/** Triggers a browser download of the generated CSV (BOM for Excel). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
