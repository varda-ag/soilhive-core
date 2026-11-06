import { describe, it, expect } from '@jest/globals';
import { RasterLayerPdfInfo, sortRasterLayers } from '../../../src/jobs/soil-export/pdfGenerator';

const makeLayer = (overrides: Partial<RasterLayerPdfInfo>): RasterLayerPdfInfo => ({
  layer_name: 'layer',
  description: null,
  dataset_name: 'SoilGrids 250m',
  soil_property_name: 'pH',
  min_depth: 0,
  max_depth: 5,
  reference_period_start: '2020-01-01',
  reference_period_stop: '2020-12-31',
  laboratory_method: null,
  standard_unit: null,
  crs: '4326',
  ...overrides,
});

const names = (layers: RasterLayerPdfInfo[]) => layers.map(l => l.layer_name);

describe('sortRasterLayers', () => {
  it('orders by dataset, then soil property', () => {
    const layers = [
      makeLayer({ layer_name: 'b-ph', dataset_name: 'B' }),
      makeLayer({ layer_name: 'a-soc', dataset_name: 'A', soil_property_name: 'SOC' }),
      makeLayer({ layer_name: 'a-ph', dataset_name: 'A', soil_property_name: 'pH' }),
    ];

    expect(names(sortRasterLayers(layers))).toEqual(['a-ph', 'a-soc', 'b-ph']);
  });

  it('orders by reference period start, then stop, with nulls last', () => {
    const layers = [
      makeLayer({ layer_name: 'no-start', reference_period_start: null }),
      makeLayer({ layer_name: '2021', reference_period_start: '2021-01-01' }),
      makeLayer({ layer_name: '2020-no-stop', reference_period_stop: null }),
      makeLayer({ layer_name: '2020-2022', reference_period_stop: '2022-12-31' }),
      makeLayer({ layer_name: '2020-2020' }),
    ];

    expect(names(sortRasterLayers(layers))).toEqual(['2020-2020', '2020-2022', '2020-no-stop', '2021', 'no-start']);
  });

  it('orders by min depth, then max depth, with nulls last', () => {
    const layers = [
      makeLayer({ layer_name: 'no-depth', min_depth: null, max_depth: null }),
      makeLayer({ layer_name: '15-30', min_depth: 15, max_depth: 30 }),
      makeLayer({ layer_name: '0-30', min_depth: 0, max_depth: 30 }),
      makeLayer({ layer_name: '0-5', min_depth: 0, max_depth: 5 }),
      makeLayer({ layer_name: '5-15', min_depth: 5, max_depth: 15 }),
    ];

    expect(names(sortRasterLayers(layers))).toEqual(['0-5', '0-30', '5-15', '15-30', 'no-depth']);
  });

  it('falls back to layer name when every other key is equal', () => {
    const layers = [makeLayer({ layer_name: 'ph_2' }), makeLayer({ layer_name: 'ph_1' })];

    expect(names(sortRasterLayers(layers))).toEqual(['ph_1', 'ph_2']);
  });

  it('returns a sorted copy without mutating its input', () => {
    const layers = [makeLayer({ layer_name: 'b' }), makeLayer({ layer_name: 'a' })];

    const sorted = sortRasterLayers(layers);

    expect(names(sorted)).toEqual(['a', 'b']);
    expect(names(layers)).toEqual(['b', 'a']);
  });
});
