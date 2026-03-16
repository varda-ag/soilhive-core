# Development

## Setting up the environment variables

### Frontend
Create a file named env-config.js in the public folder of soilhive-app. The content of the file is:

```
window._env_ = {
  BACKEND_BASE_URL: 'http://localhost:4001',
  MAPBOX_ACCESS_TOKEN: '<your mapbox access token>',
};
```

### Backend
Simply create a file named .env out of the .env-example file

## Start the application

First start the app infrastructure services with:

`docker-compose -f docker-compose-dev.yaml`

Then start both backend and frontend with:

`pnpm i -r`

`pnpm run dev`
