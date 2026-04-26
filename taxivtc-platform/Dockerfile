FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci

COPY . .

ARG BUILD_DATE
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
