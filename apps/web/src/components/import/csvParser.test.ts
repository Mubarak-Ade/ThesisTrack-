import { describe, expect, it } from 'vitest';

import { parseCsv } from './csvParser';

describe('parseCsv', () => {
  it('parses headers and simple rows', () => {
    const { headers, rows } = parseCsv('firstName,lastName,email,role\nMarcus,Holloway,m@x.edu,student\n');
    expect(headers).toEqual(['firstName', 'lastName', 'email', 'role']);
    expect(rows).toEqual([['Marcus', 'Holloway', 'm@x.edu', 'student']]);
  });

  it('handles quoted fields containing commas', () => {
    const { rows } = parseCsv('a,b\n"Doe, Jr.",x\n');
    expect(rows).toEqual([['Doe, Jr.', 'x']]);
  });

  it('unescapes doubled quotes', () => {
    const { rows } = parseCsv('a\n"He said ""hi"""\n');
    expect(rows).toEqual([['He said "hi"']]);
  });

  it('keeps newlines inside quoted fields', () => {
    const { rows } = parseCsv('a,b\n"line1\nline2",next\n');
    expect(rows).toEqual([['line1\nline2', 'next']]);
  });

  it('supports CRLF line endings', () => {
    const { headers, rows } = parseCsv('x,y\r\n1,2\r\n3,4\r\n');
    expect(headers).toEqual(['x', 'y']);
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('skips blank lines and trims header cells', () => {
    const { headers, rows } = parseCsv(' a , b \n\n1,2\n\n');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('handles empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('\n\n')).toEqual({ headers: [], rows: [] });
  });

  it('tolerates an unterminated quote (lenient mode)', () => {
    const { rows } = parseCsv('a\n"never closed\nstill going');
    expect(rows[0]?.[0]).toContain('never closed');
  });

  it('parses a trailing row without a newline', () => {
    const { rows } = parseCsv('h\nv1');
    expect(rows).toEqual([['v1']]);
  });
});
