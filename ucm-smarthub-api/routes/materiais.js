const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const mailer = require("../services/email");
const { getConfiguracoes, getCursos } = require("../services/plataforma");
const { genAI, extractPdfText, gerarResumoIA, verificarConformidadeIA, MENSAGEM_IA_MAX } = require("../services/ia");
const { paraUrlAbsoluto } = require("../utils/urls");
const { validarFicheiroPorMime, MIME_PARA_TIPO } = require("../utils/security");
const validar = require("../middleware/validar");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { atualizarReputacao } = require("../services/reputacao");
const { notificarSubscritores, criarNotificacao } = require("../services/notificacoes");
const { formatoConvertivel, conversaoDisponivel, converterParaPdf } = require("../services/conversao");
const { indexarMaterial, consultaBooleana } = require("../services/indexacao");
const { limitarChat, limitarAvaliacoes } = require("../middleware/rateLimiters");
const { uploadsDir, upload } = require("../middleware/upload");
const { schemaMaterial } = require("../schemas");

const MAX_VERSOES_GUARDADAS = 5;

// Validações comuns ao upload inicial e ao envio de uma nova versão: tamanho
// configurado, assinatura real do ficheiro e, para DOCX/PPTX/DOC/PPT,
// conversão para PDF. Devolve o ficheiro final (já convertido, se for o
// caso) ou lança um erro com `status` para a rota responder.
async function prepararFicheiro(file, config, tipoDeclarado) {
  const falhar = (mensagem) => { throw Object.assign(new Error(mensagem), { status: 400 }); };

  const limiteBytes = (config.tamanho_maximo_mb || 100) * 1024 * 1024;
  if (file.size > limiteBytes) falhar(`Ficheiro demasiado grande. Limite actual: ${config.tamanho_maximo_mb} MB.`);

  // O Content-Type e a extensão vêm do cliente; o cabeçalho real do
  // ficheiro é a única coisa que não controla. Um .exe renomeado para
  // .pdf passa o fileFilter do multer, mas não passa aqui.
  let assinaturaValida = false;
  try { assinaturaValida = validarFicheiroPorMime(file.path, file.mimetype); } catch { /* tratado abaixo */ }
  if (!assinaturaValida) falhar("O conteúdo do ficheiro não corresponde ao tipo indicado. Verifique que é um PDF, vídeo ou documento Office válido.");

  const formato = formatoConvertivel(file.mimetype);
  const tipoDetectado = (formato || MIME_PARA_TIPO[file.mimetype] === "pdf") ? "PDF" : "Vídeo";
  if (tipoDeclarado && tipoDeclarado !== tipoDetectado) {
    falhar(tipoDetectado === "PDF" ? "Escolheu \"Vídeo\" mas enviou um documento." : "Escolheu \"PDF\" mas enviou um vídeo.");
  }

  if (!formato) return { caminho: file.path, nome: file.filename, formatoOriginal: null, tipo: tipoDetectado };

  if (!(await conversaoDisponivel())) {
    falhar("Este servidor não consegue converter documentos Office para PDF. Exporte o ficheiro como PDF e volte a enviar.");
  }
  let caminhoPdf;
  try {
    caminhoPdf = await converterParaPdf(file.path);
  } catch (erro) {
    console.error("Conversão para PDF falhou:", erro.message);
    falhar("Não foi possível converter o documento para PDF. Confirme que o ficheiro abre correctamente e tente de novo, ou envie-o já em PDF.");
  } finally {
    fs.unlink(file.path, () => {});
  }
  return { caminho: caminhoPdf, nome: path.basename(caminhoPdf), formatoOriginal: formato, tipo: "PDF" };
}

const nomeSeguro = (urlArquivo) => {
  const nome = path.basename(String(urlArquivo || ""));
  return nome && !nome.includes("..") ? nome : null;
};

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
      const tag     = req.query.tag     || null; // filtro por tag (nome)
      const ordem   = req.query.ordem === "populares" ? "m.visualizacoes DESC, m.downloads DESC, m.data_upload DESC" : "m.data_upload DESC";

      const params = [];
      let where = "WHERE m.status = 'aprovado'";

      // Pesquisa: título por LIKE (funciona com 1–2 letras) e conteúdo dos
      // PDFs por FULLTEXT (ver services/indexacao.js). O trecho devolvido é
      // o contexto da primeira ocorrência da primeira palavra pesquisada.
      const termoBruto = (req.query.busca || "").trim();
      const consultaFt = consultaBooleana(termoBruto);
      let selectTrecho = "NULL AS trecho";
      if (busca) {
        if (consultaFt) {
          where += " AND (m.titulo LIKE ? OR MATCH(m.titulo, m.texto_extraido) AGAINST(? IN BOOLEAN MODE))";
          params.push(busca, consultaFt);
          const primeiraPalavra = termoBruto.split(/\s+/)[0];
          selectTrecho = "CASE WHEN m.texto_extraido IS NOT NULL AND LOCATE(?, m.texto_extraido) > 0 THEN SUBSTRING(m.texto_extraido, GREATEST(1, LOCATE(?, m.texto_extraido) - 80), 240) ELSE NULL END AS trecho";
          params.unshift(primeiraPalavra, primeiraPalavra);
        } else {
          where += " AND m.titulo LIKE ?";
          params.push(busca);
        }
      }
      if (tipo)    { where += " AND m.tipo = ?";      params.push(tipo);    }
      if (cadeira) { where += " AND m.cadeira = ?";   params.push(cadeira); }
      if (tag)     { where += " AND EXISTS (SELECT 1 FROM materiais_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.material_id = m.id AND t.nome = ?)"; params.push(tag); }

      // As tags vêm agregadas numa string "nome|cor;nome|cor" para evitar uma
      // consulta por material só para desenhar as etiquetas nos cartões.
      const [materiais] = await db.query(
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, m.autor_id, u.nome AS autor,
                m.visualizacoes, m.downloads, m.versao, m.formato_original,
                (SELECT GROUP_CONCAT(CONCAT(t.nome, '|', t.cor) ORDER BY t.nome SEPARATOR ';')
                 FROM materiais_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.material_id = m.id) AS tags_raw,
                ${selectTrecho}
         FROM materiais m
         JOIN usuarios u ON m.autor_id = u.id
         ${where}
         ORDER BY ${ordem}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      // O COUNT não tem a coluna do trecho — retira os dois parâmetros dele.
      const paramsContagem = selectTrecho.startsWith("CASE") ? params.slice(2) : params;
      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total FROM materiais m ${where}`,
        paramsContagem
      );

      res.status(200).json({
        materiais: materiais.map(({ tags_raw, trecho, ...m }) => ({
          ...m,
          url_arquivo: paraUrlAbsoluto(m.url_arquivo),
          tags: tags_raw ? tags_raw.split(";").map(par => { const [nome, cor] = par.split("|"); return { nome, cor }; }) : [],
          trecho: trecho ? `…${String(trecho).trim()}…` : null,
        })),
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
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, m.autor_id, u.nome AS autor,
                m.visualizacoes, m.downloads, m.versao, m.formato_original
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
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.resumo_texto, m.texto_extraido, u.nome AS autor
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
        // url_arquivo é armazenado como "/uploads/uuid.pdf" — extrair APENAS o filename
        // Usando split('/') para ser seguro contra path traversal (ex: "/uploads/../../../etc/passwd")
        const urlParts = material.url_arquivo.split('/').filter(p => p && p !== "..");
        const fileName = urlParts[urlParts.length - 1];

        if (!fileName || fileName.includes("..")) {
          console.error("Tentativa de acesso com path traversal:", material.url_arquivo);
          return res.status(400).json({ erro: "Caminho de ficheiro inválido." });
        }

        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(filePath)) {
          console.error("PDF não encontrado no disco:", filePath);
          return res.status(404).json({ erro: "Ficheiro PDF não encontrado no servidor." });
        }

        // Texto já indexado (services/indexacao.js) evita reextrair o PDF.
        let pdfText = material.texto_extraido || "";
        if (!pdfText) {
          try {
            pdfText = await extractPdfText(filePath);
          } catch (pdfErro) {
            console.error("Erro ao extrair texto do PDF:", pdfErro.message);
            // Continua sem texto — Gemini usará título e disciplina
          }
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
        const urlParts = material.url_arquivo.split('/').filter(p => p && p !== "..");
        const fileName = urlParts[urlParts.length - 1];
        const filePath = path.join(uploadsDir, fileName);

        if (fileName && !fileName.includes("..") && fs.existsSync(filePath)) {
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

      const cursos = await getCursos();
      if (!cursos.some(c => c.nome === cadeira)) {
        limparFicheiroOrfao();
        return res.status(400).json({ erro: "Disciplina inválida." });
      }

      let ficheiro;
      try {
        ficheiro = await prepararFicheiro(req.file, config, tipo);
      } catch (erroFicheiro) {
        limparFicheiroOrfao();
        if (erroFicheiro.status) return res.status(erroFicheiro.status).json({ erro: erroFicheiro.message });
        throw erroFicheiro;
      }
      // A partir daqui o ficheiro "do pedido" é o final (pode ser o PDF convertido)
      req.file.path = ficheiro.caminho;
      req.file.filename = ficheiro.nome;

      const { sinalizado, motivo } = await verificarConformidadeIA(config, { titulo, cadeira, tipo });

      // FAIL-SAFE: Se moderação falhar ou não conseguir validar, marcar como "pendente"
      // em vez de "aprovado". Isto previne conteúdo impróprio de ser publicado automaticamente
      // se houver um erro na IA ou timeout do Gemini.
      let statusInicial = "pendente";
      if (config.moderacao_ia_activada && genAI && sinalizado !== undefined && sinalizado !== null) {
        // Só marca como "aprovado" se moderação está ON, IA está configurada, E conseguiu verificar
        statusInicial = sinalizado === false ? "aprovado" : "pendente";
      }

      // Usa sempre o ID do utilizador autenticado — ignora qualquer autor_id do body
      const autor_id = req.utilizador.id;
      const url_arquivo = `/uploads/${req.file.filename}`;
      const [resultado] = await db.query(
        "INSERT INTO materiais (titulo, cadeira, tipo, url_arquivo, autor_id, status, ia_sinalizado, ia_motivo, formato_original) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [titulo, cadeira, tipo, url_arquivo, autor_id, statusInicial, sinalizado, motivo, ficheiro.formatoOriginal]
      );

      res.status(201).json({
        mensagem: statusInicial === "aprovado"
          ? "Material publicado automaticamente após verificação pela IA."
          : "Ficheiro enviado para aprovação.",
        id_novo_material: resultado.insertId,
        status: statusInicial,
      });

      atualizarReputacao(autor_id);
      if (tipo === "PDF") indexarMaterial(resultado.insertId, url_arquivo);
      if (statusInicial === "aprovado") notificarSubscritores({ id: resultado.insertId, titulo, cadeira, tipo, autor_id });
    } catch (erro) {
      limparFicheiroOrfao();
      console.error("Erro ao gravar material:", erro.message);
      res.status(500).json({ erro: "Erro ao gravar ficheiro na base de dados." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/acesso:
   *   post:
   *     summary: Regista uma abertura ou download do material (uma por utilizador/material/tipo a cada 30 minutos)
   *     tags: [Materiais]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { tipo: { type: string, enum: [abertura, download] } } }
   *     responses:
   *       204: { description: Registado (ou ignorado por repetição) }
   */
  const acessosRecentes = new Map(); // "user:material:tipo" -> timestamp
  const JANELA_ACESSO_MS = 30 * 60 * 1000;
  setInterval(() => {
    const agora = Date.now();
    for (const [k, t] of acessosRecentes) if (agora - t > JANELA_ACESSO_MS) acessosRecentes.delete(k);
  }, 10 * 60 * 1000).unref?.();

  app.post("/api/materiais/:id/acesso", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const tipo = req.body?.tipo === "download" ? "download" : "abertura";
      if (!Number.isInteger(materialId)) return res.status(400).json({ erro: "ID inválido." });

      const chave = `${req.utilizador.id}:${materialId}:${tipo}`;
      const agora = Date.now();
      if (agora - (acessosRecentes.get(chave) || 0) < JANELA_ACESSO_MS) return res.status(204).end();
      acessosRecentes.set(chave, agora);

      const coluna = tipo === "download" ? "downloads" : "visualizacoes";
      const [r] = await db.query(`UPDATE materiais SET ${coluna} = ${coluna} + 1 WHERE id = ? AND status = 'aprovado'`, [materialId]);
      if (r.affectedRows > 0) {
        await db.query("INSERT INTO materiais_acessos (material_id, usuario_id, tipo) VALUES (?, ?, ?)", [materialId, req.utilizador.id, tipo]);
      }
      res.status(204).end();
    } catch (erro) {
      console.error("Erro ao registar acesso:", erro.message);
      res.status(204).end();
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/versoes:
   *   get:
   *     summary: Histórico de versões anteriores do material (ficheiros continuam descarregáveis)
   *     tags: [Materiais]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Versão actual e lista de anteriores }
   *   post:
   *     summary: Envia uma nova versão do ficheiro (só o autor ou um admin). Mantém avaliações e comentários; volta a passar pela moderação por IA.
   *     tags: [Materiais]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [arquivo]
   *             properties:
   *               arquivo: { type: string, format: binary }
   *               notas: { type: string, maxLength: 500, description: O que mudou nesta versão }
   *     responses:
   *       200: { description: Nova versão gravada }
   *       403: { description: Não é o autor nem admin }
   */
  app.get("/api/materiais/:id/versoes", autenticar, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [[material]] = await db.query("SELECT id, versao, url_arquivo, data_upload FROM materiais WHERE id = ?", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      const [versoes] = await db.query(
        `SELECT v.id, v.versao, v.url_arquivo, v.notas, v.criado_em, u.nome AS autor
         FROM versoes_materiais v LEFT JOIN usuarios u ON u.id = v.autor_id
         WHERE v.material_id = ? ORDER BY v.versao DESC`,
        [materialId]
      );
      res.json({
        actual: { versao: material.versao, url_arquivo: paraUrlAbsoluto(material.url_arquivo), data: material.data_upload },
        anteriores: versoes.map(v => ({ ...v, url_arquivo: paraUrlAbsoluto(v.url_arquivo) })),
      });
    } catch (erro) {
      console.error("Erro ao listar versões:", erro.message);
      res.status(500).json({ erro: "Erro ao listar versões." });
    }
  });

  app.post("/api/materiais/:id/versoes", autenticar, upload.single("arquivo"), async (req, res) => {
    const limparFicheiroOrfao = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
    try {
      const materialId = parseInt(req.params.id, 10);
      if (!req.file) return res.status(400).json({ erro: "Anexe o novo ficheiro." });
      const notas = typeof req.body?.notas === "string" ? req.body.notas.trim().slice(0, 500) : null;

      const [[material]] = await db.query(
        "SELECT id, titulo, cadeira, tipo, url_arquivo, autor_id, status, versao FROM materiais WHERE id = ?",
        [materialId]
      );
      if (!material) { limparFicheiroOrfao(); return res.status(404).json({ erro: "Material não encontrado." }); }
      if (material.autor_id !== req.utilizador.id && req.utilizador.papel !== "admin") {
        limparFicheiroOrfao();
        return res.status(403).json({ erro: "Só o autor ou um administrador podem enviar uma nova versão." });
      }

      const config = await getConfiguracoes();
      let ficheiro;
      try {
        ficheiro = await prepararFicheiro(req.file, config, material.tipo);
      } catch (erroFicheiro) {
        limparFicheiroOrfao();
        if (erroFicheiro.status) return res.status(erroFicheiro.status).json({ erro: erroFicheiro.message });
        throw erroFicheiro;
      }

      // Volta a passar pela moderação: uma versão nova é conteúdo novo.
      const { sinalizado, motivo } = await verificarConformidadeIA(config, { titulo: material.titulo, cadeira: material.cadeira, tipo: material.tipo });
      const passaAPendente = material.status === "aprovado" && !(config.moderacao_ia_activada && genAI && sinalizado === false);
      const novoStatus = passaAPendente ? "pendente" : material.status;

      const novaUrl = `/uploads/${ficheiro.nome}`;
      await db.query(
        "INSERT INTO versoes_materiais (material_id, versao, url_arquivo, notas, autor_id) VALUES (?, ?, ?, ?, ?)",
        [materialId, material.versao, material.url_arquivo, null, material.autor_id]
      );
      await db.query(
        `UPDATE materiais SET url_arquivo = ?, versao = versao + 1, status = ?, ia_sinalizado = ?, ia_motivo = ?,
                              formato_original = ?, resumo_texto = NULL, resumo_gerado_em = NULL,
                              texto_extraido = NULL, texto_indexado_em = NULL
         WHERE id = ?`,
        [novaUrl, novoStatus, sinalizado, motivo, ficheiro.formatoOriginal, materialId]
      );
      // As notas descrevem a versão NOVA — ficam na linha que a vai substituir
      // quando houver outra; até lá vivem na resposta e no histórico via UPDATE.
      if (notas) await db.query("UPDATE versoes_materiais SET notas = ? WHERE material_id = ? AND versao = ?", [`(substituída) ${notas}`, materialId, material.versao]);
      // Quiz e resumo eram sobre o conteúdo antigo.
      await db.query("DELETE FROM quizzes WHERE material_id = ?", [materialId]).catch(() => {});

      // Só as últimas N versões ficam em disco.
      const [antigas] = await db.query(
        "SELECT id, url_arquivo FROM versoes_materiais WHERE material_id = ? ORDER BY versao DESC LIMIT 100 OFFSET ?",
        [materialId, MAX_VERSOES_GUARDADAS]
      );
      for (const v of antigas) {
        const nome = nomeSeguro(v.url_arquivo);
        if (nome) fs.unlink(path.join(uploadsDir, nome), () => {});
        await db.query("DELETE FROM versoes_materiais WHERE id = ?", [v.id]);
      }

      auditar(req.utilizador.id, "nova_versao_material", "materiais", materialId, `Versão ${material.versao + 1} de "${material.titulo}"${notas ? ` — ${notas}` : ""}`, req.ip);
      if (material.tipo === "PDF") indexarMaterial(materialId, novaUrl);
      if (passaAPendente) {
        criarNotificacao(material.autor_id, { tipo: "moderacao", titulo: "Nova versão aguarda aprovação", mensagem: material.titulo, link: "/repositorio" });
      }

      res.json({
        mensagem: passaAPendente
          ? "Nova versão enviada. Fica invisível no repositório até um administrador a aprovar."
          : "Nova versão publicada.",
        versao: material.versao + 1,
        status: novoStatus,
        url_arquivo: paraUrlAbsoluto(novaUrl),
      });
    } catch (erro) {
      limparFicheiroOrfao();
      console.error("Erro ao enviar nova versão:", erro.message);
      res.status(500).json({ erro: "Erro ao gravar a nova versão." });
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
      auditar(req.utilizador.id, "remover_material", "materiais", Number(id), `Removeu "${material.titulo}"`, req.ip);
      atualizarReputacao(material.autor_id);
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
        `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.status, m.url_arquivo, m.autor_id, u.email AS autor_email, u.nome AS autor_nome
         FROM materiais m JOIN usuarios u ON m.autor_id = u.id
         WHERE m.id = ?`,
        [id]
      );

      if (!material) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }

      if (acao === "aprovar") {
        await db.query("UPDATE materiais SET status = 'aprovado' WHERE id = ?", [id]);
        auditar(req.utilizador.id, "aprovar_material", "materiais", material.id, `Aprovou "${material.titulo}"`, req.ip);
        criarNotificacao(material.autor_id, { tipo: "moderacao", titulo: "O seu material foi aprovado", mensagem: material.titulo, link: `/video/${material.id}` });
        res.json({ mensagem: "Material aprovado com sucesso!" });
        // Só avisa os subscritores na primeira aprovação — reaprovar um
        // material já aprovado não deve repetir o email a toda a gente.
        if (material.status !== "aprovado") notificarSubscritores(material);
      } else {
        await db.query("DELETE FROM materiais WHERE id = ?", [id]);
        if (material?.url_arquivo) {
          const fileName = path.basename(material.url_arquivo);
          fs.unlink(path.join(uploadsDir, fileName), () => {});
        }
        auditar(req.utilizador.id, "rejeitar_material", "materiais", material.id, `Rejeitou "${material.titulo}"`, req.ip);
        criarNotificacao(material.autor_id, { tipo: "moderacao", titulo: "O seu material foi rejeitado", mensagem: material.titulo, link: "/repositorio" });
        res.json({ mensagem: "Material rejeitado e apagado." });
      }
      atualizarReputacao(material.autor_id);

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
