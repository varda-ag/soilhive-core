#!/bin/bash
if [ $# -ne 1 ]; then
    echo "Usage: $0 <run|create>"
    echo "  run    - Executes the migrations"
    echo "  create - Generates migration file"
    exit 1
fi

rm -rf dist
npm run build

case "$1" in
    "run")
        echo "Running the migrations..."
        npm run typeorm migration:run -- -d dist/utils/migrations-data-source.js
        ;;
    "generate")
        echo "Creating the migrations..."
        npm run typeorm migration:generate -- CreateSchema -d dist/utils/migrations-data-source.js
        ;;
    *)
        echo "Error: Invalid option '$1'. Use 'run' or 'create'."
        exit 1
        ;;
esac
