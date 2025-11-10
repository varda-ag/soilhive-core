#!/bin/bash
rm -r pnpm-lock.yaml node_modules dist
cd soilhive-app
rm -r pnpm-lock.yaml node_modules dist
cd ..
cd fe-backend
rm -r pnpm-lock.yaml node_modules dist
cd ..
cd mf-comparavailability
rm -r pnpm-lock.yaml node_modules dist
