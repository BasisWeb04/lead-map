// Decodes the committed data/processed files into lookup maps.
import type { CountiesFile, IndustryFile, MetaFile } from './schema';
import type { County, IndustryRecord } from './types';

const FIPS_RE = /^\d{5}$/;

function checkFips(fips: unknown): string {
  if (typeof fips !== 'string' || !FIPS_RE.test(fips)) {
    throw new Error(`Invalid county FIPS in data file: ${JSON.stringify(fips)}`);
  }
  return fips;
}

export function stateAbbrMap(meta: Pick<MetaFile, 'states'>): Map<string, string> {
  return new Map(meta.states.map(([fips, abbr]) => [fips, abbr]));
}

export function decodeCounties(file: CountiesFile, abbr: Map<string, string>): Map<string, County> {
  const out = new Map<string, County>();
  for (const [fips, name, stateFips, population, inCbp] of file.rows) {
    const f = checkFips(fips);
    out.set(f, {
      fips: f,
      name,
      stateFips,
      stateAbbr: abbr.get(stateFips) ?? stateFips,
      population,
      inCbp: inCbp === 1,
    });
  }
  return out;
}

export function decodeIndustry(file: IndustryFile): Map<string, IndustryRecord> {
  const out = new Map<string, IndustryRecord>();
  for (const [fips, est, emp, empFlag, ...sizes] of file.rows) {
    out.set(checkFips(fips), { est, emp, empFlag, sizes });
  }
  return out;
}
