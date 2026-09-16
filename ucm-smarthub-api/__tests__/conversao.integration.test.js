import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Teste de integração REAL da conversão Office → PDF: precisa do LibreOffice
// instalado (como no Dockerfile e no job "conversao" do CI). Sem ele, os
// testes são saltados — nunca falham por o binário não existir localmente.
const { conversaoDisponivel, converterParaPdf } = require("../services/conversao");
const { validarFicheiroPorMime } = require("../utils/security");
const { extractPdfText } = require("../services/ia");

let disponivel = false;
beforeAll(async () => { disponivel = await conversaoDisponivel(); });

describe("Conversão DOCX → PDF com LibreOffice", () => {
  it("converte o fixture exemplo.docx num PDF válido com o texto original", async ({ skip }) => {
    if (!disponivel) return skip("LibreOffice não disponível nesta máquina");
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "smarthub-conv-"));
    const entrada = path.join(pasta, "exemplo.docx");
    fs.copyFileSync(path.join(__dirname, "fixtures", "exemplo.docx"), entrada);
    try {
      const pdf = await converterParaPdf(entrada);
      expect(pdf).toMatch(/\.pdf$/);
      expect(path.dirname(pdf)).toBe(pasta);
      expect(fs.statSync(pdf).size).toBeGreaterThan(500);
      expect(validarFicheiroPorMime(pdf, "application/pdf")).toBe(true);
      const texto = await extractPdfText(pdf);
      expect(texto).toContain("documento de teste");
      expect(texto).toContain("2x");
      // O nome do PDF é um UUID — nunca o nome original enviado pelo cliente
      expect(path.basename(pdf)).not.toContain("exemplo");
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  }, 180000);

  // Nota: texto simples renomeado para .docx é convertido na mesma pelo
  // LibreOffice (trata-o como texto) — é a verificação de assinatura em
  // utils/security.js, antes da conversão, que barra esses ficheiros. Aqui
  // testa-se um ZIP com cabeçalho válido mas conteúdo corrompido, que passa a
  // assinatura e tem de falhar na conversão com erro claro.
  it("um DOCX com assinatura ZIP mas conteúdo corrompido falha com erro claro", async ({ skip }) => {
    if (!disponivel) return skip("LibreOffice não disponível nesta máquina");
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "smarthub-conv-"));
    const entrada = path.join(pasta, "corrupto.docx");
    fs.writeFileSync(entrada, Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(200, 7)]));
    try {
      expect(validarFicheiroPorMime(entrada, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
      await expect(converterParaPdf(entrada)).rejects.toThrow(/Conversão/);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  }, 180000);
});
