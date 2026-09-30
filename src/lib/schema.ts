// Shape of the committed files in data/processed. Rows are arrays keyed by a 5-digit FIPS string;
// objects keyed by FIPS are avoided because keys like "10001" would be reordered as integers.

export interface SourceInfo {
  id: string;
  title: string;
  url: string;
  vintage: string;
  license: string;
  sha256: string;
  bytes: number;
}

export interface IndustryInfo {
  code: string;
  label: string;
  /** NAICS code exactly as written in the CBP file, e.g. 8111// */
  rawCode: string;
  counties: number;
  establishments: number;
}

export interface MetaFile {
  schema: 1;
  populationYear: number;
  cbpYear: number;
  sources: SourceInfo[];
  /** [stateFips, USPS abbreviation, name] */
  states: [string, string, string][];
  industries: IndustryInfo[];
  sizeClasses: string[];
  /** Target codes that were requested but not found in the file. */
  droppedCodes: string[];
}

/** [fips, name, stateFips, population or null, 1 if the CBP file covers the county else 0] */
export type CountyRow = [string, string, string, number | null, 0 | 1];

export interface CountiesFile {
  columns: ['fips', 'name', 'stateFips', 'population', 'inCbp'];
  rows: CountyRow[];
}

/** [fips, establishments, employment or null, employment flag, ...size-class counts or null] */
export type IndustryRow = [string, number, number | null, string, ...(number | null)[]];

export interface IndustryFile {
  code: string;
  columns: string[];
  rows: IndustryRow[];
}
