ARG NODE_VERSION=22-alpine3.22@sha256:b77017c37f430e4466ff497058948a2f16e8b59779600d53711eeb7b999b0f4e

# =========================================
# Stage 1: Build the application
# =========================================
FROM public.ecr.aws/docker/library/node:${NODE_VERSION} AS builder

RUN corepack enable

# Set the working directory inside the container
WORKDIR /app

# Copy package-related files first to leverage Docker's layer caching
COPY soilhive-app/package.json soilhive-app/pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies needed for the build)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --recursive

# Copy the rest of the application source code
COPY soilhive-app ./

# Build both the client (browser) and server (Node.js/SSR) bundles.
# Outputs:
#   dist/client/   — static React bundle + index.html
#   dist/server/   — self-contained Express + React SSR bundle (index.cjs)
RUN pnpm run build:ssr

# =========================================
# Stage 2: Minimal production image
# =========================================
FROM public.ecr.aws/docker/library/node:${NODE_VERSION} AS runner

WORKDIR /app

# The Rsbuild SSR bundle is fully self-contained (all node_modules bundled in)
# so no npm install step is required in the runner image.

# Copy compiled bundles from the build stage
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the Node server port
EXPOSE 3000

# The server generates dist/client/env-config.js at startup from runtime env vars.
CMD ["node", "/app/dist/server/index.cjs"]
