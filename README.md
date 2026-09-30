# Lead Map: where service businesses are, county by county

A static web app that maps 10 trade and home-service industries across every US county, using the public Census County Business Patterns 2022 file. You can view counts, a per-capita rate, or a "room for another business" ratio, and every view has a sortable table and CSV export.

## What this demonstrates

- A reproducible data pipeline: `npm run data` downloads two public Census files, keeps 10 NAICS codes and writes 1.34 MB of compact JSON. Three runs (cached, cached, fresh re-download) produced byte-identical output with the same SHA-256.
- Honest handling of missing data. A withheld value is carried as `null` with a reason and is never shown or exported as 0. The code also separates a real zero ("covered county, no establishments") from "county not in the file". Suppressed size-class counts ("N", meaning 0 to 2) stay null, and a test checks every row of the committed data for this.
- Pure, tested logic separated from the UI: parsing, FIPS padding, per-capita math with a documented population guard, quantile breaks that handle ties and zero-heavy data, competition ranking with ties, and CSV escaping with a formula-injection guard.
- An accessible choropleth. The map is never the only way to read the data: the table carries the same rows, the legend prints its numeric breaks, and missing values are hatched on the map and written in words in the table. In a single-state view every county can be reached and selected by keyboard.
- Golden tests against real counties. The expected values were copied from the raw file with `unzip` and `awk`, a separate code path from the TypeScript parser.

## Live demo

Live demo: (link added at publish)

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm test           # 81 tests, offline
npm run typecheck
npm run build      # static site in dist/
npm run data       # optional: rebuild data/processed from the Census files (network, about 16 MB)
```

The processed data is committed, so `dev`, `test` and `build` never touch the network. `npm run data` caches the raw downloads in `data/raw/` (gitignored); `npm run data -- --refresh` downloads them again.

## How it works

```
Census files (public)                      data/processed (committed)          browser
cbp22co.zip ----+                          meta.json      industries, sources
                +--> scripts/prepare-data  counties.json  FIPS, name, pop    --> src/lib/view.ts --> map, legend,
co-est2025.csv -+    src/prep/*.ts         naics-*.json   one per industry       (one row model)     table, detail,
                                                          (loaded on demand)                         CSV export
us-atlas counties-10m.json (npm) ----------------------------------------------> src/lib/geo.ts (d3-geo, Albers USA)
```

- `src/prep/cbp.ts` parses the CBP county file: NAICS normalizing (`8111//` becomes `8111`, matched exactly so `81111` is not pulled in), FIPS padding, employment noise flags, suppressed size classes, and statewide `999` rows dropped.
- `src/prep/pep.ts` parses the population file (Latin-1 encoded) and takes the July 1, 2022 estimate so population matches the business-count year.
- `src/prep/build.ts` writes deterministic output: rows sorted by FIPS, no timestamps, one row per line. Rows are arrays rather than objects keyed by FIPS, because JavaScript would reorder integer-like keys such as `"10001"`.
- `src/lib/view.ts` builds one row model that the map, table, detail panel and CSV all read, so they cannot disagree. `metrics.ts`, `rank.ts`, `quantiles.ts` and `csv.ts` hold the math.
- `src/App.tsx` and `src/components/` hold the UI. Industry files are code-split and loaded when selected; the map shapes load as a same-origin static asset.

## Tests

81 tests across 7 files (`npm test`):

- `tests/cbp.test.ts`: NAICS filter and exact matching, FIPS padding and rejection of bad parts, CSV splitting, noise flags G/H/J kept, withheld flags (D, S, N, anything else) turned into null, suppressed size classes as null, statewide rows dropped, and loud failures on bad headers, short lines or duplicates.
- `tests/pep-build.test.ts`: population parsing, the Latin-1 decoding trap, byte-identical rebuilds, dropped-code reporting, FIPS kept as strings.
- `tests/math.test.ts`: per-capita math, the minimum-population guard at its boundary, rounding, ranking with ties and nulls, quantile breaks on empty, single, tied, short and zero-heavy arrays, and the palette.
- `tests/view-csv.test.ts`: CSV escaping (quotes, commas, newlines, spreadsheet formulas), true zero versus not in file, withheld employment, state ranks, nulls sorting last, and CSV that writes missing values as words.
- `tests/processed-data.test.ts`: golden values for Maricopa, Pima, La Paz and Greenlee counties (Arizona). Invariants over all 19,879 committed industry rows: flags agree with nulls, published size classes are at least 3, and suppressed remainders are within 0 to 2 per hidden class. It also checks for personal-data patterns and the size budget.
- `tests/table.test.tsx` and `tests/app.test.tsx`: rendered table and detail panel show "not published" and never 0. The full app opens on Arizona with 15 counties in both the table and the map, and the Maricopa detail matches the golden numbers.

Golden values (NAICS 238220 plumbing and HVAC unless noted; establishments, employment, noise flag):

| County | FIPS | Value from raw file | Population July 2022 |
| --- | --- | --- | --- |
| Maricopa | 04013 | 1,558 est., 23,816 employees, G | 4,559,561 |
| Pima (7225 restaurants) | 04019 | 1,574 est., 35,393 employees, G | 1,058,224 |
| La Paz | 04012 | 5 est., 34 employees, H; 1-4 size class suppressed | 16,460 |
| Greenlee (7225 restaurants) | 04011 | 7 est., 86 employees, H; all 9 size classes suppressed | 9,311 |
| Greenlee | 04011 | no 238220 row: a true 0 (county is covered) | 9,311 |

## Limitations and honest notes

- These are **employer establishments** (locations with paid staff). Nonemployer businesses, such as self-employed owners with no staff, are not counted, so real business counts in trades are higher.
- Employment in the 2022 file is not withheld. Every value is published with a noise flag: G (under 2%), H (2% to under 5%) or J (5% or more). J values are shown with a "high noise" label rather than hidden. Values with any other flag (D or S in older vintages) would become "not published"; the parser and tests cover that case even though the 2022 file has none.
- In this file the real suppression sits in the size-class counts, where "N" stands for 0, 1 or 2 establishments. This was measured, not assumed: across all 1,100,804 rows no published size-class count is below 3, and the gap never exceeds 2 per suppressed class.
- **Minimum population guard: 2,500 residents.** Below that, one establishment shifts the per-10,000 rate by 4 or more, so rates are not computed and the county says why. 147 of 3,144 counties fall under it for 2022 (2 of them are also absent from the business file). Raw counts are still shown.
- A county missing from the business file is "not published", not zero. Kalawao County, HI (15005) and King County, TX (48269) have no rows at all.
- The map shapes (us-atlas, 2017 boundaries) predate two changes. Connecticut's nine planning regions (09110 to 09190) replaced its counties, and Alaska's Valdez-Cordova (02261) was split into 02063 and 02066. Those areas appear in the table and CSV, and the old shapes are drawn as "boundary changed".
- "Residents per establishment" is a rough screening signal. It ignores travel distance, demand, business size and nonemployers.
- National establishment totals below come from the county rows only. Statewide rows (county code 999) are excluded because they have no place on a county map.
- Quantile breaks are recomputed for each view, so a color means "relative to the counties in view", not a fixed national scale.

## Data notice

No fictional data and no personal data. Every figure is an aggregate count of business establishments from public US government sources. None of this is a contact list: there are no names, addresses, emails or phone numbers.

| Source | File | Vintage | License | SHA-256 of the file used |
| --- | --- | --- | --- | --- |
| U.S. Census Bureau, County Business Patterns | https://www2.census.gov/programs-surveys/cbp/datasets/2022/cbp22co.zip | 2022 data year (file dated 2024-05-28) | Public domain (US Government work) | `dcea1d9a7060cdb763c841d863163856ba8d5a50dce9056992bdeacd08ff99b4` |
| U.S. Census Bureau, Population Estimates, county totals | https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv | Vintage 2025, column `POPESTIMATE2022` | Public domain (US Government work) | `4f5a499d851e2cb48fd7a5405e5a9235453a8a66933657aacd10df0e264f35d5` |
| us-atlas `counties-10m.json` (npm) | derived from Census cartographic boundary files, 2017 | 3.0.1 | ISC | n/a |

Files downloaded 2026-09-30 (UTC). The Census data API was not used, and no account or key is needed.

NAICS codes kept (all 10 requested codes were found in the file; none dropped):

| Code | As written in file | Industry | Counties with establishments | Establishments (county rows) |
| --- | --- | --- | --- | --- |
| 238220 | 238220 | Plumbing, heating and air-conditioning contractors | 2,472 | 108,933 |
| 238210 | 238210 | Electrical contractors | 2,235 | 80,964 |
| 238160 | 238160 | Roofing contractors | 1,221 | 23,424 |
| 238320 | 238320 | Painting and wall covering contractors | 1,249 | 36,905 |
| 561730 | 561730 | Landscaping services | 2,206 | 116,325 |
| 561710 | 561710 | Exterminating and pest control services | 956 | 14,749 |
| 561720 | 561720 | Janitorial services | 1,698 | 66,112 |
| 8111 | 8111// | Automotive repair and maintenance | 2,731 | 167,444 |
| 621210 | 621210 | Offices of dentists | 2,093 | 135,137 |
| 7225 | 7225// | Restaurants and other eating places | 3,018 | 605,923 |

Code: MIT License, copyright Ethan Chacko. Built by Ethan Chacko, https://ethanchacko.com.
