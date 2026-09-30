// Turns parsed CBP and PEP extracts into the committed data/processed files.
// Output must be deterministic: sorted rows, no timestamps, fixed formatting.
import { NAICS_TARGETS, SIZE_CLASS_COLUMNS, SIZE_CLASS_LABELS, type CbpExtract, type NaicsTarget } from './cbp';
import type { PepExtract } from './pep';
import type {
  CountiesFile,
  CountyRow,
  IndustryFile,
  IndustryInfo,
  IndustryRow,
  MetaFile,
  SourceInfo,
} from '../lib/schema';
import { STATE_ABBR } from '../lib/states';

export interface BuildInput {
  cbp: CbpExtract;
  pep: PepExtract;
  sources: SourceInfo[];
  cbpYear: number;
  populationYear: number;
  targets?: readonly NaicsTarget[];
}

export interface BuildOutput {
  /** file name -> serialized text */
  files: Map<string, string>;
  kept: IndustryInfo[];
  dropped: string[];
}

const byFips = <T extends [string, ...unknown[]]>(a: T, b: T): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** One row per line keeps the files diffable while staying compact. */
export function serializeRows(head: Record<string, unknown>, rows: unknown[][]): string {
  const headJson = JSON.stringify(head);
  const body = rows.map((r) => JSON.stringify(r)).join(',\n');
  return `${headJson.slice(0, -1)},"rows":[\n${body}\n]}\n`;
}

export function industryFileName(code: string): string {
  return `naics-${code}.json`;
}

export function buildProcessed(input: BuildInput): BuildOutput {
  const targets = input.targets ?? NAICS_TARGETS;
  const files = new Map<string, string>();
  const kept: IndustryInfo[] = [];
  const dropped: string[] = [];

  for (const t of targets) {
    const bucket = input.cbp.byNaics.get(t.code);
    if (!bucket || bucket.size === 0) {
      dropped.push(t.code);
      continue;
    }
    const rows: IndustryRow[] = [...bucket.values()]
      .map((r): IndustryRow => [r.fips, r.est, r.emp, r.empFlag, ...r.sizes])
      .sort(byFips);
    const file: Omit<IndustryFile, 'rows'> = {
      code: t.code,
      columns: ['fips', 'est', 'emp', 'empFlag', ...SIZE_CLASS_COLUMNS],
    };
    files.set(industryFileName(t.code), serializeRows(file as unknown as Record<string, unknown>, rows));
    kept.push({
      code: t.code,
      label: t.label,
      rawCode: input.cbp.rawCodes.get(t.code) ?? t.code,
      counties: rows.length,
      establishments: rows.reduce((s, r) => s + r[1], 0),
    });
  }

  // Union of counties in the population file and counties the CBP file covers.
  const allFips = new Set<string>([...input.pep.counties.keys(), ...input.cbp.countiesInFile]);
  const countyRows: CountyRow[] = [...allFips]
    .filter((f) => STATE_ABBR[f.slice(0, 2)] !== undefined)
    .map((f): CountyRow => {
      const p = input.pep.counties.get(f);
      return [f, p?.name ?? `County ${f}`, f.slice(0, 2), p?.population ?? null, input.cbp.countiesInFile.has(f) ? 1 : 0];
    })
    .sort(byFips);
  const countiesHead: Omit<CountiesFile, 'rows'> = { columns: ['fips', 'name', 'stateFips', 'population', 'inCbp'] };
  files.set('counties.json', serializeRows(countiesHead as unknown as Record<string, unknown>, countyRows));

  const states = Object.entries(STATE_ABBR)
    .map(([fips, abbr]): [string, string, string] => [fips, abbr, input.pep.states.get(fips) ?? abbr])
    .sort(byFips);
  const meta: MetaFile = {
    schema: 1,
    cbpYear: input.cbpYear,
    populationYear: input.populationYear,
    sources: input.sources,
    states,
    industries: kept,
    sizeClasses: [...SIZE_CLASS_LABELS],
    droppedCodes: dropped,
  };
  files.set('meta.json', `${JSON.stringify(meta, null, 2)}\n`);
  return { files, kept, dropped };
}
