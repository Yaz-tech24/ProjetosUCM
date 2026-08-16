const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const { getConfiguracoes, getCursos } = require("../services/plataforma");
const { paraUrlAbsoluto } = require("../utils/urls");
const validar = require("../middleware/validar");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { uploadsDir, uploadLogo } = require("../middleware/upload");
const { schemaConfig, schemaCurso } = require("../schemas");

module.exports = function registarRotasConfig(app) {
  // ==========================================
  // CONFIGURAÇÃO DA PLATAFORMA — identidade, cores, funcionalidades, cursos
  // ==========================================
  /**
   * @openapi
   * /api/config:
   *   get:
   *     summary: Devolve a configuração pública da plataforma e a lista de cursos
   *     tags: [Configuração]
   *     security: []
   *     responses:
   *       200:
   *         description: Configuração actual
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 configuracoes: { $ref: '#/components/schemas/Configuracao' }
   *                 cursos: { type: array, items: { $ref: '#/components/schemas/Curso' } }
   */
  app.get("/api/config", async (req, res) => {
    try {
      const [configuracoes, cursos] = await Promise.all([getConfiguracoes(), getCursos()]);
      res.json({ configuracoes, cursos });
    } catch (erro) {
      console.error("Erro ao buscar configuração:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar configuração." });
    }
  });

  /**
   * @openapi
   * /api/admin/config:
   *   put:
   *     summary: Actualiza a configuração da plataforma (admin)
   *     tags: [Admin]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/Configuracao' }
   *     responses:
   *       200: { description: Configuração actualizada }
   *       400: { description: Dados inválidos, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.put("/api/admin/config", autenticar, apenasAdmin, validar(schemaConfig), async (req, res) => {
    try {
      const {
        nome_plataforma, tagline, descricao_proposito, cor_primaria, cor_destaque,
        contacto_email, localizacao, link_facebook, link_instagram, link_linkedin,
        chat_activado, ia_activada, moderacao_ia_activada,
        tipos_ficheiro_permitidos, tamanho_maximo_mb,
      } = req.body;

      await db.query(
        `UPDATE configuracoes SET
           nome_plataforma = ?, tagline = ?, descricao_proposito = ?, cor_primaria = ?, cor_destaque = ?,
           contacto_email = ?, localizacao = ?, link_facebook = ?, link_instagram = ?, link_linkedin = ?,
           chat_activado = ?, ia_activada = ?, moderacao_ia_activada = ?,
           tipos_ficheiro_permitidos = ?, tamanho_maximo_mb = ?
         WHERE id = 1`,
        [
          nome_plataforma, tagline, descricao_proposito,
          cor_primaria, cor_destaque, contacto_email, localizacao,
          link_facebook, link_instagram, link_linkedin,
          chat_activado, ia_activada, moderacao_ia_activada,
          tipos_ficheiro_permitidos.join(","), tamanho_maximo_mb,
        ]
      );

      res.json({ mensagem: "Configuração actualizada com sucesso!", configuracoes: await getConfiguracoes() });
    } catch (erro) {
      console.error("Erro ao actualizar configuração:", erro.message);
      res.status(500).json({ erro: "Falha ao actualizar configuração." });
    }
  });

  /**
   * @openapi
   * /api/admin/config/logo:
   *   post:
   *     summary: Carrega/substitui o logótipo da plataforma (admin)
   *     tags: [Admin]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema: { type: object, properties: { logo: { type: string, format: binary } } }
   *     responses:
   *       200: { description: Logótipo actualizado }
   *   delete:
   *     summary: Remove o logótipo da plataforma (admin, volta ao ícone por defeito)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Logótipo removido }
   */
  app.post("/api/admin/config/logo", autenticar, apenasAdmin, uploadLogo.single("logo"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ erro: "Nenhuma imagem enviada." });

      const configAntiga = await getConfiguracoes();
      const caminhoRelativo = `/uploads/${req.file.filename}`;
      await db.query("UPDATE configuracoes SET logo_url = ? WHERE id = 1", [caminhoRelativo]);

      if (configAntiga.logo_url) {
        fs.unlink(path.join(uploadsDir, path.basename(configAntiga.logo_url)), () => {});
      }
      res.json({ mensagem: "Logótipo actualizado!", logo_url: paraUrlAbsoluto(caminhoRelativo) });
    } catch (erro) {
      if (req.file) fs.unlink(req.file.path, () => {});
      console.error("Erro ao gravar logótipo:", erro.message);
      res.status(500).json({ erro: "Falha ao actualizar logótipo." });
    }
  });

  app.delete("/api/admin/config/logo", autenticar, apenasAdmin, async (req, res) => {
    try {
      const config = await getConfiguracoes();
      await db.query("UPDATE configuracoes SET logo_url = NULL WHERE id = 1");
      if (config.logo_url) {
        fs.unlink(path.join(uploadsDir, path.basename(config.logo_url)), () => {});
      }
      res.json({ mensagem: "Logótipo removido." });
    } catch (erro) {
      console.error("Erro ao remover logótipo:", erro.message);
      res.status(500).json({ erro: "Falha ao remover logótipo." });
    }
  });

  /**
   * @openapi
   * /api/admin/cursos:
   *   post:
   *     summary: Adiciona um curso/disciplina (admin)
   *     tags: [Admin]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [nome], properties: { nome: { type: string } } }
   *     responses:
   *       201: { description: Curso adicionado }
   *       400: { description: "Nome inválido ou já existe", content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   * /api/admin/cursos/{id}:
   *   put:
   *     summary: Renomeia um curso (admin)
   *     tags: [Admin]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [nome], properties: { nome: { type: string } } }
   *     responses:
   *       200: { description: Curso actualizado }
   *   delete:
   *     summary: Remove um curso da lista (admin)
   *     tags: [Admin]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Curso removido }
   */
  app.post("/api/admin/cursos", autenticar, apenasAdmin, validar(schemaCurso), async (req, res) => {
    try {
      const { nome } = req.body;
      await db.query("INSERT INTO cursos (nome) VALUES (?)", [nome]);
      res.status(201).json({ mensagem: "Curso adicionado.", cursos: await getCursos() });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ erro: "Este curso já existe." });
      }
      console.error("Erro ao adicionar curso:", erro.message);
      res.status(500).json({ erro: "Falha ao adicionar curso." });
    }
  });

  app.put("/api/admin/cursos/:id", autenticar, apenasAdmin, validar(schemaCurso), async (req, res) => {
    try {
      const { nome } = req.body;
      await db.query("UPDATE cursos SET nome = ? WHERE id = ?", [nome, req.params.id]);
      res.json({ mensagem: "Curso actualizado.", cursos: await getCursos() });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ erro: "Este curso já existe." });
      }
      console.error("Erro ao actualizar curso:", erro.message);
      res.status(500).json({ erro: "Falha ao actualizar curso." });
    }
  });

  app.delete("/api/admin/cursos/:id", autenticar, apenasAdmin, async (req, res) => {
    try {
      await db.query("DELETE FROM cursos WHERE id = ?", [req.params.id]);
      res.json({ mensagem: "Curso removido.", cursos: await getCursos() });
    } catch (erro) {
      console.error("Erro ao remover curso:", erro.message);
      res.status(500).json({ erro: "Falha ao remover curso." });
    }
  });
};
