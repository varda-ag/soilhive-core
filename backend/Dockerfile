ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

USER node:node
EXPOSE 3001
CMD ["npm", "start"]
