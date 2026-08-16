import { describe, it, expect, vi, beforeEach } from "vitest";

// Estes testes chamam verificarConformidadeIA directamente com um cliente Gemini
// falso (ver abaixo) — nunca tocam na BD, por isso não precisam de a mockar.
const { verificarConformidadeIA } = require("../services/ia");

// `verificarConformidadeIA` aceita um cliente Gemini injectável (3º parâmetro) —
// evita ter de mockar o módulo do SDK (o node_modules externo não é interceptado
// por vi.mock() da mesma forma que os módulos locais do projecto).
const generateContentMock = vi.fn();
const clienteFalso = { getGenerativeModel: () => ({ generateContent: generateContentMock }) };

const configBase = {
  moderacao_ia_activada: true,
  descricao_proposito: "Plataforma académica para partilha de materiais de estudo.",
};

const material = { titulo: "Álgebra Linear", cadeira: "Matemática", tipo: "PDF" };

describe("verificarConformidadeIA", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it("não sinaliza e não chama a IA quando a moderação está desactivada", async () => {
    const r = await verificarConformidadeIA({ ...configBase, moderacao_ia_activada: false }, material, clienteFalso);
    expect(r).toEqual({ sinalizado: false, motivo: null });
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("não sinaliza quando não há cliente de IA disponível (sem chave configurada)", async () => {
    const r = await verificarConformidadeIA(configBase, material, null);
    expect(r).toEqual({ sinalizado: false, motivo: null });
  });

  it("sinaliza quando a IA responde conforme:false", async () => {
    generateContentMock.mockResolvedValue({
      response: { text: () => '{"conforme": false, "motivo": "Não é material académico."}' },
    });
    const r = await verificarConformidadeIA(configBase, material, clienteFalso);
    expect(r.sinalizado).toBe(true);
    expect(r.motivo).toBe("Não é material académico.");
  });

  it("não sinaliza quando a IA responde conforme:true", async () => {
    generateContentMock.mockResolvedValue({
      response: { text: () => '{"conforme": true, "motivo": ""}' },
    });
    const r = await verificarConformidadeIA(configBase, material, clienteFalso);
    expect(r).toEqual({ sinalizado: false, motivo: null });
  });

  it("lê o JSON mesmo envolto em markdown (```json ... ```)", async () => {
    generateContentMock.mockResolvedValue({
      response: { text: () => '```json\n{"conforme": false, "motivo": "Spam"}\n```' },
    });
    const r = await verificarConformidadeIA(configBase, material, clienteFalso);
    expect(r).toEqual({ sinalizado: true, motivo: "Spam" });
  });

  it("falha aberta (não sinaliza) quando a IA rebenta com um erro", async () => {
    generateContentMock.mockRejectedValue(new Error("timeout da API"));
    const r = await verificarConformidadeIA(configBase, material, clienteFalso);
    expect(r).toEqual({ sinalizado: false, motivo: null });
  });

  it("falha aberta quando a resposta não é JSON válido", async () => {
    generateContentMock.mockResolvedValue({ response: { text: () => "resposta em texto solto, sem chavetas" } });
    const r = await verificarConformidadeIA(configBase, material, clienteFalso);
    expect(r).toEqual({ sinalizado: false, motivo: null });
  });
});
