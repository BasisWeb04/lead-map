import { describe, expect, it } from 'vitest';
import { extractCbp, NAICS_TARGETS } from '../src/prep/cbp';
import { parsePopulation } from '../src/prep/pep';
import { buildProcessed, serializeRows } from '../src/prep/build';
import type { CountiesFile, IndustryFile, MetaFile } from '../src/lib/schema';

const PEP = [
  'SUMLEV,REGION,DIVISION,STATE,COUNTY,STNAME,CTYNAME,POPESTIMATE2021,POPESTIMATE2022',
  '040,4,8,04,000,Arizona,Arizona,7000000,7100000',
  '050,4,8,04,001,Arizona,Apache County,66000,65361',
  '050,4,8,4,13,Arizona,Maricopa County,4500000,4559561',
  '050,4,8,35,013,New Mexico,Doña Ana County,220000,221000',
  '050,3,5,10,001,Delaware,Kent County,180000,186000',
  '',
].join('\n');

describe('population parsing', () => {
  const pep = parsePopulation(PEP, 'POPESTIMATE2022');

  it('reads the requested year column and pads FIPS', () => {
    expect(pep.counties.get('04013')?.population).toBe(4559561);
    expect(pep.counties.get('04001')?.population).toBe(65361);
    expect(pep.states.get('04')).toBe('Arizona');
  });

  it('keeps non-ASCII county names decoded as Latin-1', () => {
    // The raw file stores n-tilde as the single byte 0xF1; decoding as UTF-8 would corrupt it.
    const bytes = Buffer.from(PEP, 'latin1');
    expect(bytes.includes(0xf1)).toBe(true);
    expect(parsePopulation(bytes.toString('latin1'), 'POPESTIMATE2022').counties.get('35013')?.name).toBe('Doña Ana County');
    expect(parsePopulation(bytes.toString('utf8'), 'POPESTIMATE2022').counties.get('35013')?.name).not.toBe('Doña Ana County');
  });

  it('throws when the year column is missing', () => {
    expect(() => parsePopulation(PEP, 'POPESTIMATE2030')).toThrow(/POPESTIMATE2030/);
  });
});

const CBP_HEADER =
  '"fipstate","fipscty","naics","emp_nf","emp","qp1_nf","qp1","ap_nf","ap","est","n<5","n5_9","n10_19","n20_49","n50_99","n100_249","n250_499","n500_999","n1000","n1000_1","n1000_2","n1000_3","n1000_4"';
const cbpRow = (st: string, cty: string, naics: string, emp: number, est: number, sizes: (number | 'N')[]) =>
  [`"${st}"`, `"${cty}"`, `"${naics}"`, '"G"', emp, '"G"', 0, '"G"', 0, est, ...sizes.map((x) => (x === 'N' ? '"N"' : x)), '"N"', '"N"', '"N"', '"N"'].join(',');
const NN: 'N'[] = Array<'N'>(6).fill('N');
const CBP = [
  CBP_HEADER,
  cbpRow('10', '001', '------', 900, 70, [40, 20, 10, ...NN]),
  cbpRow('04', '013', '------', 1000, 90, [50, 20, 20, ...NN]),
  cbpRow('10', '001', '238220', 30, 4, [4, 'N', 'N', ...NN]),
  cbpRow('04', '013', '238220', 50, 6, [3, 3, 'N', ...NN]),
].join('\n');

function build() {
  const cbp = extractCbp(CBP, new Set(NAICS_TARGETS.map((t) => t.code)));
  const pep = parsePopulation(PEP, 'POPESTIMATE2022');
  return buildProcessed({ cbp, pep, sources: [], cbpYear: 2022, populationYear: 2022 });
}

describe('processed output', () => {
  it('fixture rows parse with the expected width', () => {
    expect(CBP.split('\n').every((l) => l.split(',').length === 23)).toBe(true);
  });

  it('is byte-identical across two builds', () => {
    const a = build();
    const b = build();
    expect([...a.files.entries()]).toEqual([...b.files.entries()]);
  });

  it('drops target codes that are absent from the file and records them', () => {
    const out = build();
    expect(out.kept.map((k) => k.code)).toEqual(['238220']);
    expect(out.dropped).toHaveLength(9);
    const meta = JSON.parse(out.files.get('meta.json')!) as MetaFile;
    expect(meta.droppedCodes).toContain('7225');
    expect(out.files.has('naics-7225.json')).toBe(false);
  });

  it('writes FIPS as sorted strings, including integer-looking ones such as 10001', () => {
    const file = JSON.parse(build().files.get('naics-238220.json')!) as IndustryFile;
    expect(file.rows.map((r) => r[0])).toEqual(['04013', '10001']);
    expect(typeof file.rows[1][0]).toBe('string');
  });

  it('lists the union of population and CBP counties with a coverage flag', () => {
    const file = JSON.parse(build().files.get('counties.json')!) as CountiesFile;
    const byFips = new Map(file.rows.map((r) => [r[0], r]));
    expect(byFips.get('04013')).toEqual(['04013', 'Maricopa County', '04', 4559561, 1]);
    expect(byFips.get('04001')?.[4]).toBe(0);
  });

  it('serializeRows produces valid JSON', () => {
    const text = serializeRows({ code: 'x', columns: ['a'] }, [['01001', 1, null]]);
    expect(JSON.parse(text)).toEqual({ code: 'x', columns: ['a'], rows: [['01001', 1, null]] });
  });
});
