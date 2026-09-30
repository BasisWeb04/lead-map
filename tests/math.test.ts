import { describe, expect, it } from 'vitest';
import { MIN_POPULATION, estMetric, per10k, residentsPer, roundTo } from '../src/lib/metrics';
import { rankDescending } from '../src/lib/rank';
import { choroplethBreaks, classify, legendClasses, quantileBreaks } from '../src/lib/quantiles';
import { PALETTE, paletteFor } from '../src/lib/palette';

describe('per-capita math', () => {
  it('computes establishments per 10,000 residents to 2 decimals', () => {
    expect(per10k(1558, 4559561)).toEqual({ value: 3.42, reason: null });
    expect(per10k(0, 50000)).toEqual({ value: 0, reason: null });
  });

  it('computes residents per establishment as whole people', () => {
    expect(residentsPer(1558, 4559561)).toEqual({ value: 2927, reason: null });
  });

  it('refuses rates below the minimum population guard but allows it exactly', () => {
    expect(MIN_POPULATION).toBe(2500);
    expect(per10k(3, MIN_POPULATION - 1)).toEqual({ value: null, reason: 'small-population' });
    expect(residentsPer(3, MIN_POPULATION - 1).reason).toBe('small-population');
    expect(per10k(1, MIN_POPULATION).value).toBe(4);
  });

  it('reports a missing population or a missing county instead of dividing', () => {
    expect(per10k(5, null).reason).toBe('no-population');
    expect(per10k(5, 0).reason).toBe('no-population');
    expect(per10k(null, 50000).reason).toBe('not-in-file');
    expect(residentsPer(null, 50000).value).toBeNull();
  });

  it('treats residents per establishment as undefined, not infinite, when there are none', () => {
    expect(residentsPer(0, 50000)).toEqual({ value: null, reason: 'no-establishments' });
  });

  it('estMetric passes counts through and marks absent counties', () => {
    expect(estMetric(0)).toEqual({ value: 0, reason: null });
    expect(estMetric(null)).toEqual({ value: null, reason: 'not-in-file' });
  });

  it('rounds halves away from zero', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(1e-9, 2)).toBe(0);
  });
});

describe('state ranking', () => {
  const items = [
    { id: 'a', v: 10 },
    { id: 'b', v: 30 },
    { id: 'c', v: 30 },
    { id: 'd', v: 5 },
    { id: 'e', v: null },
  ];
  const rank = (list: typeof items) => rankDescending(list, (x) => x.v, (x) => x.id);

  it('gives ties the same rank and skips the next rank', () => {
    const { ranks, ranked } = rank(items);
    expect(Object.fromEntries(ranks)).toEqual({ b: 1, c: 1, a: 3, d: 4 });
    expect(ranked).toBe(4);
  });

  it('leaves null values unranked', () => {
    expect(rank(items).ranks.has('e')).toBe(false);
  });

  it('ranks an all-tied list as all first', () => {
    const { ranks } = rank([{ id: 'x', v: 2 }, { id: 'y', v: 2 }, { id: 'z', v: 2 }]);
    expect([...ranks.values()]).toEqual([1, 1, 1]);
  });

  it('ranks zero as a real value below positive values', () => {
    const { ranks } = rank([{ id: 'x', v: 0 }, { id: 'y', v: 1 }]);
    expect(ranks.get('x')).toBe(2);
  });
});

describe('quantile breaks', () => {
  it('splits ten distinct values into five classes of two', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const breaks = quantileBreaks(v);
    expect(breaks).toEqual([3, 5, 7, 9]);
    expect(legendClasses(v, breaks).map((c) => c.count)).toEqual([2, 2, 2, 2, 2]);
  });

  it('returns no breaks for empty, single-value and all-tied input', () => {
    expect(quantileBreaks([])).toEqual([]);
    expect(quantileBreaks([null, null])).toEqual([]);
    expect(quantileBreaks([7])).toEqual([]);
    expect(quantileBreaks([4, 4, 4, 4, 4, 4])).toEqual([]);
  });

  it('collapses tied quantiles instead of creating empty classes', () => {
    const v = [0, 0, 0, 0, 1];
    const breaks = quantileBreaks(v);
    expect(breaks).toEqual([1]);
    expect(legendClasses(v, breaks).map((c) => c.count)).toEqual([4, 1]);
  });

  it('handles arrays shorter than the class count', () => {
    expect(quantileBreaks([1, 2])).toEqual([2]);
    expect(quantileBreaks([3, 1, 2])).toEqual([2, 3]);
  });

  it('ignores nulls and does not sort them in as zero', () => {
    expect(quantileBreaks([null, 5, null, 10, 15, 20, 25])).toEqual(quantileBreaks([5, 10, 15, 20, 25]));
  });

  it('classifies values at a break into the upper class', () => {
    expect(classify(3, [3, 5])).toBe(1);
    expect(classify(2.99, [3, 5])).toBe(0);
    expect(classify(100, [3, 5])).toBe(2);
    expect(classify(1, [])).toBe(0);
  });

  it('legend bounds span the observed min and max', () => {
    const classes = legendClasses([2, 9, 4, 6], quantileBreaks([2, 9, 4, 6]));
    expect(classes[0].from).toBe(2);
    expect(classes[classes.length - 1].to).toBeNull();
    expect(classes[classes.length - 1].max).toBe(9);
  });
});

describe('map breaks with many zeros', () => {
  it('gives zero its own class when zeros fill at least one quantile', () => {
    const v = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
    const breaks = choroplethBreaks(v);
    expect(breaks[0]).toBe(1);
    const classes = legendClasses(v, breaks);
    expect(classes[0]).toMatchObject({ count: 6, lo: 0, hi: 0 });
    expect(classes.reduce((s, c) => s + c.count, 0)).toBe(10);
  });

  it('matches plain quantiles when zeros are rare or absent', () => {
    const v = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(choroplethBreaks(v)).toEqual(quantileBreaks(v));
    expect(choroplethBreaks([1, 2, 3, 4, 5])).toEqual(quantileBreaks([1, 2, 3, 4, 5]));
  });

  it('returns no breaks when every value is zero', () => {
    expect(choroplethBreaks([0, 0, 0])).toEqual([]);
  });
});

describe('palette', () => {
  it('spans light to dark for any class count', () => {
    expect(paletteFor(5)).toEqual([...PALETTE]);
    expect(paletteFor(2)).toEqual([PALETTE[0], PALETTE[4]]);
    expect(paletteFor(1)).toHaveLength(1);
    expect(paletteFor(0)).toEqual([]);
  });
});
