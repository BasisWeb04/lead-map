// Parsing for the Census County Business Patterns (CBP) county file.
// Pure functions only, so the data script and the tests share one code path.

export interface NaicsTarget {
  /** Code as the app uses it, without the file's slash padding. */
  code: string;
  label: string;
}

export const NAICS_TARGETS: readonly NaicsTarget[] = [
  { code: '238220', label: 'Plumbing, heating and air-conditioning contractors' },
  { code: '238210', label: 'Electrical contractors' },
  { code: '238160', label: 'Roofing contractors' },
  { code: '238320', label: 'Painting and wall covering contractors' },
  { code: '561730', label: 'Landscaping services' },
  { code: '561710', label: 'Exterminating and pest control services' },
  { code: '561720', label: 'Janitorial services' },
  { code: '8111', label: 'Automotive repair and maintenance' },
  { code: '621210', label: 'Offices of dentists' },
  { code: '7225', label: 'Restaurants and other eating places' },
];

/** Size-class columns in file order; n1000_1..4 are sub-splits of n1000 and are skipped. */
export const SIZE_CLASS_COLUMNS = [
  'n<5',
  'n5_9',
  'n10_19',
  'n20_49',
  'n50_99',
  'n100_249',
  'n250_499',
  'n500_999',
  'n1000',
] as const;

export const SIZE_CLASS_LABELS = [
  '1-4',
  '5-9',
  '10-19',
  '20-49',
  '50-99',
  '100-249',
  '250-499',
  '500-999',
  '1000+',
] as const;

/** Noise flags that still mean "published". Anything else (D, S, N, X in older vintages) means withheld. */
const PUBLISHED_NOISE_FLAGS = new Set(['G', 'H', 'J']);

export type NoiseFlag = 'G' | 'H' | 'J';

export interface CbpRecord {
  fips: string;
  naics: string;
  est: number;
  /** Mid-March employment; null when the file withholds it. */
  emp: number | null;
  /** Noise flag for employment, or the withholding flag when emp is null. */
  empFlag: string;
  /** Establishment counts by employment size; null means suppressed (0, 1 or 2), never zero. */
  sizes: (number | null)[];
}

/** Strips quotes; the file pads codes with '/' (e.g. 8111//) and '-' for totals (------). */
export function normalizeNaics(raw: string): string {
  return stripQuotes(raw).replace(/[-/]+$/, '');
}

export function stripQuotes(value: string): string {
  const v = value.trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

/** Builds a 5-digit county FIPS string; numeric input would otherwise lose the leading zero. */
export function padFips(state: string | number, county: string | number): string {
  const s = String(state).trim().padStart(2, '0');
  const c = String(county).trim().padStart(3, '0');
  if (!/^\d{2}$/.test(s) || !/^\d{3}$/.test(c)) {
    throw new Error(`Invalid FIPS parts: state=${String(state)} county=${String(county)}`);
  }
  return s + c;
}

/** Minimal CSV splitter that honours double-quoted fields and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function parseCount(value: string): number | null {
  const v = stripQuotes(value);
  return /^\d+$/.test(v) ? Number(v) : null;
}

/** Employment is published only with a noise flag G/H/J and a numeric value; otherwise null, never 0. */
export function parseEmployment(flag: string, value: string): { emp: number | null; empFlag: string } {
  const f = stripQuotes(flag).toUpperCase();
  const n = parseCount(value);
  if (!PUBLISHED_NOISE_FLAGS.has(f) || n === null) return { emp: null, empFlag: f || 'N' };
  return { emp: n, empFlag: f };
}

/** "N" in a size-class column is a suppressed count of 0 to 2, so it maps to null. */
export function parseSizeClass(value: string): number | null {
  return parseCount(value);
}

export interface HeaderIndex {
  [column: string]: number;
}

export function indexHeader(headerLine: string): HeaderIndex {
  const idx: HeaderIndex = {};
  splitCsvLine(headerLine).forEach((name, i) => {
    idx[stripQuotes(name).toLowerCase()] = i;
  });
  const required = ['fipstate', 'fipscty', 'naics', 'emp_nf', 'emp', 'est', ...SIZE_CLASS_COLUMNS];
  const missing = required.filter((c) => idx[c] === undefined);
  if (missing.length) throw new Error(`CBP header missing columns: ${missing.join(', ')}`);
  return idx;
}

/** Returns null for statewide (county 999) rows, which have no place on a county map. */
export function parseCbpFields(fields: string[], idx: HeaderIndex): CbpRecord | null {
  const county = stripQuotes(fields[idx.fipscty]);
  if (county === '999') return null;
  const fips = padFips(stripQuotes(fields[idx.fipstate]), county);
  const est = parseCount(fields[idx.est]);
  if (est === null) throw new Error(`Non-numeric establishment count for ${fips}`);
  const { emp, empFlag } = parseEmployment(fields[idx.emp_nf], fields[idx.emp]);
  return {
    fips,
    naics: normalizeNaics(fields[idx.naics]),
    est,
    emp,
    empFlag,
    sizes: SIZE_CLASS_COLUMNS.map((c) => parseSizeClass(fields[idx[c]])),
  };
}

export interface CbpExtract {
  /** naics code -> fips -> record */
  byNaics: Map<string, Map<string, CbpRecord>>;
  /** Counties that have an all-industries total row, i.e. that the file covers. */
  countiesInFile: Set<string>;
  /** normalized code -> code exactly as written in the file */
  rawCodes: Map<string, string>;
  rowCount: number;
}

/** Keeps only the target NAICS codes (exact match after normalizing) plus the county coverage list. */
export function extractCbp(text: string, targetCodes: ReadonlySet<string>): CbpExtract {
  const lines = text.split(/\r?\n/);
  const idx = indexHeader(lines[0]);
  const width = Object.keys(idx).length;
  const byNaics = new Map<string, Map<string, CbpRecord>>();
  const countiesInFile = new Set<string>();
  const rawCodes = new Map<string, string>();
  let rowCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (fields.length !== width) throw new Error(`Line ${i + 1}: expected ${width} fields, got ${fields.length}`);
    rowCount++;
    const code = normalizeNaics(fields[idx.naics]);
    const isTotal = code === '';
    if (!isTotal && !targetCodes.has(code)) continue;
    if (!isTotal) rawCodes.set(code, stripQuotes(fields[idx.naics]));
    const rec = parseCbpFields(fields, idx);
    if (!rec) continue;
    if (isTotal) {
      countiesInFile.add(rec.fips);
      continue;
    }
    let bucket = byNaics.get(code);
    if (!bucket) {
      bucket = new Map();
      byNaics.set(code, bucket);
    }
    if (bucket.has(rec.fips)) throw new Error(`Duplicate row for ${code} ${rec.fips}`);
    bucket.set(rec.fips, rec);
  }
  return { byNaics, countiesInFile, rawCodes, rowCount };
}
