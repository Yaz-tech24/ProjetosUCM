const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitarAvaliacoes } = require("../middleware/rateLimiters");
const { verificarConquistas } = require("../services/conquistas");

// Progresso de leitura (página onde ficou) e anotações por página — tudo
// privado de cada utilizador. O visualizador usa `#page=N` no iframe do PDF
// para retomar; os marcadores e notas vivem num separador ao lado.
const schemaProgresso = z.object({
  pagina: z.coerce.number().int().min(1).max(100000),
  total_paginas: z.coerce.number().int().min(1).max(100000).optional().nullable(),
});

const schemaAnotacao = z.object({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  tipo: z.enum(["marcador", "nota"]).default("nota"),
  texto: z.string().trim().min(1, "A anotação não pode estar vazia.").max(2000, "Máximo 2000 caracteres."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.").optional().nullable(),
});

const schemaAnotacaoEdicao = schemaAnotacao.partial().refine(d => Object.keys(d).length > 0, { message: "Nada para actualizar." });

module.exports = function registarRotasLeitura(app) {
  /**
   * @openapi
   * /api/materiais/{id}/leitura:
   *   get:
   *     summary: Progresso de leitura e anotações do utilizador neste material
   *     tags: [Leitura]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: "{ pagina, total_paginas, atualizado_em, anotacoes[] }" }
   *   put:
   *     summary: Guarda a página onde o utilizador ficou
   *     tags: [Leitura]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [pagina], properties: { pagina: { type: integer }, total_paginas: { type: integer } } }
   *     responses:
   *       200: { description: Guardado }
   */
  app.get("/api/materiais/:id/leitura", autenticar, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [[progresso]] = await db.query(
        "SELECT pagina, total_paginas, atualizado_em FROM leituras WHERE usuario_id = ? AND material_id = ?",
        [req.utilizador.id, materialId]
      );
      const [anotacoes] = await db.query(
        "SELECT id, pagina, tipo, texto, cor, criado_em, atualizado_em FROM anotacoes WHERE usuario_id = ? AND material_id = ? ORDER BY pagina ASC, criado_em ASC",
        [req.utilizador.id, materialId]
      );
      res.json({
        pagina: progresso?.pagina || null,
        total_paginas: progresso?.total_paginas || null,
        atualizado_em: progresso?.atualizado_em || null,
        anotacoes,
      });
    } catch (erro) {
      console.error("Erro ao ler progresso:", erro.message);
      res.status(500).json({ erro: "Erro ao carregar a leitura." });
    }
  });

  app.put("/api/materiais/:id/leitura", autenticar, limitarAvaliacoes, validar(schemaProgresso), async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [[material]] = await db.query("SELECT id FROM materiais WHERE id = ? AND status = 'aprovado'", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      const { pagina, total_paginas } = req.body;
      await db.query(
        `INSERT INTO leituras (usuario_id, material_id, pagina, total_paginas) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pagina = VALUES(pagina), total_paginas = COALESCE(VALUES(total_paginas), total_paginas), atualizado_em = NOW()`,
        [req.utilizador.id, materialId, pagina, total_paginas || null]
      );
      res.json({ pagina, total_paginas: total_paginas || null });
    } catch (erro) {
      console.error("Erro ao guardar progresso:", erro.message);
      res.status(500).json({ erro: "Erro ao guardar a página." });
    }
  });

  /**
   * @openapi
   * /api/leituras:
   *   get:
   *     summary: Materiais em leitura (para "continuar a ler" no painel inicial)
   *     tags: [Leitura]
   *     responses:
   *       200: { description: Até 6 materiais com a página onde o utilizador ficou }
   */
  app.get("/api/leituras", autenticar, async (req, res) => {
    try {
      const [linhas] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, l.pagina, l.total_paginas, l.atualizado_em
         FROM leituras l JOIN materiais m ON m.id = l.material_id AND m.status = 'aprovado'
         WHERE l.usuario_id = ? AND (l.total_paginas IS NULL OR l.pagina < l.total_paginas)
         ORDER BY l.atualizado_em DESC LIMIT 6`,
        [req.utilizador.id]
      );
      res.json(linhas);
    } catch (erro) {
      console.error("Erro ao listar leituras:", erro.message);
      res.status(500).json({ erro: "Erro ao listar leituras." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/anotacoes:
   *   post:
   *     summary: Cria um marcador ou nota numa página do material
   *     tags: [Leitura]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [texto], properties: { pagina: { type: integer }, tipo: { type: string, enum: [marcador, nota] }, texto: { type: string }, cor: { type: string } } }
   *     responses:
   *       201: { description: Anotação criada }
   * /api/anotacoes/{id}:
   *   put:
   *     summary: Edita uma anotação própria
   *     tags: [Leitura]
   *     responses:
   *       200: { description: Actualizada }
   *   delete:
   *     summary: Apaga uma anotação própria
   *     tags: [Leitura]
   *     responses:
   *       200: { description: Apagada }
   */
  app.post("/api/materiais/:id/anotacoes", autenticar, limitarAvaliacoes, validar(schemaAnotacao), async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [[material]] = await db.query("SELECT id FROM materiais WHERE id = ? AND status = 'aprovado'", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM anotacoes WHERE usuario_id = ? AND material_id = ?", [req.utilizador.id, materialId]);
      if (Number(total) >= 200) return res.status(400).json({ erro: "Limite de 200 anotações por material atingido." });
      const { pagina, tipo, texto, cor } = req.body;
      const [r] = await db.query(
        "INSERT INTO anotacoes (usuario_id, material_id, pagina, tipo, texto, cor) VALUES (?, ?, ?, ?, ?, ?)",
        [req.utilizador.id, materialId, pagina, tipo, texto, cor || null]
      );
      const [[criada]] = await db.query("SELECT id, pagina, tipo, texto, cor, criado_em, atualizado_em FROM anotacoes WHERE id = ?", [r.insertId]);
      verificarConquistas(req.utilizador.id).catch(() => {});
      res.status(201).json(criada);
    } catch (erro) {
      console.error("Erro ao criar anotação:", erro.message);
      res.status(500).json({ erro: "Erro ao guardar a anotação." });
    }
  });

  app.put("/api/anotacoes/:id", autenticar, validar(schemaAnotacaoEdicao), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[anotacao]] = await db.query("SELECT id FROM anotacoes WHERE id = ? AND usuario_id = ?", [id, req.utilizador.id]);
      if (!anotacao) return res.status(404).json({ erro: "Anotação não encontrada." });
      const campos = [];
      const valores = [];
      for (const c of ["pagina", "tipo", "texto", "cor"]) {
        if (req.body[c] !== undefined) { campos.push(`\`${c}\` = ?`); valores.push(req.body[c]); }
      }
      await db.query(`UPDATE anotacoes SET ${campos.join(", ")} WHERE id = ?`, [...valores, id]);
      const [[actualizada]] = await db.query("SELECT id, pagina, tipo, texto, cor, criado_em, atualizado_em FROM anotacoes WHERE id = ?", [id]);
      res.json(actualizada);
    } catch (erro) {
      console.error("Erro ao editar anotação:", erro.message);
      res.status(500).json({ erro: "Erro ao editar a anotação." });
    }
  });

  app.delete("/api/anotacoes/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [r] = await db.query("DELETE FROM anotacoes WHERE id = ? AND usuario_id = ?", [id, req.utilizador.id]);
      if (!r.affectedRows) return res.status(404).json({ erro: "Anotação não encontrada." });
      res.json({ mensagem: "Anotação apagada." });
    } catch (erro) {
      console.error("Erro ao apagar anotação:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar a anotação." });
    }
  });
};
