const cookie = require("cookie");

const db = require("../config/db");
const { getConfiguracoes } = require("../services/plataforma");
const { genAI, gerarResumoIA, MENSAGEM_IA_MAX } = require("../services/ia");
const { autenticar, apenasAdmin, verificarSessao } = require("../middleware/auth");
const { salaDoUtilizador } = require("../services/notificacoes");
const { limitarChat } = require("../middleware/rateLimiters");
const { analisarMensagem, mensagemAviso } = require("../utils/filtroChat");

// Nome de sala: um curso (ex: "Informática") ou uma disciplina subscrita
// com prefixo ("disc:Cálculo I"). Limitado ao tamanho da coluna.
const PREFIXO_DISCIPLINA = "disc:";
const normalizarSala = (valor) => {
  const sala = String(valor || "Geral").trim().slice(0, 160);
  return sala || "Geral";
};

module.exports = function registarRotasChat(app, io) {
  /**
   * @openapi
   * /api/chat/salas:
   *   get:
   *     summary: Salas disponíveis ao utilizador — cursos da plataforma e disciplinas que subscreve
   *     tags: [Chat]
   *     responses:
   *       200: { description: "{ cursos[], disciplinas[] } — cada disciplina traz o nome da sala (disc:...)" }
   */
  app.get("/api/chat/salas", autenticar, async (req, res) => {
    try {
      const [cursos] = await db.query("SELECT nome FROM cursos ORDER BY nome ASC");
      const [subs] = await db.query("SELECT disciplina FROM subscricoes_disciplinas WHERE usuario_id = ? ORDER BY disciplina ASC", [req.utilizador.id]);
      res.json({
        cursos: cursos.map(c => ({ nome: c.nome, sala: c.nome })),
        disciplinas: subs.map(s => ({ nome: s.disciplina, sala: PREFIXO_DISCIPLINA + s.disciplina })),
      });
    } catch (erro) {
      console.error("Erro ao listar salas:", erro.message);
      res.status(500).json({ erro: "Erro ao listar salas." });
    }
  });

  // ==========================================
  // CHAT COM IA (GEMINI) — protegido por autenticação
  // ==========================================
  /**
   * @openapi
   * /api/chat:
   *   post:
   *     summary: Envia uma pergunta ao assistente académico de IA
   *     tags: [Chat IA]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [mensagem], properties: { mensagem: { type: string } } }
   *     responses:
   *       200: { description: Resposta da IA, content: { application/json: { schema: { type: object, properties: { resposta: { type: string } } } } } }
   *       429: { description: Demasiados pedidos }
   *       503: { description: IA desactivada ou não configurada }
   */
  app.post("/api/chat", autenticar, limitarChat, async (req, res) => {
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

      const utilizadorNome = req.utilizador?.nome || "estudante";
      const utilizadorCurso = req.utilizador?.curso || "";
      const dataHoje = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

      // Contexto do repositório — dá à IA visibilidade sobre o que realmente existe
      // na plataforma, para poder apontar/recomendar materiais reais em vez de
      // inventar títulos. Prioriza a disciplina do estudante; completa com os mais
      // recentes de toda a plataforma se houver poucos resultados nessa disciplina.
      let materiaisContexto = [];
      try {
        if (utilizadorCurso) {
          const [porCurso] = await db.query(
            `SELECT titulo, cadeira, tipo FROM materiais
             WHERE status = 'aprovado' AND cadeira = ?
             ORDER BY data_upload DESC LIMIT 12`,
            [utilizadorCurso]
          );
          materiaisContexto = porCurso;
        }
        if (materiaisContexto.length < 6) {
          const [recentes] = await db.query(
            `SELECT titulo, cadeira, tipo FROM materiais
             WHERE status = 'aprovado'
             ORDER BY data_upload DESC LIMIT 12`
          );
          const titulosExistentes = new Set(materiaisContexto.map(m => m.titulo));
          materiaisContexto = materiaisContexto.concat(recentes.filter(m => !titulosExistentes.has(m.titulo)));
        }
      } catch (erroRepo) {
        console.error("Erro ao carregar contexto do repositório para o chat:", erroRepo.message);
      }
      const listaMateriais = materiaisContexto.length > 0
        ? materiaisContexto.slice(0, 15).map(m => `- [${m.tipo}] "${m.titulo}" — ${m.cadeira}`).join("\n")
        : "(Repositório vazio de momento.)";

      const prompt = `És o assistente académico de IA oficial da plataforma "${config.nome_plataforma}".

Identidade e tom:
- Culto, directo e encorajador — como um tutor experiente que respeita o tempo do estudante
- Trata o estudante pelo primeiro nome quando adequado
- Português europeu, linguagem académica mas acessível

Capacidades:
- Explicar conceitos de qualquer disciplina com profundidade real e exemplos concretos
- Para exercícios matemáticos, físicos ou técnicos: mostra sempre os passos intermédios, não só o resultado
- Sugerir métodos de estudo, técnicas de memorização e preparação para exames
- Orientar na estrutura de trabalhos académicos e relatórios
- Apontar materiais concretos do repositório da plataforma quando forem relevantes para a pergunta

Materiais actualmente disponíveis no repositório (usa APENAS estes ao recomendar ou referir materiais existentes — nunca inventes títulos, autores ou materiais que não estejam nesta lista; se nada aqui for relevante, diz isso claramente):
${listaMateriais}

Regras de resposta:
- Explica com a profundidade que a pergunta merece — parágrafos completos, exemplos e, em exercícios, todos os passos do raciocínio; não cortes por brevidade artificial
- Usa listas numeradas ou com marcadores quando isso tornar a resposta mais clara de seguir
- Só sê curto quando a pergunta for genuinamente simples (ex: uma definição de uma linha) — nesses casos não estiques a resposta à força
- Vai directo ao essencial — sem introduções tipo "Claro que sim!", sem despedidas
- Se não souberes algo com certeza, diz claramente e indica onde pesquisar
- Nunca inventes factos, datas, autores ou resultados
- Evita emojis — usa linguagem para transmitir energia e precisão

Contexto da sessão:
- Estudante: ${utilizadorNome}${utilizadorCurso ? ` | Curso: ${utilizadorCurso}` : ""}
- Data: ${dataHoje}

Pergunta do estudante: ${mensagem}`;

      // gerarResumoIA tenta vários modelos por ordem (ver GEMINI_MODELS em services/ia.js)
      // em vez de um único modelo fixo — um modelo específico a falhar (quota, descontinuado,
      // instabilidade pontual da Google) já não derruba o assistente inteiro, ao contrário
      // do que acontecia aqui antes com uma chamada directa a "gemini-2.5-flash" sem rede
      // de segurança nenhuma.
      const fallback = "Não consegui obter uma resposta neste momento. Tente novamente dentro de instantes.";
      const resposta = await gerarResumoIA(prompt, fallback);
      res.status(200).json({ resposta });
    } catch (erro) {
      console.error("Erro na IA chat:", erro.message);
      res.status(500).json({
        erro: "A IA está temporariamente indisponível. Tente novamente em instantes.",
      });
    }
  });

  // ==========================================
  // SOCKET.IO — CHAT ENTRE ESTUDANTES (SALAS POR CURSO)
  // ==========================================
  // Autenticação da ligação: o browser envia o JWT automaticamente através
  // do cookie httpOnly (ver Chat.jsx, `io(url, { withCredentials: true })`) —
  // o handshake do socket.io não passa pelo cookie-parser do Express, por
  // isso o cabeçalho Cookie é lido e interpretado aqui manualmente. `auth.token`
  // fica como alternativa para clientes não-browser que liguem directamente.
  // Sem isto, qualquer cliente ligado directamente ao socket.io (fora da app)
  // podia enviar `userId`/`userName` arbitrários e falsificar a identidade de
  // outro utilizador no chat — o token verificado aqui é a ÚNICA fonte de
  // identidade usada em sendMessage, nunca o payload do evento.
  io.use(async (socket, next) => {
    // Uma excepção aqui dentro (ex: um cabeçalho Cookie malformado) derrubava
    // o processo Node inteiro — isto corre fora do try/catch global do Express,
    // por ser middleware do socket.io, não uma rota HTTP normal. Uma ligação de
    // um só cliente nunca deve poder tirar o serviço do ar para todos os outros.
    let tokenCookie = null;
    try {
      const cookiesBrutos = socket.handshake.headers.cookie;
      tokenCookie = cookiesBrutos ? cookie.parseCookie(cookiesBrutos).token : null;
    } catch {
      // Cookie malformado — ignora-se, cai para o token explícito (se houver).
    }
    const token = tokenCookie || socket.handshake.auth?.token;
    if (!token) {
      const erro = new Error("Autenticação necessária.");
      erro.data = { codigo: "auth_necessaria" };
      return next(erro);
    }
    try {
      socket.utilizador = await verificarSessao(token);
      next();
    } catch {
      // `data.codigo` é o que o cliente usa para decidir a mensagem a
      // mostrar (Chat.jsx) — mais robusto do que comparar o texto exacto de
      // `error.message`, que quebra silenciosamente se este texto mudar.
      const erro = new Error("Token inválido ou expirado.");
      erro.data = { codigo: "token_invalido" };
      next(erro);
    }
  });

  io.on("connection", (socket) => {
    // Sala pessoal — é para aqui que services/notificacoes.js empurra as
    // notificações em tempo real. Fica sempre activa, independentemente da
    // sala de chat escolhida.
    const salaPessoal = salaDoUtilizador(socket.utilizador.id);
    socket.join(salaPessoal);

    // Cliente pede para entrar numa sala de curso
    socket.on("joinRoom", (dados) => {
      const sala = normalizarSala(dados?.sala ?? dados?.curso);
      // Sai de todas as salas de chat (mantém a própria do socket e a pessoal)
      socket.rooms.forEach((room) => {
        if (room !== socket.id && room !== salaPessoal) socket.leave(room);
      });
      socket.join(sala);
    });

    socket.on("sendMessage", async (data) => {
      const { message } = data || {};
      // Sala: vem do cliente (é só uma escolha de sala, não uma alegação de
      // identidade). Identidade: vem SEMPRE do token verificado em io.use(),
      // nunca do payload — impede um cliente de se fazer passar por outro.
      const sala = normalizarSala(data?.sala ?? data?.curso);
      const userId = socket.utilizador.id;
      const userName = socket.utilizador.nome;

      if (typeof message !== "string" || !message.trim()) return;

      // Material partilhado (cartão na mensagem): só o id é aceite do cliente;
      // título e tipo vêm da BD, e só se estiver aprovado.
      let material = null;
      const materialId = Number.isInteger(data?.material_id) ? data.material_id : null;
      if (materialId) {
        try {
          const [[m]] = await db.query("SELECT id, titulo, tipo, cadeira FROM materiais WHERE id = ? AND status = 'aprovado'", [materialId]);
          if (m) material = m;
        } catch { /* sem cartão */ }
      }

      // Mesma verificação de conteúdo que a app já faz no browser (ver
      // filtroChat.js no frontend) — repetida aqui porque o filtro do lado
      // do cliente pode ser contornado por quem falar directamente com o socket.
      const { bloqueada, motivo } = analisarMensagem(message);
      if (bloqueada) {
        socket.emit("messageRejected", { motivo, mensagem: mensagemAviso(motivo) });
        return;
      }

      try {
        const [resultado] = await db.query(
          "INSERT INTO mensagens_estudantes (user_id, message, timestamp, curso, material_id) VALUES (?, ?, NOW(), ?, ?)",
          [userId, message, sala, material?.id || null]
        );
        // Emite com o ID da BD para permitir apagar em tempo real
        io.to(sala).emit("message", {
          id: resultado.insertId, message, userId, userName, timestamp: new Date(), curso: sala,
          material_id: material?.id || null, material_titulo: material?.titulo || null, material_tipo: material?.tipo || null,
        });
      } catch (error) {
        // Fallback: se a coluna curso não existir ainda, guarda sem ela
        try {
          await db.query(
            "INSERT INTO mensagens_estudantes (user_id, message, timestamp) VALUES (?, ?, NOW())",
            [userId, message]
          );
          io.to(sala).emit("message", { message, userId, userName, timestamp: new Date(), curso: sala });
        } catch (e) {
          console.error("Erro ao guardar mensagem:", e.message);
        }
      }
    });
  });

  /**
   * @openapi
   * /api/chat/messages:
   *   get:
   *     summary: Histórico de mensagens de uma sala de curso
   *     tags: [Chat]
   *     parameters:
   *       - in: query
   *         name: curso
   *         schema: { type: string, default: Geral }
   *     responses:
   *       200: { description: Últimas 60 mensagens da sala }
   */
  app.get("/api/chat/messages", autenticar, async (req, res) => {
    const curso = req.query.curso || "Geral";
    try {
      const [messages] = await db.query(
        `SELECT m.id, m.message, m.timestamp, m.user_id AS userId,
                COALESCE(u.nome, 'Utilizador') AS userName,
                COALESCE(m.curso, 'Geral') AS curso,
                m.material_id, mat.titulo AS material_titulo, mat.tipo AS material_tipo
         FROM mensagens_estudantes m
         LEFT JOIN usuarios u ON m.user_id = u.id
         LEFT JOIN materiais mat ON mat.id = m.material_id AND mat.status = 'aprovado'
         WHERE COALESCE(m.curso, 'Geral') = ?
         ORDER BY m.timestamp DESC
         LIMIT 60`,
        [normalizarSala(curso)]
      );
      res.status(200).json(messages.reverse());
    } catch {
      // Fallback sem filtro de curso (coluna ainda não existe)
      try {
        const [messages] = await db.query(
          `SELECT m.message, m.timestamp, m.user_id AS userId,
                  COALESCE(u.nome, 'Utilizador') AS userName
           FROM mensagens_estudantes m
           LEFT JOIN usuarios u ON m.user_id = u.id
           ORDER BY m.timestamp DESC
           LIMIT 60`
        );
        res.status(200).json(messages.reverse());
      } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar mensagens." });
      }
    }
  });

  // ==========================================
  // MODERAÇÃO DO CHAT — apenas admins
  // ==========================================

  /* Lista todas as mensagens (paginada, filtrável por curso) */
  /**
   * @openapi
   * /api/admin/mensagens:
   *   get:
   *     summary: Lista mensagens do chat para moderação (admin)
   *     tags: [Admin]
   *     parameters:
   *       - in: query
   *         name: curso
   *         schema: { type: string }
   *     responses:
   *       200: { description: Até 80 mensagens, mais recentes primeiro }
   * /api/admin/mensagens/{id}:
   *   delete:
   *     summary: Apaga uma mensagem do chat (admin)
   *     tags: [Admin]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Mensagem apagada }
   *       404: { description: Mensagem não encontrada }
   */
  app.get("/api/admin/mensagens", autenticar, apenasAdmin, async (req, res) => {
    const curso = req.query.curso || null;
    const limit = 80;
    try {
      const whereCurso = curso ? "WHERE COALESCE(m.curso,'Geral') = ?" : "";
      const params = curso ? [curso, limit] : [limit];
      const [rows] = await db.query(
        `SELECT m.id, m.message, m.timestamp, m.user_id AS userId,
                COALESCE(u.nome,'Utilizador') AS userName,
                COALESCE(m.curso,'Geral') AS curso
         FROM mensagens_estudantes m
         LEFT JOIN usuarios u ON m.user_id = u.id
         ${whereCurso}
         ORDER BY m.timestamp DESC
         LIMIT ?`,
        params
      );
      res.json(rows);
    } catch {
      res.status(500).json({ erro: "Erro ao buscar mensagens." });
    }
  });

  /* Apaga uma mensagem e notifica todos os clientes em tempo real */
  app.delete("/api/admin/mensagens/:id", autenticar, apenasAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ erro: "ID inválido." });
    try {
      const [[msg]] = await db.query("SELECT id, curso FROM mensagens_estudantes WHERE id = ?", [id]);
      if (!msg) return res.status(404).json({ erro: "Mensagem não encontrada." });

      await db.query("DELETE FROM mensagens_estudantes WHERE id = ?", [id]);

      // Notifica a sala do curso E todos os clientes (garante remoção imediata em todas as salas)
      io.to(msg.curso || "Geral").emit("messageDeleted", { id });
      io.emit("messageDeleted", { id });

      res.json({ mensagem: "Mensagem apagada." });
    } catch {
      res.status(500).json({ erro: "Erro ao apagar mensagem." });
    }
  });
};
