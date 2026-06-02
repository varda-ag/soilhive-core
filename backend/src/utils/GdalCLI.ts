import { spawn } from 'child_process';

export interface OgrInfoField {
  name: string;
  type: string;
}

export interface OgrInfoLayer {
  name: string;
  geometry: string;
  geomColumn: string | null;
  fields: OgrInfoField[];
  featureCount: number;
  epsg: number | undefined;
}

export interface OgrInfoResult {
  driver: string;
  layers: OgrInfoLayer[];
}

export class GdalCLI {
  static async ogrinfo(filePath: string, openOptions: string[] = []): Promise<OgrInfoResult> {
    const ooArgs = openOptions.flatMap(o => ['-oo', o]);
    const stdout = await GdalCLI.run('ogrinfo', ['-al', '-so', '-json', ...ooArgs, filePath]);
    return GdalCLI.parseOgrInfo(stdout);
  }

  static async ogr2ogr(args: string[]): Promise<void> {
    await GdalCLI.run('ogr2ogr', args);
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
      proc.on('error', err => reject(new Error(`Failed to run ${cmd}: ${err.message}`)));
    });
  }

  private static parseOgrInfo(json: string): OgrInfoResult {
    const parsed = JSON.parse(json);
    const driver = (parsed.driverShortName as string) ?? '';
    const layers: OgrInfoLayer[] = ((parsed.layers ?? []) as any[]).map(l => ({
      name: l.name as string,
      geometry: ((l.geometryFields as any[])?.[0]?.type as string) ?? 'None',
      geomColumn: ((l.geometryFields as any[])?.[0]?.name as string) ?? null,
      fields: ((l.fields ?? []) as any[]).map(f => ({
        name: f.name as string,
        type: f.type as string,
      })),
      featureCount: (l.featureCount as number) ?? -1,
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
}
