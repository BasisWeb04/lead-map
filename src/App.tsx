import { useCallback, useEffect, useMemo, useState } from 'react';
import atlasUrl from 'us-atlas/counties-10m.json?url';
import type { Topology } from 'topojson-specification';
import metaJson from '../data/processed/meta.json';
import countiesJson from '../data/processed/counties.json';
import { CountyTable } from './components/CountyTable';
import { DetailPanel } from './components/DetailPanel';
import { HatchDefs } from './components/HatchDefs';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import { decodeCounties, decodeIndustry, stateAbbrMap } from './lib/data';
import { formatInt } from './lib/format';
import { toGeography, type Geography } from './lib/geo';
import { MIN_POPULATION } from './lib/metrics';
import { paletteFor } from './lib/palette';
import { choroplethBreaks, legendClasses } from './lib/quantiles';
import type { CountiesFile, IndustryFile, MetaFile } from './lib/schema';
import { METRIC_LABELS, type IndustryRecord, type MetricKey } from './lib/types';
import { ALL_STATES, buildRows, rowsToCsv, sortRows, type SortDir, type SortKey } from './lib/view';

const meta = metaJson as unknown as MetaFile;
const abbr = stateAbbrMap(meta);
const counties = decodeCounties(countiesJson as unknown as CountiesFile, abbr);
const industryLoaders = import.meta.glob<IndustryFile>('../data/processed/naics-*.json', { import: 'default' });

// Arizona is the default view because that is the market this demo was built for.
const DEFAULT_STATE = '04';
const DEFAULT_NAICS = '238220';

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useIndustry(code: string): Load<Map<string, IndustryRecord>> {
  const [state, setState] = useState<Load<Map<string, IndustryRecord>>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    const loader = industryLoaders[`../data/processed/naics-${code}.json`];
    if (!loader) {
      setState({ status: 'error', message: `No data file for NAICS ${code}` });
      return;
    }
    loader()
      .then((file) => live && setState({ status: 'ready', data: decodeIndustry(file) }))
      .catch((e: unknown) => live && setState({ status: 'error', message: errorText(e) }));
    return () => {
      live = false;
    };
  }, [code]);
  return state;
}

function useGeography(): Load<Geography> {
  const [state, setState] = useState<Load<Geography>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    fetch(atlasUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Map shapes failed to load (${r.status})`);
        return r.json() as Promise<Topology>;
      })
      .then((t) => live && setState({ status: 'ready', data: toGeography(t) }))
      .catch((e: unknown) => live && setState({ status: 'error', message: errorText(e) }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-stone-600 dark:text-stone-400';
const inputCls =
  'lm-focus mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-900';

export default function App() {
  const [naics, setNaics] = useState(DEFAULT_NAICS);
  const [metric, setMetric] = useState<MetricKey>('per10k');
  const [stateFips, setStateFips] = useState(DEFAULT_STATE);
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const industry = useIndustry(naics);
  const geo = useGeography();
  const industryInfo = meta.industries.find((i) => i.code === naics) ?? meta.industries[0];
  const stateName = (fips: string) => meta.states.find((s) => s[0] === fips)?.[2] ?? fips;

  const rows = useMemo(
    () => (industry.status === 'ready' ? buildRows(counties, industry.data, metric, stateFips) : []),
    [industry, metric, stateFips],
  );
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const values = useMemo(() => rows.map((r) => r.metric.value), [rows]);
  const breaks = useMemo(() => choroplethBreaks(values), [values]);
  const classes = useMemo(() => legendClasses(values, breaks), [values, breaks]);
  const colors = useMemo(() => paletteFor(breaks.length + 1), [breaks]);
  const missingCount = values.filter((v) => v === null).length;
  const noMatchCount = useMemo(() => {
    if (geo.status !== 'ready') return 0;
    return geo.data.counties.filter((c) => (stateFips === ALL_STATES || c.id.startsWith(stateFips)) && !counties.has(c.id)).length;
  }, [geo, stateFips]);
  const selectedRow = rows.find((r) => r.fips === selected) ?? null;
  const totalEst = rows.reduce((s, r) => s + (r.est ?? 0), 0);

  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir(key === 'name' || key === 'state' || key === 'rank' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  const onState = (fips: string) => {
    setStateFips(fips);
    if (selected && fips !== ALL_STATES && !selected.startsWith(fips)) setSelected(null);
  };

  const exportCsv = () => {
    const scope = stateFips === ALL_STATES ? 'us' : (abbr.get(stateFips) ?? stateFips).toLowerCase();
    downloadText(rowsToCsv(sorted, naics, metric), `lead-map-${naics}-${scope}-${metric}.csv`);
  };

  const cbp = meta.sources.find((s) => s.id.startsWith('cbp'));
  const sourceLine = `Source: U.S. Census Bureau, County Business Patterns ${meta.cbpYear} (${cbp?.id ?? 'cbp'}); population: Census Vintage 2025 estimates for July 1, ${meta.populationYear}. Public domain.`;
  const viewName = stateFips === ALL_STATES ? 'United States' : stateName(stateFips);

  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-10 sm:px-5">
      <HatchDefs />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 py-2 text-xs text-stone-700 dark:border-stone-700 dark:text-stone-300">
        <p>
          <strong className="font-semibold">Demo with public Census data.</strong> Counts of business establishments, not contact lists. No
          personal data.
        </p>
        <a href="https://ethanchacko.com" className="lm-focus rounded font-medium text-accent underline-offset-2 hover:underline dark:text-accent-dark">
          Built by Ethan Chacko
        </a>
      </div>

      <header className="py-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Lead Map</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">Where service businesses are, county by county. Employer establishments, {meta.cbpYear}.</p>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded border border-stone-300 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1.3fr_auto] dark:border-stone-700 dark:bg-stone-900" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="industry" className={labelCls}>Industry</label>
          <select id="industry" className={inputCls} value={naics} onChange={(e) => setNaics(e.target.value)}>
            {meta.industries.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label} ({i.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="metric" className={labelCls}>Measure</label>
          <select id="metric" className={inputCls} value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
            {(Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => (
              <option key={k} value={k}>
                {METRIC_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="state" className={labelCls}>State</label>
          <select id="state" className={inputCls} value={stateFips} onChange={(e) => onState(e.target.value)}>
            <option value={ALL_STATES}>All states</option>
            {meta.states.map(([fips, , name]) => (
              <option key={fips} value={fips}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="lm-focus w-full rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Export CSV ({formatInt(rows.length)} rows)
          </button>
        </div>
      </form>

      <p className="mt-3 text-sm" aria-live="polite">
        {industry.status === 'ready' ? (
          <>
            <span className="font-medium">{viewName}:</span> {formatInt(totalEst)} {industryInfo.label.toLowerCase()} establishments across{' '}
            {formatInt(rows.length)} counties.{stateFips === DEFAULT_STATE && ' Arizona is the default view.'}
          </>
        ) : industry.status === 'loading' ? (
          'Loading industry data...'
        ) : (
          <span className="text-red-700 dark:text-red-400">Could not load industry data: {industry.message}</span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="rounded border border-stone-300 bg-white p-2 dark:border-stone-700 dark:bg-stone-900">
            {geo.status === 'ready' ? (
              <MapView
                geography={geo.data}
                stateFips={stateFips}
                rows={rows}
                metric={metric}
                breaks={breaks}
                colors={colors}
                selected={selected}
                onSelect={setSelected}
              />
            ) : geo.status === 'loading' ? (
              <p className="p-8 text-center text-sm text-stone-600 dark:text-stone-400">Loading county shapes...</p>
            ) : (
              <p className="p-8 text-center text-sm text-red-700 dark:text-red-400">
                {geo.message}. The table still has every county.
              </p>
            )}
          </div>
          <Legend metric={metric} classes={classes} colors={colors} missingCount={missingCount} noMatchCount={noMatchCount} />
          <DetailPanel
            row={selectedRow}
            metric={metric}
            industryLabel={industryInfo.label}
            naics={industryInfo.code}
            stateName={selectedRow ? stateName(selectedRow.stateFips) : ''}
            sizeClasses={meta.sizeClasses}
            sourceLine={sourceLine}
          />
        </div>
        <section aria-labelledby="table-h" className="min-w-0">
          <h2 id="table-h" className="mb-2 text-sm font-medium">
            Counties in view <span className="font-normal text-stone-600 dark:text-stone-400">(same data as the map)</span>
          </h2>
          <CountyTable
            rows={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            selected={selected}
            onSelect={setSelected}
            showState={stateFips === ALL_STATES}
          />
        </section>
      </div>

      <section aria-labelledby="notes-h" className="mt-8 max-w-3xl text-sm text-stone-700 dark:text-stone-300">
        <h2 id="notes-h" className="mb-2 font-medium">How to read this</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Counts are employer establishments (locations with paid staff) from County Business Patterns. Self-employed owners with no staff are not included.</li>
          <li>Employment is the mid-March {meta.cbpYear} head count. Census adds noise to protect respondents; values marked "high noise" may be off by 5% or more.</li>
          <li>"Not published" is never zero. A county missing from the business file, or a size class the file withholds, is shown in words, hatched on the map, and written as words in the CSV.</li>
          <li>
            Rates are not computed for counties under {formatInt(MIN_POPULATION)} residents: there, one business moves the per-10,000 rate by 4 or more.
          </li>
          <li>Residents per establishment is a rough "room for another business" signal: higher means fewer competitors per person. It ignores county size, travel and demand.</li>
          <li>Connecticut reports by planning region since 2022 and one Alaska area was split in 2019; the map shapes predate both, so those appear in the table only.</li>
        </ul>
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{sourceLine}</p>
      </section>
    </div>
  );
}
