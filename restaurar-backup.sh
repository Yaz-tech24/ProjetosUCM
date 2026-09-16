#!/bin/sh
# Restauro completo (base de dados + uploads) da stack Docker Compose, a
# partir da pasta backups/. Corre no servidor, na raiz do projecto:
#
#   ./restaurar-backup.sh                                   # dump mais recente
#   ./restaurar-backup.sh ucm_smarthub_20260101_030000.sql.gz
#
# Pára a API durante o restauro (para não haver escritas a meio), delega o
# trabalho ao serviço "backup" (backup/restaurar.sh) com o volume de uploads
# montado com escrita, e volta a arrancar a API no fim.
#
# Para só TESTAR que o último backup se restaura (sem tocar em nada):
#   docker compose exec backup verificar-backup.sh
set -e
cd "$(dirname "$0")"

VOLUME=$(docker volume ls -q --filter label=com.docker.compose.volume=api_uploads | head -n 1)
[ -n "$VOLUME" ] || { echo "Volume api_uploads não encontrado — a stack já arrancou alguma vez (docker compose up)?"; exit 1; }

echo "A parar a API..."
docker compose stop api
docker compose run --rm -v "$VOLUME:/uploads-rw" backup restaurar.sh "$@"
echo "A arrancar a API..."
docker compose start api
echo "Restauro concluído."
