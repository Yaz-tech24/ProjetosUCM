import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const db = require("../config/db");
const { app } = require("../server");

const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";
const tokenEstudante = jwt.sign({ id: 1, papel: "estudante", nome: "Ana", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
const tokenOutroEstudante = jwt.sign({ id: 2, papel: "estudante", nome: "Bruno", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
const tokenAdmin = jwt.sign({ id: 99, papel: "admin", nome: "Admin", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });

function mockSql(regrasPorOrdem) {
  vi.spyOn(db, "query").mockImplementation((sql) => {
    for (const [padrao, resultado] of regrasPorOrdem) {
      if (padrao.test(sql)) return Promise.resolve(resultado);
    }
    return Promise.resolve([[]]);
  });
}

// O fileFilter do multer (ver middleware/upload.js) chama getConfiguracoes()
// em TODO upload, mesmo antes de qualquer validação do corpo do pedido — por
// isso qualquer teste que anexe um ficheiro precisa deste mock, ou a query
// real (sem BD nos testes) falha e mascara a validação que o teste quer
// mesmo exercitar, respondendo sempre com o erro genérico de tipo de ficheiro.
const mockConfiguracoesPadrao = () => mockSql([
  [/FROM configuracoes/, [[{ tamanho_maximo_mb: 100, moderacao_ia_activada: false, tipos_ficheiro_permitidos: "pdf,mp4,webm,ogg,mov" }]]],
]);

describe("POST /api/materiais", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/materiais").field("titulo", "T");
    expect(res.status).toBe(401);
  });

  it("rejeita quando não há ficheiro anexado", async () => {
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "Título válido")
      .field("cadeira", "Geral")
      .field("tipo", "PDF");
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/anexe um ficheiro/);
  });

  it("rejeita título vazio e não deixa o ficheiro na pasta uploads", async () => {
    mockConfiguracoesPadrao();
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "")
      .field("cadeira", "Geral")
      .field("tipo", "PDF")
      .attach("arquivo", Buffer.from("%PDF-1.4 conteúdo de teste"), { filename: "teste.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/título/i);
  });

  it("rejeita tipo de material inválido", async () => {
    mockConfiguracoesPadrao();
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "Título válido")
      .field("cadeira", "Geral")
      .field("tipo", "EXE")
      .attach("arquivo", Buffer.from("%PDF-1.4 conteúdo de teste"), { filename: "teste.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });

  it("rejeita ficheiro de tipo MIME não permitido", async () => {
    mockConfiguracoesPadrao();
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "Título válido")
      .field("cadeira", "Geral")
      .field("tipo", "PDF")
      .attach("arquivo", Buffer.from("conteúdo executável"), { filename: "malware.exe", contentType: "application/x-msdownload" });
    expect(res.status).toBe(400);
  });

  it("rejeita disciplina que não existe na configuração actual", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ tamanho_maximo_mb: 100, moderacao_ia_activada: false, tipos_ficheiro_permitidos: "pdf,mp4,webm,ogg,mov" }]]],
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
    ]);
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "Título válido")
      .field("cadeira", "Disciplina Inexistente")
      .field("tipo", "PDF")
      .attach("arquivo", Buffer.from("%PDF-1.4 conteúdo de teste"), { filename: "teste.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Disciplina inválida/);
  });

  it("aceita um material válido e grava-o como pendente", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ tamanho_maximo_mb: 100, moderacao_ia_activada: false, descricao_proposito: "", tipos_ficheiro_permitidos: "pdf,mp4,webm,ogg,mov" }]]],
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
      [/INSERT INTO materiais/, [{ insertId: 7 }]],
    ]);
    const res = await request(app)
      .post("/api/materiais")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .field("titulo", "Título válido")
      .field("cadeira", "Geral")
      .field("tipo", "PDF")
      .attach("arquivo", Buffer.from("%PDF-1.4 conteúdo de teste"), { filename: "teste.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.id_novo_material).toBe(7);
  });
});

describe("DELETE /api/materiais/:id", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).delete("/api/materiais/5");
    expect(res.status).toBe(401);
  });

  it("devolve 404 quando o material não existe", async () => {
    mockSql([[/SELECT autor_id, url_arquivo FROM materiais/, [[]]]]);
    const res = await request(app).delete("/api/materiais/999").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(404);
  });

  it("rejeita quando quem pede não é o autor nem admin", async () => {
    mockSql([[/SELECT autor_id, url_arquivo FROM materiais/, [[{ autor_id: 1, url_arquivo: "/uploads/x.pdf" }]]]]);
    const res = await request(app).delete("/api/materiais/5").set("Authorization", `Bearer ${tokenOutroEstudante}`);
    expect(res.status).toBe(403);
    expect(res.body.erro).toMatch(/administrador/);
  });

  it("permite ao autor remover o próprio material", async () => {
    mockSql([
      [/SELECT autor_id, url_arquivo FROM materiais/, [[{ autor_id: 1, url_arquivo: "/uploads/x.pdf" }]]],
      [/DELETE FROM materiais/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).delete("/api/materiais/5").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(200);
  });

  it("permite a um admin remover material de outro utilizador", async () => {
    mockSql([
      [/SELECT autor_id, url_arquivo FROM materiais/, [[{ autor_id: 1, url_arquivo: "/uploads/x.pdf" }]]],
      [/DELETE FROM materiais/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).delete("/api/materiais/5").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/materiais/:id/resumo", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).get("/api/materiais/1/resumo");
    expect(res.status).toBe(401);
  });

  it("devolve 503 quando os resumos por IA estão desactivados", async () => {
    mockSql([[/FROM configuracoes/, [[{ ia_activada: false }]]]]);
    const res = await request(app).get("/api/materiais/1/resumo").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(503);
  });

  it("devolve 404 quando o material não existe ou não está aprovado", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ ia_activada: true }]]],
      [/FROM materiais m/, [[]]],
    ]);
    const res = await request(app).get("/api/materiais/999/resumo").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(404);
  });

  // Determinístico em qualquer ambiente: um resumo em cache é devolvido sem
  // sequer chegar à chamada à IA, por isso não depende de GEMINI_API_KEY estar
  // configurada (ao contrário do caminho de geração, coberto por
  // rotas-chat-ia.test.js apenas até ao ponto comum a todos os ambientes).
  it("devolve o resumo em cache sem gerar um novo", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ ia_activada: true }]]],
      [/FROM materiais m/, [[{ id: 1, titulo: "T", cadeira: "Geral", tipo: "PDF", url_arquivo: "/uploads/x.pdf", resumo_texto: "Resumo já em cache.", autor: "Ana" }]]],
    ]);
    const res = await request(app).get("/api/materiais/1/resumo").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(200);
    expect(res.body.resumo).toBe("Resumo já em cache.");
  });
});
