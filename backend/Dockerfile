ARG NODE_VERSION=22-alpine3.22

FROM public.ecr.aws/docker/library/node:${NODE_VERSION} AS base

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Install system dependencies needed for building native modules
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    gdal-dev \
    gdal-driver-pg \
    && ln -sf /usr/bin/python3 /usr/bin/python

# ========================================
# Dependencies Stage
# ========================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --build-from-source --shared_gdal && \
    npm cache clean --force

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# ========================================
# Build Dependencies Stage
# ========================================
FROM base AS build-deps

# Copy package files
COPY package*.json ./

# Install all dependencies with build optimizations
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund --build-from-source --shared_gdal && \
    npm cache clean --force

# Create necessary directories and set permissions
RUN mkdir -p /app/node_modules/.vite && \
    chown -R nodejs:nodejs /app

# ========================================
# Build Stage
# ========================================
FROM build-deps AS build

# Copy only necessary files for building (respects .dockerignore)
COPY --chown=nodejs:nodejs . .

# Build the application
RUN npm run build

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# ========================================
# Final Stage
# ========================================
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Set optimized environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=256 --no-warnings" \
    NPM_CONFIG_LOGLEVEL=silent

RUN apk add --no-cache gdal gdal-driver-pg

# Copy production dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./
# Copy built application from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Copy static assets
COPY src/GeoJSON-OAS3.yaml ./src/GeoJSON-OAS3.yaml
COPY src/openapi.yaml ./src/openapi.yaml
COPY src/assets ./src/assets

# Switch to non-root user for security
USER nodejs

# Expose port
EXPOSE 4001

# Start production server
CMD ["node", "dist/app.js"]
