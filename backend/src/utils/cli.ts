import fs from 'fs';
import { InvalidArgumentError, program } from 'commander';
import { getDataSource, isDBAvailable } from './data-source';
import { replaceExtension, sleep } from './utils';
import { addSyntheticData, syntheticDataOptions } from '../utils/mock';
import { randomInt } from 'crypto';
import { dbRestore } from './db-restore';
import { log } from './logger';
import { ingestRaster } from '../services/RasterIngestService';
import { refreshDaiStats } from '../data-layer/DaiStats';
import { bumpCacheEpoch } from './cache-epoch';

export const setupCLI = async () => {
  program
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--create-data <number>', 'Create synthetic data given feature count', validInt)
    .option('--bbox <minx,miny,maxx,maxy>', 'Synthetic data bounds')
    .option('--load-raster-filter <file.dump>', 'Load raster filter')
    .option('--refresh-dai-stats', 'Fully rebuild the precomputed DAI stats (feature_dai_stats)')
    .option('--ingest-raster <input.tif>', 'Ingest a COG raster file into the catalog')
    .option('--nodata <value>', 'NoData value (auto-detected if omitted)', parseFloat)
    .option('--dataset <name>', 'Dataset name', 'test-ds')
    .option('--soil-property <name>', 'Soil property name', 'Organic Carbon Stock')
    .option('--soil-property-category <name>', 'Soil property category name', 'Chemical')
    .option('--original_unit [unit]', 'Unit of measurement')
    .parse();

  const options = program.opts();
  if (options['ingestRaster']) {
    log.info('Ingesting raster', options);
    try {
      await ingestRaster({
        input: options['ingestRaster'],
        nodata: options['nodata'],
        dataset: options['dataset'],
        soilProperty: options['soilProperty'],
        soilPropertyCategory: options['soilPropertyCategory'],
        originaUnit: options['originalUnit'],
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
  if (options['refreshDaiStats']) {
    log.info('Rebuilding DAI stats');
    try {
      await refreshAllDaiStats();
    } catch (e) {
      log.error(`DAI stats rebuild error: ${e}`);
      process.exitCode = 1;
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

// Backfill/repair entry point for the precomputed DAI rollup (docs/adr/0009):
// run after deploying to an existing database, or whenever feature_dai_stats is
// suspected stale (e.g. ingestions performed by nodes on a pre-DAI-stats build).
// The rebuild upserts in place, so concurrent DAI reads stay consistent.
async function refreshAllDaiStats() {
  while (!(await isDBAvailable())) {
    await sleep(1000);
  }
  const dataSource = await getDataSource();
  await dataSource.transaction(async manager => {
    // One statement over every feature: override the global statement timeout
    // and match the work_mem the heavy spatial queries run with.
    await manager.query('SET LOCAL statement_timeout = 0;');
    await manager.query("SET LOCAL work_mem = '512MB';");
    await refreshDaiStats(manager);
    const [{ count }] = await manager.query(`SELECT COUNT(*)::int AS count FROM ${process.env.POSTGRES_SCHEMA}.feature_dai_stats`);
    log.info('DAI stats rebuilt', { rows: count });
  });
  // Cached /dai responses on all nodes were computed from the old rollup
  await bumpCacheEpoch();
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
