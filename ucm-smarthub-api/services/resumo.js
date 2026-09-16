const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const { extractPdfText } = require("./ia");
const { chamarGemini, genAI } = require("./gemini");
const { uploadsDir } = require("../middleware/upload");

// Resumo de estudo por IA de um material. Usado pela rota GET
// /api/materiais/:id/resumo e pela pré-geração em background
// (services/preGeracao.js), para o aluno encontrar o resumo já feito.
//
// Quando a IA não responde devolve-se um texto GENÉRICO marcado como
// provisório — e esse texto NÃO é guardado: antes ficava em cache como se
// fosse o resumo do documento e era servido para sempre.
const LIMITE_TEXTO = 12000;

function caminhoDoMaterial(urlArquivo) {
  const nome = path.basename(String(urlArquivo || ""));
  if (!nome || nome.includes("..")) return null;
  return path.join(uploadsDir, nome);
}

function construirPrompt(material, config, pdfText) {
  if (material.tipo === "PDF") {
    const trimmedText = String(pdfText || "").slice(0, LIMITE_TEXTO);
    const temTexto = trimmedText.trim().length > 0;
    const promptResumo = temTexto
      ? `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Analisa o documento académico abaixo e produz um resumo de estudo completo em português europeu.

USA EXACTAMENTE este formato de secções (os títulos em maiúsculas são obrigatórios):

VISÃO GERAL
[2 a 3 frases que expliquem o tema central do documento, o seu propósito e a sua importância para a disciplina]

CONCEITOS FUNDAMENTAIS
• [Nome do conceito]: [Definição clara e precisa em 1-2 frases]
• [Repete para cada conceito relevante — mínimo 3, máximo 7]

MÉTODOS E PROCEDIMENTOS
• [Descreve cada método, fórmula, processo ou técnica que o estudante deve saber aplicar]
• [Inclui passos ou condições de aplicação quando relevante]
• [Omite esta secção se o material for puramente teórico]

PONTOS-CHAVE PARA O EXAME
• [Tema ou questão com alta probabilidade de aparecer na avaliação]
• [Mínimo 3, máximo 5 pontos — específicos e accionáveis]

DICA DE ESTUDO
[1 a 2 frases com uma estratégia concreta e eficaz para estudar este material específico]

REGRAS ABSOLUTAS:
- Usa EXACTAMENTE os títulos de secção em maiúsculas como indicado
- Cada bullet começa obrigatoriamente com "• " (bullet + espaço)
- Baseia-te APENAS no conteúdo do documento — nunca inventes factos
- Português europeu, linguagem académica mas acessível ao estudante universitário
- Não uses markdown (**negrito**, _itálico_) — texto simples apenas

Documento:
Título: ${material.titulo}
Disciplina: ${material.cadeira}

Conteúdo:
${trimmedText}`
      : `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base no título e disciplina abaixo, cria um resumo de estudo estruturado em português europeu.

USA EXACTAMENTE este formato:

VISÃO GERAL
[2-3 frases sobre o que esta matéria aborda e a sua importância na disciplina]

CONCEITOS FUNDAMENTAIS
• [Conceito essencial 1 desta disciplina/tema]: [Definição]
• [Conceito essencial 2]: [Definição]
• [Conceito essencial 3]: [Definição]

PONTOS-CHAVE PARA O EXAME
• [Ponto 1 que normalmente sai nos exames desta matéria]
• [Ponto 2]
• [Ponto 3]

DICA DE ESTUDO
[Estratégia concreta para estudar este tema]

Título: ${material.titulo}
Disciplina: ${material.cadeira}`;

    const fallback = `VISÃO GERAL
Este documento aborda os conceitos fundamentais de ${material.cadeira} apresentados em "${material.titulo}". Compreender esta matéria é essencial para o aproveitamento académico na disciplina.

CONCEITOS FUNDAMENTAIS
• Definições base: Identifique e memorize os termos técnicos e definições centrais apresentados pelo autor.
• Princípios teóricos: Compreenda os fundamentos que sustentam a disciplina e as suas aplicações práticas.
• Relações entre conceitos: Analise como os diferentes tópicos se relacionam entre si.

PONTOS-CHAVE PARA O EXAME
• Questões de definição e identificação de conceitos teóricos.
• Aplicação prática dos métodos e procedimentos estudados.
• Análise e interpretação de casos práticos da disciplina.

DICA DE ESTUDO
Leia o material duas vezes: primeiro para compreensão geral, depois sublinhando os conceitos-chave. Crie um mapa mental ligando os tópicos principais antes de resolver exercícios práticos.`;


    return { prompt: promptResumo, fallback };
  }
  // Vídeo ou outro tipo
    const promptResumo = `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base nos metadados do material abaixo, gera 3 notas de estudo em português europeu, numeradas de 1 a 3, úteis para quem vai ver ou rever este conteúdo:

1. O que aprender — o tema ou competência central que este material ensina
2. Como estudar — a abordagem prática recomendada para tirar o máximo partido do conteúdo
3. Para o exame — o conceito ou questão mais provável em avaliação desta matéria

Título: ${material.titulo}
Disciplina: ${material.cadeira}
Tipo de material: ${material.tipo}

Responde APENAS com as 3 notas numeradas. Sem introdução, sem conclusão.`;

    const fallback = `1. Este material aborda os conceitos essenciais de ${material.cadeira} — foque-se nas definições e princípios apresentados.
2. Tome notas durante a visualização e relacione cada conceito com exemplos da vida real ou de exercícios do manual.
3. Reveja os temas que normalmente aparecem nos exames de ${material.cadeira} e verifique se o material os cobre.`;


  return { prompt: promptResumo, fallback };
}

async function textoDoMaterial(material) {
  if (material.tipo !== "PDF") return "";
  if (material.texto_extraido) return material.texto_extraido;
  const caminho = caminhoDoMaterial(material.url_arquivo);
  if (!caminho || !fs.existsSync(caminho)) return "";
  try {
    return await extractPdfText(caminho);
  } catch (erro) {
    console.error("Erro ao extrair texto do PDF para o resumo:", erro.message);
    return ""; // continua só com título e disciplina
  }
}

// Devolve { resumo, provisorio, modelo? } e guarda em cache só o resumo real.
async function gerarResumoMaterial(material, config, { cliente = genAI } = {}) {
  const pdfText = await textoDoMaterial(material);
  const { prompt, fallback } = construirPrompt(material, config, pdfText);
  try {
    const { texto, modelo } = await chamarGemini({ prompt, recurso: "resumo", cliente });
    await db.query("UPDATE materiais SET resumo_texto = ?, resumo_gerado_em = NOW() WHERE id = ?", [texto, material.id])
      .catch(erro => console.error("Erro ao guardar cache do resumo:", erro.message));
    return { resumo: texto, provisorio: false, modelo };
  } catch (erro) {
    console.error(`[Resumo] Material ${material.id}: ${erro.message}`);
    return { resumo: fallback, provisorio: true, erro: erro.message, status: erro.status };
  }
}

module.exports = { gerarResumoMaterial, construirPrompt, LIMITE_TEXTO };
