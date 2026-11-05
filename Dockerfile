# ── Stage 1: build the React dashboard ─────────────────────────
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ── Stage 2: production API image (serves the built dashboard) ─
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV CLIENT_DIST=/app/client/dist
# Cloud Run injects PORT (defaults to 8080)
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
