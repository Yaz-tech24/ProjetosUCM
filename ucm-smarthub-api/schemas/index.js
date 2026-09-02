const { z } = require("zod");

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const TIPOS_FICHEIRO_VALIDOS = ["pdf", "mp4", "webm", "ogg", "mov"];
// Tecto técnico absoluto (multer + validação) — independente do limite
// configurado pelo admin, que é sempre aplicado depois, no handler da rota.
const TAMANHO_MAXIMO_TECTO_MB = 500;

// Política de palavra-passe: comprimento mínimo + pelo menos uma letra e um
// número. Aplica-se a palavras-passe NOVAS (registo, alteração, reposição) —
// contas já existentes com palavras-passe mais curtas continuam a conseguir
// entrar normalmente, só passam a ter de cumprir a regra quando a mudarem.
const SENHA_MIN = 8;
const senhaForte = () => z.string()
  .min(SENHA_MIN, `A palavra-passe deve ter pelo menos ${SENHA_MIN} caracteres.`)
  .regex(/[A-Za-z]/, "A palavra-passe deve conter pelo menos uma letra.")
  .regex(/[0-9]/, "A palavra-passe deve conter pelo menos um número.");

// Número de identificação institucional (número de estudante, de docente,
// etc.) — genérico de propósito, para servir qualquer instituição que use a
// plataforma, não só a UCM. Opcional: nem toda a instituição atribui um, e
// não convém bloquear o registo por causa disto.
const numeroEstudante = () => z.string().trim().max(50).catch("");
const telefone = () => z.string().trim().max(30).catch("");

// Registo público — sempre estudante. Contas de docente/admin só podem ser
// criadas por um administrador (ver schemaUtilizadorAdmin), por isso este
// schema nem aceita "papel" do cliente — evita que alguém tente forçar o
// campo directamente na API, ignorando a interface.
const schemaRegisto = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido.")),
  senha: senhaForte(),
  curso: z.string().trim().min(1, "Curso inválido."),
  numero_estudante: numeroEstudante(),
  telefone: telefone(),
});

// Criação de conta pelo admin — pode escolher qualquer papel (inclui
// "professor" e mesmo outro "admin"), ao contrário do registo público.
const schemaUtilizadorAdmin = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido.")),
  senha: senhaForte(),
  papel: z.enum(["estudante", "professor", "admin"]).catch("professor"),
  curso: z.string().trim().min(1, "Curso inválido."),
  numero_estudante: numeroEstudante(),
  telefone: telefone(),
});

// Restrição de domínio de email — configurável pelo admin (ex: só contas
// "@universidade.ac.mz" ou "@gmail.com"). Lista vazia = sem restrição,
// qualquer domínio é aceite. Verificado no handler da rota (depende da
// configuração guardada na BD, não é uma regra estática do schema).
function emailComDominioPermitido(email, dominiosPermitidos) {
  const lista = (dominiosPermitidos || "")
    .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  if (lista.length === 0) return true;
  const dominio = email.split("@")[1]?.toLowerCase();
  return lista.includes(dominio);
}

const schemaLogin = z.object({
  email: z.string().trim().toLowerCase(),
  senha: z.string().min(1, "Palavra-passe é obrigatória."),
});

const schemaMaterial = z.object({
  titulo: z.string().trim().min(1, "O título é obrigatório."),
  cadeira: z.string().trim().min(1, "Disciplina inválida."),
  tipo: z.enum(["PDF", "Vídeo"], { message: "Tipo de material inválido." }),
});

const schemaConfig = z.object({
  nome_plataforma: z.string().trim().min(1, "O nome da plataforma é obrigatório."),
  tagline: z.string().trim().catch(""),
  descricao_proposito: z.string().trim().catch(""),
  cor_primaria: z.string().regex(HEX_COLOR_REGEX, "Cores inválidas — use o formato #rrggbb."),
  cor_destaque: z.string().regex(HEX_COLOR_REGEX, "Cores inválidas — use o formato #rrggbb."),
  contacto_email: z.string().trim().catch(""),
  localizacao: z.string().trim().catch(""),
  link_facebook: z.string().trim().catch(""),
  link_instagram: z.string().trim().catch(""),
  link_linkedin: z.string().trim().catch(""),
  dominios_email_permitidos: z.string().trim().catch(""),
  chat_activado: z.coerce.boolean(),
  ia_activada: z.coerce.boolean(),
  moderacao_ia_activada: z.coerce.boolean(),
  tipos_ficheiro_permitidos: z.array(z.enum(TIPOS_FICHEIRO_VALIDOS))
    .min(1, "Seleccione pelo menos um tipo de ficheiro permitido."),
  tamanho_maximo_mb: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_TECTO_MB),
});

const schemaCurso = z.object({
  nome: z.string().trim().min(1, "O nome do curso é obrigatório."),
});

const schemaPerfilDados = z.object({
  nome: z.string().trim().min(1, "O nome é obrigatório."),
  numero_estudante: numeroEstudante(),
  telefone: telefone(),
});

const schemaPerfilSenha = z.object({
  senha_actual: z.string().min(1, "Indique a palavra-passe actual."),
  nova_senha: senhaForte(),
});

const schemaEsqueciSenha = z.object({
  email: z.string().trim().toLowerCase(),
});

const schemaReporSenha = z.object({
  token: z.string().min(1, "Token em falta."),
  novaSenha: senhaForte(),
});

module.exports = {
  HEX_COLOR_REGEX, TIPOS_FICHEIRO_VALIDOS, TAMANHO_MAXIMO_TECTO_MB,
  schemaRegisto, schemaUtilizadorAdmin, schemaLogin, schemaMaterial, schemaConfig, schemaCurso,
  schemaPerfilDados, schemaPerfilSenha, schemaEsqueciSenha, schemaReporSenha,
  emailComDominioPermitido,
};
