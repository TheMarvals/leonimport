FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --include=dev

COPY . .

RUN npx prisma generate --schema=./prisma/schema.prisma \
    && npm run build \
    && npm prune --omit=dev

EXPOSE 3000

# Schema changes must be reviewed and applied separately from application startup.
# Running db push here can attempt to remove fields added by another release.
CMD ["sh", "-c", "npm run start -- --hostname 0.0.0.0 --port ${PORT:-3000}"]
