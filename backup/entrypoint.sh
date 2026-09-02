#!/bin/sh
# Ponto de entrada do sidecar de backups: o cron do sistema (cronie) limpa
# o ambiente das tarefas que corre — não herda as variáveis de ambiente do
# container (DB_PASSWORD, etc.), ao contrário do processo principal. Por
# isso gravamos as variáveis necessárias num ficheiro que o backup-cron.sh
# lê explicitamente, em vez de assumir que chegam por herança.
set -e

env | grep -E '^(DB_NAME|DB_PASSWORD)=' > /etc/backup.env
chmod 600 /etc/backup.env

exec cron -f
