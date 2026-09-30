export type CsvCell = string | number | null;

// Spreadsheet apps execute cells that start with these characters as formulas.
const FORMULA_START = /^[=+\-@\t\r]/;

/** RFC 4180 quoting, plus a leading apostrophe on text that a spreadsheet would treat as a formula. */
export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  let text = cell;
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(escapeCsvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
