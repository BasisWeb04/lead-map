/**
 * Competition ranking ("1224"), highest value first. Tied values share a rank and the next rank skips.
 * Items whose value is null are left out: an unpublished value has no place in an ordering.
 */
export function rankDescending<T>(
  items: readonly T[],
  valueOf: (item: T) => number | null,
  keyOf: (item: T) => string,
): { ranks: Map<string, number>; ranked: number } {
  const scored = items
    .map((item) => ({ key: keyOf(item), value: valueOf(item) }))
    .filter((s): s is { key: string; value: number } => s.value !== null && Number.isFinite(s.value))
    .sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  scored.forEach((s, i) => {
    const prev = scored[i - 1];
    ranks.set(s.key, prev && prev.value === s.value ? (ranks.get(prev.key) as number) : i + 1);
  });
  return { ranks, ranked: scored.length };
}
