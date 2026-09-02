# Node 22, não 20: o pacote "cookie" (usado na sessão por cookie httpOnly)
# exige Node >=22 — com Node 20, "npm ci" falhava a validar o lock file.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 5000

# Sem wget/curl na imagem slim — o próprio Node faz o pedido do healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/status', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
