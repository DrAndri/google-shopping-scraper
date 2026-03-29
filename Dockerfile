
FROM node:24-bullseye

ENV NODE_ENV=production

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./

RUN yarn install --production --frozen-lockfile

RUN npx playwright install --with-deps

COPY . .
RUN yarn build

EXPOSE 8080
CMD [ "node", "dist/index.js" ]