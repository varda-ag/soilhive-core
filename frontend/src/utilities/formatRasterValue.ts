// Float32 holds about 7 significant digits; the rest of what a pixel widens to (6.2869 arrives as
// 6.286900043487549, docs/adr/0045) is noise. Integers, class codes among them, are shown as they are.
// For display only: the API and the Export carry the exact value.
export function formatRasterValue(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toPrecision(7));
}
