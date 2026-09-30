/**
 * Quantile class breaks taken from the data itself, so every break is a real observed value.
 * A value v falls in class i when breaks[i-1] <= v < breaks[i]. Duplicate or minimum-valued breaks are
 * dropped, so tied data yields fewer classes instead of empty ones.
 */
export function quantileBreaks(values: readonly (number | null)[], classes = 5): number[] {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0 || classes < 2) return [];
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const b = v[Math.floor((i * v.length) / classes)];
    const last = breaks.length ? breaks[breaks.length - 1] : v[0];
    if (b > last) breaks.push(b);
  }
  return breaks;
}

/**
 * Breaks for the map. Rare industries have zero establishments in most counties; when zeros fill at least
 * one quantile's share they get a class of their own and the positive values are split into the rest.
 * Assumes non-negative values, which holds for every metric in this app.
 */
export function choroplethBreaks(values: readonly (number | null)[], classes = 5): number[] {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  const positives = v.filter((x) => x > 0);
  const zeros = v.length - positives.length;
  if (zeros > 0 && positives.length > 0 && zeros >= v.length / classes) {
    return [Math.min(...positives), ...quantileBreaks(positives, classes - 1)];
  }
  return quantileBreaks(v, classes);
}

export function classify(value: number, breaks: readonly number[]): number {
  let c = 0;
  while (c < breaks.length && value >= breaks[c]) c++;
  return c;
}

export interface LegendClass {
  index: number;
  /** inclusive lower bound */
  from: number;
  /** exclusive upper bound; null for the top class, whose bound is the inclusive max */
  to: number | null;
  max: number;
  count: number;
  /** smallest and largest observed value inside the class */
  lo: number;
  hi: number;
}

export function legendClasses(values: readonly (number | null)[], breaks: readonly number[]): LegendClass[] {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length === 0) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const counts = new Array<number>(breaks.length + 1).fill(0);
  const lo = new Array<number>(breaks.length + 1).fill(Infinity);
  const hi = new Array<number>(breaks.length + 1).fill(-Infinity);
  for (const x of v) {
    const c = classify(x, breaks);
    counts[c]++;
    lo[c] = Math.min(lo[c], x);
    hi[c] = Math.max(hi[c], x);
  }
  return counts.map((count, i) => ({
    index: i,
    from: i === 0 ? min : breaks[i - 1],
    to: i < breaks.length ? breaks[i] : null,
    max,
    count,
    lo: lo[i],
    hi: hi[i],
  }));
}
