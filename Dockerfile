# Base pinned by digest so Railway rebuilds (even config-only redeploys) are reproducible.
# Bump deliberately: docker buildx imagetools inspect node:20-slim
ARG NODE_IMAGE=node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

# Build frontend
FROM ${NODE_IMAGE} AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Chrome comes from Puppeteer, not apt: the version is fixed by puppeteer in
# package-lock.json (24.32.1 -> Chrome 143.0.7499.40). Debian's chromium package
# moves on every rebuild and once broke launches (--single-process crash, Chromium 155).
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    PUPPETEER_CHROME_HEADLESS_SHELL_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && apt-get update \
    && npx puppeteer browsers install chrome --install-deps \
    && rm -rf /var/lib/apt/lists/*
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY VERSION ./
COPY --from=frontend /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
