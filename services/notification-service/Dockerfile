# ── Stage 1: Build ────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --frozen-lockfile

COPY src ./src
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S klgroup && adduser -S kluser -G klgroup

COPY --from=builder /app/package.json ./
RUN npm install --frozen-lockfile --omit=dev

COPY --from=builder /app/dist ./dist

RUN chown -R kluser:klgroup /app
USER kluser

EXPOSE 8086

CMD ["node", "dist/server.js"]
