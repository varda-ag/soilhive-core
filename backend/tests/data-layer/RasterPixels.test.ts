import { describe, it, expect } from '@jest/globals';
import * as turf from '@turf/turf';
import type { Position } from 'geojson';
import {
  AllTouchedSweep,
  collectTouchedPixels,
  densify,
  nodataPredicate,
  pixelOutline,
  toPixelSpace,
  type PixelGrid,
  type PolygonRings,
} from '../../src/data-layer/RasterPixels';

const square = (x0: number, y0: number, x1: number, y1: number): Position[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

/** Every pixel of a width × height grid the polygons touch, as "row:col", row-major. */
const touched = (polygons: PolygonRings[], width = 10, height = 10): string[] => {
  const sweep = new AllTouchedSweep(polygons);
  const out: string[] = [];
  for (let row = 0; row < height; row++) {
    for (const [first, last] of sweep.columns(row, 0, width - 1)) {
      for (let col = first; col <= last; col++) out.push(`${row}:${col}`);
    }
  }
  return out;
};

/** The pixel-centre rule (gdal_rasterize without -at), for contrast. */
const centreRule = (polygons: PolygonRings[], width = 10, height = 10): string[] => {
  const out: string[] = [];
  const multiPolygon = turf.multiPolygon(polygons);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (turf.booleanPointInPolygon([col + 0.5, row + 0.5], multiPolygon)) out.push(`${row}:${col}`);
    }
  }
  return out;
};

/** Brute force: pixels whose square and the polygon share a positive area. */
const overlapping = (polygon: PolygonRings, width: number, height: number): string[] => {
  const out: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const intersection = turf.intersect(
        turf.featureCollection([turf.polygon([square(col, row, col + 1, row + 1)]), turf.polygon(polygon)]),
      );
      if (intersection && turf.area(intersection) > 0) out.push(`${row}:${col}`);
    }
  }
  return out;
};

// Deterministic pseudo-random numbers (mulberry32), so the property test is reproducible
const seededRandom = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('AllTouchedSweep', () => {
  it('selects the pixel an AOI smaller than a pixel lies in, even away from its centre', () => {
    const aoi = [square(2.1, 3.1, 2.3, 3.3)];
    expect(touched([aoi])).toEqual(['3:2']);
    // The centre rule would return nothing for the same AOI
    expect(centreRule([aoi])).toEqual([]);
  });

  it('selects all four pixels around a corner the AOI straddles', () => {
    expect(touched([[square(2.9, 2.9, 3.1, 3.1)]])).toEqual(['2:2', '2:3', '3:2', '3:3']);
  });

  it('counts a sliver of overlap', () => {
    expect(touched([[square(1.99, 5.2, 3, 5.8)]])).toEqual(['5:1', '5:2']);
  });

  it('does not select pixels the AOI meets only along an edge or at a corner', () => {
    // Exactly pixels (2..3, 2..3): the 12 pixels around them share an edge or a corner with it
    expect(touched([[square(2, 2, 4, 4)]])).toEqual(['2:2', '2:3', '3:2', '3:3']);
    // A triangle whose apex touches the corner of pixel (0, 0)
    expect(
      touched([
        [
          [
            [1, 1],
            [2.5, 1.5],
            [1.5, 2.5],
            [1, 1],
          ],
        ],
      ]),
    ).toEqual(['1:1', '1:2', '2:1']);
  });

  it('excludes pixels wholly inside a hole, but not those the hole only partly covers', () => {
    const polygon = [square(0, 0, 6, 6), square(1.5, 1.5, 4.5, 4.5)];
    const all = touched([polygon], 6, 6);
    expect(all).toHaveLength(36 - 4);
    expect(all).not.toEqual(expect.arrayContaining(['2:2', '2:3', '3:2', '3:3']));
    expect(all).toEqual(expect.arrayContaining(['1:1', '1:4', '4:1', '4:4']));
  });

  it('unions the parts of a multipolygon', () => {
    expect(touched([[square(0.2, 0.2, 0.4, 0.4)], [square(5.6, 7.6, 5.8, 7.8)]])).toEqual(['0:0', '7:5']);
  });

  it('agrees with a brute-force overlap test on random polygons', () => {
    const random = seededRandom(20261005);
    for (let n = 0; n < 150; n++) {
      // Star-shaped, hence simple, polygons of 3-12 vertices, some smaller than a pixel
      const cx = 1 + random() * 10;
      const cy = 1 + random() * 10;
      const vertices = 3 + Math.floor(random() * 10);
      const maxRadius = random() < 0.3 ? 0.4 : 4;
      const angles = Array.from({ length: vertices }, () => random() * 2 * Math.PI).sort((a, b) => a - b);
      const ring: Position[] = angles.map(angle => {
        const radius = 0.05 + random() * maxRadius;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
      });
      ring.push(ring[0]!);
      expect({ n, pixels: touched([[ring]], 12, 12) }).toEqual({ n, pixels: overlapping([ring], 12, 12) });
    }
  });

  it('refuses to go back to an earlier row', () => {
    const sweep = new AllTouchedSweep([[square(0, 0, 3, 3)]]);
    sweep.columns(2, 0, 9);
    expect(() => sweep.columns(1, 0, 9)).toThrow();
  });
});

describe('toPixelSpace / pixelOutline', () => {
  // A north-up grid in degrees, as a GeoTIFF of EPSG:4326 has
  const grid: PixelGrid = { width: 12, height: 8, originX: 10, originY: 50, resX: 0.01, resY: -0.01 };

  it('round-trips a pixel outline to exactly that pixel', () => {
    const outline = pixelOutline(grid, 2, 3);
    expect(outline[0]![0]).toBeCloseTo(10.03, 12);
    expect(outline[0]![1]).toBeCloseTo(49.97, 12);
    expect(outline[2]![0]).toBeCloseTo(10.04, 12);
    expect(outline[2]![1]).toBeCloseTo(49.98, 12);
    // Float noise on the edges is snapped away, so no neighbour comes in through a sliver
    expect(touched(toPixelSpace([[outline]], grid), grid.width, grid.height)).toEqual(['2:3']);
  });

  it('draws the outline counter-clockwise', () => {
    expect(turf.booleanClockwise(pixelOutline(grid, 0, 0))).toBe(false);
  });
});

describe('densify', () => {
  it('splits edges longer than the step and keeps the vertices', () => {
    const [[ring]] = densify([[square(0, 0, 0.05, 0.01)]], 0.01);
    expect(ring).toHaveLength(5 + 4 + 4);
    expect(ring![0]).toEqual([0, 0]);
    expect(ring![ring!.length - 1]).toEqual([0, 0]);
  });
});

describe('nodataPredicate', () => {
  it('treats NaN, infinities and every marker as nodata', () => {
    const isNodata = nodataPredicate([255, null, undefined], false);
    expect(isNodata(255)).toBe(true);
    expect(isNodata(Number.NaN)).toBe(true);
    expect(isNodata(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isNodata(Number.NEGATIVE_INFINITY)).toBe(true);
    expect(isNodata(254)).toBe(false);
  });

  it('compares a Float32 band in single precision', () => {
    const stored = Math.fround(-3.4e38);
    expect(nodataPredicate([-3.4e38], true)(stored)).toBe(true);
    expect(nodataPredicate([-3.4e38], false)(stored)).toBe(false);
  });
});

describe('collectTouchedPixels', () => {
  const width = 8;
  const height = 6;
  // value = row * 100 + col, with a marker, a NaN and a Float32 sentinel planted in it
  const band = new Float32Array(width * height).map((_, i) => Math.floor(i / width) * 100 + (i % width));
  band[1 * width + 1] = -9999;
  band[1 * width + 2] = Number.NaN;
  band[2 * width + 2] = -3.4e38;
  const isNodata = nodataPredicate([-9999, -3.4e38], true);

  const reader =
    (reads: number[][] = []) =>
    async ([left, top, right, bottom]: [number, number, number, number]) => {
      reads.push([left, top, right, bottom]);
      const out: number[] = [];
      for (let row = top; row < bottom; row++) {
        for (let col = left; col < right; col++) out.push(band[row * width + col]!);
      }
      return out;
    };
  // Covers pixels (0..3, 0..4) partially, (1..2, 1..3) fully
  const aoi = [[square(0.5, 0.5, 4.5, 3.5)]];
  const collect = (options: { after?: { row: number; col: number }; max?: number; maxWindowPixels?: number; reads?: number[][] } = {}) =>
    collectTouchedPixels({
      sweep: new AllTouchedSweep(aoi),
      grid: { width, height },
      readWindow: reader(options.reads),
      isNodata,
      after: options.after,
      max: options.max ?? 1000,
      ...(options.maxWindowPixels !== undefined && { maxWindowPixels: options.maxWindowPixels }),
    });

  it('returns touched pixels in row-then-column order, without nodata', async () => {
    const pixels = await collect();
    const positions = pixels.map(({ row, col }) => `${row}:${col}`);
    expect(positions).toEqual([
      ...['0:0', '0:1', '0:2', '0:3', '0:4'],
      ...['1:0', '1:3', '1:4'], // 1:1 is the marker, 1:2 is NaN
      ...['2:0', '2:1', '2:3', '2:4'], // 2:2 is the Float32 sentinel
      ...['3:0', '3:1', '3:2', '3:3', '3:4'],
    ]);
    expect(pixels.find(p => p.row === 3 && p.col === 4)?.value).toBe(304);
  });

  it('pages through the same pixels when resumed after the last one of each page', async () => {
    const all = await collect();
    const paged: typeof all = [];
    let after: { row: number; col: number } | undefined;
    for (;;) {
      const page = await collect({ max: 3, ...(after && { after }) });
      if (page.length === 0) break;
      paged.push(...page);
      after = page[page.length - 1]!;
    }
    expect(paged).toEqual(all);
  });

  it('reads in windows no larger than the bound, in the same order', async () => {
    const reads: number[][] = [];
    const pixels = await collect({ maxWindowPixels: 3, reads });
    expect(pixels).toEqual(await collect());
    expect(reads.length).toBeGreaterThan(1);
    for (const [left, top, right, bottom] of reads) {
      expect((right! - left!) * (bottom! - top!)).toBeLessThanOrEqual(3);
    }
  });

  it('stops reading once the page is full', async () => {
    const reads: number[][] = [];
    const pixels = await collect({ max: 2, maxWindowPixels: 5, reads });
    expect(pixels.map(({ row, col }) => `${row}:${col}`)).toEqual(['0:0', '0:1']);
    expect(reads).toEqual([[0, 0, 5, 1]]);
  });

  it('stops reading once the signal aborts', async () => {
    const controller = new AbortController();
    const reads: number[][] = [];
    const read = reader(reads);
    // One row per strip: the abort lands during the first strip's read and stops the second
    const collecting = collectTouchedPixels({
      sweep: new AllTouchedSweep(aoi),
      grid: { width, height },
      readWindow: async window => {
        controller.abort(new Error('client disconnected'));
        return read(window);
      },
      isNodata,
      max: 1000,
      maxWindowPixels: 5,
      signal: controller.signal,
    });
    await expect(collecting).rejects.toThrow('client disconnected');
    expect(reads).toEqual([[0, 0, 5, 1]]);
  });

  it('returns nothing for an AOI off the grid', async () => {
    const pixels = await collectTouchedPixels({
      sweep: new AllTouchedSweep([[square(20, 20, 21, 21)]]),
      grid: { width, height },
      readWindow: reader(),
      isNodata,
      max: 10,
    });
    expect(pixels).toEqual([]);
  });
});
