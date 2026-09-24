import { ClassDefinition } from '../../interfaces/Job';
import { ClassMethod } from '../../types/enums';
import { round3 } from '../../utils/utils';

/** Readable width mantissas (× 10ᵏ); denser than 1/2/2.5/5 so rounding up stretches the range less. */
const NICE_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

const EQUAL_INTERVAL_TRIM = [0.01, 0.99];

export const percentilesFor = (method: ClassMethod, count: number): number[] =>
  method === ClassMethod.EQUAL_INTERVAL ? EQUAL_INTERVAL_TRIM : Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);

/** First and last Classes are open-ended; equal edges merge, so fewer than `count` may come back. */
export const generateClasses = (method: ClassMethod, count: number, percentiles: number[]): ClassDefinition[] => {
  if (method === ClassMethod.EQUAL_INTERVAL) {
    const { edges, label } = equalIntervalEdges(percentiles[0]!, percentiles[1]!, count - 2);
    return fromEdges(edges, label);
  }
  return fromEdges(percentiles.map(round3), value => String(value));
};

/** Smallest readable width whose `inner` Classes, starting at a multiple at or below `low`, reach `high`. */
const equalIntervalEdges = (low: number, high: number, inner: number): { edges: number[]; label: (value: number) => string } => {
  if (!(high > low)) {
    return { edges: [round3(low)], label: value => String(value) };
  }
  const raw = (high - low) / inner;
  for (let exponent = Math.floor(Math.log10(raw)); ; exponent += 1) {
    for (const mantissa of NICE_MANTISSAS) {
      // Divide for negative exponents: 0.1 * 3 is 0.30000000000000004.
      const width = exponent < 0 ? mantissa / 10 ** -exponent : mantissa * 10 ** exponent;
      if (width < raw) {
        continue;
      }
      const decimals = Math.max(0, -exponent + (Number.isInteger(mantissa) ? 0 : 1));
      const fix = (value: number) => Number(value.toFixed(decimals));
      // Epsilon: don't floor an exact multiple a whole step down.
      const start = fix(Math.floor(low / width + 1e-9) * width);
      if (fix(start + inner * width) >= high) {
        return {
          edges: Array.from({ length: inner + 1 }, (_, i) => fix(start + i * width)),
          label: value => value.toFixed(decimals),
        };
      }
    }
  }
};

const fromEdges = (edges: number[], label: (value: number) => string): ClassDefinition[] => {
  const distinct = edges.filter((value, index) => index === 0 || value > edges[index - 1]!);
  const first = distinct[0]!;
  const last = distinct[distinct.length - 1]!;
  return [
    { name: `< ${label(first)}`, max: first },
    ...distinct.slice(1).map((max, index) => {
      const min = distinct[index]!;
      return { name: `${label(min)}–${label(max)}`, min, max };
    }),
    { name: `≥ ${label(last)}`, min: last },
  ];
};
