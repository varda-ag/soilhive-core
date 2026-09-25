import { describe, it, expect } from '@jest/globals';
import { generateClasses, percentilesFor } from '../../../src/jobs/data-requests/generateClasses';
import { ClassMethod } from '../../../src/types/enums';

const names = (classes: { name: string }[]) => classes.map(definition => definition.name);

describe('percentilesFor', () => {
  it('asks equal-interval for the trimmed range and quantile for its N-1 inner cut points', () => {
    expect(percentilesFor(ClassMethod.EQUAL_INTERVAL, 8)).toEqual([0.01, 0.99]);
    expect(percentilesFor(ClassMethod.QUANTILE, 4)).toEqual([0.25, 0.5, 0.75]);
  });
});

describe('generateClasses — equal-interval', () => {
  it('picks the smallest readable width whose inner classes still reach the 99th percentile', () => {
    // Width 0.6 from 4.2 stops at 7.8, short of p99 = 7.93, so it steps up to 0.8 from 4.0.
    const classes = generateClasses(ClassMethod.EQUAL_INTERVAL, 8, [4.37, 7.93]);

    expect(names(classes)).toEqual(['< 4.0', '4.0–4.8', '4.8–5.6', '5.6–6.4', '6.4–7.2', '7.2–8.0', '8.0–8.8', '≥ 8.8']);
    expect(classes[0]).toEqual({ name: '< 4.0', max: 4 });
    expect(classes[1]).toEqual({ name: '4.0–4.8', min: 4, max: 4.8 });
    expect(classes[7]).toEqual({ name: '≥ 8.8', min: 8.8 });
  });

  it('writes edges exactly, without floating-point residue', () => {
    const classes = generateClasses(ClassMethod.EQUAL_INTERVAL, 8, [4.37, 7.93]);
    for (const definition of classes) {
      for (const bound of [definition.min, definition.max]) {
        if (bound !== undefined) {
          expect(Number(bound.toFixed(1))).toBe(bound);
        }
      }
    }
  });

  it('starts at the low percentile itself when it is already a multiple of the width', () => {
    const classes = generateClasses(ClassMethod.EQUAL_INTERVAL, 6, [4, 8]);
    expect(names(classes)).toEqual(['< 4', '4–5', '5–6', '6–7', '7–8', '≥ 8']);
  });

  it('handles a range crossing zero', () => {
    const classes = generateClasses(ClassMethod.EQUAL_INTERVAL, 4, [-1.3, 0.9]);
    expect(names(classes)).toEqual(['< -1.5', '-1.5–0.0', '0.0–1.5', '≥ 1.5']);
  });

  it('returns two classes split at the value when the range cannot be split', () => {
    expect(generateClasses(ClassMethod.EQUAL_INTERVAL, 8, [5, 5])).toEqual([
      { name: '< 5', max: 5 },
      { name: '≥ 5', min: 5 },
    ]);
  });
});

describe('generateClasses — quantile', () => {
  it('cuts at the given percentiles, open below the first and above the last', () => {
    expect(generateClasses(ClassMethod.QUANTILE, 4, [5.2, 6.1, 6.9])).toEqual([
      { name: '< 5.2', max: 5.2 },
      { name: '5.2–6.1', min: 5.2, max: 6.1 },
      { name: '6.1–6.9', min: 6.1, max: 6.9 },
      { name: '≥ 6.9', min: 6.9 },
    ]);
  });

  it('rounds edges to 3 decimals', () => {
    expect(names(generateClasses(ClassMethod.QUANTILE, 3, [5.12345, 6.98765]))).toEqual(['< 5.123', '5.123–6.988', '≥ 6.988']);
  });

  it('merges classes between equal edges rather than keeping an empty zero-width one', () => {
    // Two cut points coincide: four asked, three returned.
    const classes = generateClasses(ClassMethod.QUANTILE, 4, [6.5, 6.5, 7]);
    expect(names(classes)).toEqual(['< 6.5', '6.5–7', '≥ 7']);
    for (const definition of classes) {
      if (definition.min !== undefined && definition.max !== undefined) {
        expect(definition.min).toBeLessThan(definition.max);
      }
    }
  });
});
