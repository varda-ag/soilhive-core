import { spawn } from 'child_process';
import { getErrorMessage } from './error';

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

  static async ogr2ogr(args: string[]): Promise<void> {
    await GdalCLI.run('ogr2ogr', args);
  }

  static async warp(src: string, dst: string, args: string[]): Promise<void> {
    await GdalCLI.run('gdalwarp', [...args, src, dst]);
  }

  static async translate(src: string, dst: string, args: string[]): Promise<void> {
    await GdalCLI.run('gdal_translate', [...args, src, dst]);
  }

  private static run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', chunk => {
        stdout += chunk;
      });
      proc.stderr.on('data', chunk => {
        stderr += chunk;
      });
      proc.on('close', code => {
        if (code !== 0) {
          reject(new Error(`${cmd} failed (exit ${code}): ${stderr.trim()}`));
        } else {
          resolve(stdout);
        }
      });
      proc.on('error', err => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(`GDAL_NOT_INSTALLED: ${cmd} not found on this server`));
        } else {
          reject(new Error(`Failed to run ${cmd}: ${getErrorMessage(err)}`));
        }
      });
    });
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
