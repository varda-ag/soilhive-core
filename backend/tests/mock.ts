import { v7 as uuidv7 } from 'uuid';
import DatasetEntity from '../src/entities/Dataset';
import FeatureEntity from '../src/entities/Feature';
import LayerEntity from '../src/entities/Layer';
import SoilPropertyEntity from '../src/entities/SoilProperty';
import SoilPropertyCategoryEntity from '../src/entities/SoilPropertyCategory';
import DatasetLayerEntity from '../src/entities/DatasetLayer';
import AnalyticalMethodEntity from '../src/entities/AnalyticalMethod';
import ObservationEntity from '../src/entities/Observation';
import LicenseEntity from '../src/entities/License';
import { getPolygonFromBbox } from '../src/utils/geometry';
import { getDataSource } from '../src/utils/data-source';
import SlugHistoryEntity from '../src/entities/SlugHistory';
import { EntityType, GISDataType, IngestionStatus } from '../src/types/data';

const randomInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
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
    created_by: 'tests',
    gis_datatype: GISDataType.POINT,
    status: IngestionStatus.INGESTED,
    spatial_extent: getPolygonFromBbox(spatial_extent),
  });
  return await repo.save(dataset);
};

export const addFeature = async (lng: number, lat: number) => {
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
  sampling_date = new Date('2020-01-01'),
  min_depth = 0,
  max_depth = 100,
  horizon = 'A',
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

export const addAnalyticalMethod = async (analytical_method: string = 'test_analytical_method') => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(AnalyticalMethodEntity);
  const analyticalMethod = repo.create({
    analytical_method,
    slug: analytical_method,
  });
  return await repo.save(analyticalMethod);
};

export const addObservation = async (value: number, analytical_methodology_id: string, dataset_layer_id: string) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ObservationEntity);
  const observation = repo.create({
    value,
    analytical_methodology_id,
    dataset_layer_id,
  });
  return await repo.save(observation);
};

export const addSyntheticData = async (
  id: number,
  spatial_extent: number[],
  featureCount: number,
  observationsPerFeature: number,
  depthLayers: number = 5,
): Promise<DatasetEntity> => {
  const year = 2020 + id;
  const dataset = await addDataset(`test_dataset_${id}`, spatial_extent);
  dataset.soil_depth = { min: 0, max: depthLayers * 10 };
  dataset.reference_period_start = `${year}-01-01`;
  dataset.reference_period_stop = `${year}-12-31`;
  await dataset.save();
  const category = await addCategory(`test_category_${id}`);
  const soilProperty = await addSoilProperty(`test_soil_property_${id}`, category.id);
  const analyticalMethod = await addAnalyticalMethod(`test_analytical_method_${id}`);
  const license = await addLicense(`test_license_${id}`);
  const features: FeatureEntity[] = [];
  for (let i = 0; i < featureCount; i++) {
    const feature = await addFeature(
      randomInRange(spatial_extent[0], spatial_extent[2]),
      randomInRange(spatial_extent[1], spatial_extent[3]),
    );
    features.push(feature);
  }
  for (let depthLayer = 0; depthLayer < depthLayers; depthLayer++) {
    const depth = depthLayer * 10;
    const layer = await addLayer(license.id, new Date(`${year}-01-01`), depth, depth + 10, 'A');
    for (let i = 0; i < featureCount; i++) {
      const feature = features[i];
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      for (let j = 0; j < observationsPerFeature; j++) {
        await addObservation(randomInRange(0, 100), analyticalMethod.id, datasetLayer.id);
      }
    }
  }
  return dataset;
};
