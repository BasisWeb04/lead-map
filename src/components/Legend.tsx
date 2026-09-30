import { formatMetricNumber } from '../lib/format';
import { HATCH_ID } from './HatchDefs';
import type { LegendClass } from '../lib/quantiles';
import { METRIC_LABELS, type MetricKey } from '../lib/types';

interface Props {
  metric: MetricKey;
  classes: readonly LegendClass[];
  colors: readonly string[];
  missingCount: number;
  noMatchCount: number;
}

function rangeText(metric: MetricKey, c: LegendClass): string {
  const f = (n: number) => formatMetricNumber(metric, n);
  if (c.lo === c.hi) return f(c.lo);
  if (c.to === null) return c.from === c.max ? f(c.from) : `${f(c.from)} to ${f(c.max)}`;
  return `${f(c.from)} to under ${f(c.to)}`;
}

export function Legend({ metric, classes, colors, missingCount, noMatchCount }: Props) {
  return (
    <figure className="text-xs" aria-label="Map legend">
      <figcaption className="mb-1 font-medium text-stone-700 dark:text-stone-300">
        {METRIC_LABELS[metric]}, quantile classes of the counties in view
      </figcaption>
      {classes.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">No published values in this view.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {classes.map((c) => (
            <li key={c.index} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border border-stone-400/60" style={{ background: colors[c.index] }} aria-hidden="true" />
              <span className="font-mono tabular-nums">{rangeText(metric, c)}</span>
              <span className="text-stone-500 dark:text-stone-400">({c.count})</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-stone-600 dark:text-stone-400">
        <li className="flex items-center gap-1.5">
          <svg width="20" height="12" aria-hidden="true">
            <rect width="20" height="12" fill={`url(#${HATCH_ID})`} className="stroke-stone-400" />
          </svg>
          Not published or not computed ({missingCount}); the table says why
        </li>
        {noMatchCount > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm" style={{ background: 'var(--lm-nomatch)' }} aria-hidden="true" />
            Boundary changed after the map file ({noMatchCount} shapes)
          </li>
        )}
      </ul>
    </figure>
  );
}
