FROM node:22

# Set working directory
WORKDIR /usr/src/app
COPY ./package*.json ./
RUN npm ci

EXPOSE 3000

CMD ["npm", "start"]

