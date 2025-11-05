import { createInstance } from '@module-federation/enhanced/runtime';

const mf = createInstance({
  name: 'mf_host',
  remotes: [
    {
      name: 'soilhiveapp',
      entry: 'http://localhost:3001/mf-manifest.json'
    }
  ]
});

/** Store loaded dynamically from the host itself so that it shares its instance */
const store: any = await mf.loadRemote(`soilhiveapp/store`);

export { store };