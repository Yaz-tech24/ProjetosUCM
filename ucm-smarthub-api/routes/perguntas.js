const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitarComentarios } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { paraUrlAbsoluto } = require("../utils/urls");
const { criarNotificacao } = require("../services/notificacoes");
const { atualizarReputacao } = require("../services/reputacao");

const schemaPergunta = z.object({
  disciplina: z.string().trim().min(1, "Escolha a disciplina."),
  titulo: z.string().trim().min(8, "O título deve ter pelo menos 8 caracteres.").max(200, "Máximo 200 caracteres."),
  conteudo: z.string().trim().min(10, "Descreva a dúvida com pelo menos 10 caracteres.").max(5000, "Máximo 5000 caracteres."),
});
const schemaResposta = z.object({
  conteudo: z.string().trim().min(2, "Escreva a resposta.").max(5000, "Máximo 5000 caracteres."),
});

const SELECT_PERGUNTA = `p.id, p.disciplina, p.titulo, p.conteudo, p.resolvida, p.resposta_aceite_id, p.visualizacoes, p.criado_em, p.atualizado_em,
   p.usuario_id, u.nome AS autor, u.avatar_url AS autor_avatar,
   (SELECT COUNT(*) FROM respostas r WHERE r.pergunta_id = p.id) AS total_respostas`;

module.exports = function registarRotasPerguntas(app) {
  /**
   * @openapi
   * /api/perguntas:
   *   get:
   *     summary: Perguntas da comunidade, filtráveis por disciplina, estado e texto
   *     tags: [Perguntas]
   *     parameters:
   *       - in: query
   *         name: disciplina
   *         schema: { type: string }
   *       - in: query
   *         name: estado
   *         schema: { type: string, enum: [abertas, resolvidas] }
   *       - in: query
   *         name: busca
   *         schema: { type: string }
   *       - in: query
   *         name: page
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Lista paginada }
   *   post:
   *     summary: Faz uma pergunta numa disciplina
   *     tags: [Perguntas]
   *     responses:
   *       201: { description: Criada }
   */
  app.get("/api/perguntas", autenticar, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));
      const offset = (page - 1) * limit;
      const params = [];
      let where = "WHERE 1=1";
      if (req.query.disciplina) { where += " AND p.disciplina = ?"; params.push(String(req.query.disciplina)); }
      if (req.query.estado === "abertas") where += " AND p.resolvida = 0";
      if (req.query.estado === "resolvidas") where += " AND p.resolvida = 1";
      if (req.query.busca) { where += " AND (p.titulo LIKE ? OR p.conteudo LIKE ?)"; const t = `%${String(req.query.busca).trim()}%`; params.push(t, t); }

      const [perguntas] = await db.query(
        `SELECT ${SELECT_PERGUNTA} FROM perguntas p JOIN usuarios u ON u.id = p.usuario_id
         ${where} ORDER BY p.resolvida ASC, p.atualizado_em DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM perguntas p ${where}`, params);
      res.json({
        perguntas: perguntas.map(p => ({ ...p, autor_avatar: paraUrlAbsoluto(p.autor_avatar), conteudo: p.conteudo.slice(0, 280) })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao listar perguntas:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar perguntas." });
    }
  });

  app.post("/api/perguntas", autenticar, limitarComentarios, validar(schemaPergunta), async (req, res) => {
    try {
      const { disciplina, titulo, conteudo } = req.body;
      const [[curso]] = await db.query("SELECT id FROM cursos WHERE nome = ?", [disciplina]);
      if (!curso) return res.status(400).json({ erro: "Disciplina inválida." });
      const [r] = await db.query(
        "INSERT INTO perguntas (disciplina, usuario_id, titulo, conteudo) VALUES (?, ?, ?, ?)",
        [disciplina, req.utilizador.id, titulo, conteudo]
      );
      auditar(req.utilizador.id, "criar_pergunta", "perguntas", r.insertId, titulo, req.ip);
      res.status(201).json({ id: r.insertId, mensagem: "Pergunta publicada." });
    } catch (erro) {
      console.error("Erro ao criar pergunta:", erro.message);
      res.status(500).json({ erro: "Erro ao publicar a pergunta." });
    }
  });

  /**
   * @openapi
   * /api/perguntas/{id}:
   *   get:
   *     summary: Uma pergunta com todas as respostas (a aceite primeiro)
   *     tags: [Perguntas]
   *     responses:
   *       200: { description: Pergunta + respostas }
   *   delete:
   *     summary: Apaga a pergunta (autor ou admin)
   *     tags: [Perguntas]
   *     responses:
   *       200: { description: Apagada }
   */
  app.get("/api/perguntas/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pergunta]] = await db.query(`SELECT ${SELECT_PERGUNTA} FROM perguntas p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?`, [id]);
      if (!pergunta) return res.status(404).json({ erro: "Pergunta não encontrada." });
      db.query("UPDATE perguntas SET visualizacoes = visualizacoes + 1 WHERE id = ?", [id]).catch(() => {});
      const [respostas] = await db.query(
        `SELECT r.id, r.conteudo, r.criado_em, r.usuario_id, u.nome AS autor, u.avatar_url AS autor_avatar, u.papel AS autor_papel
         FROM respostas r JOIN usuarios u ON u.id = r.usuario_id WHERE r.pergunta_id = ?
         ORDER BY (r.id = ?) DESC, r.criado_em ASC`,
        [id, pergunta.resposta_aceite_id || 0]
      );
      res.json({
        ...pergunta,
        autor_avatar: paraUrlAbsoluto(pergunta.autor_avatar),
        respostas: respostas.map(r => ({ ...r, autor_avatar: paraUrlAbsoluto(r.autor_avatar), aceite: r.id === pergunta.resposta_aceite_id })),
      });
    } catch (erro) {
      console.error("Erro ao abrir pergunta:", erro.message);
      res.status(500).json({ erro: "Erro ao abrir a pergunta." });
    }
  });

  app.delete("/api/perguntas/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pergunta]] = await db.query("SELECT id, usuario_id, titulo FROM perguntas WHERE id = ?", [id]);
      if (!pergunta) return res.status(404).json({ erro: "Pergunta não encontrada." });
      if (pergunta.usuario_id !== req.utilizador.id && req.utilizador.papel !== "admin") {
        return res.status(403).json({ erro: "Só quem perguntou ou um administrador pode apagar." });
      }
      await db.query("DELETE FROM perguntas WHERE id = ?", [id]);
      auditar(req.utilizador.id, "apagar_pergunta", "perguntas", id, pergunta.titulo, req.ip);
      res.json({ mensagem: "Pergunta apagada." });
    } catch (erro) {
      console.error("Erro ao apagar pergunta:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar a pergunta." });
    }
  });

  /**
   * @openapi
   * /api/perguntas/{id}/respostas:
   *   post:
   *     summary: Responde a uma pergunta (notifica quem perguntou)
   *     tags: [Perguntas]
   *     responses:
   *       201: { description: Resposta publicada }
   */
  app.post("/api/perguntas/:id/respostas", autenticar, limitarComentarios, validar(schemaResposta), async (req, res) => {
    try {
      const perguntaId = parseInt(req.params.id, 10);
      const [[pergunta]] = await db.query("SELECT id, usuario_id, titulo FROM perguntas WHERE id = ?", [perguntaId]);
      if (!pergunta) return res.status(404).json({ erro: "Pergunta não encontrada." });
      const [r] = await db.query(
        "INSERT INTO respostas (pergunta_id, usuario_id, conteudo) VALUES (?, ?, ?)",
        [perguntaId, req.utilizador.id, req.body.conteudo]
      );
      await db.query("UPDATE perguntas SET atualizado_em = NOW() WHERE id = ?", [perguntaId]);
      if (pergunta.usuario_id !== req.utilizador.id) {
        await criarNotificacao(pergunta.usuario_id, { tipo: "resposta", titulo: `${req.utilizador.nome} respondeu à sua pergunta`, mensagem: pergunta.titulo, link: `/perguntas/${perguntaId}` });
      }
      res.status(201).json({ id: r.insertId, mensagem: "Resposta publicada." });
    } catch (erro) {
      console.error("Erro ao responder:", erro.message);
      res.status(500).json({ erro: "Erro ao publicar a resposta." });
    }
  });

  /**
   * @openapi
   * /api/perguntas/{id}/aceitar/{respostaId}:
   *   put:
   *     summary: Marca uma resposta como a que resolveu a pergunta (só quem perguntou). Dá reputação a quem respondeu.
   *     tags: [Perguntas]
   *     responses:
   *       200: { description: Marcada }
   */
  app.put("/api/perguntas/:id/aceitar/:respostaId", autenticar, async (req, res) => {
    try {
      const perguntaId = parseInt(req.params.id, 10);
      const respostaId = parseInt(req.params.respostaId, 10);
      const [[pergunta]] = await db.query("SELECT id, usuario_id, titulo, resposta_aceite_id FROM perguntas WHERE id = ?", [perguntaId]);
      if (!pergunta) return res.status(404).json({ erro: "Pergunta não encontrada." });
      if (pergunta.usuario_id !== req.utilizador.id) return res.status(403).json({ erro: "Só quem perguntou pode marcar a resposta que resolveu." });
      const [[resposta]] = await db.query("SELECT id, usuario_id FROM respostas WHERE id = ? AND pergunta_id = ?", [respostaId, perguntaId]);
      if (!resposta) return res.status(404).json({ erro: "Resposta não encontrada." });

      const desmarcar = pergunta.resposta_aceite_id === respostaId;
      await db.query(
        "UPDATE perguntas SET resolvida = ?, resposta_aceite_id = ? WHERE id = ?",
        [desmarcar ? 0 : 1, desmarcar ? null : respostaId, perguntaId]
      );
      if (!desmarcar && resposta.usuario_id !== req.utilizador.id) {
        criarNotificacao(resposta.usuario_id, { tipo: "resposta_aceite", titulo: "A sua resposta foi marcada como solução", mensagem: pergunta.titulo, link: `/perguntas/${perguntaId}` });
      }
      // Aguarda: quem responde vê os pontos assim que a página recarrega.
      await atualizarReputacao(resposta.usuario_id);
      res.json({ mensagem: desmarcar ? "Resposta desmarcada." : "Pergunta marcada como resolvida.", resolvida: !desmarcar });
    } catch (erro) {
      console.error("Erro ao aceitar resposta:", erro.message);
      res.status(500).json({ erro: "Erro ao marcar a resposta." });
    }
  });

  /**
   * @openapi
   * /api/respostas/{id}:
   *   delete:
   *     summary: Apaga uma resposta (autor ou admin)
   *     tags: [Perguntas]
   *     responses:
   *       200: { description: Apagada }
   */
  app.delete("/api/respostas/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[resposta]] = await db.query("SELECT id, usuario_id, pergunta_id FROM respostas WHERE id = ?", [id]);
      if (!resposta) return res.status(404).json({ erro: "Resposta não encontrada." });
      if (resposta.usuario_id !== req.utilizador.id && req.utilizador.papel !== "admin") {
        return res.status(403).json({ erro: "Só quem respondeu ou um administrador pode apagar." });
      }
      await db.query("UPDATE perguntas SET resolvida = 0, resposta_aceite_id = NULL WHERE id = ? AND resposta_aceite_id = ?", [resposta.pergunta_id, id]);
      await db.query("DELETE FROM respostas WHERE id = ?", [id]);
      atualizarReputacao(resposta.usuario_id);
      res.json({ mensagem: "Resposta apagada." });
    } catch (erro) {
      console.error("Erro ao apagar resposta:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar a resposta." });
    }
  });
};
