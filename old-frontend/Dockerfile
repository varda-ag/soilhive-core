FROM node:22

# Set working directory
WORKDIR /usr/src/app
COPY . .
RUN npm ci
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]

