# Funcionalidades — estado real

Descreve o que existe, como funciona e o que precisa de configuração.

## Segurança

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Verificação de email** | O registo guarda um token (hash SHA-256) válido 24 h e envia o link `/verificar-email?token=…`. O login devolve `403 { email_nao_verificado: true }` até o email ser confirmado. Contas anteriores à funcionalidade foram marcadas como verificadas na migração. | Só é exigida quando `SMTP_HOST/USER/PASS` estão definidos; sem SMTP as contas nascem verificadas. |
| **2FA (TOTP)** | `otplib` + QR code. Activação em `/seguranca`. O login devolve `{ requer_2fa, token_2fa }` (JWT de 5 min que **não** serve como sessão) e o segundo passo é `POST /api/login/2fa` com `codigo` (app) **ou** `codigo_recuperacao`. 10 tentativas/15 min por conta. | — |
| **Códigos de recuperação** | 10 códigos `XXXX-XXXX` de uso único, mostrados uma vez ao activar o 2FA (guardados como hash). Regeneráveis em `/seguranca` com um código da app. Usar um cria uma notificação de segurança. | — |
| **Sessões** | Cada login regista uma linha em `sessoes` (jti do JWT, dispositivo, IP, último uso). `/seguranca` lista-as e permite terminar uma ou todas as outras; mudar a palavra-passe termina as outras; o logout revoga a actual. O middleware valida o jti em cada pedido e refresca o papel/curso da BD. Tokens sem jti só são aceites fora de produção. | — |
| **Eliminar conta** | `DELETE /api/perfil` com palavra-passe (+ código 2FA se activo). Materiais, comentários, perguntas, respostas e pedidos passam para a conta-sentinela "Conta eliminada"; o resto é apagado em transacção; a reputação dos autores que o utilizador avaliou é recalculada. O único admin não se pode eliminar. | — |
| **Validação de uploads** | Assinatura real do ficheiro (PDF, MP4/MOV via `ftyp`, WebM, Ogg, ZIP para DOCX/PPTX, OLE para DOC/PPT). | — |
| **Auditoria** | Tabela `auditoria`; consulta em `/analytics`. Purgada ao fim de `RETENCAO_AUDITORIA_DIAS` (365). | — |
| **Rate limiting** | Por utilizador nas rotas autenticadas; por IP nas públicas. `DESATIVAR_RATE_LIMIT=1` só fora de produção. | — |

## Materiais e estudo

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Pesquisa no conteúdo dos PDFs** | O texto é extraído no upload (e em background para os antigos) para `materiais.texto_extraido`, com índice FULLTEXT. A pesquisa do repositório combina título (LIKE) e conteúdo (MATCH … IN BOOLEAN MODE) e devolve um trecho com a ocorrência. | MySQL 5.6+ (InnoDB FULLTEXT) |
| **Pesquisa global (Ctrl+K)** | `GET /api/pesquisa?q=` devolve até 5 materiais, perguntas, colecções, eventos e pedidos (utilizadores só para admins). Paleta no cabeçalho com navegação por teclado; sem resultados oferece "pedir este material". | — |
| **Aberturas e downloads** | `POST /api/materiais/:id/acesso` (dedupe 30 min por utilizador). Contagens nos cartões, na página do material, no repositório ("Mais vistos") e no dashboard de analytics. | — |
| **Leitura: progresso, marcadores e notas** | Separador "Leitura" na página do PDF: página onde ficou (`PUT /api/materiais/:id/leitura`), marcadores e notas por página (`/api/materiais/:id/anotacoes`), tudo privado. Ao reabrir, o PDF abre em `#page=N`. "Continuar a ler" no painel inicial (`GET /api/leituras`). O visualizador é o do browser, por isso a página é indicada pelo aluno. | — |
| **Versões** | `POST /api/materiais/:id/versoes` (autor ou admin). Mantém avaliações, comentários e tags; guarda as últimas 5 versões descarregáveis (ficheiros apagados com o material); volta a passar pela moderação por IA. | — |
| **Word/PowerPoint → PDF** | DOCX/PPTX/DOC/PPT convertidos com LibreOffice headless no upload e em versões novas. Activar os tipos em Admin → Configurações. Testado de verdade no CI (job `conversao`) e na imagem Docker. | LibreOffice no servidor (incluído no Dockerfile; `SOFFICE_PATH` opcional). Sem ele, o upload é recusado com aviso e o Admin mostra o estado. |
| **Resumo por IA** | Gerado uma vez e guardado em `materiais.resumo_texto`; viaja com a cópia offline. Botão **EN/PT** traduz o resumo (`GET /api/materiais/:id/resumo/traducao?idioma=en`, cache em `traducoes` invalidada quando o resumo muda). | `GEMINI_API_KEY` |
| **Perguntar ao documento** | `POST /api/materiais/:id/chat` usa o texto indexado (sem reextrair o PDF) e recebe as últimas 6 trocas como contexto. | `GEMINI_API_KEY` |
| **Quizzes por IA** | `GET /api/materiais/:id/quiz` gera (uma vez) 10 perguntas de escolha múltipla; `POST …/quiz/respostas` corrige. Passar (≥70%) vale 2 pontos de reputação por quiz. | `GEMINI_API_KEY` |
| **Flashcards (repetição espaçada)** | `GET /api/materiais/:id/flashcards` gera (uma vez) 20 cartões a partir do PDF; `POST /api/flashcards/:id/revisao` com `errei/dificil/facil` aplica SM-2 simplificado (facilidade e intervalo por utilizador). "Revisões de hoje" no painel inicial (`GET /api/flashcards/pendentes`). Autor/admin podem regenerar. | `GEMINI_API_KEY` |
| **Leitura offline** | Botão "Offline" na página de um PDF guarda o ficheiro na Cache API e o resumo no localStorage; sem rede mostra os dois. Lista em `/colecoes`. Sem rede a sessão em cache não é terminada. | Browser com Cache API |
| **PWA** | Instalável (manifest + ícones); app-shell em precache; respostas GET da API em network-first (1 h), cache limpa no logout. | HTTPS em produção |

## Comunidade

| Funcionalidade | Onde | Notas |
|---|---|---|
| **Avaliações e comentários** | Página do material | Reportáveis. |
| **Reputação e Top 10** | Perfil | `10 × aprovados + round(média × 5) + 2 × quizzes passados + 5 × respostas aceites + 3 × pedidos atendidos`. |
| **Conquistas** | Perfil (`GET /api/perfil/conquistas`) | 16 emblemas calculados a partir das tabelas de origem (uploads, respostas aceites, quizzes, materiais abertos, offline, revisões, sequência de dias, colecções, pedidos, anotações). Nunca se perdem; cada nova gera notificação. Públicas entre utilizadores (`GET /api/utilizadores/:id/conquistas`). |
| **Estatísticas de estudo** | Perfil (`GET /api/perfil/estatisticas`) | 8 semanas de leituras/quizzes/revisões, totais, tempo estimado (12 min por abertura + 1 por revisão) e sequência de dias seguidos. |
| **Pedidos de materiais** | `/pedidos` | "Alguém tem…?" por disciplina; "também preciso" (apoios); quem tiver o material liga-o ao pedido (3 pontos + conquista). Subscritores da disciplina são avisados ao criar; quem pediu é avisado quando entra um material aprovado na disciplina. |
| **Subscrições** | Perfil | Notificação in-app (e email com SMTP) ao aprovar material, ao criar evento e 24 h antes de cada evento. |
| **Digest semanal** | Perfil (interruptor) · Admin → Sistema | Uma vez por semana (`DIGEST_DIA_SEMANA`/`DIGEST_HORA`, por defeito segunda às 07:00): materiais novos, perguntas sem resposta, pedidos e eventos das disciplinas subscritas (ou do curso), mais flashcards pendentes. Notificação in-app sempre; email com SMTP. Só é enviado quando há conteúdo; `ultimo_digest_em` evita repetições. Admin pode pré-visualizar e forçar o envio. |
| **Favoritos** | Servidor (`/api/favoritos`) | Os antigos do browser são migrados no primeiro carregamento. |
| **Colecções** | `/colecoes`, botão "Colecção" no material | Públicas partilháveis por link `/colecoes/:slug`. **Exportar ZIP** (`GET /api/colecoes/:slug/zip`): PDFs numerados + `LEIA-ME.txt`, em streaming, limite `ZIP_LIMITE_MB` (300), 10/hora por utilizador. |
| **Perguntas e respostas** | `/perguntas` | Por disciplina; quem perguntou marca a solução; docentes têm distintivo. |
| **Chat** | `/chat` | Uma única ligação Socket.IO partilhada com o sino de notificações. Salas por curso **e por disciplina subscrita** (`GET /api/chat/salas`, sala `disc:<disciplina>`). Botão de clip partilha um material do repositório como cartão clicável (só o id vai do cliente; título/tipo vêm da BD). |
| **Notificações** | Sino no cabeçalho | Tempo real via Socket.IO (sala `user:{id}`); notificação do browser quando a aba está em fundo. Lidas com mais de 90 dias são purgadas. |
| **Denúncias** | Botão "Reportar" em materiais, comentários, perguntas e respostas; fila em Admin → Denúncias | Fechar uma fecha todas as pendentes sobre o mesmo conteúdo; opção de remover o conteúdo. **Moderação assistida**: ao reportar comentários/perguntas/respostas, o Gemini classifica (spam, ofensivo, assédio, …) e sugere remover/ignorar/rever — só orienta; o admin decide. |
| **Calendário** | `/calendario` | Docentes e admins criam eventos; lembrete 24 h antes aos subscritores da disciplina (job horário). |
| **Tags** | Admin → Configurações; material; filtro no Repositório | — |
| **Analytics** | `/analytics` (admin) | Inclui aberturas/downloads. |

## Operação

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Saúde e alertas** | `GET /api/health` (público, 503 se a BD estiver em baixo) e `GET /api/admin/sistema` (Admin → Sistema): BD e latência, LibreOffice, fila de indexação, disco livre, idade do último backup, migrações, IA, SMTP. O monitor corre a cada 5 min e, à 2.ª falha seguida, avisa os admins (notificação + email), no máximo uma vez por 6 h por problema, e avisa quando resolve. | `BACKUPS_DIR` para vigiar backups (o docker-compose já o define); `DISCO_MIN_MB`, `BACKUP_MAX_HORAS`. |
| **Limpeza diária** | Sessões expiradas (30 d), registos de acesso (2 anos), auditoria e denúncias fechadas (`RETENCAO_AUDITORIA_DIAS`), notificações lidas (`RETENCAO_NOTIFICACOES_DIAS`), eventos passados (`RETENCAO_EVENTOS_DIAS`). Accionável em Admin → Sistema. | — |
| **Backups** | Serviço `backup` do docker-compose: dump diário às 03:00 (`--single-transaction`; um `mysqldump` falhado **aborta** em vez de deixar um ficheiro vazio), espelho diário dos uploads em `backups/uploads`, snapshot `uploads_AAAAMMDD.tar.gz` ao domingo (mantém 4), e **prova de restauro** à segunda (`verificar-backup.sh`: repõe o último dump numa BD temporária e conta tabelas). Restauro completo com `./restaurar-backup.sh`. Testado ponta-a-ponta em Docker (backup → verificação → drop → restauro → 36 tabelas, uploads repostos). | Docker Compose |
| **Migrações** | `ucm-smarthub-api/db/migracoes.js`: lista nomeada, cada uma corre uma vez e fica registada em `migracoes` (com duração). Continuam idempotentes por dentro para servir bases de dados anteriores ao registo. A 0019 corrige a FK de `auditoria` do esquema base (sem `ON DELETE SET NULL`, eliminar contas falhava em instalações novas). | — |

## Base de dados

Migrações em `ucm-smarthub-api/db/migracoes.js` (19), idempotentes (verificam
`information_schema`) e registadas na tabela `migracoes`. Todas as tabelas novas
têm chaves estrangeiras com `ON DELETE CASCADE` (auditoria/denúncias/acessos/
pedidos: `SET NULL`).

## Testes e CI

- `npm test` na API: 184 testes com `db.query` mockado (+2 de conversão real, saltados sem LibreOffice); no frontend, 44 (Vitest).
- `npm run smoke` na API: 70–72 verificações ponta-a-ponta contra uma API a correr e a BD real (contas descartáveis, limpas no fim).
- `npm run fluxos` no frontend: 21 verificações de UI em Chromium headless sobre o build de produção (login 2FA, paleta, pedidos, leitura, offline).
- CI (GitHub Actions, Node 22 = Dockerfile): testes unitários API/Web, lint e build, conversão DOCX→PDF com LibreOffice real, smoke contra MySQL 8 de serviço (com verificação de idempotência das migrações) e fluxos de UI com screenshots como artefacto.

## Variáveis de ambiente relevantes

`FRONTEND_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`GEMINI_API_KEY`, `JWT_SECRET` (obrigatória em produção), `SOFFICE_PATH`,
`DB_PORT`, `BACKUPS_DIR`, `BACKUP_MAX_HORAS`, `DISCO_MIN_MB`, `DIGEST_DIA_SEMANA`,
`DIGEST_HORA`, `RETENCAO_*_DIAS`, `ZIP_LIMITE_MB`, `DESATIVAR_RATE_LIMIT` (só dev).
Ver `.env.example`.
