// ColorBrewer YlGnBu, 5 classes: sequential and colorblind safe (light = low, dark = high).
export const PALETTE = ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494'] as const;

/** Spreads n classes across the palette so fewer classes still span light to dark. */
export function paletteFor(n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [PALETTE[2]];
  const last = PALETTE.length - 1;
  return Array.from({ length: n }, (_, i) => PALETTE[Math.round((i * last) / (n - 1))]);
}
