import { describe, it, expect, jest } from '@jest/globals';
import { EntityManager } from 'typeorm';
import {
  assertWithinAreaLimit,
  assertWithinObservationLimit,
  assertWithinRasterLayerLimit,
  ExportLimits,
  getExportLimits,
  NO_EXPORT_LIMITS,
  parseExportLimits,
} from '../../../src/jobs/soil-export/exportLimits';
import { DataFilter } from '../../../src/interfaces/DatasetFilter';

const limits = (overrides: Partial<ExportLimits>): ExportLimits => ({ ...NO_EXPORT_LIMITS, ...overrides });

const filter = (area: number, geometryIds: string[] = ['g1']): DataFilter => ({ geometryIds, parameters: {}, area });

const codeOf = (fn: () => void): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

function entityManagerWithTheme(themeData: object | null): EntityManager {
  return {
    getRepository: jest.fn().mockReturnValue({
      findOneBy: jest.fn<() => Promise<any>>().mockResolvedValue(themeData ? { id: 'theme', data: themeData } : null),
    }),
  } as unknown as EntityManager;
}

describe('parseExportLimits', () => {
  it('is unlimited when the key is absent', () => {
    expect(parseExportLimits(undefined)).toEqual(NO_EXPORT_LIMITS);
    expect(parseExportLimits(null)).toEqual(NO_EXPORT_LIMITS);
  });

  it('keeps valid limits', () => {
    expect(parseExportLimits({ maxAreaM2: 1e9, maxObservations: 500_000, maxRasterLayers: 10, exemptAdmins: true })).toEqual({
      maxAreaM2: 1e9,
      maxObservations: 500_000,
      maxRasterLayers: 10,
      exemptAdmins: true,
    });
  });

  it('ignores only the invalid limits', () => {
    expect(parseExportLimits({ maxAreaM2: 'abc', maxObservations: -5, maxRasterLayers: 3 })).toEqual(limits({ maxRasterLayers: 3 }));
    expect(parseExportLimits({ maxObservations: 0, maxRasterLayers: Infinity })).toEqual(NO_EXPORT_LIMITS);
  });

  it('treats a non-boolean exemptAdmins as false', () => {
    expect(parseExportLimits({ maxRasterLayers: 3, exemptAdmins: 'yes' }).exemptAdmins).toBe(false);
  });

  it('is unlimited when the value is not an object', () => {
    expect(parseExportLimits('unlimited')).toEqual(NO_EXPORT_LIMITS);
  });
});

describe('getExportLimits', () => {
  const exportLimits = { maxObservations: 100, exemptAdmins: true };

  it('is unlimited when there is no theme config', async () => {
    expect(await getExportLimits(entityManagerWithTheme(null), {})).toEqual(NO_EXPORT_LIMITS);
  });

  it('applies the limits to a non-admin', async () => {
    const result = await getExportLimits(entityManagerWithTheme({ exportLimits }), { isDataAdmin: false, isSuperAdmin: false });
    expect(result.maxObservations).toBe(100);
  });

  it.each([{ isDataAdmin: true }, { isSuperAdmin: true }])('exempts an admin when exemptAdmins is set (%o)', async submitter => {
    expect(await getExportLimits(entityManagerWithTheme({ exportLimits }), submitter)).toEqual(NO_EXPORT_LIMITS);
  });

  it('applies the limits to an admin when exemptAdmins is not set', async () => {
    const result = await getExportLimits(entityManagerWithTheme({ exportLimits: { maxObservations: 100 } }), { isSuperAdmin: true });
    expect(result.maxObservations).toBe(100);
  });
});

describe('assertWithinAreaLimit', () => {
  it('passes when no area limit is set, even without geometries', () => {
    expect(() => assertWithinAreaLimit(NO_EXPORT_LIMITS, filter(0, []))).not.toThrow();
  });

  it('passes at the limit', () => {
    expect(() => assertWithinAreaLimit(limits({ maxAreaM2: 1e9 }), filter(1e9))).not.toThrow();
  });

  it('fails above the limit', () => {
    expect(codeOf(() => assertWithinAreaLimit(limits({ maxAreaM2: 1e9 }), filter(1e9 + 1)))).toBe('EX_AREA_LIMIT_EXCEEDED');
  });

  it('fails a Filter with no geometries', () => {
    expect(codeOf(() => assertWithinAreaLimit(limits({ maxAreaM2: 1e9 }), filter(0, [])))).toBe('EX_AREA_LIMIT_NO_AOI');
  });

  it('reports areas in km²', () => {
    try {
      assertWithinAreaLimit(limits({ maxAreaM2: 1e9 }), filter(1_250_500_000));
    } catch (error) {
      expect((error as { params: object }).params).toEqual({ area_km2: '1,250.5', max_area_km2: '1,000' });
    }
    expect.assertions(1);
  });
});

describe('count limits', () => {
  it('pass when not set', () => {
    expect(() => assertWithinRasterLayerLimit(NO_EXPORT_LIMITS, 1_000)).not.toThrow();
    expect(() => assertWithinObservationLimit(NO_EXPORT_LIMITS, 10_000_000)).not.toThrow();
  });

  it('pass at the limit', () => {
    expect(() => assertWithinRasterLayerLimit(limits({ maxRasterLayers: 5 }), 5)).not.toThrow();
    expect(() => assertWithinObservationLimit(limits({ maxObservations: 500 }), 500)).not.toThrow();
  });

  it('fail above the limit', () => {
    expect(codeOf(() => assertWithinRasterLayerLimit(limits({ maxRasterLayers: 5 }), 6))).toBe('EX_RASTER_LAYER_LIMIT_EXCEEDED');
    expect(codeOf(() => assertWithinObservationLimit(limits({ maxObservations: 500 }), 501))).toBe('EX_OBSERVATION_LIMIT_EXCEEDED');
  });

  it('are independent of each other', () => {
    expect(() => assertWithinObservationLimit(limits({ maxRasterLayers: 1 }), 10_000_000)).not.toThrow();
  });
});
