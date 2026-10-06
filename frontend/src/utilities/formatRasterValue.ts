// Float32 holds about 7 significant digits; the rest of what a pixel widens to (6.2869 arrives as
// 6.286900043487549, docs/adr/0045) is noise. Integers, class codes among them, are shown as they are.
// For display only: the API and the Export carry the exact value.
// A value can arrive as null although typed as a number (an Observation without one); it is shown
// empty, like any missing value, rather than breaking the table.
export function formatRasterValue(value: number | null): number | null {
  if (value === null || Number.isInteger(value) || !Number.isFinite(value)) return value;
  return Number(value.toPrecision(7));
}
