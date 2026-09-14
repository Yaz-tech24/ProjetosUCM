const db = require("../config/db");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { z } = require("zod");
const validar = require("../middleware/validar");

const schemaTag = z.object({
  nome: z.string().trim().min(1, "Nome da tag é obrigatório").max(50, "Máximo 50 caracteres"),
  cor: z.string().regex(/^#[0-9a-f]{6}$/i, "Cor deve ser hex válido (ex: #ffd700)").optional().catch("#ffd700"),
});

module.exports = function registarRotasTags(app) {
  // GET: Listar todas as tags
  app.get("/api/tags", async (req, res) => {
    try {
      const [tags] = await db.query(
        `SELECT id, nome, cor, COUNT(DISTINCT mt.material_id) as quantidade
         FROM tags t
         LEFT JOIN materiais_tags mt ON t.id = mt.tag_id
         GROUP BY t.id
         ORDER BY quantidade DESC`
      );

      res.json(tags);
    } catch (erro) {
      console.error("Erro ao listar tags:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar tags." });
    }
  });

  // POST: Criar tag (admin)
  app.post("/api/admin/tags", autenticar, apenasAdmin, validar(schemaTag), async (req, res) => {
    try {
      const { nome, cor } = req.body;

      const [resultado] = await db.query(
        "INSERT INTO tags (nome, cor) VALUES (?, ?)",
        [nome, cor]
      );

      auditar(req.utilizador.id, "criar_tag", "tags", resultado.insertId, `Tag: ${nome}`, req.ip);

      res.status(201).json({
        id: resultado.insertId,
        nome,
        cor,
      });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ erro: "Esta tag já existe." });
      }
      console.error("Erro ao criar tag:", erro.message);
      res.status(500).json({ erro: "Erro ao criar tag." });
    }
  });

  // POST: Adicionar tag a um material (admin)
  app.post("/api/admin/materiais/:id/tags/:tagId", autenticar, apenasAdmin, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const tagId = parseInt(req.params.tagId, 10);

      // Verificar que material e tag existem
      const [[material]] = await db.query("SELECT id FROM materiais WHERE id = ?", [materialId]);
      const [[tag]] = await db.query("SELECT id FROM tags WHERE id = ?", [tagId]);

      if (!material || !tag) {
        return res.status(404).json({ erro: "Material ou tag não encontrado." });
      }

      try {
        await db.query(
          "INSERT INTO materiais_tags (material_id, tag_id) VALUES (?, ?)",
          [materialId, tagId]
        );
      } catch (erro) {
        if (erro.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ erro: "Esta tag já está associada ao material." });
        }
        throw erro;
      }

      auditar(req.utilizador.id, "adicionar_tag", "materiais", materialId, `Tag adicionada`, req.ip);

      res.status(201).json({ mensagem: "Tag adicionada ao material." });
    } catch (erro) {
      console.error("Erro ao adicionar tag:", erro.message);
      res.status(500).json({ erro: "Erro ao adicionar tag." });
    }
  });

  // DELETE: Remover tag de um material (admin)
  app.delete("/api/admin/materiais/:id/tags/:tagId", autenticar, apenasAdmin, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const tagId = parseInt(req.params.tagId, 10);

      const [resultado] = await db.query(
        "DELETE FROM materiais_tags WHERE material_id = ? AND tag_id = ?",
        [materialId, tagId]
      );

      if (resultado.affectedRows === 0) {
        return res.status(404).json({ erro: "Tag não encontrada neste material." });
      }

      auditar(req.utilizador.id, "remover_tag", "materiais", materialId, "Tag removida", req.ip);

      res.json({ mensagem: "Tag removida." });
    } catch (erro) {
      console.error("Erro ao remover tag:", erro.message);
      res.status(500).json({ erro: "Erro ao remover tag." });
    }
  });

  // GET: Listar tags de um material
  app.get("/api/materiais/:id/tags", async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);

      const [tags] = await db.query(
        `SELECT t.id, t.nome, t.cor FROM tags t
         JOIN materiais_tags mt ON t.id = mt.tag_id
         WHERE mt.material_id = ?
         ORDER BY t.nome`,
        [materialId]
      );

      res.json(tags);
    } catch (erro) {
      console.error("Erro ao listar tags:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar tags." });
    }
  });

  // GET: Filtrar materiais por tag
  app.get("/api/materiais/por-tag/:tagNome", async (req, res) => {
    try {
      const tagNome = req.params.tagNome.trim();
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
      const offset = (page - 1) * limit;

      const [materiais] = await db.query(
        `SELECT DISTINCT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, u.nome as autor
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         JOIN materiais_tags mt ON m.id = mt.material_id
         JOIN tags t ON mt.tag_id = t.id
         WHERE m.status = 'aprovado' AND t.nome = ?
         ORDER BY m.data_upload DESC
         LIMIT ? OFFSET ?`,
        [tagNome, limit, offset]
      );

      const [[{ total }]] = await db.query(
        `SELECT COUNT(DISTINCT m.id) as total FROM materiais m
         JOIN materiais_tags mt ON m.id = mt.material_id
         JOIN tags t ON mt.tag_id = t.id
         WHERE m.status = 'aprovado' AND t.nome = ?`,
        [tagNome]
      );

      res.json({
        materiais,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao filtrar por tag:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar materiais." });
    }
  });
};
