#!/bin/bash
rm -rf dist
npm run build
npm run typeorm migration:run -- -d dist/utils/migrations-data-source.js