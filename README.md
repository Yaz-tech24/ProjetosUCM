# UCM SmartHub

Plataforma académica de partilha de materiais, chat entre estudantes e resumos automáticos por IA — totalmente configurável pelo administrador (nome, cores, logótipo, cursos e funcionalidades).

- **Frontend**: [ucm-smarthub-web](ucm-smarthub-web) — React 19 + Vite
- **Backend**: [ucm-smarthub-api](ucm-smarthub-api) — Node.js + Express 5 + MySQL

## Desenvolvimento local

Ver `iniciar.ps1` (Windows) — arranca os dois servidores de desenvolvimento (API em `:5000`, frontend em `:5173`). Cada projecto tem também o seu próprio `.env.example`.

## Deployment (VPS com Docker)

Pré-requisitos no servidor: Docker + Docker Compose.

1. Copiar `.env.example` para `.env` na raiz e preencher os valores (password da base de dados, `JWT_SECRET`, URLs públicas, e opcionalmente `GEMINI_API_KEY`/SMTP).
2. Arrancar a stack:

   ```bash
   docker compose up -d --build
   ```

3. Confirmar que tudo está a correr:
   - Frontend: `http://<servidor>/`
   - API: `http://<servidor>:5000/api/status`
   - Documentação da API (Swagger): `http://<servidor>:5000/api/docs`

A stack tem três serviços (`db`, `api`, `web`) — ver [docker-compose.yml](docker-compose.yml). A base de dados MySQL e os ficheiros submetidos (`uploads/`) persistem em volumes nomeados entre reinícios/deploys.

### Notas importantes

- **`VITE_API_URL` é gravado no bundle do frontend em build-time**, não é uma variável de ambiente lida em runtime pelo container `web`. Se mudar `API_URL` no `.env`, é preciso reconstruir a imagem do frontend (`docker compose up -d --build web`).
- Sem `GEMINI_API_KEY`, a IA (resumos, chat assistente, moderação automática) fica desactivada — o resto da aplicação continua a funcionar normalmente.
- Sem as variáveis `SMTP_*`, os emails (boas-vindas, recuperação de password, notificação de moderação) não são enviados — a app regista um aviso e continua.
- Para actualizar depois de alterações no código: `git pull && docker compose up -d --build`.
