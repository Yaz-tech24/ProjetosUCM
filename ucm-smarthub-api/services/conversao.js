const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { gerarUUID } = require("../utils/security");

// Conversão de documentos Office para PDF com o LibreOffice em modo headless.
// O binário chama-se "soffice" (Linux/Windows) ou "libreoffice" (algumas
// distribuições); SOFFICE_PATH permite apontar para um caminho explícito.
// Sem LibreOffice instalado, a conversão fica indisponível e o upload de
// DOCX/PPTX é recusado com uma mensagem clara — nunca aceite em silêncio.
const CANDIDATOS = [process.env.SOFFICE_PATH, "soffice", "libreoffice", "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice"].filter(Boolean);
const TIMEOUT_MS = 120 * 1000;

const MIME_CONVERTIVEIS = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
};

let binarioDetectado; // undefined = ainda não procurado; null = não existe

function testarBinario(candidato) {
  return new Promise(resolve => {
    execFile(candidato, ["--version"], { timeout: 15000, windowsHide: true }, (erro) => resolve(!erro));
  });
}

async function detectarBinario() {
  if (binarioDetectado !== undefined) return binarioDetectado;
  for (const candidato of CANDIDATOS) {
    if (await testarBinario(candidato)) { binarioDetectado = candidato; return candidato; }
  }
  binarioDetectado = null;
  return null;
}

async function conversaoDisponivel() {
  return Boolean(await detectarBinario());
}

const formatoConvertivel = (mimetype) => MIME_CONVERTIVEIS[mimetype] || null;

// Devolve o caminho do PDF gerado (nome UUID) na mesma pasta do original.
// O LibreOffice grava sempre <nome-original>.pdf no --outdir; renomeia-se a
// seguir para não expor o nome enviado pelo cliente.
async function converterParaPdf(caminhoEntrada) {
  const binario = await detectarBinario();
  if (!binario) throw new Error("LibreOffice não disponível neste servidor.");

  const dir = path.dirname(caminhoEntrada);
  // Perfil de utilizador isolado por conversão: duas conversões em simultâneo
  // com o mesmo perfil bloqueiam-se uma à outra (ficheiro .lock do LibreOffice).
  const perfil = path.join(dir, `.lo-profile-${gerarUUID()}`);
  const args = [
    "--headless", "--norestore", "--nologo",
    `-env:UserInstallation=file:///${perfil.replace(/\\/g, "/")}`,
    "--convert-to", "pdf", "--outdir", dir, caminhoEntrada,
  ];

  await new Promise((resolve, reject) => {
    execFile(binario, args, { timeout: TIMEOUT_MS, windowsHide: true }, (erro, stdout, stderr) => {
      if (erro) return reject(new Error(`Conversão falhou: ${stderr || erro.message}`));
      resolve();
    });
  });
  fs.rm(perfil, { recursive: true, force: true }, () => {});

  const gerado = path.join(dir, path.basename(caminhoEntrada, path.extname(caminhoEntrada)) + ".pdf");
  if (!fs.existsSync(gerado)) throw new Error("Conversão terminou sem produzir PDF.");
  const destino = path.join(dir, `${gerarUUID()}.pdf`);
  fs.renameSync(gerado, destino);
  return destino;
}

module.exports = { MIME_CONVERTIVEIS, formatoConvertivel, conversaoDisponivel, converterParaPdf };
