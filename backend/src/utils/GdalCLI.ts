import { spawn } from 'child_process';
import { getErrorMessage } from './error';
import { log } from './logger';

/**
 * Receives the percentage markers of a GDAL progress bar as they stream in.
 *
 * The percentage is per progress bar, not per run: `gdalwarp` prints one bar per source file,
 * so a multi-source run reports 0→100 once per source and the value can go down. Nothing is
 * synthesized — the callback may fire zero times (see `ogr2ogr` below), and completion is
 * signalled by the returned promise, not by a final 100.
 *
 * Awaited, so a slow callback is applied in order and has finished before the run resolves.
 * A rejection is logged and swallowed: expensive conversion work is never failed because
 * progress reporting broke.
 */
export type GdalProgressCallback = (percent: number) => void | Promise<void>;

export interface OgrInfoField {
  name: string;
  type: string;
}

export interface OgrInfoLayer {
  name: string;
  geometry: string;
  geomColumn: string | null;
  fields: OgrInfoField[];
  featureCount: number | null;
  epsg: number | undefined;
}

export interface OgrInfoResult {
  driver: string;
  layers: OgrInfoLayer[];
}

export interface GdalInfoBand {
  band?: number;
  block?: [number, number];
  type?: string;
  min?: number;
  max?: number;
  overviews?: Array<{ size: [number, number] }>;
  noDataValue?: number;
}

export interface GdalInfoOutput {
  driverShortName?: string;
  geoTransform?: number[];
  size?: [number, number];
  bands?: GdalInfoBand[];
  metadata?: {
    IMAGE_STRUCTURE?: { LAYOUT?: string; COMPRESSION?: string };
    SUBDATASETS?: Record<string, string>;
    [key: string]: Record<string, string> | undefined;
  };
  coordinateSystem?: { wkt?: string };
  wgs84Extent?: { type: string; coordinates: number[][][] };
}

export class GdalCLI {
  static async gdalinfo(filePath: string): Promise<GdalInfoOutput> {
    const stdout = await GdalCLI.run('gdalinfo', ['-json', filePath]);
    return JSON.parse(stdout) as GdalInfoOutput;
  }

  static async ogrinfo(filePath: string, openOptions: string[] = []): Promise<OgrInfoResult> {
    const ooArgs = openOptions.flatMap(o => ['-oo', o]);
    const stdout = await GdalCLI.run('ogrinfo', ['-al', '-so', '-json', ...ooArgs, filePath]);
    return GdalCLI.parseOgrInfo(stdout);
  }

  /**
   * `ogr2ogr` prints no progress bar unless asked, so `-progress` is added here when — and only
   * when — a callback is given, to keep the two from drifting apart.
   *
   * The flag is not enough on its own: GDAL turns progress off for sources without a fast feature
   * count, warning `Progress turned off as fast feature count is not available` on stderr and
   * emitting no bar at all. CSV and XLSX sources fall in that group, so the callback never fires
   * for them; GeoJSON and GPKG sources do report.
   */
  static async ogr2ogr(args: string[], onProgress?: GdalProgressCallback): Promise<void> {
    await GdalCLI.run('ogr2ogr', onProgress ? ['-progress', ...args] : args, onProgress);
  }

  static async warp(src: string, dst: string, args: string[], onProgress?: GdalProgressCallback): Promise<void> {
    await GdalCLI.run('gdalwarp', [...args, src, dst], onProgress);
  }

  static async translate(src: string, dst: string, args: string[], onProgress?: GdalProgressCallback): Promise<void> {
    await GdalCLI.run('gdal_translate', [...args, src, dst], onProgress);
  }

  /**
   * Edits a raster's metadata in place with `gdal_edit.py` — used here to set per-band
   * Scale/Offset on a VRT so reads apply a unit conversion without rewriting pixel data.
   */
  static async editInPlace(filePath: string, args: string[]): Promise<void> {
    await GdalCLI.run('gdal_edit.py', [...args, filePath]);
  }

  private static async run(cmd: string, args: string[], onProgress?: GdalProgressCallback): Promise<string> {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stderr.on('data', chunk => {
      stderr += chunk;
    });

    // Resolves rather than rejects so that a spawn error raised while stdout is still being
    // drained does not surface as an unhandled rejection before it is awaited below.
    const exit = new Promise<{ code: number | null; error?: Error }>(resolve => {
      proc.on('close', code => resolve({ code }));
      proc.on('error', error => resolve({ code: null, error }));
    });

    // Iterating (rather than listening for 'data') lets each onProgress call be awaited before
    // the next chunk is parsed, and makes the loop finish before run() resolves — so the last
    // reported percentage has been applied by the time the caller's await returns. The bar is a
    // few dozen bytes, far below the pipe buffer, so pausing the read never stalls GDAL.
    let buffer = '';
    let last: number | null = null;
    try {
      for await (const chunk of proc.stdout) {
        const text = String(chunk);
        stdout += text;
        if (!onProgress) continue;

        const parsed = GdalCLI.parseProgress(buffer + text, last);
        buffer = parsed.rest;
        last = parsed.last;
        for (const percent of parsed.percentages) {
          try {
            await onProgress(percent);
          } catch (err) {
            log.warn('GDAL progress callback failed', { cmd, percent, error: getErrorMessage(err) });
          }
        }
      }
    } catch {
      // Stream failures are reported through the exit result below.
    }

    const { code, error } = await exit;
    if (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`GDAL_NOT_INSTALLED: ${cmd} not found on this server`);
      }
      throw new Error(`Failed to run ${cmd}: ${getErrorMessage(error)}`);
    }
    if (code !== 0) {
      throw new Error(`${cmd} failed (exit ${code}): ${stderr.trim()}`);
    }
    return stdout;
  }

  /**
   * Extracts the percentage markers of a GDAL progress bar (`0...10...20...100 - done.`) from
   * streamed stdout. Only the numbers are reported — the dots in between are 2.5% ticks that carry
   * no value of their own — so a complete bar yields 0, 10, … 100.
   *
   * GDAL flushes after every tick, but chunks still coalesce arbitrarily (`"...10...20...30"`) and
   * can end mid-number, so a trailing digit run is returned in `rest` and re-parsed with the next
   * chunk: a chunk ending in `10` may be a complete marker or a truncated `100`.
   *
   * Acceptance is sequence-locked — `0` starts a bar (or restarts it, since gdalwarp prints one bar
   * per source file) and afterwards only `last + 10` is accepted. The same stream carries preamble
   * text whose digits would otherwise read as percentages: `Input file size is 100, 100`,
   * `Creating output file that is 5984P x 3008L.`, `Processing tile_10.tif [1/2] : `.
   */
  private static parseProgress(buffer: string, last: number | null): { percentages: number[]; rest: string; last: number | null } {
    const percentages: number[] = [];
    let current = last;
    const digits = /\d+/g;
    let match: RegExpExecArray | null;

    while ((match = digits.exec(buffer)) !== null) {
      if (match.index + match[0].length === buffer.length) {
        return { percentages, rest: buffer.slice(match.index), last: current };
      }
      const value = Number(match[0]);
      if (value === 0 || value === (current === null ? 0 : current + 10)) {
        percentages.push(value);
        current = value;
      }
    }

    return { percentages, rest: '', last: current };
  }

  private static parseOgrInfo(json: string): OgrInfoResult {
    const parsed = JSON.parse(json);
    const driver = (parsed.driverShortName as string) ?? '';
    const layers: OgrInfoLayer[] = ((parsed.layers ?? []) as any[]).map(l => ({
      name: l.name as string,
      geometry: GdalCLI.extractGeomType(l),
      geomColumn: GdalCLI.extractGeomColumn(l),
      fields: ((l.fields ?? []) as any[]).map(f => ({
        name: f.name as string,
        type: f.type as string,
      })),
      featureCount: (l.featureCount as number | null) ?? null,
      epsg: GdalCLI.extractEpsg((l.geometryFields as any[])?.[0]?.coordinateSystem?.projjson),
    }));
    return { driver, layers };
  }

  private static extractEpsg(srs: any): number | undefined {
    if (!srs?.id) return undefined;
    const entries: any[] = Array.isArray(srs.id) ? srs.id : [srs.id];
    const epsg = entries.find(e => e.authority === 'EPSG');
    return epsg ? Number(epsg.code) : undefined;
  }

  // gdalinfo's raster output has no structured authority code (unlike ogrinfo's projjson), so the
  // CRS's own EPSG code is read off the last ID["EPSG", n] entry in the WKT, which is the outermost one.
  static extractEpsgFromWkt(wkt?: string): number | undefined {
    if (!wkt) return undefined;
    const matches = [...wkt.matchAll(/ID\["EPSG",\s*(\d+)\]/g)];
    const last = matches.at(-1);
    return last ? Number(last[1]) : undefined;
  }

  private static extractGeomType(layer: any): string {
    // Take type from the first geometry field with an extent
    const geomFields = layer.geometryFields as any[];
    if (!geomFields || geomFields.length === 0) return 'None';
    for (let i = 0; i < geomFields.length; i++) {
      if (geomFields[i].extent) {
        return geomFields[i].type as string;
      }
    }
    return 'None';
  }

  private static extractGeomColumn(layer: any): string | null {
    // Rationale: if a geometry field has an extent, it is likely the main geometry field.
    // If multiple geometry fields have extents, we take the first one.
    // If name is not available, we use the layer fields list but only if it has the same length as the geometry fields list.
    // This covers the case of CSV files with geometry columns detected by GDAL, where the geometry fields may not have names.
    const geomFields = layer.geometryFields as any[];
    if (!geomFields || geomFields.length === 0) return null;
    for (let i = 0; i < geomFields.length; i++) {
      if (geomFields[i].extent) {
        if (geomFields[i].name) {
          return geomFields[i].name as string;
        } else if (layer.fields && layer.fields.length === geomFields.length) {
          return layer.fields[i].name as string;
        }
      }
    }
    return null;
  }
}
