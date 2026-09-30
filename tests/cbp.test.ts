import { describe, expect, it } from 'vitest';
import {
  NAICS_TARGETS,
  extractCbp,
  indexHeader,
  normalizeNaics,
  padFips,
  parseEmployment,
  parseSizeClass,
  splitCsvLine,
} from '../src/prep/cbp';

const HEADER =
  '"fipstate","fipscty","naics","emp_nf","emp","qp1_nf","qp1","ap_nf","ap","est","n<5","n5_9","n10_19","n20_49","n50_99","n100_249","n250_499","n500_999","n1000","n1000_1","n1000_2","n1000_3","n1000_4"';

const row = (st: string, cty: string, naics: string, flag: string, emp: string | number, est: number, sizes: string[]) =>
  [`"${st}"`, `"${cty}"`, `"${naics}"`, `"${flag}"`, emp, '"G"', 0, '"G"', 0, est, ...sizes, '"N"', '"N"', '"N"', '"N"'].join(',');

const N = '"N"';
const FIXTURE = [
  HEADER,
  row('04', '001', '------', 'G', 6093, 449, ['231', '92', '64', '41', '15', '3', '3', N, N]),
  row('04', '001', '238220', 'H', 24, 5, ['3', N, N, N, N, N, N, N, N]),
  row('04', '001', '8111//', 'G', 120, 20, ['12', '5', '3', N, N, N, N, N, N]),
  row('04', '001', '81111/', 'G', 99, 15, ['9', '4', N, N, N, N, N, N, N]),
  row('04', '001', '5617//', 'G', 50, 8, ['5', '3', N, N, N, N, N, N, N]),
  row('04', '999', '238220', 'G', 400, 9, ['6', '3', N, N, N, N, N, N, N]),
  row('10', '001', '------', 'G', 900, 70, ['40', '20', '10', N, N, N, N, N, N]),
  row('10', '001', '238220', 'D', 0, 4, [N, N, N, N, N, N, N, N, N]),
  '',
].join('\n');

const targets = new Set(NAICS_TARGETS.map((t) => t.code));

describe('NAICS code handling', () => {
  it('strips quotes and slash or dash padding', () => {
    expect(normalizeNaics('"8111//"')).toBe('8111');
    expect(normalizeNaics('"7225//"')).toBe('7225');
    expect(normalizeNaics('"238220"')).toBe('238220');
    expect(normalizeNaics('"------"')).toBe('');
    expect(normalizeNaics('"11----"')).toBe('11');
  });

  it('keeps exactly ten target codes, all distinct', () => {
    expect(NAICS_TARGETS).toHaveLength(10);
    expect(targets.size).toBe(10);
  });

  it('matches 8111 exactly and does not pull in its 5-digit child 81111', () => {
    const out = extractCbp(FIXTURE, targets);
    expect(out.byNaics.get('8111')?.get('04001')?.est).toBe(20);
    expect(out.byNaics.has('81111')).toBe(false);
    expect(out.byNaics.has('5617')).toBe(false);
    expect(out.rawCodes.get('8111')).toBe('8111//');
  });
});

describe('FIPS padding', () => {
  it('pads numeric parts that lost their leading zeros', () => {
    expect(padFips(4, 13)).toBe('04013');
    expect(padFips('4', '1')).toBe('04001');
    expect(padFips('48', '453')).toBe('48453');
  });

  it('rejects malformed parts instead of producing a wrong key', () => {
    expect(() => padFips('A4', '013')).toThrow();
    expect(() => padFips('123', '013')).toThrow();
    expect(() => padFips('04', '1234')).toThrow();
  });

  it('keeps the leading zero through a full extract', () => {
    const out = extractCbp(FIXTURE, targets);
    expect([...out.byNaics.get('238220')!.keys()]).toEqual(['04001', '10001']);
  });
});

describe('CSV splitting', () => {
  it('handles quoted fields with commas and doubled quotes', () => {
    expect(splitCsvLine('"a,b",c,"say ""hi"""')).toEqual(['a,b', 'c', 'say "hi"']);
  });

  it('keeps empty fields', () => {
    expect(splitCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
  });
});

describe('suppression and noise flags', () => {
  it('publishes employment with noise flags G, H and J', () => {
    expect(parseEmployment('"G"', '12')).toEqual({ emp: 12, empFlag: 'G' });
    expect(parseEmployment('"H"', '0')).toEqual({ emp: 0, empFlag: 'H' });
    expect(parseEmployment('"J"', '86')).toEqual({ emp: 86, empFlag: 'J' });
  });

  it('turns withheld employment (D, S, N or any other flag) into null, never 0', () => {
    for (const flag of ['"D"', '"S"', '"N"', '"X"', '""']) {
      expect(parseEmployment(flag, '0').emp).toBeNull();
    }
    expect(parseEmployment('"D"', '0').empFlag).toBe('D');
  });

  it('turns a non-numeric employment value into null even with a published flag', () => {
    expect(parseEmployment('"G"', '"N"').emp).toBeNull();
  });

  it('reads a suppressed size-class count "N" as null and a real count as a number', () => {
    expect(parseSizeClass('"N"')).toBeNull();
    expect(parseSizeClass('3')).toBe(3);
    expect(parseSizeClass('0')).toBe(0);
  });

  it('carries withheld values through the extract as null', () => {
    const rec = extractCbp(FIXTURE, targets).byNaics.get('238220')!.get('10001')!;
    expect(rec.est).toBe(4);
    expect(rec.emp).toBeNull();
    expect(rec.sizes.every((s) => s === null)).toBe(true);
  });
});

describe('extract structure', () => {
  it('drops statewide 999 rows and records county coverage from total rows', () => {
    const out = extractCbp(FIXTURE, targets);
    expect(out.byNaics.get('238220')!.has('04999')).toBe(false);
    expect([...out.countiesInFile].sort()).toEqual(['04001', '10001']);
    expect(out.rowCount).toBe(8);
  });

  it('fails loudly on a missing column or a short line', () => {
    expect(() => indexHeader('"fipstate","fipscty","naics"')).toThrow(/missing columns/);
    expect(() => extractCbp(`${HEADER}\n"04","001","238220"`, targets)).toThrow(/expected 23 fields/);
  });

  it('fails loudly on a duplicate county-industry row', () => {
    const dup = [HEADER, row('04', '001', '238220', 'G', 1, 1, Array(9).fill(N)), row('04', '001', '238220', 'G', 1, 1, Array(9).fill(N))].join('\n');
    expect(() => extractCbp(dup, targets)).toThrow(/Duplicate/);
  });
});
