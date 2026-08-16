import { describe, it, expect } from "vitest";
import path from "path";

// Teste de regressão: pdf-parse 2.x deixou de expor uma função callable
// directamente (`pdfParse(buffer)`) e passou a expor a classe `PDFParse`
// (`new PDFParse({ data }).getText()`). O código antigo continuava a
// "funcionar" silenciosamente porque o erro era apanhado pelo try/catch em
// routes/materiais.js e o resumo caía para o texto genérico — nenhum PDF
// estava de facto a ser lido. Este teste chama a função real (sem mocks)
// contra um PDF mínimo válido, para garantir que a extracção real funciona.
const { extractPdfText } = require("../services/ia");

describe("extractPdfText", () => {
  it("extrai texto real de um PDF válido", async () => {
    const texto = await extractPdfText(path.join(__dirname, "fixtures", "minimo.pdf"));
    expect(texto).toContain("Teste PDF");
  });
});
