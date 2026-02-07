# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/backend/package.json app/backend/
COPY app/frontend/package.json app/frontend/
COPY app/shared/package.json app/shared/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS builder
COPY . .
RUN cd app/backend && pnpm generate
RUN pnpm build

# Stage 3: Runtime dependencies (minimal - filter from builder)
FROM builder AS runtime-deps
# Keep only @prisma/client and argon2 dependencies in .pnpm store
# First, list what we want to keep
RUN cd /app/node_modules/.pnpm && \
    ls -d @prisma+* prisma@* argon2@* @mapbox+* node-addon-api@* node-gyp-build@* detect-libc@* 2>/dev/null > /tmp/keep-packages.txt || true

# Delete everything else from .pnpm
RUN cd /app/node_modules/.pnpm && \
    for dir in */; do \
        pkg=$(basename "$dir"); \
        if ! grep -q "^${pkg}\$" /tmp/keep-packages.txt 2>/dev/null; then \
            rm -rf "$dir"; \
        fi; \
    done

# Keep only argon2 in backend node_modules  
RUN cd /app/app/backend/node_modules && \
    ls -d argon2 .bin 2>/dev/null > /tmp/keep-backend.txt || true && \
    for item in *; do \
        if [ "$item" != "argon2" ] && [ "$item" != ".bin" ]; then \
            rm -rf "$item"; \
        fi; \
    done

# Stage 4: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app

# Create non-root user before copying files
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

USER nodejs

# Backend compiled output (rootDir=".." so output nests as dist/backend/src/ and dist/shared/)
COPY --chown=nodejs:nodejs --from=builder /app/app/backend/dist ./app/backend/dist
# Prisma schema + migrations (for prisma migrate deploy)
COPY --chown=nodejs:nodejs --from=builder /app/app/backend/prisma ./app/backend/prisma
# Frontend build output — placed where the compiled server expects it
COPY --chown=nodejs:nodejs --from=builder /app/app/frontend/dist ./app/frontend/dist
# Node modules (runtime deps - only @prisma/client and argon2)
COPY --chown=nodejs:nodejs --from=runtime-deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=runtime-deps /app/app/backend/node_modules ./app/backend/node_modules
COPY --chown=nodejs:nodejs --from=builder /app/package.json .

EXPOSE 3000

# The compiled server.ts lives at app/backend/dist/backend/src/server.js
# It looks for frontend at ../../frontend/dist relative to __dirname (app/backend/dist/backend/src)
# That resolves to app/frontend/dist — which is where we copied it above
CMD ["sh", "-c", "cd app/backend && npx prisma migrate deploy && cd /app && node app/backend/dist/backend/src/server.js"]
