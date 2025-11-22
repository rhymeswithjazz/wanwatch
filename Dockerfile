FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set dummy DATABASE_URL for build (actual URL set at runtime)
ENV DATABASE_URL="file:./dev.db"

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install system dependencies
# - tzdata: timezone support
# - wget, tar: for downloading Ookla CLI
# - ca-certificates: for HTTPS downloads
RUN apk add --no-cache tzdata wget tar ca-certificates

# Install Ookla Speedtest CLI
# Download official binary for Alpine Linux (musl)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      SPEEDTEST_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
      SPEEDTEST_ARCH="aarch64"; \
    else \
      echo "Unsupported architecture: $ARCH"; exit 1; \
    fi && \
    wget -q https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-${SPEEDTEST_ARCH}.tgz && \
    tar xzf ookla-speedtest-1.2.0-linux-${SPEEDTEST_ARCH}.tgz -C /usr/local/bin speedtest && \
    rm ookla-speedtest-1.2.0-linux-${SPEEDTEST_ARCH}.tgz && \
    chmod +x /usr/local/bin/speedtest

# Accept PUID/PGID as build args with defaults
ARG PUID=1001
ARG PGID=1001

# Create group and user with specified IDs
# Use existing group if GID already exists (like GID 100 = 'users' in Alpine)
RUN if ! getent group ${PGID} >/dev/null 2>&1; then \
      addgroup --system --gid ${PGID} nodejs; \
    fi && \
    GROUP_NAME=$(getent group ${PGID} | cut -d: -f1) && \
    adduser --system --uid ${PUID} --ingroup ${GROUP_NAME} nextjs

# Copy Prisma files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Copy prisma CLI to avoid npx downloading latest version (which may have breaking changes)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy scripts for admin tasks (user creation, etc.)
COPY --from=builder /app/scripts ./scripts

# Copy Next.js built files
# Use numeric IDs for chown to work with any group name
ARG PUID=1001
ARG PGID=1001
COPY --from=builder --chown=${PUID}:${PGID} /app/.next/standalone ./
COPY --from=builder --chown=${PUID}:${PGID} /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create data directory for SQLite
RUN mkdir -p /app/data && chown ${PUID}:${PGID} /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start script that initializes database, creates admin user if needed, and starts app
CMD ["sh", "-c", "node scripts/init.js && node server.js"]
