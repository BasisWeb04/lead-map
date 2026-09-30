import { useEffect, useRef } from 'react';
import { employmentText, formatInt, metricText } from '../lib/format';
import type { SortDir, SortKey } from '../lib/view';
import type { ViewRow } from '../lib/types';

interface Props {
  rows: readonly ViewRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  selected: string | null;
  onSelect: (fips: string) => void;
  showState: boolean;
}

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'County', numeric: false },
  { key: 'state', label: 'State', numeric: false },
  { key: 'est', label: 'Establishments', numeric: true },
  { key: 'emp', label: 'Employment', numeric: true },
  { key: 'per10k', label: 'Per 10k residents', numeric: true },
  { key: 'residentsPer', label: 'Residents per est.', numeric: true },
  { key: 'rank', label: 'Rank in state', numeric: true },
];

const muted = 'text-stone-500 dark:text-stone-400 italic';

function Cell({ text, missing }: { text: string; missing: boolean }) {
  return <span className={missing ? muted : undefined}>{text}</span>;
}

export function CountyTable({ rows, sortKey, sortDir, onSort, selected, onSelect, showState }: Props) {
  const selectedRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const columns = showState ? COLUMNS : COLUMNS.filter((c) => c.key !== 'state');
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-stone-600 dark:text-stone-400">No counties in this view.</p>;
  }
  return (
    <div className="max-h-[36rem] overflow-auto rounded border border-stone-300 dark:border-stone-700">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Counties in the current view, sortable by each column</caption>
        <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-stone-900">
          <tr>
            {columns.map((c) => {
              const active = c.key === sortKey;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`border-b border-stone-300 px-2 py-1.5 font-medium dark:border-stone-700 ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  <button type="button" onClick={() => onSort(c.key)} className="lm-focus inline-flex items-center gap-1 whitespace-nowrap rounded px-0.5 hover:underline">
                    {c.label}
                    <span aria-hidden="true" className="font-mono text-[10px] text-stone-600 dark:text-stone-400">
                      {active ? (sortDir === 'asc' ? 'asc' : 'desc') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => {
            const isSel = r.fips === selected;
            return (
              <tr
                key={r.fips}
                ref={isSel ? selectedRef : undefined}
                className={`border-b border-stone-200 dark:border-stone-800 ${isSel ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-stone-100 dark:hover:bg-stone-900'}`}
              >
                <th scope="row" className="px-2 py-1 text-left font-sans font-normal">
                  <button type="button" onClick={() => onSelect(r.fips)} aria-pressed={isSel} className="lm-focus rounded text-left hover:underline">
                    {r.name}
                  </button>
                </th>
                {showState && <td className="px-2 py-1 font-sans">{r.stateAbbr}</td>}
                <td className="px-2 py-1 text-right">
                  <Cell text={r.est === null ? 'not published' : formatInt(r.est)} missing={r.est === null} />
                </td>
                <td className="px-2 py-1 text-right">
                  <Cell text={employmentText(r.emp, r.empStatus, r.empFlag)} missing={r.emp === null} />
                </td>
                <td className="px-2 py-1 text-right">
                  <Cell text={metricText('per10k', r.per10k)} missing={r.per10k.value === null} />
                </td>
                <td className="px-2 py-1 text-right">
                  <Cell text={metricText('residentsPer', r.residentsPer)} missing={r.residentsPer.value === null} />
                </td>
                <td className="px-2 py-1 text-right">
                  <Cell text={r.rank === null ? 'unranked' : `${r.rank} of ${r.rankOf}`} missing={r.rank === null} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
