import { v7 as uuidv7 } from 'uuid';
import DatasetEntity from '../entities/Dataset';
import FileEntity from '../entities/File';
import DataMappingEntity from '../entities/DataMapping';
import FeatureEntity from '../entities/Feature';
import LayerEntity from '../entities/Layer';
import SoilPropertyEntity from '../entities/SoilProperty';
import SoilPropertyCategoryEntity from '../entities/SoilPropertyCategory';
import DatasetLayerEntity from '../entities/DatasetLayer';
import ProcedureEntity from '../entities/Procedure';
import ObservationEntity from '../entities/Observation';
import LicenseEntity from '../entities/License';
import UnitConversionEntity from '../entities/UnitConversion';
import { getPolygonFromBbox } from './geometry';
import { getDataSource } from './data-source';
import SlugHistoryEntity from '../entities/SlugHistory';
import { EntityType, GISDataType, IngestionStatus } from '../types/data';
import RasterFilter from '../data-layer/RasterFilter';
import { PropertyInfo, PropertyMapping } from '../interfaces/PropertyMapping';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { sanitizeField } from './utils';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';

const randomInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const randomsInRange = (min: number, max: number, count: number): number[] => {
  const arr: number[] = [];
  for (let i = 0; i < count; i++) {
    arr.push(randomInRange(min, max));
  }
  return arr;
};

export const syntheticDataOptions = {
  id: 1,
  spatial_extent: [0, 0, 1, 1],
  featureCount: 1,
  observationsPerLayer: 1,
  depthLayers: 1,
  soilPropertyNames: ['ph'],
  addNullValues: false,
  featureCoordinates: undefined, // number[][] array of [lng, lat]
  showProgress: false,
  useProgressiveObservationValues: false,
};

export const syntheticIngestionDataOptions = {
  id: 1,
  spatial_extent: [0, 0, 1, 1],
  columnMapping: {
    upper_depth: 'min_depth',
    lower_depth: 'max_depth',
    date: 'sampling_date',
    licence: 'license',
    layer_name: 'horizon',
    bdfi33: {
      property_name: 'Bulk Density',
      procedure_name: 'Fine earth 33kPa',
      conversion_formula: 'x*10',
      original_unit: 'kg/dm3',
      standard_unit: 'mmolc/dm3',
      max_val: 14,
    },
    bdfiod: {
      property_name: 'Bulk Density 2',
      procedure_name: 'Fine earth oven dry',
      conversion_formula: 'x/10',
      original_unit: 'kg/cm3',
      standard_unit: 'mmolc/dm3',
      min_val: 0.1,
    },
    drop_records: [10136, 10137],
  },
  createTable: true,
  showProgress: false,
};

export const addSlug = async (slug: string, entity_id: string, entity_type: EntityType) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(SlugHistoryEntity);
  const slugEntity = repo.create({ slug, entity_id, entity_type });
  return await repo.save(slugEntity);
};

export const addDataset = async (name: string, spatial_extent: number[]): Promise<DatasetEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(DatasetEntity);
  const dataset = repo.create({
    id: uuidv7(),
    name,
    slug: name,
    created_by: 'tests',
    gis_datatype: GISDataType.POINT,
    status: IngestionStatus.INGESTED,
    spatial_extent: getPolygonFromBbox(spatial_extent),
  });
  return await repo.save(dataset);
};

export const addFile = async (name: string = 'test_file'): Promise<FileEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(FileEntity);
  const file = repo.create({
    name,
    file_path: name,
    created_by: 'tests',
  });
  const newFile = await repo.save(file, { reload: true });
  return await repo.findOneByOrFail({ id: newFile.id });
};

export const addDataMapping = async (data_mapping: object): Promise<DataMappingEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(DataMappingEntity);
  const mapping = repo.create({
    data_mapping,
    created_by: 'tests',
  });
  return await repo.save(mapping);
};

export const addDatasetFileMapping = async (datasetId: string, dataMappingId: string): Promise<DatasetFileMappingEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(DatasetFileMappingEntity);
  const datasetFileMapping = repo.create({
    dataset_id: datasetId,
    data_mapping_id: dataMappingId,
  });
  return await repo.save(datasetFileMapping);
};

export const addFeature = async (lng: number, lat: number) => {
  assert(!isNaN(lng), 'Longitude must be a number');
  assert(!isNaN(lat), 'Latitude must be a number');
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(FeatureEntity);
  const feature = repo.create({
    geom: { type: 'Point', coordinates: [lng, lat] },
  });
  return await repo.save(feature);
};

export const addFeatures = async (lngLatArray: [number, number][]) => {
  const dataSource = await getDataSource();
  const result = await dataSource
    .createQueryBuilder()
    .insert()
    .into(FeatureEntity)
    .values(
      lngLatArray.map(([lng, lat]) => ({
        geom: { type: 'Point', coordinates: [lng, lat] },
      })),
    )
    .returning('*')
    .execute();
  return result.raw;
};

export const addLicense = async (name: string = 'test_license') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(LicenseEntity);
  const license = repo.create({ name, slug: name });
  return await repo.save(license);
};

export const addUnitConversion = async (
  original_unit: string = 'test_unit',
  standard_unit: string = 'test_std_unit',
  conversion_formula: string = 'x / 10',
): Promise<UnitConversionEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(UnitConversionEntity);
  const unitConversion = repo.create({
    original_unit_of_measurement: original_unit,
    standard_unit,
    conversion_formula,
  });
  await repo.save(unitConversion);
  return await repo.findOneByOrFail({ id: unitConversion.id });
};

export const addLayer = async (
  license: string,
  sampling_date?: Date,
  min_depth?: number,
  max_depth?: number,
  horizon?: string,
): Promise<LayerEntity> => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(LayerEntity);

  // Build object excluding undefined
  const layerData: Partial<LayerEntity> = { license };
  if (sampling_date !== undefined) layerData.sampling_date = sampling_date;
  if (min_depth !== undefined) layerData.min_depth = min_depth;
  if (max_depth !== undefined) layerData.max_depth = max_depth;
  if (horizon !== undefined) layerData.horizon = horizon;

  const layer = repo.create(layerData);
  return await repo.save(layer);
};

export const addCategory = async (name: string = 'test_category') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(SoilPropertyCategoryEntity);
  const soilProperty = repo.create({
    slug: name,
    category_name: name,
    category_acronym: name,
  });
  return await repo.save(soilProperty);
};

export const addSoilProperty = async (name: string, category_id: string, standard_unit: string = 'mg/kg') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(SoilPropertyEntity);
  const soilProperty = repo.create({
    property_name: name,
    property_acronym: name,
    category_id,
    standard_unit,
  });
  await repo.save(soilProperty);
  return await repo.findOneByOrFail({ id: soilProperty.id });
};

export const addDatasetLayer = async (dataset_id: string, layer_id: string, feature_id: string, soil_property_id: string) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(DatasetLayerEntity);
  const datasetLayer = repo.create({
    dataset_id,
    layer_id,
    feature_id,
    soil_property_id,
  });
  return await repo.save(datasetLayer);
};

export const addDatasetLayers = async (dataset_id: string, layer_id: string, feature_ids: string[], soil_property_ids: string[]) => {
  assert(feature_ids.length === soil_property_ids.length, 'feature_ids and soil_property_ids must have the same length');
  const values: any = [];
  for (let i = 0; i < feature_ids.length; i++) {
    values.push({
      dataset_id,
      layer_id,
      feature_id: feature_ids[i],
      soil_property_id: soil_property_ids[i],
    });
  }

  const dataSource = await getDataSource();
  const result = await dataSource.createQueryBuilder().insert().into(DatasetLayerEntity).values(values).returning('*').execute();
  return result.raw;
};

export const addProcedure = async (procedure: string = 'test_procedure') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ProcedureEntity);
  const newProcedure = repo.create({
    sample_pretreatment: procedure,
  });
  await repo.save(newProcedure);
  return await repo.findOneByOrFail({ id: newProcedure.id });
};

export const addObservations = async (values: number[], procedure_id: string, dataset_layer_id: string) => {
  const dataSource = await getDataSource();
  const result = await dataSource
    .createQueryBuilder()
    .insert()
    .into(ObservationEntity)
    .values(
      values.map(value => ({
        value,
        procedure_id,
        dataset_layer_id,
      })),
    )
    .returning('*')
    .execute();
  return result.raw;
};

export interface SyntheticDataset {
  dataset: DatasetEntity;
  features: FeatureEntity[];
  soilProperties: SoilPropertyEntity[];
}

export const addSyntheticData = async (syntheticDataOptions): Promise<SyntheticDataset> => {
  const {
    id,
    spatial_extent,
    featureCount,
    featureCoordinates,
    observationsPerLayer,
    soilPropertyNames,
    depthLayers,
    addNullValues,
    useProgressiveObservationValues,
  } = syntheticDataOptions;
  assert(featureCount > 0, 'featureCount must be greater than 0');
  assert(observationsPerLayer > 0, 'observationsPerLayer must be greater than 0');
  assert(depthLayers > 0, 'depthLayers must be greater than 0');
  assert(spatial_extent.length === 4, 'spatial_extent must be an array of 4 numbers [minX, minY, maxX, maxY]');
  assert(soilPropertyNames.length > 0, 'soilPropertyNames must be a non-empty array of strings');
  const year = 2020 + (id % 10); // Vary year between 2020-2029
  const dataset = await addDataset(`test_dataset_${id}`, spatial_extent);
  dataset.soil_depth = { min: 0, max: depthLayers * 10 };
  dataset.reference_period_start = `${year}-01-01`;
  dataset.reference_period_stop = `${year}-12-31`;
  await dataset.save();
  const category = await addCategory(`test_category_${id}`);
  const soilProperties: SoilPropertyEntity[] = [];
  for (let i = 0; i < soilPropertyNames.length; i++) {
    soilProperties.push(await addSoilProperty(soilPropertyNames[i], category.id));
  }
  const procedure = await addProcedure(`test_procedure_${id}`);
  const license = await addLicense(`test_license_${id}`);
  const coordinates: [number, number][] = [];
  if (featureCoordinates) {
    // Coordinates provided explicitly
    coordinates.push(...featureCoordinates);
  } else {
    // Random coordinates within spatial_extent
    for (let i = 0; i < featureCount; i++) {
      coordinates.push([randomInRange(spatial_extent[0], spatial_extent[2]), randomInRange(spatial_extent[1], spatial_extent[3])]);
    }
  }
  const features: FeatureEntity[] = await addFeatures(coordinates);
  if (syntheticDataOptions.showProgress) {
    console.log(`Generated ${featureCount} random features.`);
  }
  let counter = 1;
  for (let depthLayer = 0; depthLayer < depthLayers; depthLayer++) {
    const depth = depthLayer * 10;
    const layer = await addLayer(license.id, new Date(`${year}-01-01`), depth, depth + 10, `A${depthLayer}`);
    const datasetLayers = await addDatasetLayers(
      dataset.id,
      layer.id,
      features.map(f => f.id),
      features.map(_ => soilProperties[depthLayer % soilPropertyNames.length]!.id),
    );
    for (let i = 0; i < featureCount; i++) {
      if (useProgressiveObservationValues) {
        const values: number[] = [];
        for (let i = 0; i < observationsPerLayer; i++) {
          values.push(counter++);
        }
        await addObservations(values, procedure.id, datasetLayers[i].id);
      } else {
        await addObservations(randomsInRange(0, 100, observationsPerLayer), procedure.id, datasetLayers[i].id);
      }
    }
    if (addNullValues && depthLayer === 0) {
      const layer = await addLayer(license.id, undefined, undefined, undefined, undefined);
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, features[0]!.id, soilProperties[0]!.id);
      await addObservations([randomInRange(0, 100)], procedure.id, datasetLayer.id);
    }
    if (syntheticDataOptions.showProgress) {
      console.log(`Added depth layer ${depthLayer + 1}/${depthLayers}`);
    }
  }
  if (syntheticDataOptions.showProgress) {
    console.log(`Synthetic data creation complete. Dataset ID: ${dataset.id}`);
  }
  return { dataset, features, soilProperties };
};

export const addLandCover = async (): Promise<string> => {
  const rasterFilter = new RasterFilter();
  const tableName = 'test_land_cover';
  const filePath = path.join(
    __dirname,
    '..',
    '..',
    'tests',
    'assets',
    'land_cover',
    'W100S20_PROBAV_LC100_global_v3.0.1_2019-nrt_Discrete-Classification-map_EPSG-4326.tif',
  );
  await rasterFilter.addRasterFiles([filePath], tableName);
  return tableName;
};

export interface SyntheticIngestionDataset {
  dataset: DatasetEntity;
  file: FileEntity;
  dataMapping: DataMappingEntity;
  datasetFileMapping: DatasetFileMappingEntity;
}

export const addSyntheticIngestionData = async (syntheticIngestionDataOptions): Promise<SyntheticIngestionDataset> => {
  const { id, spatial_extent, columnMapping } = syntheticIngestionDataOptions;
  assert(spatial_extent.length === 4, 'spatial_extent must be an array of 4 numbers [minX, minY, maxX, maxY]');
  assert(typeof columnMapping === 'object', 'columnMapping must be a non-empty object');
  const dataset = await addDataset(`test_dataset_${id}`, spatial_extent);
  const category = await addCategory(`test_category_${id}`);
  await addLicense(`test_license_raw_data`);
  const file = await addFile(`test_file_${id}`);
  const createdDataMapping: object = {};

  for (const [field, mapping] of Object.entries(columnMapping)) {
    if (typeof mapping === 'string' || mapping instanceof String || field === 'drop_records') {
      // metadata fields
      createdDataMapping[field] = mapping;
    } else if (typeof mapping === 'object') {
      const props = mapping as PropertyInfo;
      const soilProperty = await addSoilProperty(props.property_name, category.id, props.standard_unit);
      const createdMapping: PropertyMapping = { property_id: soilProperty.slug };
      if (props.procedure_name) {
        const procedure = await addProcedure(props.procedure_name);
        createdMapping.procedure_id = procedure.slug;
      }
      if (props.conversion_formula) {
        const unitConversion = await addUnitConversion(props.original_unit, props.standard_unit, props.conversion_formula);
        createdMapping.conversion_id = unitConversion.slug;
      }
      if (props.max_val) {
        createdMapping.max_val = props.max_val;
      }
      if (props.min_val) {
        createdMapping.min_val = props.min_val;
      }

      createdDataMapping[field] = createdMapping;
    }
  }

  const dataMapping = await addDataMapping(createdDataMapping);
  const datasetFileMapping = await addDatasetFileMapping(dataset.id, dataMapping.id);
  if (syntheticIngestionDataOptions.createTable) {
    // Load raw data sample
    const sqlFile = path.join(__dirname, '..', '..', 'tests', 'assets', 'raw_data', 'raw_data_insert.sql');
    const sqlTemplate = fs.readFileSync(sqlFile, 'utf8');
    const sql = sqlTemplate.replace(/{{table}}/g, `"file_${sanitizeField(file.id)}_raw"`);
    const dataSource = await getDataSource();
    await dataSource.query(sql);
  }

  if (syntheticIngestionDataOptions.showProgress) {
    console.log(`Synthetic ingestion data creation complete. Dataset ID: ${dataset.id}`);
  }
  return { dataset, file, dataMapping, datasetFileMapping };
};

export interface DataCount {
  n_features: number;
  n_layers: number;
  n_dataset_layers: number;
  n_observations: number;
}

export const getLoadedDataCount = async (): Promise<DataCount> => {
  const dataSource = await getDataSource();
  const featureRepo = dataSource.getRepository(FeatureEntity);
  const layerRepo = dataSource.getRepository(LayerEntity);
  const datasetLayerRepo = dataSource.getRepository(DatasetLayerEntity);
  const observationRepo = dataSource.getRepository(ObservationEntity);
  const features = await featureRepo.find();
  const layers = await layerRepo.find();
  const datasetLayers = await datasetLayerRepo.find();
  const observations = await observationRepo.find();
  const result: DataCount = {
    n_features: features.length ?? 0,
    n_layers: layers.length ?? 0,
    n_dataset_layers: datasetLayers.length ?? 0,
    n_observations: observations.length ?? 0,
  };
  return result;
};
