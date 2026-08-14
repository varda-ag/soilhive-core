import { describe, it, expect, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GdalCLI } from '../../src/utils/GdalCLI';

const GEOJSON_OGRINFO = JSON.stringify({
  description: '/path/to/sample_point_0.geojson',
  driverShortName: 'GeoJSON',
  driverLongName: 'GeoJSON',
  layers: [
    {
      name: 'sample_point_0',
      metadata: {},
      geometryFields: [
        {
          name: '',
          type: 'Point',
          nullable: true,
          extent: [37.6871, -3.79168, 39.7114, -0.637193],
          coordinateSystem: {
            wkt: 'GEOGCRS["WGS 84",...]',
            projjson: {
              $schema: 'https://proj.org/schemas/v0.7/projjson.schema.json',
              type: 'GeographicCRS',
              name: 'WGS 84',
              id: { authority: 'EPSG', code: 4326 },
            },
            dataAxisToSRSAxisMapping: [2, 1],
          },
        },
      ],
      featureCount: 8,
      fields: [
        { name: 'metadata', type: 'String', subType: 'JSON', nullable: true, uniqueConstraint: false },
        { name: 'rawParameters', type: 'String', subType: 'JSON', nullable: true, uniqueConstraint: false },
      ],
    },
  ],
  metadata: {},
  domains: {},
  relationships: {},
});

const parseOgrInfo = (json: string) => (GdalCLI as any).parseOgrInfo(json);

describe('GdalCLI.parseOgrInfo', () => {
  describe('GeoJSON with Point geometry', () => {
    it('extracts driver', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).driver).toBe('GeoJSON');
    });

    it('extracts geometry type from geometryFields[0].type', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].geometry).toBe('Point');
    });

    it('extracts EPSG from coordinateSystem.projjson.id', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].epsg).toBe(4326);
    });

    it('extracts feature count', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].featureCount).toBe(8);
    });

    it('extracts attribute fields', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].fields).toEqual([
        { name: 'metadata', type: 'String' },
        { name: 'rawParameters', type: 'String' },
      ]);
    });

    it('sets geomColumn to empty string for GeoJSON (unnamed geometry field)', () => {
      expect(parseOgrInfo(GEOJSON_OGRINFO).layers[0].geomColumn).toBe(null);
    });
  });

  describe('layer with no geometry', () => {
    it('defaults geometry to None when geometryFields is absent', () => {
      const json = JSON.stringify({
        driverShortName: 'CSV',
        layers: [{ name: 'table', featureCount: 3, fields: [] }],
      });
      expect(parseOgrInfo(json).layers[0].geometry).toBe('None');
    });

    it('defaults epsg to undefined when coordinateSystem is absent', () => {
      const json = JSON.stringify({
        driverShortName: 'CSV',
        layers: [{ name: 'table', featureCount: 3, fields: [] }],
      });
      expect(parseOgrInfo(json).layers[0].epsg).toBeUndefined();
    });
  });
});

const parseProgress = (buffer: string, last: number | null = null) => (GdalCLI as any).parseProgress(buffer, last);

/** Feeds chunks through parseProgress the way run() does, returning every reported percentage. */
function feed(chunks: string[]): number[] {
  const reported: number[] = [];
  let buffer = '';
  let last: number | null = null;
  for (const chunk of chunks) {
    const parsed = parseProgress(buffer + chunk, last);
    buffer = parsed.rest;
    last = parsed.last;
    reported.push(...parsed.percentages);
  }
  return reported;
}

describe('GdalCLI.parseProgress', () => {
  const FULL_BAR = '0...10...20...30...40...50...60...70...80...90...100 - done.\n';

  it('reports every marker of a complete bar', () => {
    expect(feed([FULL_BAR])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('reports markers arriving one tick per chunk', () => {
    expect(feed(FULL_BAR.split(/(?=[.\d])/))).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  // Chunks coalesce arbitrarily under load; this is a real gdal_translate capture.
  it('reports markers from coalesced chunks', () => {
    const chunks = ['Input file size is 10, 10\n0', '...10...20...30...40...50', '...60...70...80...90...100 - done.\n'];
    expect(feed(chunks)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('holds back a trailing digit run until the next chunk completes it', () => {
    expect(feed(['0...10...20...30...40...50...60...70...80...90...10', '0 - done.\n'])).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
  });

  it('reports nothing for a chunk that is only an incomplete number', () => {
    expect(parseProgress('10', 0)).toEqual({ percentages: [], rest: '10', last: 0 });
  });

  it('ignores gdal_translate preamble digits', () => {
    expect(feed(['Input file size is 6000, 6000\n', FULL_BAR])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  // A square crop whose preamble digits are themselves valid percentages.
  it('ignores a preamble that reads as a percentage', () => {
    expect(feed(['Input file size is 100, 100\n', FULL_BAR])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('ignores gdalwarp preamble digits', () => {
    const preamble = 'Creating output file that is 5984P x 3008L.\nProcessing s1.tif [1/2] : ';
    expect(feed([preamble, FULL_BAR])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  // gdalwarp prints one bar per source file, so the percentage restarts mid-run.
  it('restarts on the second bar of a multi-source warp', () => {
    const chunks = [
      'Creating output file that is 5984P x 3008L.\nProcessing s1.tif [1/2] : 0',
      '...10...20...30...40...50...60...70...80...90',
      '...100 - done.\nProcessing s2.tif [2/2] : 0',
      '...10...20...30...40...50...60...70...80...90...100 - done.\n',
    ];
    expect(feed(chunks)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('ignores an out-of-sequence marker', () => {
    expect(feed(['0...10...', '90...', '20...'])).toEqual([0, 10, 20]);
  });

  it('reports a partial bar from a run that failed midway', () => {
    expect(feed(['0...10...20...30.'])).toEqual([0, 10, 20, 30]);
  });
});

describe('GdalCLI.translate progress reporting', () => {
  const SOURCE = path.join(__dirname, '../assets/raster/bdod_5-15cm_mean.tif');
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdalcli-progress-'));

  afterAll(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('reports 0 to 100 in order for a real gdal_translate', async () => {
    const reported: number[] = [];
    await GdalCLI.translate(SOURCE, path.join(outputDir, 'out.tif'), ['-of', 'GTiff'], percent => {
      reported.push(percent);
    });

    expect(reported[0]).toBe(0);
    expect(reported.at(-1)).toBe(100);
    expect(reported).toEqual([...reported].sort((a, b) => a - b));
  });

  it('awaits an async callback before resolving', async () => {
    const reported: number[] = [];
    await GdalCLI.translate(SOURCE, path.join(outputDir, 'async.tif'), ['-of', 'GTiff'], async percent => {
      await new Promise(resolve => setImmediate(resolve));
      reported.push(percent);
    });

    expect(reported.at(-1)).toBe(100);
  });

  it('succeeds when the callback throws', async () => {
    await expect(
      GdalCLI.translate(SOURCE, path.join(outputDir, 'throws.tif'), ['-of', 'GTiff'], () => {
        throw new Error('progress write failed');
      }),
    ).resolves.toBeUndefined();

    expect(fs.existsSync(path.join(outputDir, 'throws.tif'))).toBe(true);
  });
});

describe('GdalCLI.transformPoints', () => {
  it('transforms EPSG:3857 to EPSG:4326 by default', async () => {
    // Pseudo-Mercator's false origin coincides exactly with lon 0, lat 0 — a fixed point any
    // correct implementation must hit exactly, unlike an arbitrary coordinate.
    const [[lon, lat]] = await GdalCLI.transformPoints('EPSG:3857', [[0, 0]]);
    expect(lon).toBeCloseTo(0, 6);
    expect(lat).toBeCloseTo(0, 6);
  });

  it('transforms a real corner coordinate within the accuracy gdaltransform itself reports', async () => {
    const [[lon, lat]] = await GdalCLI.transformPoints('EPSG:3857', [[-9034969.932, -3952516.771]]);
    expect(lon).toBeCloseTo(-81.1625158147591, 6);
    expect(lat).toBeCloseTo(-33.4299806691591, 6);
  });

  it('transforms to a custom destination SRS rather than always landing on EPSG:4326', async () => {
    // The reverse of the default-direction case above — needed by RasterFileWriter.cropToAoiBbox,
    // which reprojects an EPSG:4326 AOI into a layer's native CRS rather than the other way round.
    const [[x, y]] = await GdalCLI.transformPoints('EPSG:4326', [[0, 0]], 'EPSG:3857');
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('transforms multiple points in one call, preserving order', async () => {
    const points = await GdalCLI.transformPoints('EPSG:3857', [
      [0, 0],
      [-9034969.932, -3952516.771],
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]![0]).toBeCloseTo(0, 6);
    expect(points[1]![0]).toBeCloseTo(-81.1625158147591, 6);
  });

  it('returns an empty array without spawning a process', async () => {
    const runSpy = jest.spyOn(GdalCLI as any, 'run');
    try {
      expect(await GdalCLI.transformPoints('EPSG:3857', [])).toEqual([]);
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      runSpy.mockRestore();
    }
  });

  it('throws when gdaltransform returns a different number of points than requested', async () => {
    const runSpy = jest.spyOn(GdalCLI as any, 'run').mockResolvedValueOnce('1 2 0\n');
    try {
      await expect(
        GdalCLI.transformPoints('EPSG:3857', [
          [0, 0],
          [1, 1],
        ]),
      ).rejects.toThrow(/returned 1 point\(s\) for 2 input\(s\)/);
    } finally {
      runSpy.mockRestore();
    }
  });
});

describe('GdalCLI.extractEpsgFromWkt', () => {
  it('returns undefined for an empty or missing wkt', () => {
    expect(GdalCLI.extractEpsgFromWkt(undefined)).toBeUndefined();
    expect(GdalCLI.extractEpsgFromWkt('')).toBeUndefined();
  });

  it('reads the depth-1 ID off a WKT2 PROJCRS, skipping nested DATUM/METHOD/PARAMETER ids', () => {
    const wkt = `PROJCRS["WGS 84 / Pseudo-Mercator",
      BASEGEOGCRS["WGS 84", DATUM["World Geodetic System 1984"], ID["EPSG",4326]],
      CONVERSION["Popular Visualisation Pseudo-Mercator",
        METHOD["Popular Visualisation Pseudo Mercator", ID["EPSG",1024]],
        PARAMETER["Latitude of natural origin",0, ID["EPSG",8801]],
        PARAMETER["False northing",0, ID["EPSG",8807]]],
      CS[Cartesian,2],
      ID["EPSG",3857]]`;
    expect(GdalCLI.extractEpsgFromWkt(wkt)).toBe(3857);
  });

  it('returns undefined for a custom/unregistered projection with no depth-1 id, instead of a nested parameter id', () => {
    // A Lambert Azimuthal Equal Area with no EPSG code of its own — the WKT ends after CS/AXIS
    // with no depth-1 ID at all. The only ID present is the "False northing" parameter's own code
    // (8807), nested inside CONVERSION/PARAMETER — a real, unrelated CRS in spatial_ref_sys
    // (NAD83 / Alaska zone 5 + NAVD88 height), so returning it here would silently reproject to
    // the wrong place instead of failing.
    const wkt = `PROJCRS["Lambert_Azimuthal_Equal_Area",
      BASEGEOGCRS["WGS 84", DATUM["World Geodetic System 1984"], ID["EPSG",4326]],
      CONVERSION["Lambert Azimuthal Equal Area",
        METHOD["Lambert Azimuthal Equal Area", ID["EPSG",9820]],
        PARAMETER["Latitude of natural origin",5, ID["EPSG",8801]],
        PARAMETER["Longitude of natural origin",20, ID["EPSG",8802]],
        PARAMETER["False easting",0, ID["EPSG",8806]],
        PARAMETER["False northing",0, ID["EPSG",8807]]],
      CS[Cartesian,2],
      AXIS["(E)",east], AXIS["(N)",north]]`;
    expect(GdalCLI.extractEpsgFromWkt(wkt)).toBeUndefined();
  });

  it('reads a depth-1 id off a plain GEOGCRS with no nested ids to skip', () => {
    const wkt = `GEOGCRS["WGS 84", DATUM["World Geodetic System 1984"], CS[ellipsoidal,2], ID["EPSG",4326]]`;
    expect(GdalCLI.extractEpsgFromWkt(wkt)).toBe(4326);
  });
});
