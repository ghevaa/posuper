# ============================================================
# POS Yoga — Production API Dockerfile
# ============================================================

# Step 1: Base image
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root configurations
COPY package.json tsconfig.base.json package-lock.json* ./

# Copy packages & apps packages
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Install dependencies (workspaces auto-resolved)
RUN npm install --legacy-peer-deps --force

# Build typescript projects and web app
RUN npm run build -w packages/config && npm run build -w packages/types && npm run build -w apps/api && npm run build -w apps/web

# Step 2: Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install prod dependencies
RUN npm install --omit=dev --legacy-peer-deps --force

# Copy builds
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Env
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
