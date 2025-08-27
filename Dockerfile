# Node 20 slim for smaller image
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

RUN npm i -D typescript tsx && npx tsc -p tsconfig.json

CMD ["node", "dist/index.js"]
