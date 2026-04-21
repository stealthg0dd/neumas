# =============================================================================
# Neumas Web — Dockerfile (Fixed for pnpm & dynamic port mapping)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install production node_modules using pnpm
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat is needed for some native Node.js bindings on Alpine
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm

WORKDIR /app

# Copy manifests and install *production* deps
# Using pnpm-lock.yaml as the source of truth
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# -----------------------------------------------------------------------------
# Stage 2: builder — full install + next build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm

WORKDIR /app

# Copy manifests and full install
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy application source
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build — produces .next/standalone and .next/static
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 3: runner — minimal image with standalone output
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat wget

WORKDIR /app

# Set defaults, but allow override via ENV
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copy the standalone server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets and public directory
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

# Expose the default port
EXPOSE 3000

# Health check — Modified to use the dynamic PORT variable
# This fixes the Railway "Service Unavailable" error
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

# Start the standalone Next.js server using the dynamic port
CMD ["node", "server.js"]