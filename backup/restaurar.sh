#!/bin/sh
# Restauro completo (base de dados + uploads) a partir de /backups, corrido
# DENTRO do serviço "backup":
#
#   docker compose exec backup restaurar.sh                      # dump mais recente
#   docker compose exec backup restaurar.sh ucm_smarthub_20260101_030000.sql.gz
#
# A base de dados actual é SUBSTITUÍDA pelo dump. Os uploads são repostos a
# partir do espelho /backups/uploads (só ficheiros em falta — não apaga os
# que já existem no volume). Pare o serviço "api" antes, para não haver
# escritas a meio:  docker compose stop api   …e depois  docker compose start api
set -e

[ -f /etc/backup.env ] && . /etc/backup.env
DB_NAME="${DB_NAME:-ucm_smarthub}"

if [ -n "$1" ]; then
  DUMP="/backups/$1"
else
  DUMP=$(ls -t /backups/${DB_NAME}_*.sql.gz 2>/dev/null | head -n 1)
fi
[ -f "$DUMP" ] || { echo "Dump não encontrado: $DUMP"; exit 1; }

echo "A restaurar a base de dados '$DB_NAME' a partir de $DUMP ..."
mysql -h db -uroot -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4;"
gunzip -c "$DUMP" | mysql -h db -uroot -p"$DB_PASSWORD" "$DB_NAME"
echo "Base de dados restaurada."

if [ -d /backups/uploads ] && [ -d /uploads-rw ]; then
  ANTES=$(find /uploads-rw -type f | wc -l)
  cp -rpn /backups/uploads/. /uploads-rw/
  DEPOIS=$(find /uploads-rw -type f | wc -l)
  echo "Uploads repostos: $((DEPOIS - ANTES)) ficheiro(s) recuperado(s) ($DEPOIS no total)."
else
  echo "Aviso: espelho de uploads ou volume de escrita (/uploads-rw) não montado — só a base de dados foi restaurada."
  echo "Para repor uploads: docker compose run --rm -v \$(pwd)/backups/uploads:/origem:ro -v ucm_api_uploads:/destino alpine cp -rpn /origem/. /destino/"
fi
echo "Concluído. Arranque a API: docker compose start api"
