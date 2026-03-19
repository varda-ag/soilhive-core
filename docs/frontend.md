# Frontend development setup

1. Install `node` version 22
2. Install all the dependencies at once with `pnpm install -r`
3. Run all the projects with: `pnpm run dev`

## Setting up the environment variables

Create file `./frontend/soilhive-app/public/env-config.js`.
Content of the file:

```
window._env_ = {
  BACKEND_BASE_URL: 'http://localhost:4001',
  MAPBOX_ACCESS_TOKEN: '<your mapbox access token or empty string>',
};
```
