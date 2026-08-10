// Cursos disponíveis na UCM Extensão de Tete
// Fonte única de verdade — importada por Login, Chat, Repositorio, etc.

export const CURSOS = [
  // Faculdade de Economia e Gestão
  "Gestão de Empresas",
  "Contabilidade e Auditoria",
  "Economia",

  // Faculdade de Ciências Jurídicas e Sociais
  "Direito",

  // Faculdade de Engenharia e Ciências Naturais
  "Informática",
  "Engenharia Civil",

  // Faculdade de Ciências de Saúde
  "Enfermagem",
  "Análises Clínicas",

  // Faculdade de Educação
  "Ensino de Matemática",
  "Ensino de Biologia",
  "Ensino de Física",
  "Ensino de Química",
  "Ensino de Português",

  // Faculdade de Filosofia e Ciências Sociais
  "Filosofia",
  "Psicologia",
];

// Mapeamento curso → faculdade (para agrupar no futuro)
export const FACULDADES = {
  "Faculdade de Economia e Gestão":          ["Gestão de Empresas", "Contabilidade e Auditoria", "Economia"],
  "Faculdade de Ciências Jurídicas":         ["Direito"],
  "Faculdade de Engenharia":                 ["Informática", "Engenharia Civil"],
  "Faculdade de Ciências de Saúde":          ["Enfermagem", "Análises Clínicas"],
  "Faculdade de Educação":                   ["Ensino de Matemática", "Ensino de Biologia", "Ensino de Física", "Ensino de Química", "Ensino de Português"],
  "Faculdade de Filosofia e Ciências Sociais": ["Filosofia", "Psicologia"],
};
