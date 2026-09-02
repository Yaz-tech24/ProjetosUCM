#!/bin/sh
# Ponto de entrada do sidecar de backups: o cron do sistema (cronie) limpa
# o ambiente das tarefas que corre — não herda as variáveis de ambiente do
# container (DB_PASSWORD, etc.), ao contrário do processo principal. Por
# isso gravamos as variáveis necessárias num ficheiro que o backup-cron.sh
# lê explicitamente, em vez de assumir que chegam por herança.
set -e

env | grep -E '^(DB_NAME|DB_PASSWORD)=' > /etc/backup.env
chmod 600 /etc/backup.env

# O pacote cronie instala o binário como "crond" (com "d"), não "cron", e a
# flag de "correr em primeiro plano" é "-n", não "-f" (essa é do BusyBox/
# Debian cron) — confirmado directamente na imagem antes de fechar isto.
exec crond -n
