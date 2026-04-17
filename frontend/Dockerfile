ARG NODE_VERSION=22-alpine3.22

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

# Copy the env injection script
COPY --from=builder /app/env.sh /usr/local/bin/env.sh
RUN chmod +x /usr/local/bin/env.sh

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the Node server port
EXPOSE 80

# At startup:
#   1. Regenerate dist/client/env-config.js from the current runtime env vars.
#      This file is served as a static asset to SPA routes that don't go through
#      the SSR handler (SSR routes inline env vars directly in the HTML).
#   2. Start the Express server on port 80.
CMD ["/bin/sh", "-c", "/usr/local/bin/env.sh /app/dist/client && PORT=80 node /app/dist/server/index.cjs"]
