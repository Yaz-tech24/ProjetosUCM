const swaggerJsdoc = require("swagger-jsdoc");

const definicao = {
  openapi: "3.0.0",
  info: {
    title: "SmartHub API",
    version: "1.0.0",
    description: "API REST da plataforma académica SmartHub — autenticação, materiais, chat, configuração da plataforma e moderação por IA.",
  },
  servers: [
    { url: process.env.API_URL || "http://localhost:5000", description: "Servidor actual" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Erro: {
        type: "object",
        properties: { erro: { type: "string" } },
      },
      Utilizador: {
        type: "object",
        properties: {
          id: { type: "integer" },
          nome: { type: "string" },
          email: { type: "string" },
          papel: { type: "string", enum: ["estudante", "professor", "admin"] },
          curso: { type: "string" },
          avatar_url: { type: "string", nullable: true },
        },
      },
      Material: {
        type: "object",
        properties: {
          id: { type: "integer" },
          titulo: { type: "string" },
          cadeira: { type: "string" },
          tipo: { type: "string", enum: ["PDF", "Vídeo"] },
          url_arquivo: { type: "string" },
          data_upload: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["pendente", "aprovado"] },
          autor: { type: "string" },
          ia_sinalizado: { type: "boolean" },
          ia_motivo: { type: "string", nullable: true },
        },
      },
      Configuracao: {
        type: "object",
        properties: {
          nome_plataforma: { type: "string" },
          tagline: { type: "string" },
          descricao_proposito: { type: "string" },
          logo_url: { type: "string", nullable: true },
          cor_primaria: { type: "string", example: "#04122e" },
          cor_destaque: { type: "string", example: "#ffd700" },
          contacto_email: { type: "string" },
          localizacao: { type: "string" },
          link_facebook: { type: "string", nullable: true },
          link_instagram: { type: "string", nullable: true },
          link_linkedin: { type: "string", nullable: true },
          chat_activado: { type: "boolean" },
          ia_activada: { type: "boolean" },
          moderacao_ia_activada: { type: "boolean" },
          tipos_ficheiro_permitidos: { type: "string", example: "pdf,mp4,webm,ogg,mov" },
          tamanho_maximo_mb: { type: "integer" },
        },
      },
      Curso: {
        type: "object",
        properties: {
          id: { type: "integer" },
          nome: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

module.exports = swaggerJsdoc({
  definition: definicao,
  apis: [__dirname + "/server.js", __dirname + "/routes/*.js"],
});
