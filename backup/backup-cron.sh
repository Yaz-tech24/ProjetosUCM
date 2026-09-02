#!/bin/sh
# Corrido diariamente pelo cron (ver ficheiro "crontab" ao lado) dentro do
# serviço "backup" do docker-compose.yml. Liga-se directamente ao serviço
# "db" (mysqldump), não precisa de socket Docker nem de exec noutro
# container — só o mysqldump normal, contra a rede interna do Compose.
set -e

[ -f /etc/backup.env ] && . /etc/backup.env

DB_NAME="${DB_NAME:-ucm_smarthub}"
DATA_HORA=$(date +%Y%m%d_%H%M%S)
mkdir -p /backups

echo "$(date '+%Y-%m-%d %H:%M:%S') A criar backup de '$DB_NAME'..."
mysqldump -h db -uroot -p"$DB_PASSWORD" "$DB_NAME" | gzip > "/backups/${DB_NAME}_${DATA_HORA}.sql.gz"

# Mantém só os últimos 14 backups — partilha a pasta (e a retenção) com o
# backup-db.sh manual, que escreve os mesmos nomes de ficheiro.
ls -t /backups/${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "$(date '+%Y-%m-%d %H:%M:%S') Backup criado: /backups/${DB_NAME}_${DATA_HORA}.sql.gz"
