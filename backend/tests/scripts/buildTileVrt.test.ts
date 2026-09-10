import { describe, it, expect } from '@jest/globals';
import { SyntaxValidator } from 'fast-xml-validator';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { GdalCLI } from '../../src/utils/GdalCLI';
import { buildTileVrt } from '../../src/scripts/computeRasterFootprints';

const rasterAssetsPath = path.join(__dirname, '../assets/raster');

const FOOTPRINT_ARGS = ['-b', '1', '-max_points', 'unlimited', '-t_srs', 'EPSG:4326', '-of', 'GeoJSON', '-q'];

async function withTempFile<T>(prefix: string, ext: string, fn: (filePath: string) => Promise<T>): Promise<T> {
  const filePath = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  try {
    return await fn(filePath);
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

describe('buildTileVrt', () => {
  it.each([
    'bdod_5-15cm_mean.tif', // Geographic WGS84: dataAxisToSRSAxisMapping swaps axes ("2,1")
    'epsg8807_1b_250m.tif', // Projected Lambert Azimuthal Equal Area, no EPSG code: dataAxisToSRSAxisMapping does not swap ("1,2")
  ])('produces a GDAL-valid, footprint-equivalent window', async (file: string) => {
    const filePath = path.join(rasterAssetsPath, file);
    const info = await GdalCLI.gdalinfo(filePath);
    const [width, height] = info.size!;
    const [xMin, pixelW, , yMax, , pixelH] = info.geoTransform!;

    const srcOffX = Math.floor(width / 5);
    const srcOffY = Math.floor(height / 3);
    const tilePixW = Math.floor(width / 3);
    const tilePixH = Math.floor(height / 4);

    const referenceVrtXml = await withTempFile('buildTileVrt-reference', '.vrt', async referenceVrtPath => {
      await GdalCLI.translate(filePath, referenceVrtPath, ['-of', 'VRT']);
      return fs.readFile(referenceVrtPath, 'utf-8');
    });

    const tileGeoXMin = xMin! + srcOffX * pixelW!;
    const tileGeoYMax = yMax! + srcOffY * pixelH!;
    const tileVrtXml = buildTileVrt(referenceVrtXml, tilePixW, tilePixH, srcOffX, srcOffY, tileGeoXMin, tileGeoYMax);

    expect(() => SyntaxValidator.validate(tileVrtXml)).not.toThrow();

    const jsBuiltFootprint = await withTempFile('buildTileVrt-js', '.vrt', async vrtPath => {
      await fs.writeFile(vrtPath, tileVrtXml);
      // GDAL itself must accept the JS-built VRT and see the requested tile shape, not just a
      // string that happens to be well-formed XML.
      const tileInfo = await GdalCLI.gdalinfo(vrtPath);
      expect(tileInfo.size).toEqual([tilePixW, tilePixH]);
      return GdalCLI.footprint(vrtPath, '/vsistdout/', FOOTPRINT_ARGS);
    });

    const realFootprint = await withTempFile('buildTileVrt-real', '.vrt', async realVrtPath => {
      await GdalCLI.translate(filePath, realVrtPath, [
        '-of',
        'VRT',
        '-srcwin',
        String(srcOffX),
        String(srcOffY),
        String(tilePixW),
        String(tilePixH),
      ]);
      return GdalCLI.footprint(realVrtPath, '/vsistdout/', FOOTPRINT_ARGS);
    });

    const jsGeometry = JSON.parse(jsBuiltFootprint).features.map((f: { geometry: unknown }) => f.geometry);
    const realGeometry = JSON.parse(realFootprint).features.map((f: { geometry: unknown }) => f.geometry);
    expect(jsGeometry).toEqual(realGeometry);
  });

  it('throws when the reference VRT is not well-formed XML', () => {
    const truncatedVrt = [
      '<VRTDataset rasterXSize="100" rasterYSize="100">',
      '<GeoTransform> 0, 1, 0, 0, 0, -1</GeoTransform>',
      '<VRTRasterBand dataType="Float32" band="1">',
      '<SimpleSource>',
      '<SrcRect xOff="0" yOff="0" xSize="100" ySize="100" />',
      '<DstRect xOff="0" yOff="0" xSize="100" ySize="100" />',
      '</SimpleSource>',
      // Missing </VRTRasterBand> and </VRTDataset>.
    ].join('\n');

    expect(() => buildTileVrt(truncatedVrt, 10, 10, 0, 0, 0, 0)).toThrow(/not well-formed XML/);
  });
});
