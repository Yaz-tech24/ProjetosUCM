const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { getConfiguracoes } = require("../services/plataforma");
const { genAI } = require("../services/ia");
const { autenticar, apenasAdmin, JWT_SECRET } = require("../middleware/auth");
const { limitarChat } = require("../middleware/rateLimiters");
const { analisarMensagem, mensagemAviso } = require("../utils/filtroChat");

module.exports = function registarRotasChat(app, io) {
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
      const prompt = `És o assistente académico de IA oficial da plataforma "${config.nome_plataforma}".

Identidade e tom:
- Culto, directo e encorajador — como um tutor experiente que respeita o tempo do estudante
- Trata o estudante pelo primeiro nome quando adequado
- Português europeu, linguagem académica mas acessível

Capacidades:
- Explicar conceitos de qualquer disciplina com clareza e exemplos concretos
- Para exercícios matemáticos, físicos ou técnicos: mostra os passos intermédios
- Sugerir métodos de estudo, técnicas de memorização e preparação para exames
- Orientar na estrutura de trabalhos académicos e relatórios

Regras de resposta:
- Extensão: máximo 5 frases corridas OU uma lista de 3 pontos numerados — escolhe o formato mais adequado à pergunta
- Vai sempre directo ao essencial — sem introduções, sem "Claro que sim!", sem despedidas
- Se não souberes algo com certeza, diz claramente e indica onde pesquisar
- Nunca inventes factos, datas, autores ou resultados
- Evita emojis — usa linguagem para transmitir energia e precisão

Contexto da sessão:
- Estudante: ${utilizadorNome}${utilizadorCurso ? ` | Curso: ${utilizadorCurso}` : ""}
- Data: ${dataHoje}

Pergunta do estudante: ${mensagem}`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent(prompt);
      const resposta = result.response.text();
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
  // Autenticação da ligação: o cliente envia o JWT em `auth.token` (ver
  // Chat.jsx). Sem isto, qualquer cliente ligado directamente ao socket.io
  // (fora da app) podia enviar `userId`/`userName` arbitrários e falsificar
  // a identidade de outro utilizador no chat — o token verificado aqui é a
  // ÚNICA fonte de identidade usada em sendMessage, nunca o payload do evento.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Autenticação necessária."));
    try {
      socket.utilizador = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("Token inválido ou expirado."));
    }
  });

  io.on("connection", (socket) => {
    // Cliente pede para entrar numa sala de curso
    socket.on("joinRoom", ({ curso }) => {
      const sala = curso || "Geral";
      // Sai de todas as salas excepto a própria do socket
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(sala);
    });

    socket.on("sendMessage", async (data) => {
      const { message } = data || {};
      // Sala: vem do cliente (é só uma escolha de sala, não uma alegação de
      // identidade). Identidade: vem SEMPRE do token verificado em io.use(),
      // nunca do payload — impede um cliente de se fazer passar por outro.
      const sala = data?.curso || "Geral";
      const userId = socket.utilizador.id;
      const userName = socket.utilizador.nome;

      if (typeof message !== "string" || !message.trim()) return;

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
          "INSERT INTO mensagens_estudantes (user_id, message, timestamp, curso) VALUES (?, ?, NOW(), ?)",
          [userId, message, sala]
        );
        // Emite com o ID da BD para permitir apagar em tempo real
        io.to(sala).emit("message", { id: resultado.insertId, message, userId, userName, timestamp: new Date(), curso: sala });
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
   *     security: []
   *     parameters:
   *       - in: query
   *         name: curso
   *         schema: { type: string, default: Geral }
   *     responses:
   *       200: { description: Últimas 60 mensagens da sala }
   */
  app.get("/api/chat/messages", async (req, res) => {
    const curso = req.query.curso || "Geral";
    try {
      const [messages] = await db.query(
        `SELECT m.id, m.message, m.timestamp, m.user_id AS userId,
                COALESCE(u.nome, 'Utilizador') AS userName,
                COALESCE(m.curso, 'Geral') AS curso
         FROM mensagens_estudantes m
         LEFT JOIN usuarios u ON m.user_id = u.id
         WHERE COALESCE(m.curso, 'Geral') = ?
         ORDER BY m.timestamp DESC
         LIMIT 60`,
        [curso]
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
