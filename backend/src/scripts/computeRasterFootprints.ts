import type { MultiPolygon } from 'geojson';
import FileService from '../services/FileService';
import { GdalCLI } from '../utils/GdalCLI';
import { openTiff } from '../utils/raster';

const MAX_TILES = 256 * 256;
const MIN_TILES = 256;
const PIXELS_PER_TILE_MIN_DIM = 512;
const INSERT_BATCH_SIZE = 10;

export type FootprintBatchCallback = (tiles: MultiPolygon[]) => Promise<void>;

function computeGrid(rasterWidth: number, rasterHeight: number): { nCols: number; nRows: number } {
  const rasterArea = rasterWidth * rasterHeight;
  const earthArea = 360 * 180;
  const targetTiles = Math.max(MIN_TILES, Math.min(MAX_TILES, Math.round((rasterArea / earthArea) * MAX_TILES)));
  const nCols = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterWidth / rasterHeight))));
  const nRows = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterHeight / rasterWidth))));
  return { nCols, nRows };
}

export async function streamRasterFootprints(
  cogPath: string,
  nodataOverride: number | undefined,
  onBatch: FootprintBatchCallback,
): Promise<void> {
  const { mainFilePath } = await FileService.getMainFilePath(cogPath);

  const info = await GdalCLI.gdalinfo(mainFilePath);
  const gt = info.geoTransform;
  if (!gt) throw new Error('Raster has no geoTransform');

  const [rasterNativeWidth, rasterNativeHeight] = info.size ?? [0, 0];
  const xMin = gt[0]!;
  const yMax = gt[3]!;
  const pixWFull = gt[1]!;
  const pixHFull = gt[5]!;
  const xMax = xMin + rasterNativeWidth * pixWFull;
  const yMin = yMax + rasterNativeHeight * pixHFull;
  const rasterWidthDeg = xMax - xMin;
  const rasterHeightDeg = yMax - yMin;

  const nodata: number | null = nodataOverride !== undefined ? nodataOverride : (info.bands?.[0]?.noDataValue ?? null);
  const nativePixelSize = Math.abs(pixWFull);

  const { nCols, nRows } = computeGrid(rasterWidthDeg, rasterHeightDeg);
  const tileW = rasterWidthDeg / nCols;
  const tileH = rasterHeightDeg / nRows;
  const tileMinDim = Math.min(tileW, tileH);

  const tiff = await openTiff(cogPath);
  const imageCount = await tiff.getImageCount();

  // Select overview: mirrors original GDAL logic — coarsest overview satisfying
  // the resolution criterion, falling back to finest overview.
  let selectedIndex = 0;
  for (let i = imageCount - 1; i >= 1; i--) {
    const ovImage = await tiff.getImage(i);
    const ovPixelSize = nativePixelSize * (rasterNativeWidth / ovImage.getWidth());
    if (ovPixelSize < tileMinDim / PIXELS_PER_TILE_MIN_DIM) {
      selectedIndex = i;
      break;
    }
  }
  if (selectedIndex === 0 && imageCount > 1) selectedIndex = 1;

  const selectedImage = await tiff.getImage(selectedIndex);
  const ovWidth = selectedImage.getWidth();
  const ovHeight = selectedImage.getHeight();
  const ovPixelW = rasterWidthDeg / ovWidth;
  const ovPixelH = rasterHeightDeg / ovHeight;

  let batch: MultiPolygon[] = [];

  for (let iRow = 0; iRow < nRows; iRow++) {
    for (let iCol = 0; iCol < nCols; iCol++) {
      const tileXMin = xMin + iCol * tileW;
      const tileXMax = xMin + (iCol + 1) * tileW;
      const tileYMax = yMax - iRow * tileH;
      const tileYMin = yMax - (iRow + 1) * tileH;

      const pxStart = Math.max(0, Math.floor((tileXMin - xMin) / ovPixelW));
      const pxEnd = Math.min(ovWidth, Math.ceil((tileXMax - xMin) / ovPixelW));
      const pyStart = Math.max(0, Math.floor((yMax - tileYMax) / ovPixelH));
      const pyEnd = Math.min(ovHeight, Math.ceil((yMax - tileYMin) / ovPixelH));

      const tilePixW = pxEnd - pxStart;
      const tilePixH = pyEnd - pyStart;
      if (tilePixW <= 0 || tilePixH <= 0) continue;

      const rasters = await selectedImage.readRasters({
        window: [pxStart, pyStart, pxEnd, pyEnd],
        samples: [0],
      });
      const rawData = rasters[0] as ArrayLike<number>;

      const mask = new Uint8Array(tilePixW * tilePixH);
      let hasValid = false;
      for (let i = 0; i < rawData.length; i++) {
        const v = rawData[i] as number;
        const valid = !Number.isNaN(v) && (nodata === null || v !== nodata);
        if (valid) {
          mask[i] = 1;
          hasValid = true;
        }
      }
      if (!hasValid) continue;

      const tileGeoXMin = xMin + pxStart * ovPixelW;
      const tileGeoYMax = yMax - pyStart * ovPixelH;

      const polygonCoords = traceMaskToPolygons(mask, tilePixW, tilePixH, tileGeoXMin, tileGeoYMax, ovPixelW, ovPixelH);
      if (polygonCoords.length === 0) continue;

      batch.push({ type: 'MultiPolygon', coordinates: polygonCoords });

      if (batch.length >= INSERT_BATCH_SIZE) {
        await onBatch(batch);
        batch = [];
      }
    }
  }

  if (batch.length > 0) await onBatch(batch);
}

function traceMaskToPolygons(
  mask: Uint8Array,
  w: number,
  h: number,
  xMin: number,
  yMax: number,
  pixW: number,
  pixH: number,
): MultiPolygon['coordinates'] {
  const W1 = w + 1;
  const adj = new Map<number, number[]>();

  const addEdge = (fc: number, fr: number, tc: number, tr: number) => {
    const k = fr * W1 + fc;
    const v = tr * W1 + tc;
    const list = adj.get(k);
    if (list) list.push(v);
    else adj.set(k, [v]);
  };

  const at = (r: number, c: number): number => (r >= 0 && r < h && c >= 0 && c < w ? (mask[r * w + c] as number) : 0);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!at(r, c)) continue;
      if (!at(r - 1, c)) addEdge(c, r, c + 1, r);
      if (!at(r + 1, c)) addEdge(c + 1, r + 1, c, r + 1);
      if (!at(r, c - 1)) addEdge(c, r + 1, c, r);
      if (!at(r, c + 1)) addEdge(c + 1, r, c + 1, r + 1);
    }
  }

  const maxNode = W1 * (h + 1);
  const used = new Set<number>();
  const encode = (f: number, t: number) => f * maxNode + t;

  const exterior: number[][][] = [];
  const holes: number[][][] = [];

  for (const [startK, startOuts] of adj) {
    for (const firstTo of startOuts) {
      if (used.has(encode(startK, firstTo))) continue;

      const ring: number[][] = [];
      let cur = startK;
      let nxt = firstTo;

      for (;;) {
        used.add(encode(cur, nxt));
        ring.push([xMin + (cur % W1) * pixW, yMax - Math.floor(cur / W1) * pixH]);
        cur = nxt;
        if (cur === startK) break;
        const nexts = adj.get(cur);
        if (!nexts) break;
        nxt = nexts.find(t => !used.has(encode(cur, t))) ?? -1;
        if (nxt === -1) break;
      }

      if (ring.length < 3) continue;

      // Shoelace signed area (unclosed ring, wrap-around index)
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        area += ring[i]![0]! * ring[j]![1]! - ring[j]![0]! * ring[i]![1]!;
      }

      // Tracer produces CW exterior (area < 0) and CCW holes (area > 0).
      // GeoJSON requires CCW exterior and CW holes — reverse both.
      const closed = [...ring, ring[0]!];
      if (area < 0) exterior.push(closed.reverse());
      else holes.push(closed.slice().reverse());
    }
  }

  const result: MultiPolygon['coordinates'] = exterior.map(e => [e]);

  for (const hole of holes) {
    const [hx, hy] = hole[0]!;
    const container = result.find(poly => pointInRing(hx!, hy!, poly[0]!));
    if (container) container.push(hole);
  }

  return result;
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) {
      inside = !inside;
    }
  }
  return inside;
}
