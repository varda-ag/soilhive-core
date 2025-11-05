import { createInstance } from '@module-federation/enhanced/runtime';

const modulesListResponse = await fetch('http://localhost:3000/modules.json');
const modulesList = await modulesListResponse.json();
const remotes: any[] = modulesList;

const mf = createInstance({
  name: 'mf_host',
  remotes: [
    ...remotes,
    {
      name: 'soilhiveapp',
      entry: 'http://localhost:3001/mf-manifest.json'
    }
  ]
});

// Top level await, the module pauses until it resolves the promise and then it does the export
const remoteModules: any[] = await Promise.all(remotes.map(remote => mf.loadRemote(`${remote.name}/module`)));

const singlePages = remoteModules.filter(module => module.type === 'single-page');

/** Store loaded dynamically from the host itself so that it shares its instance */
const store: any = await mf.loadRemote(`soilhiveapp/store`);

(window as any).store_host = store;

export { remoteModules as modules, singlePages, store };