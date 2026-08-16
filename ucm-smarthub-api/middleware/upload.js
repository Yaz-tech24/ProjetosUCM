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

// ==========================================
// MULTER — materiais (tipos/tamanho reais validados no handler, a partir da configuração)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extensao = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + nomeUnico + extensao);
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
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const filtroImagem = (req, file, cb) => {
  if (TIPOS_IMAGEM.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagem não suportado. Use PNG, JPG, SVG ou WebP."));
  }
};

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB é mais que suficiente para um logótipo
  fileFilter: filtroImagem,
});

// ─── Multer — avatar de utilizador ────────────────────────────────────────
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: filtroImagem,
});

module.exports = { uploadsDir, upload, uploadLogo, uploadAvatar };
