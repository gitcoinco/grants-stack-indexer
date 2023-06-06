FROM node:lts

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

# Bundle app source
COPY src src
COPY tsconfig.json ./
COPY .eslintrc.cjs ./

RUN npm run build
RUN npm run lint

EXPOSE 8080

COPY seed seed

RUN npm run test

CMD [ "npm", "start" ]
