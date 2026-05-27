import fs from 'fs';
import { InvalidArgumentError, program } from 'commander';
import { isDBAvailable } from './data-source';
import { replaceExtension, sleep } from './utils';
import { addSyntheticData, syntheticDataOptions } from '../utils/mock';
import { randomInt } from 'crypto';
import { dbRestore } from './db-restore';
import { log } from './logger';
import { ingestRaster } from '../services/RasterIngestService';

export const setupCLI = async () => {
  program
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--create-data <number>', 'Create synthetic data given feature count', validInt)
    .option('--bbox <minx,miny,maxx,maxy>', 'Synthetic data bounds')
    .option('--load-raster-filter <file.dump>', 'Load raster filter')
    .option('--ingest-raster <input.tif>', 'Ingest a raster file into the catalog')
    .option('--out <filename>', 'Output COG filename (default: <basename>_cog.tif)')
    .option('--out-dir <path>', 'Output directory for the COG')
    .option('--nodata <value>', 'NoData value (auto-detected if omitted)', parseFloat)
    .option('--dataset <name>', 'Dataset name', 'test-ds')
    .option('--soil-property <name>', 'Soil property name', 'Organic Carbon Stock')
    .option('--soil-property-category <name>', 'Soil property category name', 'Chemical')
    .option('--resampling <method>', 'GDAL overview resampling method', 'AVERAGE')
    .parse();

  const options = program.opts();
  if (options['ingestRaster']) {
    log.info('Ingesting raster', options);
    try {
      await ingestRaster({
        input: options['ingestRaster'],
        out: options['out'],
        outDir: options['outDir'],
        nodata: options['nodata'],
        dataset: options['dataset'],
        soilProperty: options['soilProperty'],
        soilPropertyCategory: options['soilPropertyCategory'],
        resampling: options['resampling'],
      });
    } catch (e) {
      log.error(`Raster ingest error: ${e}`);
    } finally {
      process.exit();
    }
  }
  if (options['createData']) {
    log.info('Creating synthetic data:', options);
    if (!options['bbox']) {
      throw new InvalidArgumentError('bbox must be provided when creating synthetic data.');
    }
    const spatial_extent = options['bbox'].split(',').map(Number);
    await createSyntheticData(options['createData'], spatial_extent);
    process.exit();
  }
  if (options['loadRasterFilter']) {
    log.info('Loading raster filter:', options);
    try {
      await loadRasterFilter(options['loadRasterFilter']);
    } catch (e) {
      log.error(`Load raster filter error: ${e}`);
    } finally {
      process.exit();
    }
  }
};

function validInt(value) {
  const v = parseInt(value, 10);
  if (isNaN(v) || v < 10 || v > 100000) {
    throw new InvalidArgumentError('Must be 10-100000.');
  }
  return v;
}

async function createSyntheticData(featureCount: number, spatial_extent: [number, number, number, number]) {
  while (!(await isDBAvailable())) {
    await sleep(1000);
  }
  const id = randomInt(1000, 9999);
  await addSyntheticData({
    ...syntheticDataOptions,
    featureCount,
    spatial_extent,
    id,
    observationsPerLayer: 10,
    depthLayers: 10,
    soilPropertyNames: [`ph_${id}`],
    addNullValues: true,
    showProgress: true,
  });
}

async function loadRasterFilter(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`File ${file} not found`);
  }
  const mappings = replaceExtension(file, 'mappings');
  if (!fs.existsSync(mappings)) {
    throw new Error(`File ${mappings} not found`);
  }
  await dbRestore(file, mappings);
}
