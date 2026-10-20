import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
createApp(config).listen(config.port, () => {
  console.log(`Plugin Backend for ${config.pluginId} on port ${config.port}, trusting Plugin tokens from ${config.coreUrl}`);
});
