# UNDERWAY — game server (Node 22 + SQLite) serving the single-file client.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8931 DATA_DIR=/data GAME_ROOT=/app
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/server.js ./
COPY index.html /app/index.html
VOLUME ["/data"]
EXPOSE 8931
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8931/api/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
