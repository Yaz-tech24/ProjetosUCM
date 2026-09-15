const jwt = require("jsonwebtoken");
const { sessaoActiva } = require("../services/sessoes");

// Em produção, um JWT_SECRET não definido cairia silenciosamente para o
// valor de desenvolvimento — que está visível no código-fonte público —
// permitindo forjar tokens (incluindo de admin). server.js falha o arranque
// se isto acontecer em produção (ver iniciar() em server.js); aqui mantemos
// o fallback só para que testes e desenvolvimento local funcionem sem configuração extra.
const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";

function erroSessao(nome, mensagem) {
  const erro = new Error(mensagem);
  erro.name = nome;
  return erro;
}

// Valida um token como SESSÃO, não só como JWT assinado:
// - o login com 2FA emite um JWT intermédio ({ id, fase: "2fa" }) que só serve
//   para /api/login/2fa — assinado com a mesma chave, tem de ser recusado aqui,
//   senão dava acesso total durante 5 minutos a quem tivesse só a palavra-passe;
// - sessões emitidas pelo login trazem `jti` e existem na tabela sessoes — é
//   isso que permite "terminar sessão noutro dispositivo". Tokens sem jti
//   (assinados à mão por testes/ferramentas) só são aceites fora de produção.
async function verificarSessao(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.fase || !payload.papel) throw erroSessao("TokenNaoSessao", "Token não é uma sessão");
  if (payload.jti) {
    if (!(await sessaoActiva(payload.jti))) throw erroSessao("SessaoRevogada", "Sessão terminada");
  } else if (process.env.NODE_ENV === "production") {
    throw erroSessao("TokenSemSessao", "Token sem sessão registada");
  }
  return payload;
}

// Fonte do token: cookie httpOnly primeiro (é como a SPA se autentica desde
// a migração para cookies — nunca guarda o token onde JavaScript o consiga
// ler, o que reduz o impacto de um eventual XSS), com o cabeçalho
// "Authorization: Bearer" como alternativa para clientes de API, o Swagger
// UI e os testes automatizados que assinam o seu próprio token.
function extrairToken(req) {
  const authHeader = req.headers.authorization;
  const tokenCabecalho = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  return req.cookies?.token || tokenCabecalho;
}

async function autenticar(req, res, next) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ erro: "Token de autenticação em falta." });
  }
  try {
    req.utilizador = await verificarSessao(token);
    req.sessaoJti = req.utilizador.jti || null;
    next();
  } catch (erro) {
    const mensagem = erro.name === "SessaoRevogada" ? "Sessão terminada. Volte a entrar." : "Token inválido ou expirado.";
    return res.status(401).json({ erro: mensagem });
  }
}

function apenasAdmin(req, res, next) {
  if (req.utilizador?.papel !== "admin") {
    return res.status(403).json({ erro: "Acesso restrito a administradores." });
  }
  next();
}

// Docentes e admins — para acções de disciplina (calendário) que não são de
// administração da plataforma mas também não são para qualquer estudante.
function apenasDocenteOuAdmin(req, res, next) {
  if (!["admin", "professor"].includes(req.utilizador?.papel)) {
    return res.status(403).json({ erro: "Acesso restrito a docentes e administradores." });
  }
  next();
}

module.exports = { autenticar, apenasAdmin, apenasDocenteOuAdmin, verificarSessao, extrairToken, JWT_SECRET };
