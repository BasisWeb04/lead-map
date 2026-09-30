import type { MetricValue } from './types';

/**
 * Rates are not computed below this population. Under 2,500 residents a single establishment moves the
 * per-10,000 rate by 4 or more, which drowns out the differences the map is meant to show (147 of 3,144
 * counties in the 2022 estimates fall below it). Raw counts are still shown for those counties.
 */
export const MIN_POPULATION = 2500;

const missing = (reason: MetricValue['reason']): MetricValue => ({ value: null, reason });

/** Rounds half away from zero to a fixed number of decimals so ties and displayed values agree. */
export function roundTo(value: number, decimals: number): number {
  // Shifting through the exponent string avoids binary artifacts such as 1.005 * 100 = 100.49999.
  const shifted = Math.round(Number(`${Math.abs(value)}e${decimals}`));
  const out = Math.sign(value) * Number(`${shifted}e-${decimals}`);
  // Very small numbers already print in exponent form, which the string shift cannot handle.
  return Number.isFinite(out) ? out : Math.round(value * 10 ** decimals) / 10 ** decimals;
}

function populationGuard(est: number | null, population: number | null): MetricValue | null {
  if (est === null) return missing('not-in-file');
  if (population === null || population <= 0) return missing('no-population');
  if (population < MIN_POPULATION) return missing('small-population');
  return null;
}

/** Establishments per 10,000 residents, rounded to 2 decimals. */
export function per10k(est: number | null, population: number | null): MetricValue {
  const blocked = populationGuard(est, population);
  if (blocked) return blocked;
  return { value: roundTo(((est as number) / (population as number)) * 10000, 2), reason: null };
}

/** Residents per establishment, rounded to whole people; undefined when there are no establishments. */
export function residentsPer(est: number | null, population: number | null): MetricValue {
  const blocked = populationGuard(est, population);
  if (blocked) return blocked;
  if (est === 0) return missing('no-establishments');
  return { value: Math.round((population as number) / (est as number)), reason: null };
}

export function estMetric(est: number | null): MetricValue {
  return est === null ? missing('not-in-file') : { value: est, reason: null };
}
