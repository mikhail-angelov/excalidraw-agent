# Stage 1: Build frontend
FROM node:22-slim AS ui-builder
WORKDIR /app
COPY package*.json ./
COPY ui ./ui
COPY vite.config.js ./
RUN npm ci && npm run build:ui && npm cache clean --force

# Stage 2: Build backend (TypeScript)
FROM node:22-slim AS server-builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm ci && npx tsc && npm cache clean --force

# Stage 3: Production
FROM node:22-slim
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 nodejs
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=server-builder /app/dist ./dist
COPY --from=ui-builder /app/dist/ui ./dist/ui
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "dist/server.js"]

LABEL org.opencontainers.image.source="https://github.com/mikhail-angelov/excalidraw-agent"
LABEL org.opencontainers.image.description="Excalidraw Agent - Canvas server with UI"
LABEL org.opencontainers.image.licenses="MIT"
