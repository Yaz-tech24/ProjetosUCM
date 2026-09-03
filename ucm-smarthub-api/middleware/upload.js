const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getConfiguracoes } = require("../services/plataforma");
const { TAMANHO_MAXIMO_TECTO_MB } = require("../schemas");

// Garante que a pasta uploads existe ao carregar o módulo
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const MAPA_TIPOS_MIME = {
  pdf:  ["application/pdf"],
  mp4:  ["video/mp4", "video/x-m4v"],
  webm: ["video/webm"],
  ogg:  ["video/ogg"],
  mov:  ["video/quicktime"],
};

// Extensão do ficheiro guardado em disco vem SEMPRE daqui, nunca do nome
// original enviado pelo cliente — este, tal como o Content-Type, é
// inteiramente controlado por quem faz o pedido. Sem isto, um pedido com
// mimetype "application/pdf" (para passar o fileFilter) mas originalname
// "x.html" gravava e servia um ficheiro ".html" arbitrário a partir de
// /uploads, com o Content-Type real decidido pela extensão no disco.
const MAPA_EXTENSAO_MIME = {
  "application/pdf":  ".pdf",
  "video/mp4":         ".mp4",
  "video/x-m4v":       ".mp4",
  "video/webm":        ".webm",
  "video/ogg":         ".ogg",
  "video/quicktime":   ".mov",
  "image/png":         ".png",
  "image/jpeg":        ".jpg",
  "image/webp":        ".webp",
};
const extensaoSegura = (mimetype) => MAPA_EXTENSAO_MIME[mimetype] || "";

// ==========================================
// MULTER — materiais (tipos/tamanho reais validados no handler, a partir da configuração)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + nomeUnico + extensaoSegura(file.mimetype));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: TAMANHO_MAXIMO_TECTO_MB * 1024 * 1024 },
  fileFilter: async (req, file, cb) => {
    try {
      const config = await getConfiguracoes();
      const mimesPermitidos = (config.tipos_ficheiro_permitidos || "")
        .split(",").map(t => t.trim()).filter(Boolean)
        .flatMap(t => MAPA_TIPOS_MIME[t] || []);
      if (mimesPermitidos.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Tipo de ficheiro não permitido pela configuração actual da plataforma."));
      }
    } catch {
      cb(new Error("Não foi possível validar o tipo de ficheiro."));
    }
  },
});

// ─── Multer — logótipo da plataforma (imagens pequenas) ──────────────────────
// SVG deliberadamente de fora: pode conter <script>, e /uploads é servido sem
// CSP e sem X-Frame-Options (necessário para embutir PDFs/vídeos no
// visualizador) — aceitar SVG tornaria qualquer upload de imagem (incluindo o
// avatar, aberto a qualquer estudante autenticado, não só admins) um vector
// de XSS armazenado na origem da própria API.
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"];
const filtroImagem = (req, file, cb) => {
  if (TIPOS_IMAGEM.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagem não suportado. Use PNG, JPG ou WebP."));
  }
};

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${extensaoSegura(file.mimetype)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB é mais que suficiente para um logótipo
  fileFilter: filtroImagem,
});

// ─── Multer — avatar de utilizador ────────────────────────────────────────
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}${extensaoSegura(file.mimetype)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: filtroImagem,
});

module.exports = { uploadsDir, upload, uploadLogo, uploadAvatar };
