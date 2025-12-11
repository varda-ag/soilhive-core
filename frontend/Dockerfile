ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build

RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY soilhive-app/package.json soilhive-app/pnpm-lock.yaml ./soilhive-app/

RUN pnpm install --frozen-lockfile --recursive

#COPY common ./common
COPY soilhive-app ./soilhive-app

RUN pnpm run build

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/soilhive-app/dist /usr/share/nginx/html
COPY --from=build /app/soilhive-app/env.sh /usr/share/nginx/html

EXPOSE 80

CMD ["/bin/bash", "-c", "/usr/share/nginx/html/env.sh && nginx -g \"daemon off;\""]