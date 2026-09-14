const crypto = require("crypto");

// Magic bytes (file signatures) para validar tipo de ficheiro
const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  mp4: [Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])], // ftyp
  webm: Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), // EBML
  ogg: Buffer.from([0x4F, 0x67, 0x67, 0x53]), // OggS
  mov: [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], // ftyp (QuickTime)
  png: Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG signature
  jpg: Buffer.from([0xFF, 0xD8, 0xFF]), // JPEG signature
  webp: Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF (WebP/WAV container)
};

// Gerar UUID v4 para nomes de ficheiro (evita path traversal)
function gerarUUID() {
  return crypto.randomUUID();
}

// Validar magic bytes do ficheiro (primeiros bytes da assinatura)
function validarMagicBytes(buffer, tipoEsperado) {
  if (!buffer || buffer.length === 0) return false;

  const tipoLower = tipoEsperado.toLowerCase();
  const magicBytes = MAGIC_BYTES[tipoLower];

  if (!magicBytes) return false;

  // Se for array (múltiplas assinaturas válidas)
  if (Array.isArray(magicBytes)) {
    return magicBytes.some(bytes => buffer.subarray(0, bytes.length).equals(bytes));
  }

  // Comparação direta
  return buffer.subarray(0, magicBytes.length).equals(magicBytes);
}

// Sanitizar nome de ficheiro para logs/mensagens (remove caminhos)
function sanitizarCaminhoFicheiro(caminho) {
  if (!caminho) return "";
  const partes = caminho.split(/[\/\\]/);
  return partes[partes.length - 1];
}

module.exports = {
  gerarUUID,
  validarMagicBytes,
  sanitizarCaminhoFicheiro,
  MAGIC_BYTES,
};
