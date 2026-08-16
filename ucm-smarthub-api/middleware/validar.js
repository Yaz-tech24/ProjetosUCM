// Middleware genérico: valida req.body contra um schema zod e substitui req.body
// pelos dados já convertidos/normalizados (trim, lowercase, coerção de tipos).
function validar(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      const primeiro = resultado.error.issues[0];
      return res.status(400).json({ erro: primeiro?.message || "Dados inválidos." });
    }
    req.body = resultado.data;
    next();
  };
}

module.exports = validar;
