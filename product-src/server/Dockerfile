FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git ripgrep gosu \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g @anthropic-ai/claude-code@2.1.282

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY src/bench/engine.js src/bench/engine.d.ts /app/src/bench/
COPY src/lib/cycles.ts src/lib/sample.ts src/lib/inbox.ts /app/src/lib/
RUN chmod 755 /app/server/entrypoint.sh

ENV HOME=/data NODE_ENV=production PORT=8080
EXPOSE 8080
# Only the entrypoint starts as root to repair mounted-volume ownership;
# it execs the server as node, and all CLI children inherit that identity.
ENTRYPOINT ["/app/server/entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
