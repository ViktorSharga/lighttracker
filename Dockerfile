FROM node:20-slim

# Install dependencies for Puppeteer (minimal set)
RUN apt-get update && apt-get install -y \
    chromium \
    dumb-init \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production && npm cache clean --force

# Copy application files
COPY . .

# Create data directory for persistent storage
RUN mkdir -p /app/data

EXPOSE 3000

# Use dumb-init to handle signals properly and run node directly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
