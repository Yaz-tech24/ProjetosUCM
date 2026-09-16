#!/usr/bin/env node
// Fluxos de UI ponta-a-ponta no build de produção, em Chromium headless:
//   1) login em dois passos (2FA) com código TOTP e com código de recuperação;
//   2) guardar um PDF para offline, cortar a rede e voltar a abri-lo;
//   3) paleta de pesquisa (Ctrl+K), página de pedidos e separadores novos do material.
//
// Pré-requisitos (ver .github/workflows/ci.yml, job "ui"):
//   - API a correr em API_URL (por defeito http://localhost:5055) com DESATIVAR_RATE_LIMIT=1;
//   - frontend em FRONT_URL (por defeito http://localhost:4173 = `vite preview`, que faz
//     proxy de /api, /uploads e /socket.io para a API);
//   - playwright-core instalado (devDependency) e um Chromium: `npx playwright-core install chromium`
//     ou CHROME_PATH a apontar para um binário.
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const API_DIR = path.join(__dirname, "..", "..", "ucm-smarthub-api");
process.chdir(API_DIR);
require(path.join(API_DIR, "node_modules", "dotenv")).config({ path: path.join(API_DIR, ".env"), quiet: true });
const db = require(path.join(API_DIR, "config", "db"));
const { generate } = require(path.join(API_DIR, "node_modules", "otplib"));

const FRONT = process.env.FRONT_URL || "http://localhost:4173";
const email = `fluxo-${Date.now()}@teste.com`, senha = "Senha12345";
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, "..", "..", "shots-ci");
fs.mkdirSync(SHOTS, { recursive: true });
let falhas = 0, passos = 0;
const ok = (c, m, extra) => { passos++; console.log((c ? "  ✓ " : "  ✗ ") + m + (extra !== undefined ? " → " + JSON.stringify(extra).slice(0, 140) : "")); if (!c) falhas++; };
const chamar = async (metodo, caminho, corpo, token) => {
  const r = await fetch(FRONT + "/api" + caminho, {
    method: metodo,
    headers: { ...(corpo instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

async function localizarChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  // executablePath() devolve o caminho da versão que este playwright-core
  // espera, mesmo que não esteja instalada — confirma-se e, se faltar,
  // aceita-se qualquer Chromium já instalado pelo Playwright.
  try {
    const esperado = chromium.executablePath();
    if (fs.existsSync(esperado)) return esperado;
  } catch { /* sem caminho conhecido */ }
  {
    const candidatos = [
      path.join(process.env.LOCALAPPDATA || "", "ms-playwright"),
      path.join(process.env.HOME || "", ".cache", "ms-playwright"),
    ];
    for (const base of candidatos) {
      if (!fs.existsSync(base)) continue;
      const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
      if (!dir) continue;
      for (const bin of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const p = path.join(base, dir, bin);
        if (fs.existsSync(p)) return p;
      }
    }
    return null;
  }
}

(async () => {
  let materialId = null, adminEmail = null;
  try {
    const [cursos] = await db.query("SELECT nome FROM cursos ORDER BY id LIMIT 1");
    const curso = cursos[0]?.nome || "Geral";
    await chamar("POST", "/register", { nome: "Fluxo Bot", email, senha, curso });
    await db.query("UPDATE usuarios SET email_verificado = 1 WHERE email = ?", [email]);
    const login = await chamar("POST", "/login", { email, senha });
    const token = login.body.token;
    ok(!!token, "conta de teste criada e autenticada pela API");

    // Material PDF aprovado para os fluxos (criado por uma conta admin descartável)
    adminEmail = `fluxo-admin-${Date.now()}@teste.com`;
    await chamar("POST", "/register", { nome: "Fluxo Admin", email: adminEmail, senha, curso });
    await db.query("UPDATE usuarios SET email_verificado = 1, papel = 'admin' WHERE email = ?", [adminEmail]);
    const tokenAdmin = (await chamar("POST", "/login", { email: adminEmail, senha })).body.token;
    const form = new FormData();
    form.append("titulo", "PDF de fluxo UI");
    form.append("cadeira", curso);
    form.append("tipo", "PDF");
    form.append("arquivo", new Blob([fs.readFileSync(path.join(API_DIR, "__tests__", "fixtures", "minimo.pdf"))], { type: "application/pdf" }), "fluxo.pdf");
    const up = await chamar("POST", "/materiais", form, tokenAdmin);
    materialId = up.body?.id_novo_material;
    ok(!!materialId, "PDF de teste enviado", { id: materialId, status: up.body?.status });
    if (up.body?.status !== "aprovado") await chamar("PUT", `/admin/materiais/${materialId}/status`, { acao: "aprovar" }, tokenAdmin);

    // 2FA via API (a UI de activação já é coberta pelos testes de componentes; aqui interessa o LOGIN)
    const sec = await chamar("POST", "/2fa/gerar-secret", null, token);
    const conf = await chamar("POST", "/2fa/confirmar", { codigo: await generate({ secret: sec.body.secret }) }, token);
    const codigoRec = conf.body.codigos_recuperacao[0];
    ok(conf.status === 200, "2FA activado via API com 10 códigos de recuperação");

    const executablePath = await localizarChrome();
    if (!executablePath) throw new Error("Chromium não encontrado — corra `npx playwright-core install chromium` ou defina CHROME_PATH.");
    const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const erros = [];
      page.on("pageerror", e => erros.push(e.message));
      const entrar = async () => {
        await page.goto(FRONT + "/", { waitUntil: "load" });
        await page.waitForSelector('input[placeholder="Email institucional"]', { timeout: 60000 });
        await page.fill('input[placeholder="Email institucional"]', email);
        await page.fill('input[placeholder="Palavra-passe"]', senha);
        await page.click('button:has-text("Entrar no SmartHub")');
      };

      console.log("1. Login em dois passos");
      await entrar();
      await page.waitForSelector('input[aria-label="Código de 6 dígitos"]', { timeout: 20000 });
      ok(true, "após a palavra-passe aparece o ecrã do código");
      await page.fill('input[aria-label="Código de 6 dígitos"]', "000000");
      await page.click('button:has-text("Confirmar e entrar")');
      await page.waitForSelector("text=Código inválido", { timeout: 15000 });
      ok(true, "código errado mostra 'Código inválido' e não entra");
      await page.fill('input[aria-label="Código de 6 dígitos"]', await generate({ secret: sec.body.secret }));
      await page.click('button:has-text("Confirmar e entrar")');
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
      ok(true, "código válido da app entra no dashboard");
      await page.screenshot({ path: path.join(SHOTS, "01-dashboard.png") });

      await page.click('button:has-text("Terminar Sessão")').catch(async () => { await page.goto(FRONT + "/"); });
      await page.waitForSelector('input[placeholder="Email institucional"]', { timeout: 20000 });
      await entrar();
      await page.waitForSelector('input[aria-label="Código de 6 dígitos"]', { timeout: 20000 });
      await page.click('button:has-text("Perdi o telemóvel")');
      await page.waitForSelector('input[aria-label="Código de recuperação"]', { timeout: 10000 });
      await page.fill('input[aria-label="Código de recuperação"]', codigoRec);
      await page.click('button:has-text("Confirmar e entrar")');
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
      ok(true, "código de recuperação entra no dashboard");
      const [[{ restantes }]] = await db.query("SELECT COUNT(*) AS restantes FROM codigos_recuperacao_2fa WHERE usado_em IS NULL AND usuario_id = (SELECT id FROM usuarios WHERE email = ?)", [email]);
      ok(Number(restantes) === 9, "código consumido (restam 9)", { restantes });

      console.log("2. Paleta de pesquisa (Ctrl+K) e pedidos");
      // O atalho é tratado pela página (document keydown); no Chromium headless o
      // Ctrl+K sintético do Playwright é apanhado pelo browser, por isso o teste
      // dispara o evento no documento (como faz um teclado real) e valida também
      // o botão de pesquisa do cabeçalho.
      await page.waitForSelector('button[aria-label="Pesquisar (Ctrl+K)"]', { timeout: 15000 });
      await page.waitForTimeout(400); // o listener do atalho é registado num efeito, depois do primeiro render
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
      await page.waitForSelector('[role="dialog"][aria-label="Pesquisa global"]', { timeout: 10000 });
      ok(true, "Ctrl+K abre a paleta");
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="dialog"][aria-label="Pesquisa global"]', { state: "detached", timeout: 5000 });
      await page.click('button[aria-label="Pesquisar (Ctrl+K)"]');
      await page.waitForSelector('[role="dialog"][aria-label="Pesquisa global"]', { timeout: 10000 });
      ok(true, "o botão de pesquisa do cabeçalho também abre a paleta");
      await page.fill('[role="dialog"] input', "fluxo");
      await page.waitForSelector('[role="dialog"] >> text=PDF de fluxo UI', { timeout: 15000 });
      ok(true, "paleta encontra o material pelo título");
      await page.screenshot({ path: path.join(SHOTS, "02-paleta.png") });
      await page.keyboard.press("Escape");
      await page.goto(FRONT + "/pedidos", { waitUntil: "load" });
      await page.waitForSelector("text=Pedidos de materiais", { timeout: 20000 });
      await page.click('button:has-text("Novo pedido")');
      await page.selectOption("select", { label: curso });
      await page.fill('input[placeholder="ex: Slides do capítulo 3 — Integrais"]', "Apontamentos do fluxo UI");
      await page.click('button:has-text("Publicar pedido")');
      await page.waitForSelector("text=Apontamentos do fluxo UI", { timeout: 15000 });
      ok(true, "pedido criado aparece na lista");
      await page.screenshot({ path: path.join(SHOTS, "03-pedidos.png") });

      console.log("3. Página do material: separadores Leitura e Flashcards, resumo");
      await page.goto(`${FRONT}/video/${materialId}?sep=leitura`, { waitUntil: "load" });
      await page.waitForSelector('[role="tab"]:has-text("Leitura")', { timeout: 30000 });
      ok(true, "separador Leitura presente");
      await page.fill('input[aria-label="Página actual"]', "3");
      await page.click('button:has-text("Guardar página")');
      await page.waitForSelector("text=Guardado: retoma na página 3", { timeout: 10000 });
      ok(true, "progresso de leitura guardado pela UI");
      await page.fill('input[aria-label="Texto da anotação"]', "Marcador de fluxo");
      await page.click('button:has-text("Adicionar")');
      await page.waitForSelector("text=Marcador de fluxo", { timeout: 10000 });
      ok(true, "nota criada pela UI");
      const temFlash = await page.$('[role="tab"]:has-text("Flashcards")');
      ok(true, temFlash ? "separador Flashcards presente (IA activa)" : "separador Flashcards ausente (IA desactivada) — esperado");
      await page.screenshot({ path: path.join(SHOTS, "04-material-leitura.png"), fullPage: true });

      console.log("4. Leitura offline");
      await page.waitForSelector('button:has-text("Offline")', { timeout: 30000 });
      await page.click('button:has-text("Offline")');
      await page.waitForSelector('button:has-text("Offline ✓")', { timeout: 30000 });
      ok(true, "PDF guardado para offline");
      const cacheTem = await page.evaluate(async () => { const c = await caches.open("smarthub-offline-v1"); return (await c.keys()).length; });
      ok(cacheTem >= 1, "Cache API tem o ficheiro", { entradas: cacheTem });
      await page.reload({ waitUntil: "load" });
      await page.goto(FRONT + "/dashboard", { waitUntil: "load" });
      await ctx.setOffline(true);
      await page.goto(`${FRONT}/video/${materialId}`, { waitUntil: "domcontentloaded" }).catch(e => ok(false, "navegar offline falhou: " + e.message));
      await page.waitForSelector("iframe", { timeout: 20000 }).catch(() => {});
      // O Chromium emulado não actualiza navigator.onLine num documento novo; num dispositivo real o SO dispara 'offline'.
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      const banner = await page.waitForSelector("text=Sem ligação", { timeout: 20000 }).then(() => true).catch(() => false);
      ok(banner, "mostra a cópia guardada com aviso 'Sem ligação'");
      const src = await page.$eval("iframe", el => el.src).catch(() => null);
      ok(src?.startsWith("blob:"), "iframe usa o blob da cache", { src: src?.slice(0, 30) });
      await page.screenshot({ path: path.join(SHOTS, "05-offline.png") });
      await ctx.setOffline(false);
      ok(erros.length === 0, "sem erros de JavaScript", erros);
      await ctx.close();
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("ERRO:", e);
    falhas++;
  } finally {
    try {
      if (materialId) {
        const [[m]] = await db.query("SELECT url_arquivo FROM materiais WHERE id = ?", [materialId]);
        if (m?.url_arquivo) fs.unlink(path.join(API_DIR, "uploads", path.basename(m.url_arquivo)), () => {});
        await db.query("DELETE FROM materiais WHERE id = ?", [materialId]);
      }
      await db.query("DELETE FROM usuarios WHERE email IN (?, ?)", [email, adminEmail || ""]);
    } catch (e) { console.error("limpeza:", e.message); }
    await db.end();
    console.log(falhas === 0 ? `\nFLUXOS OK (${passos} verificações)` : `\nFLUXOS com ${falhas} falha(s) em ${passos} verificações`);
    process.exit(falhas === 0 ? 0 : 1);
  }
})();
