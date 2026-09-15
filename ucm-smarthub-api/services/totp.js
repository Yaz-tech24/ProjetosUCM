const { generateSecret, verify, generateURI } = require("otplib");
const QRCode = require("qrcode");

// Uma tolerância de ±30 s (um período) tolera relógios ligeiramente dessincronizados
// entre o telemóvel e o servidor sem alargar de forma relevante a superfície
// de adivinhação (3 códigos válidos em vez de 1, entre 1 000 000).
const TOLERANCIA_SEGUNDOS = 30;

function gerarSecret() {
  return generateSecret();
}

async function verificarCodigo(secret, codigo) {
  if (!secret || !/^\d{6}$/.test(String(codigo || ""))) return false;
  try {
    const { valid } = await verify({ secret, token: String(codigo), epochTolerance: TOLERANCIA_SEGUNDOS });
    return valid === true;
  } catch {
    return false;
  }
}

function gerarOtpauthUrl({ secret, email, emissor }) {
  return generateURI({ issuer: emissor, label: email, secret });
}

async function gerarQrCodeDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
}

module.exports = { gerarSecret, verificarCodigo, gerarOtpauthUrl, gerarQrCodeDataUrl };
