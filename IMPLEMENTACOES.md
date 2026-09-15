# Funcionalidades de comunidade e segurança — estado real

Este documento descreve o que existe, como funciona e o que precisa de configuração.
Substitui a versão anterior, que listava funcionalidades como concluídas quando
várias estavam partidas ou eram apenas esboços.

## Segurança

| Funcionalidade | Como funciona | Requisitos |
|---|---|---|
| **Verificação de email** | O registo guarda um token (hash SHA-256) válido 24 h e envia o link `/verificar-email?token=…`. O login devolve `403 { email_nao_verificado: true }` até o email ser confirmado. Contas anteriores à funcionalidade são marcadas como verificadas na migração. | Só é exigida quando `SMTP_HOST/USER/PASS` estão definidos; sem SMTP as contas nascem verificadas. |
| **2FA (TOTP)** | `otplib` + QR code. Activação em `/seguranca`: gerar secret → ler QR na app → confirmar código. O login passa a devolver `{ requer_2fa, token_2fa }` (JWT de 5 min que **não** serve como sessão) e o segundo passo é `POST /api/login/2fa`. 10 tentativas/15 min por conta. | — |
| **Validação do conteúdo dos uploads** | Lê os primeiros 16 bytes e compara com a assinatura do MIME declarado (`%PDF`, `ftyp` no offset 4 para MP4/MOV, EBML, OggS). Ficheiros que não batem são apagados e rejeitados. | — |
| **Auditoria** | Tabela `auditoria` com utilizador, acção, recurso, descrição, IP. Cobre: aprovar/rejeitar/remover material, criar/remover utilizador, alterar configuração/logótipo/cursos/tags, activar/desactivar 2FA, repor senha, avaliar, comentar, subscrever. Consulta em `/analytics` → Auditoria. | — |
| **Rate limiting** | Por utilizador nas rotas autenticadas (2FA, comentários, avaliações, subscrições) e por IP nas públicas (login, registo, verificação de email). | — |
| **Anti-enumeração** | `/api/esqueci-senha` e `/api/reenviar-verificacao-email` respondem sempre da mesma forma. | — |

## Comunidade

| Funcionalidade | Onde aparece | Notas |
|---|---|---|
| **Avaliações (1–5 estrelas + comentário)** | Página do material | Uma por utilizador/material; só em materiais aprovados; paginação. |
| **Comentários** | Página do material | Até 1000 caracteres; o autor ou um admin podem remover. |
| **Reputação e Top 10** | Perfil | `10 × materiais aprovados + round(média × 5)`. Recalculada ao aprovar/rejeitar/remover material e ao avaliar. Emblemas: Confiável, Excelente Qualidade, Produtor Verificado. |
| **Subscrições a disciplinas** | Perfil | Ao aprovar um material, os subscritores da disciplina recebem email (excepto o autor). Requer SMTP. |
| **Tags** | Admin → Configurações (criar/apagar); página do material (aplicar, só admin); Repositório (filtro e etiquetas nos cartões). | — |
| **Analytics** | `/analytics` (só admin) | Resumo, por disciplina, mais populares, uploads por dia, auditoria. |

## Base de dados

As migrações vivem em `ucm-smarthub-api/db/migracoes.js` e são idempotentes
(verificam `information_schema` antes de alterar). Tabelas novas têm chaves
estrangeiras com `ON DELETE CASCADE` (auditoria: `SET NULL`), também aplicadas
a instalações onde as tabelas já existiam sem FKs.

## Testes

`npm test` na API: 116 testes (auth, 2FA, avaliações, comentários, materiais,
utilizadores, chat, rate limiting, validação). Os testes substituem `db.query`
por mocks — não precisam de MySQL.

## Variáveis de ambiente relevantes

`FRONTEND_URL` (links nos emails), `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `JWT_SECRET` (obrigatória em produção). Ver `.env.example`.
