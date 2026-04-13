# ============================================================================
# Dockerfile for Enviable WhatsApp API
# Place this in the backend/ directory
#
# Local dev:  docker compose up (uses nodemon via command override)
# Production: docker build -t enviable-api . (runs node directly)
# ============================================================================

FROM node:20-alpine
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Install all dependencies (including devDependencies for nodemon in dev)
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
