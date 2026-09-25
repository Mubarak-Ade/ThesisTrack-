/**
 * Hand-rolled CSV parser (spec §5.5 — no new dependency). RFC-4180-ish:
 * quoted fields, "" escapes, commas/newlines/CRLF inside quotes.
 * Lenient on unterminated quotes (consumes the rest of the input).
 */

export interface ParsedCsv {
  /** First non-empty row, cells trimmed. */
  headers: string[];
  /** Remaining non-empty rows (untrimmed cells). */
  rows: string[][];
}

export function parseCsv(input: string): ParsedCsv {
  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    table.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      if (input[i + 1] === '\n') i += 1; // CRLF
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  // Drop blank lines (rows where every cell is empty).
  const table2 = table.filter((cells) => cells.some((cell) => cell.trim() !== ''));
  const [headerRow, ...dataRows] = table2;
  return {
    headers: (headerRow ?? []).map((cell) => cell.trim()),
    rows: dataRows,
  };
}
