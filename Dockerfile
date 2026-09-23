FROM node:22-alpine

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

FROM node:22-alpine
WORKDIR /app

# 1. Copy package files and install dependencies FIRST (this gets cached)
COPY package.json package-lock.json* ./
RUN npm install

# 2. Copy the rest of your application code
COPY . .

# 3. Generate Prisma client (doesn't need the database running yet)
RUN npx prisma generate

# 4. Expose the port
EXPOSE 3000

# 5. At runtime, push the DB schema and start the dev server
CMD ["sh", "-c", "npx prisma db push && npm run dev"]