import { MIN_POPULATION } from './metrics';
import type { EmploymentStatus, MetricKey, MetricValue, MissingReason } from './types';

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const rateFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatInt = (n: number): string => intFmt.format(n);
export const formatRate = (n: number): string => rateFmt.format(n);

export function formatMetricNumber(metric: MetricKey, n: number): string {
  return metric === 'per10k' ? formatRate(n) : formatInt(n);
}

export function reasonText(reason: MissingReason): string {
  switch (reason) {
    case 'not-in-file':
      return 'not published';
    case 'no-population':
      return 'no population estimate';
    case 'small-population':
      return `not computed (population under ${formatInt(MIN_POPULATION)})`;
    case 'no-establishments':
      return 'undefined (0 establishments)';
  }
}

export function metricText(metric: MetricKey, v: MetricValue): string {
  if (v.value !== null) return formatMetricNumber(metric, v.value);
  return reasonText(v.reason ?? 'not-in-file');
}

export const NOISE_TEXT: Record<string, string> = {
  G: 'low noise (under 2%)',
  H: 'moderate noise (2% to under 5%)',
  J: 'high noise (5% or more)',
};

export function employmentText(emp: number | null, status: EmploymentStatus, flag: string | null): string {
  if (status === 'not-in-file' || status === 'withheld' || emp === null) return 'not published';
  if (status === 'none') return '0';
  return flag === 'J' ? `${formatInt(emp)} (high noise)` : formatInt(emp);
}

/** Size-class cells: null is a suppressed count of 0 to 2, never shown as 0. */
export function sizeClassText(n: number | null): string {
  return n === null ? 'not published (0 to 2)' : formatInt(n);
}
