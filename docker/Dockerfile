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

COPY --from=builder /app/app/backend/dist ./dist
COPY --from=builder /app/app/backend/prisma ./prisma
COPY --from=builder /app/app/frontend/dist ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app/backend/node_modules ./app/backend/node_modules
COPY --from=builder /app/package.json .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
