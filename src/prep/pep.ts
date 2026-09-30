// Parsing for the Census Population Estimates (PEP) county totals file (co-est20XX-alldata.csv).
import { padFips, splitCsvLine, stripQuotes } from './cbp';

export interface PepCounty {
  fips: string;
  stateFips: string;
  name: string;
  population: number;
}

export interface PepExtract {
  counties: Map<string, PepCounty>;
  /** state FIPS -> state name */
  states: Map<string, string>;
}

/** Reads county (SUMLEV 050) and state (040) rows; `yearColumn` picks the estimate year, e.g. POPESTIMATE2022. */
export function parsePopulation(text: string, yearColumn: string): PepExtract {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]).map((h) => stripQuotes(h).toUpperCase());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Population file missing column ${name}`);
    return i;
  };
  const iSum = col('SUMLEV');
  const iState = col('STATE');
  const iCounty = col('COUNTY');
  const iStName = col('STNAME');
  const iCtyName = col('CTYNAME');
  const iPop = col(yearColumn.toUpperCase());

  const counties = new Map<string, PepCounty>();
  const states = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line).map(stripQuotes);
    const sumlev = f[iSum];
    const stateFips = f[iState].padStart(2, '0');
    if (sumlev === '040') {
      states.set(stateFips, f[iStName]);
      continue;
    }
    if (sumlev !== '050') continue;
    const pop = f[iPop];
    if (!/^\d+$/.test(pop)) throw new Error(`Non-numeric population for ${f[iState]}${f[iCounty]}`);
    const fips = padFips(f[iState], f[iCounty]);
    counties.set(fips, { fips, stateFips, name: f[iCtyName], population: Number(pop) });
  }
  return { counties, states };
}
