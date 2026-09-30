export const HATCH_ID = 'lm-hatch';

/** Shared SVG pattern for "not published" areas; rendered once so the legend works even without the map. */
export function HatchDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" className="fill-stone-100 dark:fill-stone-800" />
          <line x1="0" y1="0" x2="0" y2="5" strokeWidth="1.6" className="stroke-stone-400 dark:stroke-stone-500" />
        </pattern>
      </defs>
    </svg>
  );
}
