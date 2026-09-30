// Downloads the two public Census files once into data/raw (gitignored), then writes data/processed.
// Usage: npm run data            (uses cached raw files when present)
//        npm run data -- --refresh (downloads again)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { NAICS_TARGETS, extractCbp } from '../src/prep/cbp';
import { parsePopulation } from '../src/prep/pep';
import { buildProcessed } from '../src/prep/build';
import type { SourceInfo } from '../src/lib/schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data', 'processed');

const CBP_YEAR = 2022;
// Population for the same year as the business counts, from the newest vintage that revises it.
const POP_YEAR = 2022;

const SOURCES = {
  cbp: {
    id: 'cbp22co',
    title: 'County Business Patterns 2022, county-level file',
    url: 'https://www2.census.gov/programs-surveys/cbp/datasets/2022/cbp22co.zip',
    vintage: '2022 (released 2024)',
    license: 'Public domain (US Government work, U.S. Census Bureau)',
    file: 'cbp22co.zip',
  },
  pep: {
    id: 'co-est2025-alldata',
    title: 'County Population Totals, Vintage 2025 (April 1, 2020 to July 1, 2025)',
    url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv',
    vintage: `Vintage 2025, column POPESTIMATE${POP_YEAR}`,
    license: 'Public domain (US Government work, U.S. Census Bureau)',
    file: 'co-est2025-alldata.csv',
  },
} as const;

async function download(url: string, dest: string, refresh: boolean): Promise<Buffer> {
  if (existsSync(dest) && !refresh) {
    console.log(`cached   ${dest}`);
    return readFileSync(dest);
  }
  console.log(`download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status} ${res.statusText}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

const sha256 = (buf: Uint8Array): string => createHash('sha256').update(buf).digest('hex');

function sourceInfo(s: (typeof SOURCES)[keyof typeof SOURCES], buf: Buffer): SourceInfo {
  return { id: s.id, title: s.title, url: s.url, vintage: s.vintage, license: s.license, sha256: sha256(buf), bytes: buf.length };
}

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  mkdirSync(RAW, { recursive: true });

  const zip = await download(SOURCES.cbp.url, join(RAW, SOURCES.cbp.file), refresh);
  const pepBuf = await download(SOURCES.pep.url, join(RAW, SOURCES.pep.file), refresh);

  const entries = unzipSync(new Uint8Array(zip), { filter: (f) => f.name.toLowerCase().endsWith('.txt') });
  const names = Object.keys(entries);
  if (names.length !== 1) throw new Error(`Expected one .txt in the CBP zip, found: ${names.join(', ')}`);
  const cbpText = Buffer.from(entries[names[0]]).toString('latin1');

  const targets = new Set(NAICS_TARGETS.map((t) => t.code));
  const cbp = extractCbp(cbpText, targets);
  // The population file is Latin-1 encoded (for example "Dona Ana" is written with an n-tilde byte 0xF1).
  const pep = parsePopulation(pepBuf.toString('latin1'), `POPESTIMATE${POP_YEAR}`);

  const out = buildProcessed({
    cbp,
    pep,
    cbpYear: CBP_YEAR,
    populationYear: POP_YEAR,
    sources: [sourceInfo(SOURCES.cbp, zip), sourceInfo(SOURCES.pep, pepBuf)],
  });

  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));
  let total = 0;
  for (const [name, text] of [...out.files].sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(join(OUT, name), text, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    total += bytes;
    console.log(`wrote    ${name.padEnd(20)} ${String(bytes).padStart(9)} bytes  sha256 ${sha256(Buffer.from(text, 'utf8')).slice(0, 16)}`);
  }

  const cbpNoPop = [...cbp.countiesInFile].filter((f) => !pep.counties.has(f));
  const popNoCbp = [...pep.counties.keys()].filter((f) => !cbp.countiesInFile.has(f));
  console.log(`CBP rows scanned: ${cbp.rowCount}; counties in CBP: ${cbp.countiesInFile.size}; counties in PEP: ${pep.counties.size}`);
  console.log(`CBP counties without population: ${cbpNoPop.join(' ') || 'none'}`);
  console.log(`PEP counties absent from CBP: ${popNoCbp.join(' ') || 'none'}`);
  console.log(`NAICS kept: ${out.kept.map((k) => `${k.code} (${k.rawCode}, ${k.counties} counties)`).join('; ')}`);
  console.log(`NAICS dropped (not in file): ${out.dropped.join(' ') || 'none'}`);
  console.log(`processed total: ${total} bytes`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
