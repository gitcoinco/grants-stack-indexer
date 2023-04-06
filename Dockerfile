FROM node:lts

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

# Bundle app source
COPY . .

RUN npm run build
RUN npm run lint

EXPOSE 8080

COPY init.sh ./

# Cache indexer in the image
RUN --mount=type=cache,target=/usr/src/app/.cache ./init.sh

CMD [ "npm", "start" ]
