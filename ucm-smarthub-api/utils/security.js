const crypto = require("crypto");
const fs = require("fs");

// Assinaturas de ficheiro (magic bytes). `offset` é onde a assinatura começa:
// MP4/MOV são contentores ISO-BMFF cujos 4 primeiros bytes são o tamanho da
// primeira "box" (variável), seguidos de "ftyp" — por isso verificam-se a
// partir do byte 4, não do 0.
const ASSINATURAS = {
  pdf:  [{ offset: 0, bytes: Buffer.from("%PDF", "ascii") }],
  mp4:  [{ offset: 4, bytes: Buffer.from("ftyp", "ascii") }],
  mov:  [{ offset: 4, bytes: Buffer.from("ftyp", "ascii") }],
  webm: [{ offset: 0, bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]) }],
  ogg:  [{ offset: 0, bytes: Buffer.from("OggS", "ascii") }],
  png:  [{ offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
  jpg:  [{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
  webp: [{ offset: 0, bytes: Buffer.from("RIFF", "ascii") }, { offset: 8, bytes: Buffer.from("WEBP", "ascii") }],
  // Office moderno é um ZIP ("PK"); Office legado é um contentor OLE.
  docx: [{ offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }],
  pptx: [{ offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }],
  doc:  [{ offset: 0, bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }],
  ppt:  [{ offset: 0, bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }],
};

const MIME_PARA_TIPO = {
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/x-m4v": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/ogg": "ogg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
};

const BYTES_CABECALHO = 16;

function gerarUUID() {
  return crypto.randomUUID();
}

// Todas as assinaturas do tipo têm de bater (WebP exige RIFF e WEBP).
function validarMagicBytes(buffer, tipo) {
  if (!buffer || buffer.length === 0) return false;
  const assinaturas = ASSINATURAS[String(tipo || "").toLowerCase()];
  if (!assinaturas) return false;
  return assinaturas.every(({ offset, bytes }) =>
    buffer.length >= offset + bytes.length &&
    buffer.subarray(offset, offset + bytes.length).equals(bytes)
  );
}

// Lê apenas o cabeçalho do ficheiro — um vídeo de 100 MB não precisa de ir
// inteiro para memória só para confirmar 8 bytes.
function lerCabecalhoFicheiro(caminho) {
  const fd = fs.openSync(caminho, "r");
  try {
    const buffer = Buffer.alloc(BYTES_CABECALHO);
    const lidos = fs.readSync(fd, buffer, 0, BYTES_CABECALHO, 0);
    return buffer.subarray(0, lidos);
  } finally {
    fs.closeSync(fd);
  }
}

function validarFicheiroPorMime(caminho, mimetype) {
  const tipo = MIME_PARA_TIPO[mimetype];
  if (!tipo) return false;
  return validarMagicBytes(lerCabecalhoFicheiro(caminho), tipo);
}

function sanitizarCaminhoFicheiro(caminho) {
  if (!caminho) return "";
  const partes = caminho.split(/[/\\]/);
  return partes[partes.length - 1];
}

module.exports = {
  gerarUUID,
  validarMagicBytes,
  validarFicheiroPorMime,
  lerCabecalhoFicheiro,
  sanitizarCaminhoFicheiro,
  MIME_PARA_TIPO,
};
