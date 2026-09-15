# Node 22, não 20: o pacote "cookie" (usado na sessão por cookie httpOnly)
# exige Node >=22 — com Node 20, "npm ci" falhava a validar o lock file.
FROM node:22-bookworm-slim

WORKDIR /app

# LibreOffice (só Writer e Impress) para converter DOCX/PPTX enviados pelos
# estudantes em PDF no servidor — ver services/conversao.js. Acrescenta
# ~400 MB à imagem; para prescindir, remova este bloco e a conversão fica
# indisponível de forma controlada (o upload de Office é recusado com aviso).
RUN apt-get update  && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fonts-dejavu fonts-liberation  && rm -rf /var/lib/apt/lists/*

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
