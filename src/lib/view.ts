// Builds the rows the map, table, detail panel and CSV export all read from, so they cannot disagree.
import { toCsv, type CsvCell } from './csv';
import { employmentText, metricText } from './format';
import { estMetric, per10k, residentsPer } from './metrics';
import { rankDescending } from './rank';
import type { County, IndustryRecord, MetricKey, MetricValue, ViewRow } from './types';

export const ALL_STATES = 'all';

function baseRow(county: County, rec: IndustryRecord | undefined): Omit<ViewRow, 'metric' | 'rank' | 'rankOf'> {
  // CBP lists every county-industry pair that has at least one establishment, so a covered county with
  // no row has a true zero. A county the file does not cover at all has no value.
  const est = !county.inCbp ? null : rec ? rec.est : 0;
  const empStatus = !county.inCbp ? 'not-in-file' : !rec ? 'none' : rec.emp === null ? 'withheld' : 'published';
  return {
    fips: county.fips,
    name: county.name,
    stateFips: county.stateFips,
    stateAbbr: county.stateAbbr,
    population: county.population,
    est,
    emp: empStatus === 'none' ? 0 : rec ? rec.emp : null,
    empFlag: rec ? rec.empFlag : null,
    empStatus,
    sizes: rec ? rec.sizes : null,
    per10k: per10k(est, county.population),
    residentsPer: residentsPer(est, county.population),
  };
}

export function metricOf(row: Pick<ViewRow, 'est' | 'per10k' | 'residentsPer'>, metric: MetricKey): MetricValue {
  if (metric === 'per10k') return row.per10k;
  if (metric === 'residentsPer') return row.residentsPer;
  return estMetric(row.est);
}

/** Rows for every county in scope. Ranks are always within the county's own state. */
export function buildRows(
  counties: ReadonlyMap<string, County>,
  industry: ReadonlyMap<string, IndustryRecord>,
  metric: MetricKey,
  stateFips: string = ALL_STATES,
): ViewRow[] {
  const all = [...counties.values()].map((c) => baseRow(c, industry.get(c.fips)));
  const byState = new Map<string, typeof all>();
  for (const r of all) {
    const list = byState.get(r.stateFips) ?? [];
    list.push(r);
    byState.set(r.stateFips, list);
  }
  const rows: ViewRow[] = [];
  for (const [st, list] of byState) {
    if (stateFips !== ALL_STATES && st !== stateFips) continue;
    const { ranks, ranked } = rankDescending(list, (r) => metricOf(r, metric).value, (r) => r.fips);
    for (const r of list) {
      rows.push({ ...r, metric: metricOf(r, metric), rank: ranks.get(r.fips) ?? null, rankOf: ranked });
    }
  }
  return rows.sort((a, b) => (a.fips < b.fips ? -1 : 1));
}

export type SortKey = 'name' | 'state' | 'est' | 'emp' | 'per10k' | 'residentsPer' | 'rank';
export type SortDir = 'asc' | 'desc';

function sortValue(r: ViewRow, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return r.name;
    case 'state':
      return r.stateAbbr;
    case 'est':
      return r.est;
    case 'emp':
      return r.emp;
    case 'per10k':
      return r.per10k.value;
    case 'residentsPer':
      return r.residentsPer.value;
    case 'rank':
      return r.rank;
  }
}

/** Missing values always sort last, whatever the direction, so they never pose as the smallest. */
export function sortRows(rows: readonly ViewRow[], key: SortKey, dir: SortDir): ViewRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return a.fips < b.fips ? -1 : 1;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp !== 0 ? sign * cmp : a.fips < b.fips ? -1 : 1;
  });
}

export const CSV_HEADER = [
  'fips',
  'county',
  'state',
  'industry_naics',
  'population_2022',
  'establishments',
  'employment_march_2022',
  'employment_noise_flag',
  'establishments_per_10k_residents',
  'residents_per_establishment',
  'rank_in_state',
  'ranked_by',
] as const;

/** Missing values are written as the same words the table shows, so a blank can never be read as zero. */
export function rowsToCsv(rows: readonly ViewRow[], naics: string, metric: MetricKey): string {
  const body = rows.map((r): CsvCell[] => [
    r.fips,
    r.name,
    r.stateAbbr,
    naics,
    r.population ?? 'no population estimate',
    r.est ?? 'not published',
    r.emp ?? employmentText(r.emp, r.empStatus, r.empFlag),
    r.empStatus === 'published' ? r.empFlag : '',
    r.per10k.value ?? metricText('per10k', r.per10k),
    r.residentsPer.value ?? metricText('residentsPer', r.residentsPer),
    r.rank ?? 'unranked',
    metric,
  ]);
  return toCsv(CSV_HEADER, body);
}
