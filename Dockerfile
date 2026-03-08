FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY server/ ./server/

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S deco && \
    adduser -S deco -u 1001 -G deco
USER deco

EXPOSE 8086

ENV NODE_ENV=production

CMD ["node", "dist/server/mcp/http-server.js"]
