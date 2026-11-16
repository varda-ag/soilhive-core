import { describe, it, expect } from '@jest/globals';
import { suggestShape, ShapeVocabulary } from '../../src/utils/vectorShape';
import { OgrSampleFeature } from '../../src/utils/GdalCLI';
import { DetectableFields } from '../../src/types/DataMapping';

const NO_FIELDS: Record<DetectableFields, string | null> = {
  [DetectableFields.GEOMETRY]: null,
  [DetectableFields.LICENSE]: null,
  [DetectableFields.SAMPLING_DATE]: null,
  [DetectableFields.DEPTH]: null,
  [DetectableFields.MIN_DEPTH]: null,
  [DetectableFields.MAX_DEPTH]: null,
  [DetectableFields.HORIZON]: null,
  [DetectableFields.LATITUDE]: null,
  [DetectableFields.LONGITUDE]: null,
};

const NO_VOCABULARY: ShapeVocabulary = { units: [], procedure: {} };

const rows = (header: string[], data: unknown[][], geometry: (row: unknown[]) => unknown = () => null): OgrSampleFeature[] =>
  data.map(row => ({ properties: Object.fromEntries(header.map((name, i) => [name, row[i]])), geometry: geometry(row) }));

const POINTS = [
  [12.8, 42.4],
  [139.69, 35.69],
  [36.82, -1.29],
];

describe('suggestShape', () => {
  describe('wide files', () => {
    it('suggests wide for one row per location with several numeric columns', () => {
      const header = ['lat', 'lon', 'depth', 'land_use', 'pH', 'clay'];
      const features = rows(
        header,
        POINTS.map(([lon, lat], i) => [lat, lon, 20, i % 2 ? 'crop' : 'forest', 6 + i, 20 + i]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon', depth: 'depth' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({ format: 'wide' });
    });

    it('suggests wide for one value column with no unit or procedure column', () => {
      const header = ['lat', 'lon', 'pH'];
      const features = rows(
        header,
        POINTS.map(([lon, lat], i) => [lat, lon, 6 + i]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({ format: 'wide' });
    });

    it('suggests wide when the same location repeats at other depths only', () => {
      const header = ['lat', 'lon', 'depth', 'land_use', 'pH'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat]) => [
          [lat, lon, 20, 'crop', 6.1],
          [lat, lon, 40, 'forest', 6.4],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon', depth: 'depth' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({ format: 'wide' });
    });

    it('suggests wide for an empty sample', () => {
      expect(suggestShape(['a', 'b'], [], NO_FIELDS, NO_VOCABULARY)).toEqual({ format: 'wide' });
    });
  });

  describe('long files with a property column', () => {
    it('finds the property and value columns by content when the names say nothing', () => {
      const header = ['lat', 'lon', 'depth', 'det', 'conc'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, 20, 'P_OLSEN_2', 14 + i],
          [lat, lon, 20, 'pH_H2O', 6 + i],
          [lat, lon, 20, 'OC_WB', 1.5 + i],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon', depth: 'depth' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({
        format: 'long',
        roles: { property_col: 'det', value_col: 'conc', unit_col: null, method_code_col: null, procedure_cols: {} },
      });
    });

    it('reads values that arrive as text, as a CSV gives them', () => {
      const header = ['lat', 'lon', 'det', 'conc'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [String(lat), String(lon), 'P_OLSEN_2', String(14 + i)],
          [String(lat), String(lon), 'pH_H2O', String(6 + i)],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY).roles).toMatchObject({ property_col: 'det', value_col: 'conc' });
    });

    it('tells locations apart by the geometry of the layer', () => {
      const header = ['det', 'conc'];
      const features = rows(
        header,
        POINTS.flatMap((point, i) => [
          ['P_OLSEN_2', 14 + i, point],
          ['pH_H2O', 6 + i, point],
        ]),
        row => ({ type: 'Point', coordinates: row[2] }),
      );

      expect(suggestShape(header, features, NO_FIELDS, NO_VOCABULARY).roles).toMatchObject({ property_col: 'det', value_col: 'conc' });
    });

    it('leaves out a numeric column that stays the same within one location and depth', () => {
      const header = ['lat', 'lon', 'site_no', 'det', 'conc'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, 100 + i, 'P_OLSEN_2', 14 + i],
          [lat, lon, 100 + i, 'pH_H2O', 6 + i],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY).roles).toMatchObject({ property_col: 'det', value_col: 'conc' });
    });

    it('prefers the column with fewer codes over one with a code per row', () => {
      const header = ['lat', 'lon', 'lab_no', 'det', 'conc'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, `A${i}1`, 'P_OLSEN_2', 14 + i],
          [lat, lon, `A${i}2`, 'pH_H2O', 6 + i],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY).roles?.property_col).toBe('det');
    });

    it('uses the names to pick between two columns the content leaves equal', () => {
      const header = ['lat', 'lon', 'group', 'parameter', 'other', 'result'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, 'g1', 'P', 3 + i, 14 + i],
          [lat, lon, 'g2', 'pH', 9 + i, 6 + i],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY).roles).toMatchObject({ property_col: 'parameter', value_col: 'result' });
    });

    it('finds the unit column by what it holds', () => {
      const header = ['lat', 'lon', 'det', 'conc', 'um'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, 'P_OLSEN_2', 14 + i, 'mg/kg'],
          [lat, lon, 'OC_WB', 1.5 + i, '%'],
          [lat, lon, 'CLAY', 20 + i, '%'],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      const { roles } = suggestShape(header, features, detected, { units: ['mg/kg', '%', 'g/kg'], procedure: {} });
      expect(roles).toMatchObject({ property_col: 'det', value_col: 'conc', unit_col: 'um' });
    });

    it('suggests wide when two numeric columns are left and no name picks one', () => {
      const header = ['lat', 'lon', 'det', 'a', 'b'];
      const features = rows(
        header,
        POINTS.flatMap(([lon, lat], i) => [
          [lat, lon, 'P_OLSEN_2', 14 + i, 3 + i],
          [lat, lon, 'pH_H2O', 6 + i, 9 + i],
        ]),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({ format: 'wide' });
    });
  });

  describe('long files with no property column', () => {
    it('suggests long for one value column next to a unit column', () => {
      const header = ['lat', 'lon', 'value', 'unit'];
      const features = rows(
        header,
        POINTS.map(([lon, lat], i) => [lat, lon, 14 + i, 'mg/kg']),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY)).toEqual({
        format: 'long',
        roles: { property_col: null, value_col: 'value', unit_col: 'unit', method_code_col: null, procedure_cols: {} },
      });
    });

    it('finds procedure columns by name and by what they hold', () => {
      const header = ['lat', 'lon', 'reading', 'lab_method', 'how'];
      const features = rows(
        header,
        POINTS.map(([lon, lat], i) => [lat, lon, 14 + i, 'Olsen', i % 2 ? 'spectral' : 'lab procedure']),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      const { format, roles } = suggestShape(header, features, detected, {
        units: [],
        procedure: { technique: ['lab procedure', 'spectral', 'calculated'] },
      });
      expect(format).toBe('long');
      expect(roles).toMatchObject({
        property_col: null,
        value_col: 'reading',
        procedure_cols: { laboratory_method: 'lab_method', technique: 'how' },
      });
    });

    it('takes the numeric column as value when a label column shares its name', () => {
      const header = ['lat', 'lon', 'value', 'value_label', 'unit'];
      const features = rows(
        header,
        POINTS.map(([lon, lat], i) => [lat, lon, 1 + i, 'loam', 'class']),
      );
      const detected = { ...NO_FIELDS, latitude: 'lat', longitude: 'lon' };

      expect(suggestShape(header, features, detected, NO_VOCABULARY).roles?.value_col).toBe('value');
    });
  });
});
