import { describe, it, expect, vi, beforeEach } from "vitest";

const db = require("../config/db");
const flashcards = require("../services/flashcards");
const { calcularSequencia, CONQUISTAS } = require("../services/conquistas");
const { normalizar, classificarDenuncia } = require("../services/moderacaoDenuncias");
const { traduzirComCache, hashDe } = require("../services/traducao");
const { resumoCurto } = require("../services/digest");
const { nomeFicheiroSeguro, prepararEntradas } = require("../services/exportarZip");

describe("Flashcards — SM-2 simplificado", () => {
  it("primeira revisão: facil → 1 dia, depois 6, depois ×facilidade", () => {
    let e = flashcards.proximoEstado(null, "facil");
    expect(e).toMatchObject({ intervalo_dias: 1, repeticoes: 1, total_revisoes: 1 });
    expect(e.facilidade).toBeCloseTo(2.6);
    e = flashcards.proximoEstado(e, "facil");
    expect(e.intervalo_dias).toBe(6);
    e = flashcards.proximoEstado(e, "facil");
    expect(e.intervalo_dias).toBe(Math.round(6 * 2.7));
  });

  it("errei recomeça a contagem e baixa a facilidade sem passar do mínimo", () => {
    let e = { facilidade: 1.4, repeticoes: 5, intervalo_dias: 40, total_revisoes: 5 };
    e = flashcards.proximoEstado(e, "errei");
    expect(e).toMatchObject({ intervalo_dias: 1, repeticoes: 0, total_revisoes: 6 });
    expect(e.facilidade).toBe(1.3);
  });

  it("dificil cresce devagar", () => {
    const e = flashcards.proximoEstado({ facilidade: 2.5, repeticoes: 3, intervalo_dias: 10, total_revisoes: 3 }, "dificil");
    expect(e.intervalo_dias).toBe(12);
    expect(e.facilidade).toBeCloseTo(2.35);
  });

  it("o intervalo nunca passa de um ano e a facilidade de 3.5", () => {
    const e = flashcards.proximoEstado({ facilidade: 3.5, repeticoes: 9, intervalo_dias: 300, total_revisoes: 9 }, "facil");
    expect(e.intervalo_dias).toBe(365);
    expect(e.facilidade).toBe(3.5);
  });

  it("dataMaisDias devolve AAAA-MM-DD no futuro", () => {
    const d = flashcards.dataMaisDias(3);
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(d).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Conquistas — sequência de dias", () => {
  const dia = (offset) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };

  it("conta dias seguidos até hoje", () => {
    expect(calcularSequencia([dia(0), dia(1), dia(2), dia(5)])).toEqual({ actual: 3, melhor: 3 });
  });

  it("uma sequência que terminou ontem ainda conta como actual", () => {
    expect(calcularSequencia([dia(1), dia(2)]).actual).toBe(2);
  });

  it("um dia de intervalo quebra a sequência actual mas mantém a melhor", () => {
    const r = calcularSequencia([dia(0), dia(2), dia(3), dia(4), dia(5)]);
    expect(r.actual).toBe(1);
    expect(r.melhor).toBe(4);
  });

  it("sem actividade recente a sequência é zero", () => {
    expect(calcularSequencia([dia(3), dia(4)])).toEqual({ actual: 0, melhor: 2 });
    expect(calcularSequencia([])).toEqual({ actual: 0, melhor: 0 });
  });

  it("todas as conquistas têm código único e métrica conhecida", () => {
    const codigos = CONQUISTAS.map(c => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const c of CONQUISTAS) expect(c.alvo).toBeGreaterThan(0);
  });
});

describe("Moderação assistida de denúncias", () => {
  it("normaliza respostas fora do vocabulário para 'incerto'/'rever'", () => {
    expect(normalizar({ classificacao: "spam", sugestao: "remover", motivo: "x" })).toEqual({ classificacao: "spam", sugestao: "remover", motivo: "x" });
    expect(normalizar({ classificacao: "banir", sugestao: "apagar_tudo", motivo: 5 })).toEqual({ classificacao: "incerto", sugestao: "rever", motivo: "" });
    expect(normalizar(null).sugestao).toBe("rever");
  });

  it("usa o cliente injectado e devolve null quando a IA falha", async () => {
    const clienteOk = { getGenerativeModel: () => ({ generateContent: async () => ({ response: { text: () => '```json\n{"classificacao":"ofensivo","sugestao":"remover","motivo":"Insulto directo."}\n```' } }) }) };
    const r = await classificarDenuncia({ tipo: "comentario", motivo: "assedio", detalhes: null, conteudo: "És um idiota" }, clienteOk);
    expect(r).toEqual({ classificacao: "ofensivo", sugestao: "remover", motivo: "Insulto directo." });

    const clienteMau = { getGenerativeModel: () => ({ generateContent: async () => { throw new Error("quota"); } }) };
    expect(await classificarDenuncia({ tipo: "comentario", motivo: "spam", conteudo: "x" }, clienteMau)).toBeNull();
    expect(await classificarDenuncia({ tipo: "comentario", motivo: "spam", conteudo: "" }, clienteOk)).toBeNull();
  });
});

describe("Tradução com cache", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("devolve da cache quando o hash do texto de origem coincide, sem chamar a IA", async () => {
    const texto = "VISÃO GERAL\nTexto.";
    const chamadas = [];
    vi.spyOn(db, "query").mockImplementation((sql, params) => {
      chamadas.push(sql);
      if (/SELECT texto, origem_hash/.test(sql)) return Promise.resolve([[{ texto: "OVERVIEW\nText.", origem_hash: hashDe(texto), gerado_em: new Date() }]]);
      return Promise.resolve([[]]);
    });
    const r = await traduzirComCache({ materialId: 1, campo: "resumo", idioma: "en", texto });
    expect(r).toEqual({ texto: "OVERVIEW\nText.", cache: true });
    expect(chamadas.some(s => /INSERT INTO traducoes/.test(s))).toBe(false);
  });

  it("uma cache desactualizada (hash diferente) traduz de novo e grava", async () => {
    const chamadas = [];
    vi.spyOn(db, "query").mockImplementation((sql, params) => {
      chamadas.push({ sql, params });
      if (/SELECT texto, origem_hash/.test(sql)) return Promise.resolve([[{ texto: "OLD", origem_hash: "0".repeat(64) }]]);
      return Promise.resolve([{ affectedRows: 1 }]);
    });
    const traduzirFalso = vi.fn(async (texto, idioma) => `[${idioma}] ${texto}`);
    const r = await traduzirComCache({ materialId: 1, campo: "resumo", idioma: "en", texto: "novo" }, traduzirFalso);
    expect(r).toEqual({ texto: "[en] novo", cache: false });
    const insert = chamadas.find(c => /INSERT INTO traducoes/.test(c.sql));
    expect(insert.params).toEqual([1, "resumo", "en", "[en] novo", hashDe("novo")]);
  });
});

describe("Digest — resumo curto", () => {
  it("lista só as partes com conteúdo", () => {
    expect(resumoCurto({ materiais: [1, 2], perguntas: [], eventos: [1], pedidos: [], flashcards_pendentes: 0 })).toBe("2 material(is) novo(s) · 1 evento(s) nos próximos dias");
    expect(resumoCurto({ materiais: [], perguntas: [], eventos: [], pedidos: [], flashcards_pendentes: 0 })).toBe("");
  });
});

describe("Exportar ZIP — nomes e limites", () => {
  it("remove acentos e caracteres perigosos dos nomes", () => {
    expect(nomeFicheiroSeguro("Cálculo I: limites/derivadas <2024>")).toBe("Calculo I limites derivadas 2024");
    expect(nomeFicheiroSeguro("../../etc/passwd")).toBe(".. .. etc passwd"); // sem barras: nunca sai da pasta do zip
    expect(nomeFicheiroSeguro("")).toBe("material");
  });

  it("ignora vídeos e ficheiros inexistentes e numera os PDFs", async () => {
    const fs = require("fs");
    const path = require("path");
    const { uploadsDir } = require("../middleware/upload");
    const nome = `teste-entradas-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(uploadsDir, nome), "%PDF-1.4");
    try {
      const r = await prepararEntradas([
        { titulo: "A", tipo: "Vídeo", url_arquivo: "/uploads/a.mp4" },
        { titulo: "B", tipo: "PDF", url_arquivo: `/uploads/${nome}` },
        { titulo: "C", tipo: "PDF", url_arquivo: "/uploads/../../segredo.pdf" },
      ]);
      expect(r.ignorados).toBe(2);
      expect(r.entradas).toHaveLength(1);
      expect(r.entradas[0].nome).toBe("02 - B.pdf");
    } finally {
      fs.unlinkSync(path.join(uploadsDir, nome));
    }
  });
});
