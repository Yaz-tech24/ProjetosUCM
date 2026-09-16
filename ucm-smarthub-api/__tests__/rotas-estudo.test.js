import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const db = require("../config/db");
const { app } = require("../server");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

const tokenDe = (id, papel = "estudante") => jwt.sign({ id, papel, nome: "Teste", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
const auth = (id, papel) => ({ Authorization: `Bearer ${tokenDe(id, papel)}` });

function mockSql(regras) {
  const chamadas = [];
  vi.spyOn(db, "query").mockImplementation((sql, params) => {
    chamadas.push({ sql, params });
    for (const [padrao, resultado] of regras) {
      if (padrao.test(sql)) return Promise.resolve(typeof resultado === "function" ? resultado(params) : resultado);
    }
    return Promise.resolve([[]]);
  });
  return chamadas;
}

const CONFIG = [[{ id: 1, nome_plataforma: "SmartHub", ia_activada: 1, moderacao_ia_activada: 1 }]];

describe("Leitura: progresso e anotações", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GET /api/materiais/:id/leitura devolve página e anotações do próprio utilizador", async () => {
    const chamadas = mockSql([
      [/FROM leituras WHERE usuario_id = \? AND material_id = \?/, [[{ pagina: 23, total_paginas: 80, atualizado_em: new Date() }]]],
      [/FROM anotacoes WHERE usuario_id = \? AND material_id = \?/, [[{ id: 1, pagina: 5, tipo: "nota", texto: "Rever fórmula", cor: null }]]],
    ]);
    const res = await request(app).get("/api/materiais/15/leitura").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.pagina).toBe(23);
    expect(res.body.anotacoes).toHaveLength(1);
    // Só as do próprio utilizador — o id vai nos parâmetros de ambas as queries
    expect(chamadas.filter(c => /FROM (leituras|anotacoes)/.test(c.sql)).every(c => c.params[0] === 3)).toBe(true);
  });

  it("PUT /api/materiais/:id/leitura guarda a página (upsert) e rejeita página inválida", async () => {
    const chamadas = mockSql([
      [/SELECT id FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 15 }]]],
      [/INSERT INTO leituras/, [{ affectedRows: 1 }]],
    ]);
    const ok = await request(app).put("/api/materiais/15/leitura").set(auth(3)).send({ pagina: 42, total_paginas: 100 });
    expect(ok.status).toBe(200);
    const insert = chamadas.find(c => /INSERT INTO leituras/.test(c.sql));
    expect(insert.params).toEqual([3, 15, 42, 100]);
    expect(insert.sql).toMatch(/ON DUPLICATE KEY UPDATE/);

    const mau = await request(app).put("/api/materiais/15/leitura").set(auth(3)).send({ pagina: 0 });
    expect(mau.status).toBe(400);
  });

  it("POST anotação cria e devolve a linha; DELETE só apaga as próprias", async () => {
    mockSql([
      [/SELECT id FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 15 }]]],
      [/SELECT COUNT\(\*\) AS total FROM anotacoes/, [[{ total: 2 }]]],
      [/INSERT INTO anotacoes/, [{ insertId: 77 }]],
      [/FROM anotacoes WHERE id = \?$/, [[{ id: 77, pagina: 3, tipo: "marcador", texto: "Capítulo 2", cor: "#ffd700" }]]],
      [/DELETE FROM anotacoes WHERE id = \? AND usuario_id = \?/, (p) => [{ affectedRows: p[1] === 3 ? 1 : 0 }]],
    ]);
    const criada = await request(app).post("/api/materiais/15/anotacoes").set(auth(3)).send({ pagina: 3, tipo: "marcador", texto: "Capítulo 2", cor: "#ffd700" });
    expect(criada.status).toBe(201);
    expect(criada.body.id).toBe(77);

    const outra = await request(app).delete("/api/anotacoes/77").set(auth(9));
    expect(outra.status).toBe(404);
    const propria = await request(app).delete("/api/anotacoes/77").set(auth(3));
    expect(propria.status).toBe(200);
  });

  it("GET /api/leituras lista só leituras por terminar", async () => {
    const chamadas = mockSql([[/FROM leituras l JOIN materiais m/, [[{ id: 15, titulo: "Cálculo", pagina: 10, total_paginas: 50 }]]]]);
    const res = await request(app).get("/api/leituras").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body[0].titulo).toBe("Cálculo");
    expect(chamadas[chamadas.length - 1].sql).toMatch(/l\.pagina < l\.total_paginas/);
  });
});

describe("Flashcards", () => {
  beforeEach(() => vi.restoreAllMocks());

  const cartoesBd = [
    { id: 1, ordem: 0, frente: "O que é uma derivada?", verso: "Taxa de variação instantânea.", facilidade: null, intervalo_dias: null, repeticoes: null, total_revisoes: null, proxima_revisao: null, ultima_revisao: null },
    { id: 2, ordem: 1, frente: "Regra da cadeia", verso: "(f∘g)' = f'(g)·g'", facilidade: 2.6, intervalo_dias: 6, repeticoes: 2, total_revisoes: 2, proxima_revisao: "2020-01-01", ultima_revisao: new Date() },
    { id: 3, ordem: 2, frente: "Integral de x", verso: "x²/2 + C", facilidade: 2.8, intervalo_dias: 30, repeticoes: 4, total_revisoes: 4, proxima_revisao: "2999-01-01", ultima_revisao: new Date() },
  ];

  it("GET devolve os cartões existentes com estado de revisão sem chamar a IA", async () => {
    mockSql([
      [/FROM configuracoes/, CONFIG],
      [/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 15, titulo: "Cálculo", cadeira: "Matemática", tipo: "PDF", texto_extraido: "x".repeat(500) }]]],
      [/FROM flashcards f/, [cartoesBd]],
    ]);
    const res = await request(app).get("/api/materiais/15/flashcards").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.resumo).toEqual({ total: 3, novos: 1, pendentes: 2, dominados: 1 });
    expect(res.body.cartoes.map(c => c.pendente)).toEqual([true, true, false]);
  });

  it("GET num vídeo responde 400 e sem texto suficiente também", async () => {
    mockSql([
      [/FROM configuracoes/, CONFIG],
      [/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 16, titulo: "Aula", cadeira: "Física", tipo: "Vídeo", texto_extraido: null, texto_indexado_em: new Date() }]]],
      [/FROM flashcards f/, [[]]],
    ]);
    const res = await request(app).get("/api/materiais/16/flashcards").set(auth(3));
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/PDF/);
  });

  it("POST revisão aplica SM-2: 'facil' na primeira vez agenda para amanhã, 'errei' recomeça", async () => {
    const chamadas = mockSql([
      [/SELECT id, material_id FROM flashcards WHERE id = \?/, [[{ id: 2, material_id: 15 }]]],
      [/FROM flashcards_revisoes WHERE usuario_id = \? AND flashcard_id = \?/, [[{ facilidade: 2.6, intervalo_dias: 6, repeticoes: 2, total_revisoes: 2 }]]],
      [/INSERT INTO flashcards_revisoes/, [{ affectedRows: 1 }]],
    ]);
    const facil = await request(app).post("/api/flashcards/2/revisao").set(auth(3)).send({ resultado: "facil" });
    expect(facil.status).toBe(200);
    expect(facil.body.intervalo_dias).toBe(Math.round(6 * 2.6)); // 16
    expect(facil.body.repeticoes).toBe(3);
    const insert = chamadas.find(c => /INSERT INTO flashcards_revisoes/.test(c.sql));
    expect(insert.params[0]).toBe(3);
    expect(insert.params[2]).toBe("2.70"); // facilidade + 0.1

    const errei = await request(app).post("/api/flashcards/2/revisao").set(auth(3)).send({ resultado: "errei" });
    expect(errei.body.intervalo_dias).toBe(1);
    expect(errei.body.repeticoes).toBe(0);

    const invalido = await request(app).post("/api/flashcards/2/revisao").set(auth(3)).send({ resultado: "mais_ou_menos" });
    expect(invalido.status).toBe(400);
  });

  it("DELETE só é permitido ao autor ou admin", async () => {
    mockSql([
      [/SELECT id, autor_id FROM materiais WHERE id = \?/, [[{ id: 15, autor_id: 5 }]]],
      [/DELETE FROM flashcards WHERE material_id/, [{ affectedRows: 12 }]],
    ]);
    expect((await request(app).delete("/api/materiais/15/flashcards").set(auth(3))).status).toBe(403);
    expect((await request(app).delete("/api/materiais/15/flashcards").set(auth(5))).status).toBe(200);
    expect((await request(app).delete("/api/materiais/15/flashcards").set(auth(1, "admin"))).status).toBe(200);
  });

  it("GET /api/flashcards/pendentes soma os pendentes por material", async () => {
    mockSql([[/FROM flashcards f\s+JOIN materiais m/, [[{ material_id: 15, titulo: "Cálculo", cadeira: "Mat", pendentes: 4, novos: 1 }, { material_id: 16, titulo: "Álgebra", cadeira: "Mat", pendentes: 2, novos: 0 }]]]]);
    const res = await request(app).get("/api/flashcards/pendentes").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.materiais).toHaveLength(2);
  });
});

describe("Pedidos de materiais", () => {
  beforeEach(() => vi.restoreAllMocks());

  const pedidoLinha = { id: 4, disciplina: "Cálculo I", titulo: "Slides do capítulo 3", descricao: null, estado: "aberto", material_id: null, usuario_id: 3, autor: "Ana", apoios: 2, apoiei: 0 };

  it("POST cria o pedido, notifica subscritores da disciplina e devolve-o", async () => {
    const chamadas = mockSql([
      [/SELECT COUNT\(\*\) AS abertos FROM pedidos_materiais/, [[{ abertos: 1 }]]],
      [/INSERT INTO pedidos_materiais/, [{ insertId: 4 }]],
      [/FROM subscricoes_disciplinas WHERE disciplina = \? AND usuario_id <> \?/, [[{ usuario_id: 8 }, { usuario_id: 9 }]]],
      [/INSERT INTO notificacoes/, [{ insertId: 1 }]],
      [/FROM pedidos_materiais p/, [[pedidoLinha]]],
    ]);
    const res = await request(app).post("/api/pedidos").set(auth(3)).send({ disciplina: "Cálculo I", titulo: "Slides do capítulo 3" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(4);
    const notificacoes = chamadas.filter(c => /INSERT INTO notificacoes/.test(c.sql));
    expect(notificacoes.map(n => n.params[0])).toEqual([8, 9]);
    expect(notificacoes[0].params[1]).toBe("pedido");
  });

  it("POST recusa títulos curtos e mais de 10 pedidos abertos", async () => {
    mockSql([[/SELECT COUNT\(\*\) AS abertos/, [[{ abertos: 10 }]]]]);
    expect((await request(app).post("/api/pedidos").set(auth(3)).send({ disciplina: "X", titulo: "abc" })).status).toBe(400);
    expect((await request(app).post("/api/pedidos").set(auth(3)).send({ disciplina: "X", titulo: "Slides completos" })).status).toBe(400);
  });

  it("PUT /apoiar alterna o apoio e recusa o próprio pedido", async () => {
    mockSql([
      [/SELECT id, usuario_id, estado FROM pedidos_materiais WHERE id = \?/, [[{ id: 4, usuario_id: 3, estado: "aberto" }]]],
      [/DELETE FROM pedidos_apoios/, [{ affectedRows: 0 }]],
      [/INSERT IGNORE INTO pedidos_apoios/, [{ affectedRows: 1 }]],
      [/SELECT COUNT\(\*\) AS apoios/, [[{ apoios: 3 }]]],
    ]);
    const proprio = await request(app).put("/api/pedidos/4/apoiar").set(auth(3));
    expect(proprio.status).toBe(400);
    const outro = await request(app).put("/api/pedidos/4/apoiar").set(auth(8));
    expect(outro.status).toBe(200);
    expect(outro.body).toEqual({ apoiei: true, apoios: 3 });
  });

  it("PUT /atender liga um material aprovado, notifica quem pediu e apoiou e dá reputação a quem atendeu", async () => {
    const chamadas = mockSql([
      [/SELECT id, usuario_id, titulo, estado FROM pedidos_materiais WHERE id = \?/, [[{ id: 4, usuario_id: 3, titulo: "Slides", estado: "aberto" }]]],
      [/SELECT id, titulo FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 15, titulo: "Cálculo — slides" }]]],
      [/UPDATE pedidos_materiais SET estado = 'atendido'/, [{ affectedRows: 1 }]],
      [/SELECT usuario_id FROM pedidos_apoios WHERE pedido_id = \?/, [[{ usuario_id: 8 }, { usuario_id: 5 }]]],
      [/INSERT INTO notificacoes/, [{ insertId: 1 }]],
      [/AS submetidos/, [[{ submetidos: 0, aprovados: 0, media: 0 }]]],
      [/AS respostas_aceites,/, [[{ quizzes: 0, respostas_aceites: 0, pedidos_atendidos: 1 }]]],
      [/INSERT INTO reputacao_usuarios/, [{ affectedRows: 1 }]],
      [/FROM pedidos_materiais p/, [[{ ...pedidoLinha, estado: "atendido", material_id: 15 }]]],
    ]);
    const res = await request(app).put("/api/pedidos/4/atender").set(auth(5)).send({ material_id: 15 });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("atendido");
    const avisados = chamadas.filter(c => /INSERT INTO notificacoes/.test(c.sql) && c.params[1] === "pedido_atendido").map(c => c.params[0]);
    expect(avisados.sort()).toEqual([3, 8]); // quem atendeu (5) não se avisa a si próprio
    // …mas ganha a conquista "bom samaritano" (1 pedido atendido)
    expect(chamadas.some(c => /INSERT IGNORE INTO conquistas/.test(c.sql) && c.params[0] === 5 && c.params[1] === "bom_samaritano")).toBe(true);
    const rep = chamadas.find(c => /INSERT INTO reputacao_usuarios/.test(c.sql));
    expect(rep.params[0]).toBe(5);
    expect(rep.params[1]).toBe(3); // 1 pedido atendido × 3 pontos
  });

  it("PUT /fechar e DELETE exigem ser o autor ou admin", async () => {
    mockSql([
      [/SELECT id, usuario_id, estado FROM pedidos_materiais WHERE id = \?/, [[{ id: 4, usuario_id: 3, estado: "aberto" }]]],
      [/SELECT id, usuario_id FROM pedidos_materiais WHERE id = \?/, [[{ id: 4, usuario_id: 3 }]]],
      [/UPDATE pedidos_materiais SET estado = 'fechado'/, [{ affectedRows: 1 }]],
      [/DELETE FROM pedidos_materiais/, [{ affectedRows: 1 }]],
    ]);
    expect((await request(app).put("/api/pedidos/4/fechar").set(auth(8))).status).toBe(403);
    expect((await request(app).put("/api/pedidos/4/fechar").set(auth(3))).status).toBe(200);
    expect((await request(app).delete("/api/pedidos/4").set(auth(8))).status).toBe(403);
    expect((await request(app).delete("/api/pedidos/4").set(auth(1, "admin"))).status).toBe(200);
  });

  it("GET lista com filtros e marca apoiei", async () => {
    const chamadas = mockSql([
      [/SELECT COUNT\(\*\) AS total FROM pedidos_materiais p/, [[{ total: 1 }]]],
      [/FROM pedidos_materiais p/, [[{ ...pedidoLinha, apoiei: 1 }]]],
    ]);
    const res = await request(app).get("/api/pedidos?disciplina=C%C3%A1lculo%20I&estado=aberto").set(auth(8));
    expect(res.status).toBe(200);
    expect(res.body.pedidos[0].apoiei).toBe(true);
    expect(res.body.pedidos[0].apoios).toBe(2);
    const lista = chamadas.find(c => /ORDER BY \(p\.estado = 'aberto'\) DESC/.test(c.sql));
    expect(lista.params.slice(0, 3)).toEqual([8, "aberto", "Cálculo I"]);
  });
});

describe("Pesquisa global", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("devolve os blocos vazios para consultas curtas sem tocar na BD", async () => {
    const chamadas = mockSql([]);
    const res = await request(app).get("/api/pesquisa?q=a").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.materiais).toEqual([]);
    expect(chamadas.filter(c => !/sessoes/.test(c.sql))).toHaveLength(0);
  });

  it("agrega materiais, perguntas, colecções, eventos e pedidos; utilizadores só para admin", async () => {
    mockSql([
      [/FROM materiais m/, [[{ id: 1, titulo: "Cálculo I — limites", cadeira: "Cálculo I", tipo: "PDF" }]]],
      [/FROM perguntas p/, [[{ id: 2, titulo: "Limite de x/x?", disciplina: "Cálculo I", resolvida: 0 }]]],
      [/FROM colecoes c/, [[{ slug: "abc", nome: "Cálculo", publica: 1 }]]],
      [/FROM eventos_calendario/, [[{ id: 3, titulo: "Teste de Cálculo", disciplina: "Cálculo I", tipo: "teste" }]]],
      [/FROM pedidos_materiais/, [[{ id: 4, titulo: "Slides Cálculo", disciplina: "Cálculo I" }]]],
      [/FROM usuarios/, [[{ id: 5, nome: "Cálculo Silva", email: "c@x.com" }]]],
    ]);
    const estudante = await request(app).get("/api/pesquisa?q=c%C3%A1lculo").set(auth(3));
    expect(estudante.status).toBe(200);
    expect(estudante.body.materiais).toHaveLength(1);
    expect(estudante.body.perguntas).toHaveLength(1);
    expect(estudante.body.colecoes).toHaveLength(1);
    expect(estudante.body.eventos).toHaveLength(1);
    expect(estudante.body.pedidos).toHaveLength(1);
    expect(estudante.body.utilizadores).toEqual([]);

    const admin = await request(app).get("/api/pesquisa?q=c%C3%A1lculo").set(auth(1, "admin"));
    expect(admin.body.utilizadores).toHaveLength(1);
  });

  it("um bloco que falha não derruba os outros", async () => {
    vi.spyOn(db, "query").mockImplementation((sql) => {
      if (/FROM materiais m/.test(sql)) return Promise.reject(new Error("FULLTEXT indisponível"));
      if (/FROM perguntas p/.test(sql)) return Promise.resolve([[{ id: 2, titulo: "x" }]]);
      return Promise.resolve([[]]);
    });
    const res = await request(app).get("/api/pesquisa?q=teste").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.materiais).toEqual([]);
    expect(res.body.perguntas).toHaveLength(1);
  });
});

describe("Estatísticas de estudo e conquistas", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GET /api/perfil/estatisticas devolve 8 semanas, totais e sequência", async () => {
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    mockSql([
      [/FROM materiais_acessos WHERE usuario_id = \? AND tipo = 'abertura' AND criado_em >= DATE_SUB/, [[{ dia: hoje, n: 3, materiais: 2 }, { dia: ontem, n: 1, materiais: 1 }]]],
      [/FROM quiz_resultados WHERE usuario_id = \? AND criado_em >= DATE_SUB/, [[{ dia: ontem, n: 1, passados: 1 }]]],
      [/FROM flashcards_revisoes WHERE usuario_id = \? AND ultima_revisao >= DATE_SUB/, [[]]],
      [/AS materiais_lidos/, [[{ materiais_lidos: 12, aberturas: 30, quizzes_feitos: 4, quizzes_passados: 3, flashcards_revistos: 50, flashcards_dominados: 5, anotacoes: 2, leituras_concluidas: 1 }]]],
    ]);
    const res = await request(app).get("/api/perfil/estatisticas").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.semanas).toHaveLength(8);
    expect(res.body.semanas[7].leituras).toBeGreaterThanOrEqual(1);
    expect(res.body.totais.materiais_lidos).toBe(12);
    expect(res.body.totais.minutos_estimados).toBe(30 * 12 + 50);
    expect(res.body.sequencia.actual).toBe(2);
    expect(res.body.dias_activos).toBe(2);
  });

  it("GET /api/perfil/conquistas verifica e devolve progresso; novas conquistas geram notificação", async () => {
    const chamadas = mockSql([
      [/AS aprovados,/, [[{ aprovados: 1, respostas_aceites: 0, quizzes_perfeitos: 0, quizzes_passados: 0, materiais_abertos: 3, offline: 0, revisoes: 0, colecoes_publicas: 0, pedidos_atendidos: 0, anotacoes: 0 }]]],
      [/SELECT codigo FROM conquistas WHERE usuario_id = \?/, [[]]],
      [/INSERT IGNORE INTO conquistas/, [{ affectedRows: 1 }]],
      [/INSERT INTO notificacoes/, [{ insertId: 1 }]],
      [/SELECT codigo, obtida_em FROM conquistas/, [[{ codigo: "primeiro_upload", obtida_em: new Date() }]]],
    ]);
    const res = await request(app).get("/api/perfil/conquistas").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(10);
    expect(res.body.obtidas).toBe(1);
    const primeiro = res.body.conquistas.find(c => c.codigo === "primeiro_upload");
    expect(primeiro.obtida).toBe(true);
    const curioso = res.body.conquistas.find(c => c.codigo === "curioso");
    expect(curioso).toMatchObject({ obtida: false, progresso: 3, alvo: 10 });
    const insert = chamadas.find(c => /INSERT IGNORE INTO conquistas/.test(c.sql));
    expect(insert.params).toEqual([3, "primeiro_upload"]);
    expect(chamadas.some(c => /INSERT INTO notificacoes/.test(c.sql) && c.params[1] === "conquista")).toBe(true);
  });

  it("POST /api/eventos regista o evento 'offline' e rejeita tipos desconhecidos", async () => {
    const chamadas = mockSql([[/INSERT IGNORE INTO eventos_utilizador/, [{ affectedRows: 1 }]]]);
    const ok = await request(app).post("/api/eventos").set(auth(3)).send({ tipo: "offline", referencia: 15 });
    expect(ok.status).toBe(200);
    expect(chamadas.find(c => /eventos_utilizador/.test(c.sql)).params).toEqual([3, "offline", 15]);
    expect((await request(app).post("/api/eventos").set(auth(3)).send({ tipo: "hack" })).status).toBe(400);
  });
});

describe("Sistema: health, digest e manutenção", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GET /api/health responde 200 com a BD ligada e 503 sem ela", async () => {
    mockSql([[/SELECT 1/, [[{ 1: 1 }]]], [/FROM migracoes/, [[]]]]);
    const ok = await request(app).get("/api/health");
    expect(ok.status).toBe(200);
    expect(ok.body.estado).toBeDefined();

    vi.spyOn(db, "query").mockRejectedValue(new Error("ECONNREFUSED"));
    const mau = await request(app).get("/api/health");
    expect(mau.status).toBe(503);
  });

  it("GET /api/admin/sistema é só para admins e detalha os serviços", async () => {
    mockSql([[/SELECT 1/, [[{ 1: 1 }]]], [/COUNT\(\*\) AS pendentes FROM materiais/, [[{ pendentes: 0 }]]], [/COUNT\(\*\) AS falhados/, [[{ falhados: 0 }]]], [/FROM migracoes/, [[]]]]);
    expect((await request(app).get("/api/admin/sistema").set(auth(3))).status).toBe(403);
    const res = await request(app).get("/api/admin/sistema").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(res.body.servicos.bd.ok).toBe(true);
    expect(res.body.servicos.indexacao.pendentes).toBe(0);
    expect(res.body.servicos).toHaveProperty("libreoffice");
    expect(res.body.servicos).toHaveProperty("backups");
  });

  it("POST /api/admin/digest/enviar força o envio e respeita ultimo_digest_em", async () => {
    const chamadas = mockSql([
      [/FROM configuracoes/, CONFIG],
      [/FROM usuarios\s+WHERE digest_semanal = 1/, [[{ id: 3, nome: "Ana", email: "a@b.com", curso: "Geral", email_verificado: 1 }]]],
      [/FROM subscricoes_disciplinas WHERE usuario_id = \?/, [[{ disciplina: "Cálculo I" }]]],
      [/FROM materiais\s+WHERE status = 'aprovado' AND data_upload >= DATE_SUB/, [[{ id: 1, titulo: "Limites", cadeira: "Cálculo I", tipo: "PDF" }]]],
      [/FROM perguntas\s+WHERE resolvida = 0/, [[]]],
      [/FROM eventos_calendario\s+WHERE data_inicio BETWEEN/, [[]]],
      [/FROM flashcards_revisoes WHERE usuario_id = \? AND proxima_revisao <= CURDATE/, [[{ n: 0 }]]],
      [/FROM pedidos_materiais\s+WHERE estado = 'aberto'/, [[]]],
      [/INSERT INTO notificacoes/, [{ insertId: 1 }]],
      [/UPDATE usuarios SET ultimo_digest_em = NOW\(\)/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).post("/api/admin/digest/enviar").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ corrido: true, elegiveis: 1, enviados: 1 });
    const seleccao = chamadas.find(c => /digest_semanal = 1/.test(c.sql));
    expect(seleccao.sql).toMatch(/ultimo_digest_em IS NULL OR ultimo_digest_em < DATE_SUB/);
    const notif = chamadas.find(c => /INSERT INTO notificacoes/.test(c.sql));
    expect(notif.params[1]).toBe("digest");
    expect(notif.params[3]).toMatch(/1 material\(is\) novo\(s\)/);
  });

  it("GET /api/admin/digest/previsualizar devolve HTML com os itens", async () => {
    mockSql([
      [/SELECT id, nome, email, curso, email_verificado FROM usuarios WHERE id = \?/, [[{ id: 1, nome: "Admin <b>", email: "a@b.com", curso: "Geral", email_verificado: 1 }]]],
      [/FROM configuracoes/, CONFIG],
      [/FROM subscricoes_disciplinas WHERE usuario_id = \?/, [[]]],
      [/SELECT COUNT\(\*\) AS n FROM materiais WHERE cadeira = \?/, [[{ n: 0 }]]],
      [/FROM materiais\s+WHERE status = 'aprovado' AND data_upload >= DATE_SUB/, [[{ id: 1, titulo: "Limites & <script>", cadeira: "Cálculo I", tipo: "PDF" }]]],
      [/FROM flashcards_revisoes WHERE usuario_id = \? AND proxima_revisao/, [[{ n: 2 }]]],
    ]);
    const res = await request(app).get("/api/admin/digest/previsualizar").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(res.body.tem_conteudo).toBe(true);
    expect(res.body.html).toContain("Limites &amp; &lt;script&gt;");
    expect(res.body.html).toContain("Admin &lt;b&gt;");
    expect(res.body.html).toContain("2</strong> flashcard");
  });

  it("POST /api/admin/manutencao corre as purgas e devolve contagens", async () => {
    const chamadas = mockSql([[/DELETE FROM/, [{ affectedRows: 4 }]]]);
    const res = await request(app).post("/api/admin/manutencao").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(res.body.auditoria).toBe(4);
    expect(chamadas.some(c => /DELETE FROM auditoria WHERE data_hora < DATE_SUB/.test(c.sql))).toBe(true);
    expect(chamadas.some(c => /DELETE FROM notificacoes WHERE lida = 1/.test(c.sql))).toBe(true);
  });

  it("GET /api/admin/ia expõe modelos, estatísticas e fila de pré-geração (só admin)", async () => {
    mockSql([]);
    expect((await request(app).get("/api/admin/ia").set(auth(3))).status).toBe(403);
    const res = await request(app).get("/api/admin/ia").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.modelos)).toBe(true);
    expect(res.body.pre_geracao).toHaveProperty("fila");
    expect(res.body).toHaveProperty("porRecurso");
  });

  it("PUT /api/perfil/preferencias guarda o opt-out do digest", async () => {
    const chamadas = mockSql([[/UPDATE usuarios SET digest_semanal/, [{ affectedRows: 1 }]]]);
    const res = await request(app).put("/api/perfil/preferencias").set(auth(3)).send({ digest_semanal: false });
    expect(res.status).toBe(200);
    expect(chamadas.find(c => /digest_semanal/.test(c.sql)).params).toEqual([0, 3]);
    expect((await request(app).put("/api/perfil/preferencias").set(auth(3)).send({})).status).toBe(400);
  });
});

describe("Chat: salas e materiais partilhados", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GET /api/chat/salas devolve cursos e disciplinas subscritas com prefixo", async () => {
    mockSql([
      [/SELECT nome FROM cursos/, [[{ nome: "Geral" }, { nome: "Informática" }]]],
      [/FROM subscricoes_disciplinas WHERE usuario_id = \?/, [[{ disciplina: "Cálculo I" }]]],
    ]);
    const res = await request(app).get("/api/chat/salas").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body.cursos).toHaveLength(2);
    expect(res.body.disciplinas).toEqual([{ nome: "Cálculo I", sala: "disc:Cálculo I" }]);
  });

  it("o histórico traz o material partilhado", async () => {
    const chamadas = mockSql([[/FROM mensagens_estudantes m/, [[{ id: 1, message: "Vejam isto", userId: 3, userName: "Ana", curso: "disc:Cálculo I", material_id: 15, material_titulo: "Limites", material_tipo: "PDF" }]]]]);
    const res = await request(app).get("/api/chat/messages?curso=disc:C%C3%A1lculo%20I").set(auth(3));
    expect(res.status).toBe(200);
    expect(res.body[0].material_titulo).toBe("Limites");
    expect(chamadas[chamadas.length - 1].sql).toMatch(/LEFT JOIN materiais mat/);
  });
});

describe("Denúncias com sugestão da IA", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("a fila expõe a classificação da IA sem o conteúdo completo", async () => {
    mockSql([
      [/FROM denuncias d/, [[{ id: 1, tipo: "comentario", recurso_id: 9, motivo: "spam", estado: "pendente", ia_classificacao: "spam", ia_sugestao: "remover", ia_motivo: "Link repetido." }]]],
      [/FROM `comentarios_materiais` WHERE id = \?/, [[{ id: 9, conteudo: "Comprem aqui http://spam", material_id: 15 }]]],
      [/SELECT COUNT\(\*\) AS total FROM denuncias/, [[{ total: 1 }]]],
      [/SELECT COUNT\(\*\) AS pendentes FROM denuncias/, [[{ pendentes: 1 }]]],
    ]);
    const res = await request(app).get("/api/admin/denuncias").set(auth(1, "admin"));
    expect(res.status).toBe(200);
    expect(res.body.denuncias[0]).toMatchObject({ ia_sugestao: "remover", ia_classificacao: "spam" });
    expect(res.body.denuncias[0].recurso).not.toHaveProperty("conteudo");
    expect(res.body.denuncias[0].recurso.resumo).toContain("Comprem");
  });
});

describe("Colecções: exportar ZIP", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("recusa colecções privadas de outros e devolve 404 sem PDFs", async () => {
    mockSql([
      [/FROM colecoes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.slug = \?/, [[{ id: 1, nome: "Privada", publica: 0, usuario_id: 3, dono: "Ana" }]]],
      [/FROM colecoes_materiais cm/, [[{ id: 16, titulo: "Aula", tipo: "Vídeo", url_arquivo: "/uploads/x.mp4" }]]],
    ]);
    expect((await request(app).get("/api/colecoes/abc/zip").set(auth(8))).status).toBe(404);
    const semPdf = await request(app).get("/api/colecoes/abc/zip").set(auth(3));
    expect(semPdf.status).toBe(404);
    expect(semPdf.body.erro).toMatch(/PDFs/);
  });

  it("gera um zip válido com os PDFs existentes e um LEIA-ME", async () => {
    const fs = require("fs");
    const path = require("path");
    const { uploadsDir } = require("../middleware/upload");
    const nome = `teste-zip-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(uploadsDir, nome), "%PDF-1.4\n%teste\n");
    try {
      mockSql([
        [/FROM colecoes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.slug = \?/, [[{ id: 1, nome: "Cálculo: Semestre 1", publica: 1, usuario_id: 3, dono: "Ana" }]]],
        [/FROM colecoes_materiais cm/, [[
          { id: 15, titulo: "Limites & Derivadas", cadeira: "Cálculo I", tipo: "PDF", url_arquivo: `/uploads/${nome}`, autor: "Ana" },
          { id: 17, titulo: "Apagado", cadeira: "Cálculo I", tipo: "PDF", url_arquivo: "/uploads/nao-existe.pdf", autor: "Ana" },
        ]]],
      ]);
      const res = await request(app).get("/api/colecoes/abc/zip").set(auth(8)).buffer(true).parse((r, cb) => { const partes = []; r.on("data", d => partes.push(d)); r.on("end", () => cb(null, Buffer.concat(partes))); });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["content-disposition"]).toContain('filename="Calculo Semestre 1.zip"');
      expect(res.body.slice(0, 2).toString()).toBe("PK");
      const conteudo = res.body.toString("latin1");
      expect(conteudo).toContain("01 - Limites Derivadas.pdf");
      expect(conteudo).toContain("LEIA-ME.txt");
    } finally {
      fs.unlinkSync(path.join(uploadsDir, nome));
    }
  });
});
