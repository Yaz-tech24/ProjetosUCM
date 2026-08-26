#!/bin/sh
# Backup da base de dados MySQL da stack Docker Compose.
# Uso: ./backup-db.sh   (cria um ficheiro backups/ucm_smarthub_AAAAMMDD_HHMMSS.sql.gz)
#
# Para restaurar: gunzip -c backups/ficheiro.sql.gz | docker compose exec -T db mysql -uroot -p"$DB_PASSWORD" "$DB_NAME"
#
# Sugestão para automatizar diariamente (crontab -e no servidor):
#   0 3 * * * cd /caminho/para/o/projecto && ./backup-db.sh >> backups/backup.log 2>&1

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

DB_NAME="${DB_NAME:-ucm_smarthub}"
DATA_HORA=$(date +%Y%m%d_%H%M%S)
mkdir -p backups

echo "A criar backup de '$DB_NAME'..."
docker compose exec -T db mysqldump -uroot -p"$DB_PASSWORD" "$DB_NAME" | gzip > "backups/${DB_NAME}_${DATA_HORA}.sql.gz"

# Mantém só os últimos 14 backups
ls -t backups/${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Backup criado: backups/${DB_NAME}_${DATA_HORA}.sql.gz"
