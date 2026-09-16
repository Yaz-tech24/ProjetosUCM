const db = require("../config/db");
const { genAI } = require("./gemini");
const quiz = require("./quiz");
const flashcards = require("./flashcards");
const { indexarMaterial } = require("./indexacao");

// "Garantir" quiz/flashcards de um material: devolve o que existe ou gera e
// guarda. Partilhado pelas rotas (pedido do aluno) e pela pré-geração em
// background — a lógica de carregar-ou-gerar vive num sítio só.
const TEXTO_MINIMO = 400;

// Dois pedidos simultâneos para o mesmo material (turma inteira a abrir o
// quiz ao mesmo tempo) partilham a mesma geração em vez de pagar duas.
const emCurso = new Map(); // chave "quiz:15" -> Promise

function partilhado(chave, fn) {
  if (emCurso.has(chave)) return emCurso.get(chave);
  const p = fn().finally(() => emCurso.delete(chave));
  emCurso.set(chave, p);
  return p;
}

async function textoDoMaterial(material) {
  if (material.tipo !== "PDF") throw Object.assign(new Error("Só disponível para documentos PDF."), { status: 400, codigo: "nao_pdf" });
  let texto = material.texto_extraido;
  if (!texto && !material.texto_indexado_em) {
    await indexarMaterial(material.id, material.url_arquivo);
    const [[actualizado]] = await db.query("SELECT texto_extraido FROM materiais WHERE id = ?", [material.id]);
    texto = actualizado?.texto_extraido;
  }
  if (!texto || texto.trim().length < TEXTO_MINIMO) {
    throw Object.assign(new Error("Este PDF não tem texto suficiente (pode ser uma digitalização)."), { status: 400, codigo: "sem_texto" });
  }
  return texto;
}

async function carregarQuiz(materialId) {
  const [[linha]] = await db.query("SELECT id, perguntas, modelo, gerado_em FROM quizzes WHERE material_id = ?", [materialId]);
  if (!linha) return null;
  const perguntas = typeof linha.perguntas === "string" ? JSON.parse(linha.perguntas) : linha.perguntas;
  return { ...linha, perguntas };
}

async function garantirQuiz(material, config, { cliente = genAI } = {}) {
  const existente = await carregarQuiz(material.id);
  if (existente) return { ...existente, gerado: false };
  return partilhado(`quiz:${material.id}`, async () => {
    const texto = await textoDoMaterial(material);
    const { perguntas, modelo } = await quiz.gerarQuiz({ nomePlataforma: config.nome_plataforma, titulo: material.titulo, cadeira: material.cadeira, texto }, cliente);
    await db.query(
      "INSERT INTO quizzes (material_id, perguntas, modelo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE perguntas = VALUES(perguntas), modelo = VALUES(modelo), gerado_em = NOW()",
      [material.id, JSON.stringify(perguntas), modelo]
    );
    return { ...(await carregarQuiz(material.id)), gerado: true };
  });
}

async function contarFlashcards(materialId) {
  const [linhas] = await db.query("SELECT COUNT(*) AS n FROM flashcards WHERE material_id = ?", [materialId]);
  return Number(linhas?.[0]?.n) || 0;
}

async function garantirFlashcards(material, config, { cliente = genAI } = {}) {
  if ((await contarFlashcards(material.id)) > 0) return { gerado: false };
  return partilhado(`flashcards:${material.id}`, async () => {
    const texto = await textoDoMaterial(material);
    const { cartoes, modelo } = await flashcards.gerarFlashcards({ nomePlataforma: config.nome_plataforma, titulo: material.titulo, cadeira: material.cadeira, texto }, cliente);
    // Só insere se entretanto ninguém gerou (outro processo/instância).
    if ((await contarFlashcards(material.id)) === 0) {
      for (const [i, c] of cartoes.entries()) {
        await db.query("INSERT INTO flashcards (material_id, ordem, frente, verso, modelo) VALUES (?, ?, ?, ?, ?)", [material.id, i, c.frente, c.verso, modelo]);
      }
    }
    return { gerado: true, total: cartoes.length, modelo };
  });
}

module.exports = { garantirQuiz, garantirFlashcards, carregarQuiz, textoDoMaterial, TEXTO_MINIMO };
