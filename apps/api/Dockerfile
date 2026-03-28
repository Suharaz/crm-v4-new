FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm --filter @crm/types build
RUN pnpm --filter @crm/utils build
RUN pnpm --filter @crm/api build

# Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/utils/dist ./packages/utils/dist

ENV NODE_ENV=production
EXPOSE 3010
CMD ["node", "dist/main.js"]
