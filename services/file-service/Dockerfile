FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER app
HEALTHCHECK CMD wget -q --spider http://localhost:8085/health || exit 1
CMD ["node", "dist/server.js"]
