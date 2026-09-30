import { memo, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, projectCounties, type Geography } from '../lib/geo';
import { classify } from '../lib/quantiles';
import { metricText } from '../lib/format';
import type { MetricKey, ViewRow } from '../lib/types';
import { HATCH_ID } from './HatchDefs';

interface Props {
  geography: Geography;
  /** 'all' or a 2-digit state FIPS */
  stateFips: string;
  rows: readonly ViewRow[];
  metric: MetricKey;
  breaks: readonly number[];
  colors: readonly string[];
  selected: string | null;
  onSelect: (fips: string) => void;
}

function MapViewImpl({ geography, stateFips, rows, metric, breaks, colors, selected, onSelect }: Props) {
  const inView = stateFips === 'all';
  const { paths, borders } = useMemo(() => {
    const counties = inView ? geography.counties : geography.counties.filter((c) => c.id.startsWith(stateFips));
    return projectCounties(counties, inView ? geography.stateBorders : null);
  }, [geography, stateFips, inView]);

  const rowByFips = useMemo(() => new Map(rows.map((r) => [r.fips, r])), [rows]);
  // Tabbing through 3,000 national counties is unusable; in a single state every county is a tab stop.
  const focusable = !inView;
  const selectedPath = paths.find((p) => p.fips === selected);

  const onKey = (fips: string) => (e: KeyboardEvent<SVGPathElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(fips);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className="block h-auto w-full"
      role="group"
      aria-label={inView ? 'Map of US counties. Use the table to select counties by keyboard.' : 'County map. Tab to a county and press Enter to select it.'}
    >
      <g>
        {paths.map((p) => {
          const r = rowByFips.get(p.fips);
          let fill: string;
          let label: string;
          if (!r) {
            fill = 'var(--lm-nomatch)';
            label = 'No matching data: county boundary changed after the map file';
          } else if (r.metric.value === null) {
            fill = `url(#${HATCH_ID})`;
            label = metricText(metric, r.metric);
          } else {
            fill = colors[classify(r.metric.value, breaks)] ?? colors[0];
            label = metricText(metric, r.metric);
          }
          const name = r ? `${r.name}, ${r.stateAbbr}` : `County ${p.fips}`;
          return (
            <path
              key={p.fips}
              d={p.d}
              fill={fill}
              className="lm-county cursor-pointer stroke-white dark:stroke-stone-900"
              strokeWidth={inView ? 0.25 : 0.8}
              tabIndex={focusable && r ? 0 : undefined}
              role={r ? 'button' : undefined}
              aria-label={r ? `${name}: ${label}` : undefined}
              aria-pressed={r ? selected === p.fips : undefined}
              onClick={r ? () => onSelect(p.fips) : undefined}
              onKeyDown={r && focusable ? onKey(p.fips) : undefined}
            >
              <title>{`${name}: ${label}`}</title>
            </path>
          );
        })}
      </g>
      {borders && <path d={borders} fill="none" className="pointer-events-none stroke-stone-500 dark:stroke-stone-400" strokeWidth={0.6} />}
      {selectedPath && (
        <path d={selectedPath.d} fill="none" className="pointer-events-none stroke-accent dark:stroke-accent-dark" strokeWidth={inView ? 1.5 : 2.5} />
      )}
    </svg>
  );
}

export const MapView = memo(MapViewImpl);
