/*
 * Sistema de paleta dinâmica — deriva toda a gama de cores da marca a partir
 * de apenas duas cores base (primária + destaque) escolhidas pelo admin.
 *
 * Os tokens gerados correspondem 1:1 aos que existiam fixos em index.css,
 * por isso os valores por defeito (#04122e / #ffd700) reproduzem o visual
 * original da aplicação — mudar as cores no admin recalcula tudo em runtime.
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }) {
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

const rgbToHex = ({ r, g, b }) =>
  "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

const rgbToTriplet = ({ r, g, b }) => `${r},${g},${b}`;

/** Ajusta luminosidade (e opcionalmente saturação) de uma cor hex, devolvendo {hex, rgb}. */
function ajustar(hex, { l: deltaL = 0, s: deltaS = 0 } = {}) {
  const hsl = rgbToHsl(hexToRgb(hex));
  const nova = { h: hsl.h, s: clamp(hsl.s + deltaS, 0, 100), l: clamp(hsl.l + deltaL, 0, 100) };
  const rgb = hslToRgb(nova);
  return { hex: rgbToHex(rgb), rgb: rgbToTriplet(rgb) };
}

const identidade = (hex) => {
  const rgb = hexToRgb(hex);
  return { hex, rgb: rgbToTriplet(rgb) };
};

// Deltas de luminosidade/saturação (em HSL) medidos a partir da paleta original
// desenhada à mão (base: primária #04122e, destaque #ffd700). Aplicar estes deltas
// às cores por defeito reproduz exactamente o visual original; com outras cores
// escolhidas pelo admin, aplica o mesmo deslocamento relativo de forma coerente.
export function derivarPaleta(corPrimaria, corDestaque) {
  return {
    "navy-abyss":  ajustar(corPrimaria, { l: -4.7, s: 0.6 }),
    "navy-deep":   identidade(corPrimaria),
    "navy":        ajustar(corPrimaria, { l: 1.4,  s: -8.6 }),
    "navy-mid":    ajustar(corPrimaria, { l: 7.3,  s: -13.9 }),
    "navy-bright": ajustar(corPrimaria, { l: 16.3, s: -23.1 }),
    "blue-accent": ajustar(corPrimaria, { l: 40.0, s: -7.6 }),
    "blue-sky":    ajustar(corPrimaria, { l: 73.1, s: 16.0 }),

    "gold-dark":   ajustar(corDestaque, { l: -10.6 }),
    "gold":        identidade(corDestaque),
    "gold-light":  ajustar(corDestaque, { l: 27.1 }),
    "gold-pale":   ajustar(corDestaque, { l: 36.1 }),
    "gold-rich":   ajustar(corDestaque, { l: -4.9 }),

    "ice":         ajustar(corPrimaria, { l: 87.3, s: 16.0 }),
    "ice-mid":     ajustar(corPrimaria, { l: 85.1, s: -7.1 }),
  };
}

/** Aplica a paleta derivada como propriedades CSS em :root — cor sólida e trio RGB. */
export function aplicarPaleta(corPrimaria, corDestaque) {
  if (!corPrimaria || !corDestaque) return;
  const paleta = derivarPaleta(corPrimaria, corDestaque);
  const root = document.documentElement.style;
  for (const [nome, { hex, rgb }] of Object.entries(paleta)) {
    root.setProperty(`--color-${nome}`, hex);
    root.setProperty(`--color-${nome}-rgb`, rgb);
  }
}
