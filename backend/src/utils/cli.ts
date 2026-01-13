import { InvalidArgumentError, program } from 'commander';
import { isDBAvailable } from './data-source';
import { sleep } from './utils';
import { addSyntheticData, syntheticDataOptions } from '../utils/mock';
import { randomInt } from 'crypto';

export const setupCLI = () => {
  program
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--create-data <number>', 'Create synthetic data given feature count', validInt)
    .option('--bbox <minx,miny,maxx,maxy>', 'Synthetic data bounds')
    .parse();

  const options = program.opts();
  if (options['createData']) {
    console.log('Creating synthetic data:', options);
    if (!options['bbox']) {
      throw new InvalidArgumentError('bbox must be provided when creating synthetic data.');
    }
    const spatial_extent = options['bbox'].split(',').map(Number);
    createSyntheticData(options['createData'], spatial_extent);
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
