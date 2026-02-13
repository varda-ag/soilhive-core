ARG NODE_VERSION=22-alpine3.22
ARG NGINX_VERSION=alpine3.23

# =========================================
# Stage 1: Build the React.js Application
# =========================================
FROM node:${NODE_VERSION} AS builder

RUN corepack enable

# Set the working directory inside the container
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY soilhive-app/package.json soilhive-app/pnpm-lock.yaml* ./

# Install project dependencies ensuring a clean, reproducible install
RUN --mount=type=cache,target=/root/.npm pnpm install --frozen-lockfile --recursive

# Copy the rest of the application source code into the container
COPY soilhive-app ./

# Build the React.js application (outputs to /app/dist)
RUN pnpm run build

# =========================================
# Stage 2: Prepare Nginx to Serve Static Files
# =========================================

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runner

USER root
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static build output from the build stage to Nginx's default HTML serving directory
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx --from=builder /app/env.sh /usr/local/bin/

# Create placeholder file for env injection
RUN install -o nginx -g nginx -m 644 /dev/null /usr/share/nginx/html/env-config.js

# Use a built-in non-root user for security best practices
USER nginx

# Expose port 80 to allow HTTP traffic
EXPOSE 80

CMD ["/bin/sh", "-c", "/usr/local/bin/env.sh /usr/share/nginx/html && nginx -g \"daemon off;\""]