import fs from 'fs';
import { InvalidArgumentError, program } from 'commander';
import { isDBAvailable } from './data-source';
import { replaceExtension, sleep } from './utils';
import { addSyntheticData, syntheticDataOptions } from '../utils/mock';
import { randomInt } from 'crypto';
import { dbRestore } from './db-restore';
import { log } from './logger';

export const setupCLI = async () => {
  program
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--create-data <number>', 'Create synthetic data given feature count', validInt)
    .option('--bbox <minx,miny,maxx,maxy>', 'Synthetic data bounds')
    .option('--load-raster-filter <file.dump>', 'Load raster filter')
    .parse();

  const options = program.opts();
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
