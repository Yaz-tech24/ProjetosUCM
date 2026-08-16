// Ficheiros (materiais, avatares, logótipo) são guardados na BD como
// caminhos RELATIVOS (ex: "/uploads/ficheiro.pdf"), nunca URLs absolutos.
// A conversão para URL absoluto acontece aqui, no momento da leitura, usando
// sempre o API_URL ACTUAL — assim, se a instância mudar de domínio/porta
// (migração, alojamento novo, mudança de instituição), o conteúdo já
// existente continua acessível sem precisar de reprocessar a base de dados.
function baseUrlActual() {
  return process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
}

// Aceita tanto um caminho relativo já correcto ("/uploads/x.pdf") como um
// URL absoluto antigo (de dados criados antes desta alteração) — em ambos
// os casos devolve sempre o URL absoluto actual.
function paraUrlAbsoluto(caminho) {
  if (!caminho) return caminho;
  const relativo = caminho.startsWith("http") ? new URL(caminho).pathname : caminho;
  return `${baseUrlActual()}${relativo}`;
}

module.exports = { baseUrlActual, paraUrlAbsoluto };
