#!/bin/bash
if [ $# -ne 1 ]; then
    echo "Usage: $0 <run|generate>"
    echo "  run    - Executes the migrations"
    echo "  generate - Generates migration file"
    exit 1
fi

rm -rf dist
npm run build

case "$1" in
    "run")
        echo "Running the migrations..."
        npm run typeorm migration:run -- -d dist/utils/migrations-data-source-with-schema.js
        ;;
    "revert")
        echo "Reverting..."
        npm run typeorm migration:revert -- -d dist/utils/migrations-data-source-with-schema.js
        ;;
    "generate")
        echo "Creating the migrations..."
        npm run typeorm migration:generate -- CreateSchema -d dist/utils/migrations-data-source.js
        ;;
    *)
        echo "Error: Invalid option '$1'. Use 'run' or 'generate'."
        exit 1
        ;;
esac
