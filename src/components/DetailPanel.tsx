import { NOISE_TEXT, employmentText, formatInt, metricText, sizeClassText } from '../lib/format';
import { METRIC_LABELS, type MetricKey, type ViewRow } from '../lib/types';

interface Props {
  row: ViewRow | null;
  metric: MetricKey;
  industryLabel: string;
  naics: string;
  stateName: string;
  sizeClasses: readonly string[];
  sourceLine: string;
}

function Stat({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-200 py-1 dark:border-stone-800">
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className={`text-right font-mono tabular-nums ${missing ? 'italic text-stone-500 dark:text-stone-400' : ''}`}>{value}</dd>
    </div>
  );
}

export function DetailPanel({ row, metric, industryLabel, naics, stateName, sizeClasses, sourceLine }: Props) {
  if (!row) {
    return (
      <section aria-labelledby="detail-h" className="rounded border border-dashed border-stone-300 p-4 text-sm dark:border-stone-700">
        <h2 id="detail-h" className="font-medium">County detail</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">Select a county on the map or in the table.</p>
      </section>
    );
  }
  const flagNote = row.empStatus === 'published' && row.empFlag ? NOISE_TEXT[row.empFlag] : null;
  return (
    <section aria-labelledby="detail-h" aria-live="polite" className="rounded border border-stone-300 p-4 text-sm dark:border-stone-700">
      <h2 id="detail-h" className="text-base font-semibold">
        {row.name}, {row.stateAbbr}
      </h2>
      <p className="text-stone-600 dark:text-stone-400">
        {industryLabel} (NAICS {naics})
      </p>
      <dl className="mt-3">
        <Stat label="Population, July 2022" value={row.population === null ? 'no estimate' : formatInt(row.population)} missing={row.population === null} />
        <Stat label="Establishments" value={row.est === null ? 'not published' : formatInt(row.est)} missing={row.est === null} />
        <Stat label="Employment, mid-March" value={employmentText(row.emp, row.empStatus, row.empFlag)} missing={row.emp === null} />
        {flagNote && <Stat label="Employment noise" value={flagNote} />}
        <Stat label="Per 10,000 residents" value={metricText('per10k', row.per10k)} missing={row.per10k.value === null} />
        <Stat label="Residents per establishment" value={metricText('residentsPer', row.residentsPer)} missing={row.residentsPer.value === null} />
        <Stat
          label={`Rank in ${stateName}`}
          value={row.rank === null ? 'unranked' : `${row.rank} of ${row.rankOf}, by ${METRIC_LABELS[metric].toLowerCase()}`}
          missing={row.rank === null}
        />
      </dl>
      {row.sizes && row.est !== null && row.est > 0 && (
        <details className="mt-3">
          <summary className="lm-focus cursor-pointer rounded font-medium">Establishments by employee count</summary>
          <dl className="mt-1">
            {sizeClasses.map((label, i) => (
              <Stat key={label} label={`${label} employees`} value={sizeClassText(row.sizes?.[i] ?? null)} missing={row.sizes?.[i] === null} />
            ))}
          </dl>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            This file never publishes a size-class count below 3, so "not published" here means 0, 1 or 2 establishments.
          </p>
        </details>
      )}
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{sourceLine}</p>
    </section>
  );
}
