FROM node:lts

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci
RUN npm run build

# Bundle app source
COPY . .

EXPOSE 8080

CMD [ "npm", "start" ]
