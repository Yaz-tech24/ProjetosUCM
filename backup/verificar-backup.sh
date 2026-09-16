#!/bin/sh
# Prova de restauro: repõe o dump mais recente numa base de dados temporária
# (<DB_NAME>_verificacao) no próprio serviço "db", conta as tabelas e linhas
# das tabelas principais e apaga a base temporária. Um backup que não se
# consegue restaurar não é um backup — este script é a única forma de saber
# antes de precisar dele.
#
# Corre semanalmente pelo cron (ver "crontab") e à mão:
#   docker compose exec backup verificar-backup.sh
set -e

[ -f /etc/backup.env ] && . /etc/backup.env
DB_NAME="${DB_NAME:-ucm_smarthub}"
ALVO="${DB_NAME}_verificacao"
DUMP=$(ls -t /backups/${DB_NAME}_*.sql.gz 2>/dev/null | head -n 1)

if [ -z "$DUMP" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') VERIFICAÇÃO FALHOU: não há nenhum dump em /backups."
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') A verificar $DUMP ..."
mysql -h db -uroot -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS \`$ALVO\`; CREATE DATABASE \`$ALVO\` CHARACTER SET utf8mb4;"
gunzip -c "$DUMP" | mysql -h db -uroot -p"$DB_PASSWORD" "$ALVO"

TABELAS=$(mysql -h db -uroot -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$ALVO'")
UTILIZADORES=$(mysql -h db -uroot -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM \`$ALVO\`.usuarios" 2>/dev/null || echo "?")
MATERIAIS=$(mysql -h db -uroot -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM \`$ALVO\`.materiais" 2>/dev/null || echo "?")
MIGRACOES=$(mysql -h db -uroot -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM \`$ALVO\`.migracoes" 2>/dev/null || echo "?")
mysql -h db -uroot -p"$DB_PASSWORD" -e "DROP DATABASE \`$ALVO\`;"

if [ "$TABELAS" -lt 10 ] || [ "$UTILIZADORES" = "?" ] || [ "$MATERIAIS" = "?" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') VERIFICAÇÃO FALHOU: restauro incompleto ($TABELAS tabelas)."
  exit 1
fi
echo "$(date '+%Y-%m-%d %H:%M:%S') Restauro verificado: $TABELAS tabelas, $UTILIZADORES utilizadores, $MATERIAIS materiais, $MIGRACOES migrações."
