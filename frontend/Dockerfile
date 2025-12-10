ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build

RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --recursive
RUN pnpm run build --loglevel verbose

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/soilhive-app/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
