// Checks the committed data/processed files. Golden values were copied from the raw cbp22co.txt and
// co-est2025-alldata.csv with unzip and awk, a separate path from the TypeScript parser.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CountiesFile, IndustryFile, MetaFile } from '../src/lib/schema';

const DIR = join(__dirname, '..', 'data', 'processed');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T;

const meta = read<MetaFile>('meta.json');
const counties = read<CountiesFile>('counties.json');
const industries = new Map(meta.industries.map((i) => [i.code, read<IndustryFile>(`naics-${i.code}.json`)]));
const row = (code: string, fips: string) => industries.get(code)!.rows.find((r) => r[0] === fips);
const county = (fips: string) => counties.rows.find((r) => r[0] === fips);

const N = null;

describe('golden Arizona counties', () => {
  it('Maricopa (04013) plumbing and HVAC, 238220', () => {
    expect(row('238220', '04013')).toEqual(['04013', 1558, 23816, 'G', 889, 294, 160, 122, 52, 27, 10, 3, N]);
  });

  it('Pima (04019) restaurants, 7225', () => {
    expect(row('7225', '04019')).toEqual(['04019', 1574, 35393, 'G', 259, 247, 410, 494, 141, 22, N, N, N]);
  });

  it('La Paz (04012) plumbing and HVAC with a suppressed smallest size class', () => {
    expect(row('238220', '04012')).toEqual(['04012', 5, 34, 'H', N, 3, N, N, N, N, N, N, N]);
  });

  it('Greenlee (04011): 7 restaurants with every size class suppressed, and no plumbing row at all', () => {
    expect(row('7225', '04011')).toEqual(['04011', 7, 86, 'H', N, N, N, N, N, N, N, N, N]);
    expect(row('238220', '04011')).toBeUndefined();
    expect(county('04011')).toEqual(['04011', 'Greenlee County', '04', 9311, 1]);
  });

  it('populations for the golden counties match the 2022 estimate column', () => {
    expect(county('04013')?.[3]).toBe(4559561);
    expect(county('04019')?.[3]).toBe(1058224);
    expect(county('04012')?.[3]).toBe(16460);
  });
});

describe('processed data invariants', () => {
  it('keeps all ten industries and drops none', () => {
    expect(meta.industries.map((i) => i.code)).toEqual(['238220', '238210', '238160', '238320', '561730', '561710', '561720', '8111', '621210', '7225']);
    expect(meta.droppedCodes).toEqual([]);
  });

  it('every FIPS key is a 5-digit string and every county row is unique', () => {
    const seen = new Set<string>();
    for (const r of counties.rows) {
      expect(r[0]).toMatch(/^\d{5}$/);
      expect(seen.has(r[0])).toBe(false);
      seen.add(r[0]);
    }
    for (const file of industries.values()) for (const r of file.rows) expect(r[0]).toMatch(/^\d{5}$/);
  });

  it('employment is null exactly when its flag is not a published noise flag', () => {
    for (const file of industries.values()) {
      for (const [, , emp, flag] of file.rows) {
        expect(['G', 'H', 'J'].includes(flag)).toBe(emp !== null);
      }
    }
  });

  it('suppressed size classes are null: published counts are never 0 to 2 and sums stay consistent', () => {
    let nulls = 0;
    for (const file of industries.values()) {
      for (const [, est, , , ...sizes] of file.rows) {
        const published = sizes.filter((s): s is number => s !== null);
        const suppressed = sizes.length - published.length;
        nulls += suppressed;
        for (const s of published) expect(s).toBeGreaterThanOrEqual(3);
        const remainder = est - published.reduce((a, b) => a + b, 0);
        expect(remainder).toBeGreaterThanOrEqual(0);
        expect(remainder).toBeLessThanOrEqual(2 * suppressed);
        if (suppressed === 0) expect(remainder).toBe(0);
      }
    }
    expect(nulls).toBeGreaterThan(0);
  });

  it('every industry row belongs to a county that the CBP file covers', () => {
    const covered = new Set(counties.rows.filter((r) => r[4] === 1).map((r) => r[0]));
    for (const file of industries.values()) for (const r of file.rows) expect(covered.has(r[0])).toBe(true);
  });

  it('holds no personal data: only the expected columns and no email or phone patterns', () => {
    for (const name of readdirSync(DIR)) {
      const text = readFileSync(join(DIR, name), 'utf8');
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/);
    }
    for (const file of industries.values()) expect(file.columns.slice(0, 4)).toEqual(['fips', 'est', 'emp', 'empFlag']);
  });

  it('stays small enough for a fast static load', () => {
    const total = readdirSync(DIR).reduce((s, f) => s + readFileSync(join(DIR, f)).length, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});
