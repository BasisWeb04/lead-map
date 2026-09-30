import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from '../src/lib/csv';
import { buildRows, rowsToCsv, sortRows } from '../src/lib/view';
import { decodeCounties, decodeIndustry } from '../src/lib/data';
import type { County, IndustryRecord } from '../src/lib/types';

describe('CSV escaping', () => {
  it('leaves plain text and numbers alone', () => {
    expect(escapeCsvCell('Maricopa County')).toBe('Maricopa County');
    expect(escapeCsvCell(3.42)).toBe('3.42');
    expect(escapeCsvCell(0)).toBe('0');
  });

  it('quotes commas, quotes and line breaks, doubling inner quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell(' padded ')).toBe('" padded "');
  });

  it('neutralizes spreadsheet formulas in text cells', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('@SUM')).toBe("'@SUM");
  });

  it('writes null and non-finite numbers as empty cells', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(Number.NaN)).toBe('');
  });

  it('joins rows with CRLF and a trailing line break', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

const county = (fips: string, population: number | null, inCbp = true): County => ({
  fips,
  name: `County ${fips}`,
  stateFips: fips.slice(0, 2),
  stateAbbr: fips.startsWith('04') ? 'AZ' : 'NM',
  population,
  inCbp,
});
const rec = (est: number, emp: number | null, empFlag = 'G'): IndustryRecord => ({
  est,
  emp,
  empFlag,
  sizes: [est, null, null, null, null, null, null, null, null],
});

const counties = new Map<string, County>(
  [
    county('04001', 60000),
    county('04003', 120000),
    county('04005', 30000),
    county('04007', 2000),
    county('04009', 40000, false),
    county('35001', 600000),
  ].map((c) => [c.fips, c]),
);
const industry = new Map<string, IndustryRecord>([
  ['04001', rec(12, 80)],
  ['04003', rec(24, null, 'D')],
  ['04007', rec(3, 10, 'J')],
  ['35001', rec(100, 900)],
]);

describe('view rows', () => {
  const rows = buildRows(counties, industry, 'est', '04');
  const byFips = new Map(rows.map((r) => [r.fips, r]));

  it('filters to one state', () => {
    expect(rows.map((r) => r.fips)).toEqual(['04001', '04003', '04005', '04007', '04009']);
  });

  it('shows a covered county with no industry row as a true zero', () => {
    const r = byFips.get('04005')!;
    expect(r.est).toBe(0);
    expect(r.emp).toBe(0);
    expect(r.empStatus).toBe('none');
  });

  it('shows a county missing from the file as not published, never zero', () => {
    const r = byFips.get('04009')!;
    expect(r.est).toBeNull();
    expect(r.emp).toBeNull();
    expect(r.empStatus).toBe('not-in-file');
    expect(r.metric).toEqual({ value: null, reason: 'not-in-file' });
  });

  it('keeps withheld employment null with status withheld', () => {
    const r = byFips.get('04003')!;
    expect(r.emp).toBeNull();
    expect(r.empStatus).toBe('withheld');
  });

  it('ranks within the state and skips unpublished counties', () => {
    expect(byFips.get('04003')!.rank).toBe(1);
    expect(byFips.get('04001')!.rank).toBe(2);
    expect(byFips.get('04005')!.rank).toBe(4);
    expect(byFips.get('04009')!.rank).toBeNull();
    expect(byFips.get('04001')!.rankOf).toBe(4);
  });

  it('keeps state-level ranks when viewing all states', () => {
    const all = buildRows(counties, industry, 'est');
    expect(all.find((r) => r.fips === '35001')!.rank).toBe(1);
    expect(all.find((r) => r.fips === '04003')!.rank).toBe(1);
  });

  it('applies the population guard to rate metrics', () => {
    const rate = buildRows(counties, industry, 'per10k', '04');
    expect(rate.find((r) => r.fips === '04007')!.metric.reason).toBe('small-population');
    expect(rate.find((r) => r.fips === '04001')!.metric.value).toBe(2);
  });

  it('sorts missing values last in both directions', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const sorted = sortRows(rows, 'emp', dir);
      expect(sorted.slice(-2).map((r) => r.fips).sort()).toEqual(['04003', '04009']);
    }
    expect(sortRows(rows, 'est', 'desc')[0].fips).toBe('04003');
  });

  it('exports missing values as words, never as 0 or blank', () => {
    const csv = rowsToCsv(rows, '238220', 'est');
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(6);
    const absent = lines.find((l) => l.startsWith('04009'))!;
    expect(absent).toContain('not published');
    expect(absent.split(',')[5]).toBe('not published');
    const withheld = lines.find((l) => l.startsWith('04003'))!.split(',');
    expect(withheld[6]).toBe('not published');
    expect(withheld[7]).toBe('');
    const small = lines.find((l) => l.startsWith('04007'))!;
    expect(small).toContain('"not computed (population under 2,500)"');
  });
});

describe('decoding processed files', () => {
  it('rejects a FIPS key that lost its leading zero', () => {
    expect(() => decodeIndustry({ code: 'x', columns: [], rows: [['4013', 1, 1, 'G']] })).toThrow(/Invalid county FIPS/);
  });

  it('maps state abbreviations and coverage flags', () => {
    const c = decodeCounties(
      { columns: ['fips', 'name', 'stateFips', 'population', 'inCbp'], rows: [['04013', 'Maricopa County', '04', 10, 1]] },
      new Map([['04', 'AZ']]),
    );
    expect(c.get('04013')).toMatchObject({ stateAbbr: 'AZ', inCbp: true });
  });
});
