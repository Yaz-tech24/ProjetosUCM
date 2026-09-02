# Sidecar de backups automáticos da base de dados (ver docker-compose.yml,
# serviço "backup"). Corre um cron dentro da própria stack Docker Compose —
# nada de crontab manual no host.
#
# Base "mysql:8" (a mesma imagem do serviço "db") em vez de alpine+mariadb-
# client: testado e confirmado que o cliente mariadb do Alpine não consegue
# autenticar contra o MySQL 8 (falta o plugin caching_sha2_password, que é o
# método de autenticação por omissão do MySQL 8) — dá erro 1045 a ligar.
# A imagem oficial mysql:8 já traz o mysqldump certo, sem esse problema.
#
# mysql:8 assenta em Oracle Linux (não Debian) — por isso "microdnf", não
# "apt-get", para instalar o cron (pacote "cronie").
FROM mysql:8

RUN microdnf install -y cronie \
 && microdnf clean all

COPY backup-cron.sh /usr/local/bin/backup-cron.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY crontab /etc/cron.d/backup-cron

RUN chmod +x /usr/local/bin/backup-cron.sh /usr/local/bin/entrypoint.sh \
 && chmod 0644 /etc/cron.d/backup-cron

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
