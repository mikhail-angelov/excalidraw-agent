FROM node:22-slim
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 nodejs
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY ./dist ./dist
RUN chown -R nodejs:nodejs /app
USER nodejs