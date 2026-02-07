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

# Stage 3: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app

# Backend compiled output (rootDir=".." so output nests as dist/backend/src/ and dist/shared/)
COPY --from=builder /app/app/backend/dist ./app/backend/dist
# Prisma schema + migrations (for prisma migrate deploy)
COPY --from=builder /app/app/backend/prisma ./app/backend/prisma
# Frontend build output — placed where the compiled server expects it
COPY --from=builder /app/app/frontend/dist ./app/frontend/dist
# Node modules (runtime deps)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app/backend/node_modules ./app/backend/node_modules
COPY --from=builder /app/package.json .

EXPOSE 3000

# The compiled server.ts lives at app/backend/dist/backend/src/server.js
# It looks for frontend at ../../frontend/dist relative to __dirname (app/backend/dist/backend/src)
# That resolves to app/frontend/dist — which is where we copied it above
CMD ["sh", "-c", "cd app/backend && npx prisma migrate deploy && cd /app && node app/backend/dist/backend/src/server.js"]
