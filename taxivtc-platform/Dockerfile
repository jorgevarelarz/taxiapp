FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma/ ./prisma/

# npm install (not ci) lets npm skip darwin-only optional bins on Linux
RUN npm install --prefer-offline

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
