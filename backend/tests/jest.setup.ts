import type { Config } from '@jest/types';
import { initializeWorkerSchemas, loadRasterFilterFixtures, resetWorkerTempDirs, startDockerCompose } from './helper';
import { setupTestEnv } from './environment';

module.exports = async (globalConfig: Config.GlobalConfig) => {
  // Code to run before each test across all test files
  await startDockerCompose();
  setupTestEnv();
  resetWorkerTempDirs(globalConfig.maxWorkers);
  await initializeWorkerSchemas(globalConfig.maxWorkers);
  await loadRasterFilterFixtures();
};
