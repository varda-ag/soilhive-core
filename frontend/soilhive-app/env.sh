#!/bin/sh
OUTPUT_FOLDER=${1:-public}
mkdir -p $OUTPUT_FOLDER
cat << EOF > $OUTPUT_FOLDER/env-config.js
window._env_ = {
  BACKEND_BASE_URL: '${BACKEND_BASE_URL}',
  MAPBOX_ACCESS_TOKEN: '${MAPBOX_ACCESS_TOKEN}',
};
EOF
