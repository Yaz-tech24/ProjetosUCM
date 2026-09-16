#!/bin/sh
# Corrido diariamente pelo cron (ver ficheiro "crontab" ao lado) dentro do
# serviço "backup" do docker-compose.yml. Liga-se directamente ao serviço
# "db" (mysqldump), não precisa de socket Docker nem de exec noutro
# container — só o mysqldump normal, contra a rede interna do Compose.
#
# Faz três coisas:
#   1. dump comprimido da base de dados (mantém os últimos 14);
#   2. espelho da pasta de uploads (/uploads, montada só de leitura do volume
#      api_uploads) em /backups/uploads — cópia incremental, só ficheiros
#      novos/alterados; nunca apaga (um ficheiro removido por engano na app
#      continua recuperável aqui);
#   3. ao domingo, um snapshot completo uploads_AAAAMMDD.tar.gz (mantém 4).
set -e

[ -f /etc/backup.env ] && . /etc/backup.env

DB_NAME="${DB_NAME:-ucm_smarthub}"
DATA_HORA=$(date +%Y%m%d_%H%M%S)
mkdir -p /backups /backups/uploads

echo "$(date '+%Y-%m-%d %H:%M:%S') A criar backup de '$DB_NAME'..."
# --single-transaction: dump consistente sem bloquear as tabelas InnoDB
# enquanto a app continua a escrever.
#
# Sem pipe para o gzip de propósito: em "mysqldump | gzip" o código de saída
# é o do gzip, e um mysqldump falhado (BD em baixo, password errada) deixava
# um .sql.gz de 20 bytes com ar de backup bem-sucedido. Aqui o dump vai para
# um temporário, o exit code é verificado, e só depois se comprime e renomeia
# — um dump interrompido a meio nunca fica com o nome final.
TMP="/backups/${DB_NAME}_${DATA_HORA}.sql.tmp"
if ! mysqldump -h db -uroot -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" > "$TMP"; then
  rm -f "$TMP"
  echo "$(date '+%Y-%m-%d %H:%M:%S') BACKUP FALHOU: mysqldump devolveu erro (ver acima)."
  exit 1
fi
if [ "$(wc -c < "$TMP")" -lt 1024 ]; then
  rm -f "$TMP"
  echo "$(date '+%Y-%m-%d %H:%M:%S') BACKUP FALHOU: dump demasiado pequeno para ser válido."
  exit 1
fi
gzip -f "$TMP"
mv "$TMP.gz" "/backups/${DB_NAME}_${DATA_HORA}.sql.gz"

# Mantém só os últimos 14 backups — partilha a pasta (e a retenção) com o
# backup-db.sh manual, que escreve os mesmos nomes de ficheiro.
ls -t /backups/${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "$(date '+%Y-%m-%d %H:%M:%S') Backup criado: /backups/${DB_NAME}_${DATA_HORA}.sql.gz"

# ── Uploads (PDFs, vídeos, avatares, logótipo) ─────────────────────────
if [ -d /uploads ]; then
  # -u: só copia quando a origem é mais recente; -p preserva datas.
  cp -rpu /uploads/. /backups/uploads/ 2>/dev/null || true
  TOTAL=$(find /backups/uploads -type f | wc -l)
  echo "$(date '+%Y-%m-%d %H:%M:%S') Espelho de uploads actualizado ($TOTAL ficheiro(s))."

  if [ "$(date +%u)" = "7" ]; then
    tar -czf "/backups/uploads_$(date +%Y%m%d).tar.gz.tmp" -C /uploads . \
      && mv "/backups/uploads_$(date +%Y%m%d).tar.gz.tmp" "/backups/uploads_$(date +%Y%m%d).tar.gz"
    ls -t /backups/uploads_*.tar.gz 2>/dev/null | tail -n +5 | xargs -r rm --
    echo "$(date '+%Y-%m-%d %H:%M:%S') Snapshot semanal de uploads criado."
  fi
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') Aviso: /uploads não montado — só a base de dados foi copiada."
fi
