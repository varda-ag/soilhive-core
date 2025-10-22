import { createInstance } from '@module-federation/enhanced/runtime';

const modulesListResponse = await fetch('http://localhost:3000/modules.json');
const modulesList = await modulesListResponse.json();
const remotes: any[] = modulesList;

const mf = createInstance({
  name: 'mf_host',
  remotes
});

// Top level await, the module pauses until it resolves the promise and then it does the export
const remoteModules: any[] = await Promise.all(remotes.map(remote => mf.loadRemote(`${remote.name}/module`)));

const singlePages = remoteModules.filter(module => module.type === 'single-page');

export { remoteModules as modules, singlePages };