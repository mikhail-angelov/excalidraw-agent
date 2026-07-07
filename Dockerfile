# Stage 1: Copy source
FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY src ./src
RUN node -e "require('fs').cpSync('src','dist',{recursive:true})"

# Stage 2: Production
FROM node:22-slim

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 nodejs

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "dist/server.js"]

LABEL org.opencontainers.image.source="https://github.com/mikhail-angelov/excalidraw-agent"
LABEL org.opencontainers.image.description="Excalidraw Agent - Canvas server and AI agent"
LABEL org.opencontainers.image.licenses="MIT"
