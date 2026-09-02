# Imagem Caddy personalizada, só para acrescentar o módulo de terceiros
# caddy-ratelimit (github.com/mholt/caddy-ratelimit) — o caddy:2-alpine
# oficial não o inclui, e não há rate limiting nativo no Caddy stock.
#
# Usado no Caddyfile como travão básico por IP em /api/*, à frente do
# rate limiting que já existe ao nível do Express (não o substitui).
#
# Build testado localmente com:
#   docker build -t ucm-caddy ./caddy
#   docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" ucm-caddy \
#     caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
FROM caddy:2-builder-alpine AS builder

RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
