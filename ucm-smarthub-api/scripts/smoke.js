#!/usr/bin/env node
// Smoke test ponta-a-ponta contra um servidor a correr e a BD REAL (não usa
// mocks). Cria contas descartáveis, exercita os fluxos principais pela API
// HTTP e limpa tudo no fim. Corre localmente (npm run smoke, com a API na
// porta SMOKE_PORT) e no CI contra um MySQL de serviço.
//
//   API_URL=http://localhost:5055 node scripts/smoke.js
//
// Precisa de DESATIVAR_RATE_LIMIT=1 no servidor (faz dezenas de logins).
// Sem GEMINI_API_KEY as funcionalidades de IA são verificadas só no "503".
const path = require("path");
const fs = require("fs");
process.chdir(path.join(__dirname, ".."));
require("dotenv").config({ quiet: true });
const db = require("../config/db");
const { generate } = require("otplib");
const { emailConfigurado } = require("../services/email");

const BASE = (process.env.API_URL || `http://localhost:${process.env.SMOKE_PORT || 5055}`).replace(/\/$/, "") + "/api";
const stamp = Date.now();
const senha = "Senha12345";
const emails = { admin: `smoke-admin-${stamp}@teste.com`, a: `smoke-a-${stamp}@teste.com`, b: `smoke-b-${stamp}@teste.com` };
let falhas = 0, passos = 0;
const ok = (cond, msg, extra) => {
  passos++;
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 160) : ""));
  if (!cond) falhas++;
};
const chamar = async (metodo, caminho, corpo, token, extra = {}) => {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { ...(corpo instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined,
  });
  const tipo = r.headers.get("content-type") || "";
  let body = null;
  if (/json/.test(tipo)) { try { body = await r.json(); } catch { /* vazio */ } }
  else body = Buffer.from(await r.arrayBuffer());
  return { status: r.status, body, headers: r.headers, cookies: r.headers.get("set-cookie") || "" };
};

async function criarConta(email, papel = "estudante") {
  const [cursos] = await db.query("SELECT nome FROM cursos ORDER BY id LIMIT 1");
  const curso = cursos[0]?.nome || "Geral";
  const r = await chamar("POST", "/register", { nome: "Smoke " + papel, email, senha, curso });
  if (r.status !== 201) throw new Error(`registo de ${email} falhou: ${JSON.stringify(r.body)}`);
  const [[u]] = await db.query("SELECT id, email_verificado FROM usuarios WHERE email = ?", [email]);
  // Com SMTP configurado a conta nasce por verificar — confirma-se aqui directamente.
  await db.query("UPDATE usuarios SET email_verificado = 1, papel = ? WHERE id = ?", [papel, u.id]);
  const login = await chamar("POST", "/login", { email, senha });
  if (login.status !== 200) throw new Error(`login de ${email} falhou: ${JSON.stringify(login.body)}`);
  return { id: u.id, token: login.body.token, curso, nasceuVerificada: u.email_verificado === 1 };
}

(async () => {
  const criados = { materiais: [] };
  try {
    console.log(`Smoke contra ${BASE} (SMTP ${emailConfigurado() ? "configurado" : "ausente"}, IA ${process.env.GEMINI_API_KEY ? "configurada" : "ausente"})`);

    console.log("\n0. Saúde e migrações");
    let r = await chamar("GET", "/health");
    ok(r.status === 200 && r.body?.estado, "GET /api/health responde com estado", r.body);
    const [[mig]] = await db.query("SELECT COUNT(*) AS n FROM migracoes");
    ok(Number(mig.n) >= 19, "tabela migracoes tem as migrações registadas", { registadas: Number(mig.n) });

    console.log("\n1. Contas: registo, verificação de email, login com cookie httpOnly");
    r = await chamar("POST", "/register", { nome: "Smoke", email: emails.a, senha, curso: "Geral" });
    ok(r.status === 201, "registo devolve 201", r.body?.mensagem);
    const [[ua]] = await db.query("SELECT id, email_verificado, email_token FROM usuarios WHERE email = ?", [emails.a]);
    if (emailConfigurado()) {
      ok(ua.email_verificado === 0 && /^[0-9a-f]{64}$/.test(ua.email_token || ""), "com SMTP: conta por verificar, token em hash", { verificado: ua.email_verificado });
      r = await chamar("POST", "/login", { email: emails.a, senha });
      ok(r.status === 403 && r.body?.email_nao_verificado === true, "login bloqueado até verificar o email", r.body);
    } else {
      ok(ua.email_verificado === 1, "sem SMTP: conta nasce verificada", { verificado: ua.email_verificado });
    }
    await db.query("UPDATE usuarios SET email_verificado = 1 WHERE id = ?", [ua.id]);
    r = await chamar("POST", "/login", { email: emails.a, senha });
    ok(r.status === 200 && r.body?.token && /HttpOnly/i.test(r.cookies), "login OK com cookie httpOnly", { email: r.body?.utilizador?.email });
    const A = { id: ua.id, token: r.body.token, curso: r.body.utilizador.curso };
    const ADMIN = await criarConta(emails.admin, "admin");
    const B = await criarConta(emails.b, "estudante");
    r = await chamar("GET", "/me", null, ADMIN.token);
    ok(r.status === 200 && r.body?.utilizador?.papel === "admin" && typeof r.body.utilizador.digest_semanal === "boolean", "/me devolve papel actualizado da BD e preferência de digest", { papel: r.body?.utilizador?.papel, digest: r.body?.utilizador?.digest_semanal });

    console.log("\n2. Sessões e 2FA com códigos de recuperação");
    r = await chamar("POST", "/login", { email: emails.a, senha });
    const tokenA2 = r.body.token;
    r = await chamar("GET", "/sessoes", null, A.token);
    ok(r.status === 200 && r.body.length >= 2 && r.body.some(s => s.actual), "lista sessões e marca a actual", { total: r.body?.length });
    r = await chamar("DELETE", "/sessoes", null, A.token);
    ok(r.status === 200 && r.body.terminadas >= 1, "terminar as outras sessões", r.body);
    r = await chamar("GET", "/me", null, tokenA2);
    ok(r.status === 401, "token da sessão terminada é recusado", r.body);
    r = await chamar("POST", "/2fa/gerar-secret", null, A.token);
    const secret = r.body.secret;
    r = await chamar("POST", "/2fa/confirmar", { codigo: await generate({ secret }) }, A.token);
    ok(r.status === 200 && r.body.codigos_recuperacao?.length === 10, "activar 2FA devolve 10 códigos de recuperação");
    const codigoRec = r.body.codigos_recuperacao[0];
    r = await chamar("POST", "/login", { email: emails.a, senha });
    ok(r.status === 200 && r.body?.requer_2fa === true && !r.body?.token, "login passa a exigir 2FA", { requer_2fa: r.body?.requer_2fa });
    const token2fa = r.body.token_2fa;
    ok((await chamar("GET", "/me", null, token2fa)).status === 401, "token intermédio do 2FA não serve como sessão");
    r = await chamar("POST", "/login/2fa", { token_2fa: token2fa, codigo_recuperacao: codigoRec });
    ok(r.status === 200 && r.body?.token, "código de recuperação completa o login");
    A.token = r.body.token;
    r = await chamar("GET", "/2fa/status", null, A.token);
    ok(r.body?.codigos_restantes === 9, "código consumido (restam 9)", r.body);
    r = await chamar("POST", "/2fa/desativar", { codigo: await generate({ secret }) }, A.token);
    ok(r.status === 200, "desactivar 2FA");

    console.log("\n3. Material: upload (PDF real), moderação, aprovação, notificação a subscritores e pedidos");
    r = await chamar("POST", `/subscricoes/disciplinas/${encodeURIComponent(A.curso)}`, null, B.token);
    ok(r.status === 201, "B subscreve a disciplina");
    r = await chamar("POST", "/pedidos", { disciplina: A.curso, titulo: "Slides do capítulo smoke", descricao: "teste" }, B.token);
    ok(r.status === 201 && r.body?.id, "B pede um material na disciplina", { id: r.body?.id });
    const pedidoId = r.body.id;
    r = await chamar("GET", `/pedidos?disciplina=${encodeURIComponent(A.curso)}`, null, A.token);
    ok(r.status === 200 && r.body.pedidos.some(p => p.id === pedidoId), "pedido aparece na lista da disciplina", r.body?.pagination);
    r = await chamar("PUT", `/pedidos/${pedidoId}/apoiar`, null, A.token);
    ok(r.status === 200 && r.body.apoiei === true && r.body.apoios === 1, "A apoia o pedido (também preciso)", r.body);

    const form = new FormData();
    form.append("titulo", `Material smoke ${stamp}`);
    form.append("cadeira", A.curso);
    form.append("tipo", "PDF");
    form.append("arquivo", new Blob([fs.readFileSync(path.join(__dirname, "..", "__tests__", "fixtures", "minimo.pdf"))], { type: "application/pdf" }), "smoke.pdf");
    r = await chamar("POST", "/materiais", form, A.token);
    ok(r.status === 201 && r.body?.id_novo_material, "upload de PDF aceite", { id: r.body?.id_novo_material, status: r.body?.status });
    const materialId = r.body.id_novo_material;
    criados.materiais.push(materialId);
    const [[mat]] = await db.query("SELECT status FROM materiais WHERE id = ?", [materialId]);
    if (mat.status !== "aprovado") {
      r = await chamar("PUT", `/admin/materiais/${materialId}/status`, { acao: "aprovar" }, ADMIN.token);
      ok(r.status === 200, "admin aprova o material", r.body);
    } else ok(true, "material aprovado automaticamente pela moderação IA");
    await new Promise(res => setTimeout(res, 800)); // notificações em background
    const [notifsB] = await db.query("SELECT tipo FROM notificacoes WHERE usuario_id = ? ORDER BY id", [B.id]);
    ok(notifsB.some(n => n.tipo === "novo_material"), "B (subscritor) recebeu notificação de material novo", notifsB.map(n => n.tipo));
    ok(notifsB.some(n => n.tipo === "pedido"), "B (autor do pedido) foi avisado de material compatível", notifsB.map(n => n.tipo));

    r = await chamar("PUT", `/pedidos/${pedidoId}/atender`, { material_id: materialId }, A.token);
    ok(r.status === 200 && r.body.estado === "atendido" && r.body.material_id === materialId, "A atende o pedido com o material", { estado: r.body?.estado });
    const [[repA]] = await db.query("SELECT pontos FROM reputacao_usuarios WHERE usuario_id = ?", [A.id]);
    ok(Number(repA?.pontos) >= 13, "reputação de A: 10 (material aprovado) + 3 (pedido atendido)", repA);
    const [conqA] = await db.query("SELECT codigo FROM conquistas WHERE usuario_id = ?", [A.id]);
    ok(conqA.some(c => c.codigo === "primeiro_upload") && conqA.some(c => c.codigo === "bom_samaritano"), "conquistas de A desbloqueadas", conqA.map(c => c.codigo));

    console.log("\n4. Leitura: progresso, marcadores e notas; aberturas");
    r = await chamar("POST", `/materiais/${materialId}/acesso`, { tipo: "abertura" }, B.token);
    ok(r.status === 204, "abertura registada (204)");
    r = await chamar("PUT", `/materiais/${materialId}/leitura`, { pagina: 7, total_paginas: 20 }, B.token);
    ok(r.status === 200 && r.body.pagina === 7, "progresso guardado", r.body);
    r = await chamar("POST", `/materiais/${materialId}/anotacoes`, { pagina: 7, tipo: "marcador", texto: "Capítulo smoke", cor: "#ffd700" }, B.token);
    ok(r.status === 201 && r.body?.id, "marcador criado", { id: r.body?.id });
    const anotacaoId = r.body.id;
    r = await chamar("POST", `/materiais/${materialId}/anotacoes`, { pagina: 8, tipo: "nota", texto: "Rever a fórmula" }, B.token);
    ok(r.status === 201, "nota criada");
    r = await chamar("GET", `/materiais/${materialId}/leitura`, null, B.token);
    ok(r.body?.pagina === 7 && r.body?.anotacoes?.length === 2, "GET leitura devolve progresso + 2 anotações", { pagina: r.body?.pagina, n: r.body?.anotacoes?.length });
    ok((await chamar("GET", `/materiais/${materialId}/leitura`, null, A.token)).body?.anotacoes?.length === 0, "anotações são privadas (A não vê as de B)");
    ok((await chamar("DELETE", `/anotacoes/${anotacaoId}`, null, A.token)).status === 404, "A não consegue apagar anotação de B");
    ok((await chamar("DELETE", `/anotacoes/${anotacaoId}`, null, B.token)).status === 200, "B apaga a própria anotação");
    r = await chamar("GET", "/leituras", null, B.token);
    ok(r.status === 200 && r.body.some(l => l.id === materialId), "'continuar a ler' lista o material a meio");

    console.log("\n5. IA: flashcards, tradução e quiz (503 sem chave; com chave, geração real)");
    r = await chamar("GET", `/materiais/${materialId}/flashcards`, null, B.token);
    if (!process.env.GEMINI_API_KEY) ok(r.status === 503 || r.status === 400, "flashcards sem IA → 503 (ou 400 sem texto)", { status: r.status });
    else ok([200, 400].includes(r.status), "flashcards com IA → 200 (ou 400: PDF sem texto suficiente)", { status: r.status, erro: r.body?.erro });
    r = await chamar("GET", `/materiais/${materialId}/resumo/traducao?idioma=en`, null, B.token);
    ok([404, 503].includes(r.status), "tradução sem resumo gerado → 404 (ou 503 sem IA)", { status: r.status });
    ok((await chamar("GET", `/materiais/${materialId}/resumo/traducao?idioma=xx`, null, B.token)).status === 400 || !process.env.GEMINI_API_KEY, "idioma inválido → 400");
    r = await chamar("POST", "/flashcards/999999/revisao", { resultado: "facil" }, B.token);
    ok(r.status === 404, "revisão de cartão inexistente → 404");
    r = await chamar("GET", "/flashcards/pendentes", null, B.token);
    ok(r.status === 200 && typeof r.body.total === "number", "pendentes de flashcards responde", r.body);

    console.log("\n6. Pesquisa global, estatísticas e conquistas");
    r = await chamar("GET", `/pesquisa?q=${encodeURIComponent("smoke")}`, null, B.token);
    ok(r.status === 200 && r.body.materiais.some(m => m.id === materialId) && r.body.pedidos !== undefined, "pesquisa encontra o material", { materiais: r.body?.materiais?.length, perguntas: r.body?.perguntas?.length });
    ok(r.body.utilizadores.length === 0, "estudante não vê utilizadores na pesquisa");
    r = await chamar("GET", `/pesquisa?q=${encodeURIComponent("smoke")}`, null, ADMIN.token);
    ok(r.body.utilizadores.length >= 1, "admin vê utilizadores na pesquisa");
    r = await chamar("GET", "/perfil/estatisticas", null, B.token);
    ok(r.status === 200 && r.body.semanas.length === 8 && r.body.totais.materiais_lidos >= 1 && r.body.sequencia.actual >= 1, "estatísticas de estudo de B", { lidos: r.body?.totais?.materiais_lidos, sequencia: r.body?.sequencia });
    r = await chamar("GET", "/perfil/conquistas", null, B.token);
    ok(r.status === 200 && r.body.total >= 10 && r.body.conquistas.find(c => c.codigo === "curioso")?.progresso === 1, "conquistas de B com progresso", { obtidas: r.body?.obtidas, total: r.body?.total });
    r = await chamar("POST", "/eventos", { tipo: "offline", referencia: materialId }, B.token);
    ok(r.status === 200 && r.body.conquistas_novas.some(c => c.codigo === "leitor_offline"), "evento offline desbloqueia 'Leitor offline'", r.body?.conquistas_novas);
    r = await chamar("GET", `/utilizadores/${B.id}/conquistas`, null, A.token);
    ok(r.status === 200 && r.body.some(c => c.codigo === "leitor_offline"), "conquistas públicas de B visíveis a A");

    console.log("\n7. Chat: salas por disciplina e histórico com material");
    r = await chamar("GET", "/chat/salas", null, B.token);
    ok(r.status === 200 && r.body.disciplinas.some(d => d.sala === "disc:" + A.curso), "salas incluem a disciplina subscrita por B", r.body?.disciplinas);
    await db.query("INSERT INTO mensagens_estudantes (user_id, message, timestamp, curso, material_id) VALUES (?, 'Vejam isto', NOW(), ?, ?)", [B.id, "disc:" + A.curso, materialId]);
    r = await chamar("GET", `/chat/messages?curso=${encodeURIComponent("disc:" + A.curso)}`, null, A.token);
    ok(r.status === 200 && r.body.some(m => m.material_id === materialId && m.material_titulo), "histórico da sala de disciplina traz o cartão do material");
    ok((await chamar("GET", "/chat/messages")).status === 401, "histórico do chat exige autenticação");

    console.log("\n8. Colecções: ZIP dos PDFs");
    r = await chamar("POST", "/colecoes", { nome: "Colecção smoke", publica: true }, B.token);
    ok(r.status === 201 && r.body?.slug, "colecção pública criada", { slug: r.body?.slug });
    const slug = r.body.slug;
    r = await chamar("PUT", `/colecoes/${slug}/materiais/${materialId}`, null, B.token);
    ok(r.status === 200 || r.status === 201, "material adicionado à colecção", { status: r.status });
    r = await chamar("GET", `/colecoes/${slug}/zip`, null, A.token);
    ok(r.status === 200 && Buffer.isBuffer(r.body) && r.body.slice(0, 2).toString() === "PK" && /attachment/.test(r.headers.get("content-disposition") || ""), "ZIP válido descarregado por outro utilizador (pública)", { bytes: r.body?.length, disposition: r.headers.get("content-disposition") });
    ok(r.body.toString("latin1").includes("LEIA-ME.txt") && r.body.toString("latin1").includes("01 - Material smoke"), "ZIP contém LEIA-ME e o PDF numerado");

    console.log("\n9. Denúncias com sugestão da IA e fila do admin");
    r = await chamar("POST", `/materiais/${materialId}/comentarios`, { conteudo: "Comprem seguidores aqui http://spam.example" }, A.token);
    const comentarioId = r.body?.id;
    ok(r.status === 201, "comentário criado");
    r = await chamar("POST", "/denuncias", { tipo: "comentario", recurso_id: comentarioId, motivo: "spam", detalhes: "publicidade" }, B.token);
    ok(r.status === 201, "denúncia registada");
    r = await chamar("GET", "/admin/denuncias", null, ADMIN.token);
    const den = r.body?.denuncias?.find(d => d.recurso_id === comentarioId);
    ok(!!den && !("conteudo" in den.recurso), "fila do admin lista a denúncia sem expor o conteúdo completo", { ia_sugestao: den?.ia_sugestao, ia_classificacao: den?.ia_classificacao });
    // Depende da quota da API do Gemini — informativo, nunca falha o smoke.
    if (process.env.GEMINI_API_KEY) console.log(den?.ia_sugestao ? `  · com IA: sugestão "${den.ia_sugestao}" (${den.ia_classificacao}) — ${den.ia_motivo}` : "  · com IA: sem sugestão nesta execução (quota/erro do Gemini — ver log da API)");
    r = await chamar("PUT", `/admin/denuncias/${den.id}`, { estado: "resolvida", remover_conteudo: true }, ADMIN.token);
    ok(r.status === 200, "admin remove o conteúdo e fecha a denúncia");
    const [[com]] = await db.query("SELECT id FROM comentarios_materiais WHERE id = ?", [comentarioId]);
    ok(!com, "comentário removido");

    console.log("\n10. Sistema: digest, preferências, manutenção, saúde detalhada");
    r = await chamar("PUT", "/perfil/preferencias", { digest_semanal: false }, A.token);
    ok(r.status === 200 && r.body.digest_semanal === false, "A desliga o digest");
    r = await chamar("GET", "/admin/digest/previsualizar", null, ADMIN.token);
    ok(r.status === 200 && typeof r.body.html === "string", "pré-visualização do digest", { tem_conteudo: r.body?.tem_conteudo, resumo: r.body?.resumo });
    // Envio forçado só para as contas smoke (as outras ficam marcadas como já
    // servidas esta semana) e sem email (contas por verificar não recebem
    // email; a notificação in-app é criada na mesma) — evita spam a
    // utilizadores reais e emails para domínios inexistentes.
    await db.query("UPDATE usuarios SET ultimo_digest_em = NOW() WHERE email NOT LIKE 'smoke-%'");
    await db.query("UPDATE usuarios SET email_verificado = 0 WHERE email LIKE 'smoke-%'");
    r = await chamar("POST", "/admin/digest/enviar", null, ADMIN.token);
    ok(r.status === 200 && r.body.corrido === true && r.body.emails === 0, "envio forçado do digest corre (sem emails para contas por verificar)", r.body);
    await db.query("UPDATE usuarios SET email_verificado = 1 WHERE email LIKE 'smoke-%'");
    const [notifsDigestB] = await db.query("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND tipo = 'digest'", [B.id]);
    const [notifsDigestA] = await db.query("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND tipo = 'digest'", [A.id]);
    ok(Number(notifsDigestB[0].n) === 1 && Number(notifsDigestA[0].n) === 0, "B recebeu o digest in-app; A (opt-out) não", { B: notifsDigestB[0].n, A: notifsDigestA[0].n });
    r = await chamar("POST", "/admin/manutencao", null, ADMIN.token);
    ok(r.status === 200 && "auditoria" in r.body, "manutenção manual corre", r.body);
    r = await chamar("GET", "/admin/sistema", null, ADMIN.token);
    ok(r.status === 200 && r.body.servicos.bd.ok && "libreoffice" in r.body.servicos && r.body.servicos.migracoes.pendentes.length === 0, "estado detalhado do sistema", { estado: r.body?.estado, problemas: r.body?.problemas });
    // B, não A: numa BD vazia a primeira conta registada (A) torna-se admin automaticamente.
    ok((await chamar("GET", "/admin/sistema", null, B.token)).status === 403, "estado detalhado é só para admins");

    console.log("\n11. Eliminar conta: reputação dos autores avaliados é recalculada");
    r = await chamar("POST", `/materiais/${materialId}/avaliacoes`, { nota: 5, comentario: "smoke" }, B.token);
    ok(r.status === 201, "B avalia o material de A");
    await new Promise(res => setTimeout(res, 600)); // recálculo da reputação corre em background
    const [[repAntes]] = await db.query("SELECT pontos FROM reputacao_usuarios WHERE usuario_id = ?", [A.id]);
    ok(Number(repAntes.pontos) === 38, "A tem 10 + 3 + 25 (5 estrelas × 5)", repAntes);
    r = await chamar("DELETE", "/perfil", { senha }, B.token);
    ok(r.status === 200, "B elimina a conta", r.body);
    const [[repDepois]] = await db.query("SELECT pontos FROM reputacao_usuarios WHERE usuario_id = ?", [A.id]);
    ok(Number(repDepois.pontos) === Number(repAntes.pontos) - 25, "A perde só os 25 pontos da avaliação apagada — o pedido atendido passa à conta-sentinela", { antes: repAntes.pontos, depois: repDepois.pontos });
  } catch (e) {
    console.error("\nERRO no smoke:", e);
    falhas++;
  } finally {
    try {
      // Materiais das contas smoke (mesmo os que ficaram a meio) e os ficheiros no disco
      const [mats] = await db.query("SELECT id, url_arquivo FROM materiais WHERE autor_id IN (SELECT id FROM usuarios WHERE email IN (?, ?, ?))", [emails.admin, emails.a, emails.b]);
      for (const m of mats) {
        if (m.url_arquivo) fs.unlink(path.join(__dirname, "..", "uploads", path.basename(m.url_arquivo)), () => {});
        await db.query("DELETE FROM materiais WHERE id = ?", [m.id]);
      }
      await db.query("DELETE FROM usuarios WHERE email IN (?, ?, ?)", [emails.admin, emails.a, emails.b]);
    } catch (e) { console.error("limpeza:", e.message); }
    await db.end();
    console.log(falhas === 0 ? `\nSMOKE OK (${passos} verificações)` : `\nSMOKE com ${falhas} falha(s) em ${passos} verificações`);
    process.exit(falhas === 0 ? 0 : 1);
  }
})();
