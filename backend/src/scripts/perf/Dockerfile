# =============================================================================
# soilhive-core-perf — the performance suite as a scheduled job (docs/adr/0029)
#
# BUILD CONTEXT IS `backend`, NOT THIS DIRECTORY. The Dockerfile lives here,
# beside the code it packages, but it is built as:
#
#   docker build -f src/scripts/perf/Dockerfile backend
#
# and the CI job passes `context: backend` with `file:` pointing here. Using
# this directory as the context is not merely unconventional, it cannot work:
# the context is the only thing sent to the daemon, and this directory holds
# five .ts files — no package.json, no tsconfig.json, no src/, and no
# tests/assets/geojson, which runner.ts resolves as BACKEND_ROOT/tests/assets/
# geojson and without which every row aborts.
#
# The stages below deliberately mirror backend/Dockerfile rather than deriving
# from the published backend image: FROM-ing it would serialise this build
# behind that one and break on fork pull requests, where docker-build-reusable
# sets push: false and no tag exists to pull. The cost is that the shared parts
# — the NODE_VERSION digest, the gdal packages, the deps install — must be kept
# in step with backend/Dockerfile by hand.
# =============================================================================
ARG NODE_VERSION=24-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a

FROM public.ecr.aws/docker/library/node:${NODE_VERSION} AS base

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Needed to build native modules (bcrypt, pg-native's peers)
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    && ln -sf /usr/bin/python3 /usr/bin/python

# ========================================
# Dependencies Stage
# ========================================
FROM base AS deps

COPY package*.json ./

# Production dependencies only. Everything the suite imports at runtime — pg,
# dotenv, the aws-sdk and flystorage packages — is a production dependency;
# ts-node and typescript are not, which is why the entrypoint runs the compiled
# dist output rather than `npm run perf` or `npm run perf:diff`.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev && \
    npm cache clean --force

RUN chown -R nodejs:nodejs /app

# ========================================
# Build Dependencies Stage
# ========================================
FROM base AS build-deps

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund && \
    npm cache clean --force

RUN chown -R nodejs:nodejs /app

# ========================================
# Build Stage
# ========================================
FROM build-deps AS build

COPY --chown=nodejs:nodejs . .

# Compiles the suite to dist/scripts/perf/{runner,diff}.js alongside the app,
# which managed mode spawns as dist/app.js.
RUN npm run build

RUN chown -R nodejs:nodejs /app

# ========================================
# Final Stage
# ========================================
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Provenance. There is no `git` and no .git here (.dockerignore excludes it), so
# runner.ts falls back to these; CI passes github.sha and the branch. gitDirty is
# recorded as false by the runner, which is a fact about an image rather than a
# default: it is built from a committed tree.
ARG GIT_SHA=unknown
ARG GIT_BRANCH=unknown

# Only container-invariants belong here — things true of this image whatever the
# schedule asks it to measure. Every knob that decides *what* a run measures
# (PERF_BASE_URL, PERF_ASSETS, PERF_ITERATIONS, PERF_ENDPOINT,
# PERF_CACHE_BYPASS) and every alerting policy (PERF_DIFF_FAIL_ON_REGRESSION,
# PERF_DIFF_FAIL_THRESHOLD) comes from the schedule instead, so the CronJob spec
# is the single readable answer to what a run does.
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent \
    PERF_GIT_SHA=${GIT_SHA} \
    PERF_GIT_BRANCH=${GIT_BRANCH}

# This container's disk dies with it, so the upload is the run's only durable
# record: a failed one fails the run, and a missing STORAGE_MODE=s3 aborts
# before anything is measured.
ENV PERF_REQUIRE_PUBLISH=true

# The heap of the server managed mode spawns, held at the backend image's
# production value while the runner gets its own below.
ENV PERF_SERVER_NODE_OPTIONS="--max-old-space-size=256 --no-warnings"

# The measuring process, not the measured one: it parses every geojson asset up
# front and holds each row's response bodies, so it is deliberately given more
# room than the app it measures.
ENV NODE_OPTIONS="--max-old-space-size=1024 --no-warnings"

# Same native dependency as the backend image, because managed mode boots the
# same dist/app.js: a missing one would be a difference between what this image
# measures and what production runs.
RUN apk add --no-cache gdal gdal-tools gdal-driver-pg

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Everything below is needed only by managed mode, where this container boots
# the API itself. Attached mode uses none of it, but the image supports both and
# which one runs is decided at runtime by PERF_BASE_URL.
COPY --chown=nodejs:nodejs src/GeoJSON-OAS3.yaml ./src/GeoJSON-OAS3.yaml
COPY --chown=nodejs:nodejs src/openapi.yaml ./src/openapi.yaml
COPY --chown=nodejs:nodejs src/assets ./src/assets
COPY --chown=nodejs:nodejs docs/data-model ./docs/data-model

# The measurement fixtures, and the reason the context has to be `backend`:
# runner.ts reads them from BACKEND_ROOT/tests/assets/geojson. Only the geojson
# directory is copied — the suite reads nothing else under tests/assets.
COPY --chown=nodejs:nodejs tests/assets/geojson ./tests/assets/geojson

COPY --chown=nodejs:nodejs src/scripts/perf/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Written by the runner and hydrated with baselines pulled from S3 by the diff.
RUN mkdir -p /app/perf-results && chown -R nodejs:nodejs /app/perf-results

USER nodejs

# No EXPOSE: in managed mode the API is spawned for this process alone and is
# reached over localhost; nothing outside the container talks to it.
ENTRYPOINT ["./entrypoint.sh"]
