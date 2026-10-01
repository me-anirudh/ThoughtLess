FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies (using legacy-peer-deps to resolve any strict version conflicts)
RUN npm install --legacy-peer-deps

# Copy all files
COPY . .

# Generate Prisma Client and Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# Expose port
EXPOSE 3000
ENV PORT=3000

# Push Prisma schema to the database automatically on startup, then run the app
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]