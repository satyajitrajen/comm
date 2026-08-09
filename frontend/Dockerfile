FROM oven/bun:latest AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN bun install
COPY . .
# Optional cache-bust: BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) docker compose build frontend
ARG BUILD_DATE
RUN echo "BUILD_DATE=${BUILD_DATE:-}" && bun run build

FROM oven/bun:latest AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN bun install --production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "run", "start"]
