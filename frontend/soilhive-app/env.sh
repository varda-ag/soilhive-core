#!/bin/sh
cat << EOF > ./env-config.js
window._env_ = {
  BACKEND_BASE_URL: '${BACKEND_BASE_URL}',
  MAPBOX_ACCESS_TOKEN: '${MAPBOX_ACCESS_TOKEN}',
};
EOF
