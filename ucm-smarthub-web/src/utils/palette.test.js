import { describe, it, expect } from "vitest";
import { derivarPaleta } from "./palette";

// Valores por defeito também fixados como fallback em index.css. A derivação a
// partir destas duas cores base reproduz esses tons de perto — a conversão
// HSL⇄RGB envolve arredondamentos, por isso comparamos por canal com uma
// tolerância pequena em vez de exigir o hex exacto (excepto nos tokens de
// identidade, que devem ser bit-a-bit iguais às cores base).
const CORES_ESPERADAS_POR_DEFEITO = {
  "navy-abyss":  "#020b18",
  "navy-deep":   "#04122e",
  "navy":        "#071832",
  "navy-mid":    "#0d254a",
  "navy-bright": "#1a3a6b",
  "gold-dark":   "#c9a800",
  "gold":        "#ffd700",
  "gold-light":  "#ffe88a",
  "ice":         "#f0f5ff",
};

const TOLERANCIA_CANAL = 5;
const hexParaCanais = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

describe("derivarPaleta", () => {
  const paleta = derivarPaleta("#04122e", "#ffd700");

  it("reproduz de perto os tons por defeito a partir das cores base originais", () => {
    for (const [nome, hexEsperado] of Object.entries(CORES_ESPERADAS_POR_DEFEITO)) {
      const obtido = hexParaCanais(paleta[nome].hex);
      const esperado = hexParaCanais(hexEsperado);
      obtido.forEach((canal, i) => {
        expect(Math.abs(canal - esperado[i]), `${nome}: ${paleta[nome].hex} vs ${hexEsperado}`).toBeLessThanOrEqual(TOLERANCIA_CANAL);
      });
    }
  });

  it("devolve a cor primária/destaque identicamente em navy-deep/gold", () => {
    expect(paleta["navy-deep"].hex.toLowerCase()).toBe("#04122e");
    expect(paleta.gold.hex.toLowerCase()).toBe("#ffd700");
  });

  it("gera o trio RGB correspondente a cada hex", () => {
    expect(paleta["navy-deep"].rgb).toBe("4,18,46");
    expect(paleta.gold.rgb).toBe("255,215,0");
  });

  it("com cores diferentes, gera uma paleta diferente mas com a mesma estrutura", () => {
    const outra = derivarPaleta("#7a1f9c", "#00c2ff");
    expect(outra["navy-deep"].hex.toLowerCase()).toBe("#7a1f9c");
    expect(outra.gold.hex.toLowerCase()).toBe("#00c2ff");
    expect(Object.keys(outra)).toEqual(Object.keys(paleta));
  });
});
