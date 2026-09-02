const jwt = require("jsonwebtoken");

// Em produção, um JWT_SECRET não definido cairia silenciosamente para o
// valor de desenvolvimento — que está visível no código-fonte público —
// permitindo forjar tokens (incluindo de admin). server.js falha o arranque
// se isto acontecer em produção (ver iniciar() em server.js); aqui mantemos
// o fallback só para que testes e desenvolvimento local funcionem sem configuração extra.
const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";

// Fonte do token: cookie httpOnly primeiro (é como a SPA se autentica desde
// a migração para cookies — nunca guarda o token onde JavaScript o consiga
// ler, o que reduz o impacto de um eventual XSS), com o cabeçalho
// "Authorization: Bearer" como alternativa para clientes de API, o Swagger
// UI e os testes automatizados que assinam o seu próprio token.
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenCabecalho = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const token = req.cookies?.token || tokenCabecalho;

  if (!token) {
    return res.status(401).json({ erro: "Token de autenticação em falta." });
  }
  try {
    req.utilizador = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

function apenasAdmin(req, res, next) {
  if (req.utilizador?.papel !== "admin") {
    return res.status(403).json({ erro: "Acesso restrito a administradores." });
  }
  next();
}

module.exports = { autenticar, apenasAdmin, JWT_SECRET };
