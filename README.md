# UCM SmartHub

Plataforma académica de partilha de materiais, chat entre estudantes e resumos automáticos por IA — totalmente configurável pelo administrador (nome, cores, logótipo, cursos e funcionalidades).

- **Frontend**: [ucm-smarthub-web](ucm-smarthub-web) — React 19 + Vite
- **Backend**: [ucm-smarthub-api](ucm-smarthub-api) — Node.js + Express 5 + MySQL

### Estrutura do backend

```
ucm-smarthub-api/
  server.js       — arranque: middlewares globais, montagem das rotas, migrações, ciclo de vida
  routes/         — um ficheiro por domínio (auth, perfil, materiais, config, stats, chat, status)
  middleware/     — autenticação JWT, validação zod, rate limiting, uploads (multer)
  schemas/        — schemas zod de validação de entrada
  services/       — integrações externas (email, IA/Gemini) e acesso à configuração da plataforma
  config/db.js    — pool de ligação MySQL
  __tests__/      — testes Vitest + Supertest
```

## Desenvolvimento local

Pré-requisito: um servidor MySQL a correr localmente (XAMPP, serviço nativo do Windows, ou um `docker run` só do serviço `db`), com a base de dados criada e o `DB_HOST`/`DB_PASSWORD` em `ucm-smarthub-api/.env` a apontar para ele — ao contrário do caminho Docker abaixo, `iniciar.ps1`/`iniciar.bat` não sobem o MySQL por si; só arrancam a API e o frontend (e agora avisam, mas não bloqueiam, se não conseguirem alcançar o MySQL antes de arrancar).

Ver `iniciar.ps1` (Windows) — arranca os dois servidores de desenvolvimento (API em `:5000`, frontend em `:5173`). Cada projecto tem também o seu próprio `.env.example`.

## Deployment (VPS com Docker)

Pré-requisitos no servidor: Docker + Docker Compose, e um domínio cujo DNS (registo A) já aponte para o IP do servidor.

1. Copiar `.env.example` para `.env` na raiz e preencher os valores — em particular `DOMAIN` (o domínio público real, ex: `smarthub.auniversidade.ac.mz`), `DB_PASSWORD`, `JWT_SECRET`, e opcionalmente `GEMINI_API_KEY`/SMTP.
2. Garantir que as portas **80 e 443** estão abertas no firewall do servidor (necessárias para o HTTPS automático).
3. Arrancar a stack:

   ```bash
   docker compose up -d --build
   ```

4. Confirmar que tudo está a correr (pode demorar um minuto na primeira vez, enquanto o Caddy pede o certificado HTTPS ao Let's Encrypt):
   - Frontend: `https://<domínio>/`
   - API: `https://<domínio>/api/status`
   - Documentação da API (Swagger): `https://<domínio>/api/docs`

A stack tem quatro serviços — ver [docker-compose.yml](docker-compose.yml):
- `db` (MySQL) e `api`/`web` não expõem portas directamente ao exterior.
- `caddy` é o único ponto de entrada (portas 80/443), serve HTTPS automático (Let's Encrypt) e encaminha `/api/*`, `/uploads/*` e `/socket.io/*` para a API, e tudo o resto para o frontend — mesmo domínio para tudo, sem problemas de CORS.

A base de dados MySQL, os ficheiros submetidos (`uploads/`) e os certificados HTTPS persistem em volumes nomeados entre reinícios/deploys.

### Testar localmente sem domínio real

Definir `DOMAIN=localhost` no `.env` e aceder a `https://localhost/` — o Caddy usa um certificado próprio (não confiável para o browser, vai pedir para aceitar o aviso) em vez de tentar obter um certificado Let's Encrypt real.

### Notas importantes

- **`VITE_API_URL` é gravado no bundle do frontend em build-time**, não é uma variável de ambiente lida em runtime pelo container `web`. Se mudar `DOMAIN` no `.env`, é preciso reconstruir a imagem do frontend (`docker compose up -d --build web`).
- Sem `GEMINI_API_KEY`, a IA (resumos, chat assistente, moderação automática) fica desactivada — o resto da aplicação continua a funcionar normalmente.
- Sem as variáveis `SMTP_*`, os emails (boas-vindas, recuperação de password, notificação de moderação) não são enviados — a app regista um aviso e continua.
- Para actualizar depois de alterações no código: `git pull && docker compose up -d --build`.
- Se preferir gerir o HTTPS com o seu próprio proxy (Cloudflare, outro nginx, etc.) em vez do Caddy incluído, remova o serviço `caddy` do `docker-compose.yml` e descomente as secções `ports:` dos serviços `api`/`web`. Se o `api` ficar exposto **directamente à Internet sem nenhum proxy à frente**, mude `app.set("trust proxy", 1)` para `false` em `server.js` — com um proxy real (Caddy ou outro) esse "1" garante que os limitadores de taxa vêem o IP verdadeiro de cada cliente em vez do IP interno do proxy; sem proxy nenhum, o mesmo ajuste deixaria um cliente malicioso falsificar o cabeçalho `X-Forwarded-For` para contornar os limites.

### Backups

O serviço `backup` do `docker-compose.yml` corre um cron dentro da própria stack e cria automaticamente, todos os dias às 03:00, uma cópia comprimida da base de dados em `backups/` (mantém as últimas 14) — não é preciso nenhum crontab manual no servidor, basta que a stack esteja de pé (`docker compose up -d`).

`./backup-db.sh` continua disponível para criar um backup manual/pontual a qualquer momento, na mesma pasta `backups/` e com a mesma política de retenção.

Para restaurar um backup:

```bash
gunzip -c backups/ucm_smarthub_20260101_030000.sql.gz | docker compose exec -T db mysql -uroot -p"$DB_PASSWORD" ucm_smarthub
```
