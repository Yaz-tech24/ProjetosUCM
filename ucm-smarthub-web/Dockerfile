FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# O Vite grava VITE_API_URL no bundle em build-time — tem de vir da imagem,
# não de uma variável de ambiente do container em runtime.
ARG VITE_API_URL=http://localhost:5000/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80


# 127.0.0.1, não "localhost" — em Alpine, "localhost" resolve para ::1 (IPv6)
# primeiro, e o nginx só escuta em IPv4 por omissão. Com "localhost" isto
# falhava sempre por dentro do próprio container ("connection refused"),
# apesar do nginx responder perfeitamente a pedidos externos — só se nota ao
# fim de alguns minutos, quando as tentativas do HEALTHCHECK se esgotam.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
