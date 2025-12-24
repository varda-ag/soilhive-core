import { v7 as uuidv7 } from 'uuid';
import DatasetEntity from '../src/entities/Dataset';
import FeatureEntity from '../src/entities/Feature';
import LayerEntity from '../src/entities/Layer';
import SoilPropertyEntity from '../src/entities/SoilProperty';
import SoilPropertyCategoryEntity from '../src/entities/SoilPropertyCategory';
import DatasetLayerEntity from '../src/entities/DatasetLayer';
import ProcedureEntity from '../src/entities/Procedure';
import ObservationEntity from '../src/entities/Observation';
import LicenseEntity from '../src/entities/License';
import { getPolygonFromBbox } from '../src/utils/geometry';
import { getDataSource } from '../src/utils/data-source';
import SlugHistoryEntity from '../src/entities/SlugHistory';
import { EntityType, GISDataType, IngestionStatus } from '../src/types/data';
import assert from 'assert';
import path from 'path';
import RasterFilter from '../src/data-layer/RasterFilter';

const randomInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
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

export const addLicense = async (name: string = 'test_license') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(LicenseEntity);
  const license = repo.create({ name, slug: name });
  return await repo.save(license);
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
  const layer = repo.create({
    license,
    min_depth,
    max_depth,
    sampling_date,
    horizon,
  });
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

export const addSoilProperty = async (name: string, category_id: string) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(SoilPropertyEntity);
  const soilProperty = repo.create({
    property_name: name,
    property_acronym: name,
    slug: name,
    category_id,
  });
  return await repo.save(soilProperty);
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

export const addProcedure = async (procedure: string = 'test_procedure') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ProcedureEntity);
  const newProcedure = repo.create({
    sample_pretreatment: procedure,
  });
  return await repo.save(newProcedure);
};

export const addObservation = async (value: number, procedure_id: string, dataset_layer_id: string) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ObservationEntity);
  const observation = repo.create({
    value,
    procedure_id,
    dataset_layer_id,
  });
  return await repo.save(observation);
};

export interface SyntheticDataset {
  dataset: DatasetEntity;
  features: FeatureEntity[];
  soilProperties: SoilPropertyEntity[];
}

export const addSyntheticData = async (syntheticDataOptions): Promise<SyntheticDataset> => {
  const { id, spatial_extent, featureCount, featureCoordinates, observationsPerLayer, soilPropertyNames, depthLayers, addNullValues } =
    syntheticDataOptions;
  assert(featureCount > 0, 'featureCount must be greater than 0');
  assert(observationsPerLayer > 0, 'observationsPerLayer must be greater than 0');
  assert(depthLayers > 0, 'depthLayers must be greater than 0');
  assert(spatial_extent.length === 4, 'spatial_extent must be an array of 4 numbers [minX, minY, maxX, maxY]');
  assert(soilPropertyNames.length > 0, 'soilPropertyNames must be a non-empty array of strings');
  const year = 2020 + id;
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
  const features: FeatureEntity[] = [];
  if (featureCoordinates) {
    // Coordinates provided explicitly
    for (let i = 0; i < featureCoordinates.length; i++) {
      const feature = await addFeature(featureCoordinates[i][0], featureCoordinates[i][1]);
      features.push(feature);
    }
  } else {
    // Random coordinates within spatial_extent
    for (let i = 0; i < featureCount; i++) {
      const feature = await addFeature(
        randomInRange(spatial_extent[0], spatial_extent[2]),
        randomInRange(spatial_extent[1], spatial_extent[3]),
      );
      features.push(feature);
    }
  }
  for (let depthLayer = 0; depthLayer < depthLayers; depthLayer++) {
    const depth = depthLayer * 10;
    const layer = await addLayer(license.id, new Date(`${year}-01-01`), depth, depth + 10, `A${depthLayer}`);
    for (let i = 0; i < featureCount; i++) {
      const feature = features[i];
      const soilProperty = soilProperties[depthLayer % soilPropertyNames.length];
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      for (let j = 0; j < observationsPerLayer; j++) {
        await addObservation(randomInRange(0, 100), procedure.id, datasetLayer.id);
      }
      if (addNullValues && depthLayer === 0 && i === 0) {
        const layer = await addLayer(license.id, undefined, undefined, undefined, undefined);
        const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
        await addObservation(randomInRange(0, 100), procedure.id, datasetLayer.id);
      }
    }
  }
  return { dataset, features, soilProperties };
};

export const addLandCover = async (): Promise<string> => {
  const rasterFilter = new RasterFilter();
  const tableName = 'test_land_cover';
  const filePath = path.join(
    __dirname,
    'assets',
    'land_cover',
    'W100S20_PROBAV_LC100_global_v3.0.1_2019-nrt_Discrete-Classification-map_EPSG-4326.tif',
  );
  await rasterFilter.addRasterFiles([filePath], tableName);
  return tableName;
};
