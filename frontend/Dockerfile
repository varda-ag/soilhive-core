ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build

RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app
COPY soilhive-app/package.json soilhive-app/pnpm-lock.yaml ./soilhive-app/

RUN pnpm install --frozen-lockfile --recursive

#COPY common ./common
COPY soilhive-app ./soilhive-app

RUN pnpm --filter=!common --parallel build

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/soilhive-app/dist /usr/share/nginx/html
COPY --from=build /app/soilhive-app/env.sh /usr/share/nginx/html/env.sh

RUN cat << 'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen       80;
    server_name  localhost;
    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
        try_files $uri $uri/ /index.html; 
    }
}
EOF

EXPOSE 80

CMD ["/bin/sh", "-c", "/usr/share/nginx/html/env.sh /usr/share/nginx/html && nginx -g \"daemon off;\""]