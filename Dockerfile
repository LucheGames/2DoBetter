# syntax=docker/dockerfile:1
# 2Do Better — Dockerfile
#
# Builds a self-contained production image.
# Data (users, DB, certs) is NOT baked in — mount it via docker-compose volumes.
#
# Build:  docker compose build
# Run:    docker compose up -d
# Setup:  docker exec -it 2dobetter node scripts/setup.js

FROM node:20-alpine

WORKDIR /app

# System packages needed at build time:
#   bash    — build.sh uses bash (Alpine ships ash by default)
#   python3, make, g++ — node-gyp native addons (bcrypt)
RUN apk add --no-cache bash python3 make g++

# Install dependencies — BuildKit cache mount keeps the npm download cache
# between builds so packages aren't re-downloaded when lock file changes.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --cache /root/.npm

# Copy source code
COPY . .

# Generate Prisma client and build Next.js
# build.sh detects node from PATH (no nvm needed in this image)
RUN npm run build

# Pre-create data directories. In production these are mounted as volumes,
# so anything written here is shadowed. Pre-creating prevents startup crashes
# if the user forgets to create them on the host.
RUN mkdir -p data certs

# 3000 = HTTPS app   3001 = HTTP redirect
EXPOSE 3000 3001

# server.js is the custom Node server (HTTPS + SSE) that wraps Next.js
CMD ["node", "server.js"]
