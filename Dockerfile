# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations

RUN addgroup -S labflow && adduser -S labflow -G labflow
USER labflow

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "cmd/server/index.js"]
