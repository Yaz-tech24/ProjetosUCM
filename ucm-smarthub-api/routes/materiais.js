const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const mailer = require("../services/email");
const { getConfiguracoes, getCursos } = require("../services/plataforma");
const { genAI, extractPdfText, gerarResumoIA, verificarConformidadeIA, MENSAGEM_IA_MAX } = require("../services/ia");
const { paraUrlAbsoluto } = require("../utils/urls");
const validar = require("../middleware/validar");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { limitarChat } = require("../middleware/rateLimiters");
const { uploadsDir, upload } = require("../middleware/upload");
const { schemaMaterial } = require("../schemas");

module.exports = function registarRotasMateriais(app) {
  // ==========================================
  // REPOSITÓRIO E MODERAÇÃO
  // ==========================================
  /**
   * @openapi
   * /api/materiais:
   *   get:
   *     summary: Lista materiais aprovados (paginado, com filtros)
   *     tags: [Materiais]
   *     security: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 12 }
   *       - in: query
   *         name: busca
   *         schema: { type: string }
   *       - in: query
   *         name: tipo
   *         schema: { type: string, enum: [PDF, Vídeo] }
   *       - in: query
   *         name: cadeira
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lista paginada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 materiais: { type: array, items: { $ref: '#/components/schemas/Material' } }
   *                 pagination: { type: object }
   *   post:
   *     summary: Submete um novo material para aprovação
   *     tags: [Materiais]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [titulo, cadeira, tipo, arquivo]
   *             properties:
   *               titulo: { type: string }
   *               cadeira: { type: string }
   *               tipo: { type: string, enum: [PDF, Vídeo] }
   *               arquivo: { type: string, format: binary }
   *     responses:
   *       201: { description: Enviado para aprovação }
   *       400: { description: Dados ou ficheiro inválidos, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.get("/api/materiais", async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(req.query.page)  || 1);
      const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
      const offset = (page - 1) * limit;
      const busca   = req.query.busca   ? `%${req.query.busca}%` : null;
      const tipo    = req.query.tipo    || null; // "PDF" | "Vídeo" | null = todos
      const cadeira = req.query.cadeira || null; // filtro por disciplina

      const params = [];
      let where = "WHERE m.status = 'aprovado'";

      if (busca)   { where += " AND m.titulo LIKE ?"; params.push(busca);   }
      if (tipo)    { where += " AND m.tipo = ?";      params.push(tipo);    }
      if (cadeira) { where += " AND m.cadeira = ?";   params.push(cadeira); }

      const [materiais] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, m.autor_id, u.nome AS autor
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         ${where}
         ORDER BY m.data_upload DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total FROM materiais m ${where}`,
        params
      );

      res.status(200).json({
        materiais: materiais.map(m => ({ ...m, url_arquivo: paraUrlAbsoluto(m.url_arquivo) })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao listar materiais:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar materiais." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}:
   *   get:
   *     summary: Obtém um material aprovado pelo ID
   *     tags: [Materiais]
   *     security: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Material encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/Material' } } } }
   *       404: { description: Não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.get("/api/materiais/:id", async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [resultado] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, m.autor_id, u.nome AS autor
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         WHERE m.status = 'aprovado' AND m.id = ?`,
        [materialId]
      );

      if (resultado.length === 0) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }
      res.status(200).json({ ...resultado[0], url_arquivo: paraUrlAbsoluto(resultado[0].url_arquivo) });
    } catch (erro) {
      console.error("Erro ao buscar material:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar material." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/resumo:
   *   get:
   *     summary: Gera (ou devolve do cache) o resumo por IA de um material
   *     tags: [Materiais]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: forcar
   *         schema: { type: string, enum: ["true"] }
   *         description: Ignora o cache e gera um resumo novo (usado pelo botão "Regenerar resumo").
   *     responses:
   *       200: { description: Resumo gerado, content: { application/json: { schema: { type: object, properties: { resumo: { type: string } } } } } }
   *       404: { description: Material não encontrado }
   *       503: { description: IA desactivada pelo administrador }
   */
  // limitarChat aqui também: gerar (não devolver do cache) volta a extrair o PDF
  // e a chamar o Gemini — sem limite, "Regenerar resumo" podia ser martelado
  // num loop apertado a custo real e ilimitado.
  app.get("/api/materiais/:id/resumo", autenticar, limitarChat, async (req, res) => {
    try {
      const config = await getConfiguracoes();
      if (!config.ia_activada) {
        return res.status(503).json({ erro: "Resumos por IA desactivados pelo administrador." });
      }

      const materialId = parseInt(req.params.id, 10);
      const [resultado] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.resumo_texto, u.nome AS autor
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         WHERE m.status = 'aprovado' AND m.id = ?`,
        [materialId]
      );

      if (resultado.length === 0) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }

      const material = resultado[0];

      // Cache: o mesmo material devolve o mesmo resumo enquanto ninguém pedir
      // explicitamente para o regenerar — poupa reextrair o PDF e pagar outra
      // chamada ao Gemini de cada vez que alguém simplesmente abre a página.
      const forcarRegeneracao = req.query.forcar === "true";
      if (material.resumo_texto && !forcarRegeneracao) {
        return res.status(200).json({ resumo: material.resumo_texto });
      }

      let resumoTexto = "";

      if (material.tipo === "PDF") {
        const fileName = path.basename(material.url_arquivo);
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(filePath)) {
          console.error("PDF não encontrado no disco:", filePath);
          return res.status(404).json({ erro: "Ficheiro PDF não encontrado no servidor." });
        }

        let pdfText = "";
        try {
          pdfText = await extractPdfText(filePath);
        } catch (pdfErro) {
          console.error("Erro ao extrair texto do PDF:", pdfErro.message);
          // Continua sem texto — Gemini usará título e disciplina
        }

        const trimmedText = pdfText.slice(0, 12000);
        const temTexto = trimmedText.trim().length > 0;

        const promptResumo = temTexto
          ? `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Analisa o documento académico abaixo e produz um resumo de estudo completo em português europeu.

USA EXACTAMENTE este formato de secções (os títulos em maiúsculas são obrigatórios):

VISÃO GERAL
[2 a 3 frases que expliquem o tema central do documento, o seu propósito e a sua importância para a disciplina]

CONCEITOS FUNDAMENTAIS
• [Nome do conceito]: [Definição clara e precisa em 1-2 frases]
• [Repete para cada conceito relevante — mínimo 3, máximo 7]

MÉTODOS E PROCEDIMENTOS
• [Descreve cada método, fórmula, processo ou técnica que o estudante deve saber aplicar]
• [Inclui passos ou condições de aplicação quando relevante]
• [Omite esta secção se o material for puramente teórico]

PONTOS-CHAVE PARA O EXAME
• [Tema ou questão com alta probabilidade de aparecer na avaliação]
• [Mínimo 3, máximo 5 pontos — específicos e accionáveis]

DICA DE ESTUDO
[1 a 2 frases com uma estratégia concreta e eficaz para estudar este material específico]

REGRAS ABSOLUTAS:
- Usa EXACTAMENTE os títulos de secção em maiúsculas como indicado
- Cada bullet começa obrigatoriamente com "• " (bullet + espaço)
- Baseia-te APENAS no conteúdo do documento — nunca inventes factos
- Português europeu, linguagem académica mas acessível ao estudante universitário
- Não uses markdown (**negrito**, _itálico_) — texto simples apenas

Documento:
Título: ${material.titulo}
Disciplina: ${material.cadeira}

Conteúdo:
${trimmedText}`
          : `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base no título e disciplina abaixo, cria um resumo de estudo estruturado em português europeu.

USA EXACTAMENTE este formato:

VISÃO GERAL
[2-3 frases sobre o que esta matéria aborda e a sua importância na disciplina]

CONCEITOS FUNDAMENTAIS
• [Conceito essencial 1 desta disciplina/tema]: [Definição]
• [Conceito essencial 2]: [Definição]
• [Conceito essencial 3]: [Definição]

PONTOS-CHAVE PARA O EXAME
• [Ponto 1 que normalmente sai nos exames desta matéria]
• [Ponto 2]
• [Ponto 3]

DICA DE ESTUDO
[Estratégia concreta para estudar este tema]

Título: ${material.titulo}
Disciplina: ${material.cadeira}`;

        const fallback = `VISÃO GERAL
Este documento aborda os conceitos fundamentais de ${material.cadeira} apresentados em "${material.titulo}". Compreender esta matéria é essencial para o aproveitamento académico na disciplina.

CONCEITOS FUNDAMENTAIS
• Definições base: Identifique e memorize os termos técnicos e definições centrais apresentados pelo autor.
• Princípios teóricos: Compreenda os fundamentos que sustentam a disciplina e as suas aplicações práticas.
• Relações entre conceitos: Analise como os diferentes tópicos se relacionam entre si.

PONTOS-CHAVE PARA O EXAME
• Questões de definição e identificação de conceitos teóricos.
• Aplicação prática dos métodos e procedimentos estudados.
• Análise e interpretação de casos práticos da disciplina.

DICA DE ESTUDO
Leia o material duas vezes: primeiro para compreensão geral, depois sublinhando os conceitos-chave. Crie um mapa mental ligando os tópicos principais antes de resolver exercícios práticos.`;

        resumoTexto = await gerarResumoIA(promptResumo, fallback);
      } else {
        // Vídeo ou outro tipo
        const promptResumo = `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base nos metadados do material abaixo, gera 3 notas de estudo em português europeu, numeradas de 1 a 3, úteis para quem vai ver ou rever este conteúdo:

1. O que aprender — o tema ou competência central que este material ensina
2. Como estudar — a abordagem prática recomendada para tirar o máximo partido do conteúdo
3. Para o exame — o conceito ou questão mais provável em avaliação desta matéria

Título: ${material.titulo}
Disciplina: ${material.cadeira}
Tipo de material: ${material.tipo}

Responde APENAS com as 3 notas numeradas. Sem introdução, sem conclusão.`;

        const fallback = `1. Este material aborda os conceitos essenciais de ${material.cadeira} — foque-se nas definições e princípios apresentados.
2. Tome notas durante a visualização e relacione cada conceito com exemplos da vida real ou de exercícios do manual.
3. Reveja os temas que normalmente aparecem nos exames de ${material.cadeira} e verifique se o material os cobre.`;

        resumoTexto = await gerarResumoIA(promptResumo, fallback);
      }

      // Best-effort: uma falha a guardar o cache não deve impedir a resposta
      // de chegar ao estudante, só significa que a próxima visita gera de novo.
      db.query(
        "UPDATE materiais SET resumo_texto = ?, resumo_gerado_em = NOW() WHERE id = ?",
        [resumoTexto, materialId]
      ).catch(erroCache => console.error("Erro ao guardar cache do resumo:", erroCache.message));

      res.status(200).json({ resumo: resumoTexto });
    } catch (erro) {
      console.error("Erro ao gerar resumo:", erro.message);
      res.status(500).json({ erro: "Falha ao gerar resumo do material." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/chat:
   *   post:
   *     summary: Pergunta de acompanhamento à IA sobre um material específico (baseada no resumo/conteúdo)
   *     tags: [Materiais]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [mensagem], properties: { mensagem: { type: string } } }
   *     responses:
   *       200: { description: Resposta da IA, content: { application/json: { schema: { type: object, properties: { resposta: { type: string } } } } } }
   *       404: { description: Material não encontrado }
   *       429: { description: Demasiados pedidos }
   *       503: { description: IA desactivada ou não configurada }
   */
  // Reaproveita o limitador do assistente geral — cada pergunta aqui custa o mesmo à
  // API do Gemini que uma mensagem no chatbot flutuante.
  app.post("/api/materiais/:id/chat", autenticar, limitarChat, async (req, res) => {
    try {
      const { mensagem } = req.body;
      if (!mensagem || !mensagem.trim()) {
        return res.status(400).json({ erro: "Mensagem em falta." });
      }
      if (mensagem.length > MENSAGEM_IA_MAX) {
        return res.status(400).json({ erro: `Mensagem demasiado longa (máximo ${MENSAGEM_IA_MAX} caracteres).` });
      }

      const config = await getConfiguracoes();
      if (!config.ia_activada) {
        return res.status(503).json({ erro: "Assistente de IA desactivado pelo administrador." });
      }
      if (!genAI) {
        return res.status(503).json({ erro: "Serviço de IA não configurado." });
      }

      const materialId = parseInt(req.params.id, 10);
      const [resultado] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, u.nome AS autor
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         WHERE m.status = 'aprovado' AND m.id = ?`,
        [materialId]
      );
      if (resultado.length === 0) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }
      const material = resultado[0];

      // Mesmo texto que alimenta o resumo — assim a conversa mantém-se ancorada
      // no conteúdo real do documento, não apenas no seu título.
      let trimmedText = "";
      if (material.tipo === "PDF") {
        const fileName = path.basename(material.url_arquivo);
        const filePath = path.join(uploadsDir, fileName);
        if (fs.existsSync(filePath)) {
          try {
            const pdfText = await extractPdfText(filePath);
            trimmedText = pdfText.slice(0, 12000);
          } catch (pdfErro) {
            console.error("Erro ao extrair texto do PDF para chat:", pdfErro.message);
          }
        }
      }
      const temTexto = trimmedText.trim().length > 0;

      const utilizadorNome = req.utilizador?.nome || "estudante";
      const prompt = `És o assistente académico de IA da plataforma "${config.nome_plataforma}", a esclarecer dúvidas de ${utilizadorNome} sobre um material específico do repositório.

Material em análise:
Título: ${material.titulo}
Disciplina: ${material.cadeira}
Tipo: ${material.tipo}
${temTexto ? `\nConteúdo do documento (extraído do PDF, pode estar incompleto ou truncado):\n${trimmedText}` : "\n(Sem texto extraído deste material — responde com o teu conhecimento da disciplina, deixando claro que não estás a citar o documento directamente.)"}

Regras de resposta:
- Responde com profundidade real: explica o raciocínio, dá exemplos concretos e, em exercícios, mostra os passos — nunca cortes a resposta artificialmente por ser "longa"
- Usa parágrafos curtos e, quando ajudar a clareza, listas numeradas ou com marcadores
- Prioriza sempre o conteúdo do documento acima quando a pergunta for sobre ele; só recorres a conhecimento geral da disciplina quando o documento não cobrir o tema, e dizes isso explicitamente
- Nunca inventes dados, números ou citações que não estejam no documento
- Português europeu, tom de tutor — directo, sem introduções nem despedidas desnecessárias

Pergunta do estudante: ${mensagem.trim()}`;

      const fallback = "Não consegui obter uma resposta neste momento. Tente novamente dentro de instantes.";
      const resposta = await gerarResumoIA(prompt, fallback);
      res.status(200).json({ resposta });
    } catch (erro) {
      console.error("Erro no chat sobre material:", erro.message);
      res.status(500).json({ erro: "A IA está temporariamente indisponível. Tente novamente em instantes." });
    }
  });

  app.post("/api/materiais", autenticar, upload.single("arquivo"), async (req, res) => {
    // Remove o ficheiro que o multer já gravou em disco, caso a validação ou a BD falhem
    const limparFicheiroOrfao = () => {
      if (req.file) fs.unlink(req.file.path, () => {});
    };

    try {
      if (!req.file) {
        return res.status(400).json({ erro: "Por favor, anexe um ficheiro." });
      }

      const parsed = schemaMaterial.safeParse(req.body);
      if (!parsed.success) {
        limparFicheiroOrfao();
        return res.status(400).json({ erro: parsed.error.issues[0]?.message || "Dados inválidos." });
      }
      const { titulo, cadeira, tipo } = parsed.data;

      const config = await getConfiguracoes();

      const limiteBytes = (config.tamanho_maximo_mb || 100) * 1024 * 1024;
      if (req.file.size > limiteBytes) {
        limparFicheiroOrfao();
        return res.status(400).json({ erro: `Ficheiro demasiado grande. Limite actual: ${config.tamanho_maximo_mb} MB.` });
      }

      const cursos = await getCursos();
      if (!cursos.some(c => c.nome === cadeira)) {
        limparFicheiroOrfao();
        return res.status(400).json({ erro: "Disciplina inválida." });
      }

      const { sinalizado, motivo } = await verificarConformidadeIA(config, { titulo, cadeira, tipo });

      // A IA já analisou o material acima: se a moderação estiver activada, a
      // chave do Gemini estiver configurada (sem ela, verificarConformidadeIA
      // nunca sinaliza nada — não podemos tratar "não verificou" como "está
      // conforme") e nada de suspeito for encontrado, o material é publicado
      // de imediato. Em qualquer outro caso — sinalizado, moderação desligada,
      // ou IA não configurada — vai para a fila de aprovação manual do admin.
      const statusInicial = config.moderacao_ia_activada && genAI && !sinalizado ? "aprovado" : "pendente";

      // Usa sempre o ID do utilizador autenticado — ignora qualquer autor_id do body
      const autor_id = req.utilizador.id;
      const url_arquivo = `/uploads/${req.file.filename}`;
      const [resultado] = await db.query(
        "INSERT INTO materiais (titulo, cadeira, tipo, url_arquivo, autor_id, status, ia_sinalizado, ia_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [titulo, cadeira, tipo, url_arquivo, autor_id, statusInicial, sinalizado, motivo]
      );

      res.status(201).json({
        mensagem: statusInicial === "aprovado"
          ? "Material publicado automaticamente após verificação pela IA."
          : "Ficheiro enviado para aprovação.",
        id_novo_material: resultado.insertId,
        status: statusInicial,
      });
    } catch (erro) {
      limparFicheiroOrfao();
      console.error("Erro ao gravar material:", erro.message);
      res.status(500).json({ erro: "Erro ao gravar ficheiro na base de dados." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}:
   *   delete:
   *     summary: Remove um material — só quem o enviou originalmente ou um administrador
   *     tags: [Materiais]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Material removido }
   *       403: { description: Sem permissão para remover este material, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   *       404: { description: Material não encontrado }
   */
  app.delete("/api/materiais/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ erro: "ID inválido." });

      const [[material]] = await db.query("SELECT autor_id, url_arquivo FROM materiais WHERE id = ?", [id]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });

      const ehAutor = material.autor_id === req.utilizador.id;
      const ehAdmin = req.utilizador.papel === "admin";
      if (!ehAutor && !ehAdmin) {
        return res.status(403).json({ erro: "Só quem enviou este material ou um administrador o pode remover." });
      }

      await db.query("DELETE FROM materiais WHERE id = ?", [id]);
      if (material.url_arquivo) {
        const fileName = path.basename(material.url_arquivo);
        fs.unlink(path.join(uploadsDir, fileName), () => {});
      }
      res.json({ mensagem: "Material removido com sucesso." });
    } catch (erro) {
      console.error("Erro ao remover material:", erro.message);
      res.status(500).json({ erro: "Erro ao remover material." });
    }
  });

  /**
   * @openapi
   * /api/admin/pendentes:
   *   get:
   *     summary: Lista materiais à espera de aprovação (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Lista de pendentes, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Material' } } } } }
   *       403: { description: Acesso restrito a administradores }
   */
  app.get("/api/admin/pendentes", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [materiais] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.data_upload, m.ia_sinalizado, m.ia_motivo, u.nome AS autor
         FROM materiais m JOIN usuarios u ON m.autor_id = u.id
         WHERE m.status = 'pendente' ORDER BY m.data_upload ASC`
      );
      res.status(200).json(materiais);
    } catch (erro) {
      res.status(500).json({ erro: "Erro ao buscar materiais pendentes." });
    }
  });

  // Materiais enviados pelo próprio utilizador
  /**
   * @openapi
   * /api/meus-materiais:
   *   get:
   *     summary: Lista os materiais submetidos pelo próprio utilizador
   *     tags: [Materiais]
   *     responses:
   *       200: { description: Lista de materiais, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Material' } } } } }
   */
  app.get("/api/meus-materiais", autenticar, async (req, res) => {
    try {
      const [materiais] = await db.query(
        `SELECT id, titulo, cadeira, tipo, status, data_upload
         FROM materiais
         WHERE autor_id = ?
         ORDER BY data_upload DESC
         LIMIT 20`,
        [req.utilizador.id]
      );
      res.json(materiais);
    } catch (erro) {
      console.error("Erro ao buscar meus materiais:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar os seus materiais." });
    }
  });

  /**
   * @openapi
   * /api/admin/materiais/{id}/status:
   *   put:
   *     summary: Aprova ou rejeita um material pendente (admin)
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
   *           schema: { type: object, required: [acao], properties: { acao: { type: string, enum: [aprovar, rejeitar] } } }
   *     responses:
   *       200: { description: Material processado }
   *       400: { description: Acção inválida, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.put("/api/admin/materiais/:id/status", autenticar, apenasAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { acao } = req.body;

      if (acao !== "aprovar" && acao !== "rejeitar") {
        return res.status(400).json({ erro: "Acção inválida. Use 'aprovar' ou 'rejeitar'." });
      }

      const [[material]] = await db.query(
        `SELECT m.titulo, m.url_arquivo, u.email AS autor_email, u.nome AS autor_nome
         FROM materiais m JOIN usuarios u ON m.autor_id = u.id
         WHERE m.id = ?`,
        [id]
      );

      if (!material) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }

      if (acao === "aprovar") {
        await db.query("UPDATE materiais SET status = 'aprovado' WHERE id = ?", [id]);
        res.json({ mensagem: "Material aprovado com sucesso!" });
      } else {
        await db.query("DELETE FROM materiais WHERE id = ?", [id]);
        if (material?.url_arquivo) {
          const fileName = path.basename(material.url_arquivo);
          fs.unlink(path.join(uploadsDir, fileName), () => {});
        }
        res.json({ mensagem: "Material rejeitado e apagado." });
      }

      // Notifica o autor por email — não bloqueia a resposta nem falha a moderação.
      if (material) {
        getConfiguracoes().then(config => {
          mailer.enviarModeracaoMaterial({
            to: material.autor_email, nome: material.autor_nome, titulo: material.titulo,
            aprovado: acao === "aprovar",
            nomePlataforma: config.nome_plataforma, corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque,
            logoUrl: config.logo_url,
          });
        }).catch(() => {});
      }
    } catch (erro) {
      console.error("Erro na moderação:", erro.message);
      res.status(500).json({ erro: "Erro ao processar moderação." });
    }
  });
};
