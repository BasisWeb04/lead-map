export type MetricKey = 'est' | 'per10k' | 'residentsPer';

/** Why a value is absent. None of these is ever displayed or exported as 0. */
export type MissingReason =
  | 'not-in-file' // the CBP file has no rows at all for this county
  | 'no-population' // no population estimate to divide by
  | 'small-population' // below the minimum population guard for rates
  | 'no-establishments'; // residents per establishment is undefined when there are none

export interface MetricValue {
  value: number | null;
  reason: MissingReason | null;
}

export interface County {
  fips: string;
  name: string;
  stateFips: string;
  stateAbbr: string;
  population: number | null;
  inCbp: boolean;
}

export interface IndustryRecord {
  est: number;
  emp: number | null;
  empFlag: string;
  /** null entries are suppressed counts (0, 1 or 2) */
  sizes: (number | null)[];
}

export type EmploymentStatus = 'published' | 'withheld' | 'none' | 'not-in-file';

export interface ViewRow {
  fips: string;
  name: string;
  stateFips: string;
  stateAbbr: string;
  population: number | null;
  /** null only when the county is absent from the CBP file; 0 is a real zero (no row for this industry) */
  est: number | null;
  emp: number | null;
  empFlag: string | null;
  empStatus: EmploymentStatus;
  sizes: (number | null)[] | null;
  per10k: MetricValue;
  residentsPer: MetricValue;
  /** The value for the metric currently mapped. */
  metric: MetricValue;
  /** Rank within the county's state for the current metric, highest first; null when unranked. */
  rank: number | null;
  /** Number of ranked counties in the state. */
  rankOf: number;
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  est: 'Establishments',
  per10k: 'Establishments per 10,000 residents',
  residentsPer: 'Residents per establishment (room for another business)',
};
