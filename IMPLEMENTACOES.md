# Funcionalidades — estado real

Descreve o que existe, como funciona e o que precisa de configuração.

## Segurança

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Verificação de email** | O registo guarda um token (hash SHA-256) válido 24 h e envia o link `/verificar-email?token=…`. O login devolve `403 { email_nao_verificado: true }` até o email ser confirmado. Contas anteriores à funcionalidade foram marcadas como verificadas na migração. | Só é exigida quando `SMTP_HOST/USER/PASS` estão definidos; sem SMTP as contas nascem verificadas. |
| **2FA (TOTP)** | `otplib` + QR code. Activação em `/seguranca`. O login devolve `{ requer_2fa, token_2fa }` (JWT de 5 min que **não** serve como sessão) e o segundo passo é `POST /api/login/2fa` com `codigo` (app) **ou** `codigo_recuperacao`. 10 tentativas/15 min por conta. | — |
| **Códigos de recuperação** | 10 códigos `XXXX-XXXX` de uso único, mostrados uma vez ao activar o 2FA (guardados como hash). Regeneráveis em `/seguranca` com um código da app. Usar um cria uma notificação de segurança. | — |
| **Sessões** | Cada login regista uma linha em `sessoes` (jti do JWT, dispositivo, IP, último uso). `/seguranca` lista-as e permite terminar uma ou todas as outras; mudar a palavra-passe termina as outras; o logout revoga a actual. O middleware valida o jti em cada pedido. Tokens sem jti só são aceites fora de produção. | — |
| **Eliminar conta** | `DELETE /api/perfil` com palavra-passe (+ código 2FA se activo). Materiais, comentários, perguntas e respostas passam para a conta-sentinela "Conta eliminada"; o resto é apagado em transacção. O único admin não se pode eliminar. | — |
| **Validação de uploads** | Assinatura real do ficheiro (PDF, MP4/MOV via `ftyp`, WebM, Ogg, ZIP para DOCX/PPTX, OLE para DOC/PPT). | — |
| **Auditoria** | Tabela `auditoria`; consulta em `/analytics`. Cobre moderação, utilizadores, configuração, tags, 2FA, sessões, senha, denúncias, eventos, colecções, quizzes. | — |
| **Rate limiting** | Por utilizador nas rotas autenticadas; por IP nas públicas. | — |

## Materiais

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Pesquisa no conteúdo dos PDFs** | O texto é extraído no upload (e em background para os antigos) para `materiais.texto_extraido`, com índice FULLTEXT. A pesquisa do repositório combina título (LIKE) e conteúdo (MATCH … IN BOOLEAN MODE) e devolve um trecho com a ocorrência. | MySQL 5.6+ (InnoDB FULLTEXT) |
| **Aberturas e downloads** | `POST /api/materiais/:id/acesso` (dedupe 30 min por utilizador). Contagens nos cartões, na página do material, no repositório ("Mais vistos") e no dashboard de analytics. | — |
| **Versões** | `POST /api/materiais/:id/versoes` (autor ou admin). Mantém avaliações, comentários e tags; guarda as últimas 5 versões descarregáveis; volta a passar pela moderação por IA. | — |
| **Word/PowerPoint → PDF** | DOCX/PPTX/DOC/PPT convertidos com LibreOffice headless no upload e em versões novas. Activar os tipos em Admin → Configurações. | LibreOffice no servidor (incluído no Dockerfile; `SOFFICE_PATH` opcional). Sem ele, o upload é recusado com aviso e o Admin mostra o estado. |
| **Quizzes por IA** | `GET /api/materiais/:id/quiz` gera (uma vez) 10 perguntas de escolha múltipla a partir do texto do PDF; `POST …/quiz/respostas` corrige. Passar (≥70%) vale 2 pontos de reputação por quiz. | `GEMINI_API_KEY` |
| **Leitura offline** | Botão "Offline" na página de um PDF guarda o ficheiro na Cache API do browser e mostra-o por blob URL sem rede. Lista em `/colecoes`. | Browser com Cache API |
| **PWA** | Instalável (manifest + ícones); app-shell em precache; respostas GET da API em network-first (1 h). | HTTPS em produção |

## Comunidade

| Funcionalidade | Onde | Notas |
|---|---|---|
| **Avaliações e comentários** | Página do material | Reportáveis. |
| **Reputação e Top 10** | Perfil | `10 × aprovados + round(média × 5) + 2 × quizzes passados + 5 × respostas aceites`. |
| **Subscrições** | Perfil | Notificação in-app (e email com SMTP) ao aprovar material, ao criar evento e 24 h antes de cada evento. |
| **Favoritos** | Servidor (`/api/favoritos`) | Os antigos do browser são migrados no primeiro carregamento. |
| **Colecções** | `/colecoes`, botão "Colecção" no material | Públicas partilháveis por link `/colecoes/:slug`. |
| **Perguntas e respostas** | `/perguntas` | Por disciplina; quem perguntou marca a solução; docentes têm distintivo. |
| **Notificações** | Sino no cabeçalho | Tempo real via Socket.IO (sala `user:{id}`); notificação do browser quando a aba está em fundo. |
| **Denúncias** | Botão "Reportar" em materiais, comentários, perguntas e respostas; fila em Admin → Denúncias | Fechar uma fecha todas as pendentes sobre o mesmo conteúdo; opção de remover o conteúdo. |
| **Calendário** | `/calendario` | Docentes e admins criam eventos; lembrete 24 h antes aos subscritores da disciplina (job horário). |
| **Tags** | Admin → Configurações; material; filtro no Repositório | — |
| **Analytics** | `/analytics` (admin) | Inclui aberturas/downloads. |

## Base de dados

Migrações em `ucm-smarthub-api/db/migracoes.js`, idempotentes (verificam
`information_schema`). Todas as tabelas novas têm chaves estrangeiras com
`ON DELETE CASCADE` (auditoria/denúncias/acessos: `SET NULL`).

## Testes

`npm test` na API: 135 testes com `db.query` mockado. Há ainda dois scripts de
smoke test ponta-a-ponta contra a BD real usados durante o desenvolvimento
(não fazem parte do CI).

## Variáveis de ambiente relevantes

`FRONTEND_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`GEMINI_API_KEY`, `JWT_SECRET` (obrigatória em produção), `SOFFICE_PATH`
(opcional). Ver `.env.example`.
