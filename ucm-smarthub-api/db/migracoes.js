const db = require("../config/db");

// Migrações idempotentes, verificadas contra information_schema em vez de
// "tentar e engolir o erro": um ALTER que falha por outra razão (sintaxe,
// permissões, disco cheio) continua a rebentar alto em vez de passar em
// silêncio como se a coluna já existisse.

async function colunaExiste(tabela, coluna) {
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return total > 0;
}

// Devolve true se a coluna foi criada agora (false se já existia) — permite
// correr backfills só na primeira vez.
async function adicionarColuna(tabela, coluna, definicao) {
  if (await colunaExiste(tabela, coluna)) return false;
  await db.query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`);
  console.log(`✅ Migração: coluna '${coluna}' adicionada à tabela ${tabela}.`);
  return true;
}

async function renomearColunaSeExistir(tabela, de, para) {
  if (!(await colunaExiste(tabela, de)) || (await colunaExiste(tabela, para))) return;
  await db.query(`ALTER TABLE \`${tabela}\` RENAME COLUMN \`${de}\` TO \`${para}\``);
  console.log(`✅ Migração: coluna '${de}' renomeada para '${para}' em ${tabela}.`);
}

async function indiceExiste(tabela, indice) {
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tabela, indice]
  );
  return total > 0;
}

async function criarIndice(tabela, indice, colunas) {
  if (await indiceExiste(tabela, indice)) return;
  await db.query(`CREATE INDEX \`${indice}\` ON \`${tabela}\` (${colunas})`);
  console.log(`✅ Migração: índice '${indice}' criado em ${tabela}.`);
}

async function constraintExiste(tabela, nome) {
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [tabela, nome]
  );
  return total > 0;
}

// Tabelas criadas por versões anteriores destas migrações nasceram sem chaves
// estrangeiras; CREATE TABLE IF NOT EXISTS não as acrescenta a tabelas que já
// existem, por isso cada FK é também garantida à parte.
async function garantirChaveEstrangeira(tabela, nome, definicao) {
  if (await constraintExiste(tabela, nome)) return;
  await db.query(`ALTER TABLE \`${tabela}\` ADD CONSTRAINT \`${nome}\` FOREIGN KEY ${definicao}`);
  console.log(`✅ Migração: chave estrangeira '${nome}' adicionada a ${tabela}.`);
}

async function correrMigracoes() {
  // ── Colunas em tabelas antigas ─────────────────────────────────────────
  await adicionarColuna("mensagens_estudantes", "curso", "VARCHAR(100) NOT NULL DEFAULT 'Geral'");
  await adicionarColuna("materiais", "ia_sinalizado", "BOOLEAN NOT NULL DEFAULT FALSE");
  await adicionarColuna("materiais", "ia_motivo", "TEXT NULL");
  // Cache do resumo por IA — sem isto, abrir o mesmo material duas vezes (ou só
  // recarregar a página) reextraía o PDF e pagava outra chamada ao Gemini para
  // devolver exactamente o mesmo texto.
  await adicionarColuna("materiais", "resumo_texto", "MEDIUMTEXT NULL");
  await adicionarColuna("materiais", "resumo_gerado_em", "DATETIME NULL");

  await adicionarColuna("usuarios", "avatar_url", "VARCHAR(255) NULL");
  await adicionarColuna("usuarios", "reset_token", "VARCHAR(255) NULL");
  await adicionarColuna("usuarios", "reset_token_expira", "DATETIME NULL");
  await adicionarColuna("usuarios", "numero_estudante", "VARCHAR(50) NULL");
  await adicionarColuna("usuarios", "telefone", "VARCHAR(30) NULL");

  // Contas anteriores à verificação de email já provaram ser reais ao usar a
  // plataforma — exigir-lhes verificação agora bloqueava toda a gente de uma
  // vez. Só as contas criadas a partir daqui nascem por verificar.
  if (await adicionarColuna("usuarios", "email_verificado", "TINYINT(1) NOT NULL DEFAULT 0")) {
    await db.query("UPDATE usuarios SET email_verificado = 1");
    console.log("✅ Migração: contas existentes marcadas como verificadas.");
  }
  await adicionarColuna("usuarios", "email_token", "VARCHAR(255) NULL");
  await adicionarColuna("usuarios", "email_token_expira", "DATETIME NULL");
  await adicionarColuna("usuarios", "2fa_ativado", "TINYINT(1) NOT NULL DEFAULT 0");
  await adicionarColuna("usuarios", "2fa_secret", "VARCHAR(255) NULL");
  await adicionarColuna("usuarios", "2fa_secret_temp", "VARCHAR(255) NULL");

  // ── Índices ─────────────────────────────────────────────────────────────
  // Quase todas as leituras de materiais filtram por status e ordenam por
  // data_upload; o histórico de chat filtra por curso e ordena por timestamp.
  await criarIndice("materiais", "idx_materiais_status_data", "status, data_upload");
  await criarIndice("mensagens_estudantes", "idx_mensagens_curso_timestamp", "curso, timestamp");

  // ── Configuração e cursos ──────────────────────────────────────────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id INT PRIMARY KEY DEFAULT 1,
      nome_plataforma VARCHAR(100) NOT NULL DEFAULT 'SmartHub',
      tagline VARCHAR(150) NOT NULL DEFAULT 'Aprenda · Partilhe · Cresça',
      descricao_proposito TEXT,
      logo_url VARCHAR(255) NULL,
      cor_primaria CHAR(7) NOT NULL DEFAULT '#04122e',
      cor_destaque CHAR(7) NOT NULL DEFAULT '#ffd700',
      contacto_email VARCHAR(150) NULL,
      localizacao VARCHAR(150) NULL,
      link_facebook VARCHAR(255) NULL,
      link_instagram VARCHAR(255) NULL,
      link_linkedin VARCHAR(255) NULL,
      dominios_email_permitidos VARCHAR(255) NULL,
      chat_activado BOOLEAN NOT NULL DEFAULT TRUE,
      ia_activada BOOLEAN NOT NULL DEFAULT TRUE,
      moderacao_ia_activada BOOLEAN NOT NULL DEFAULT TRUE,
      tipos_ficheiro_permitidos VARCHAR(100) NOT NULL DEFAULT 'pdf,mp4,webm,ogg,mov',
      tamanho_maximo_mb INT NOT NULL DEFAULT 100
    )
  `);
  for (const coluna of ["link_facebook", "link_instagram", "link_linkedin", "dominios_email_permitidos"]) {
    await adicionarColuna("configuracoes", coluna, "VARCHAR(255) NULL");
  }
  const [[{ total: totalConfig }]] = await db.query("SELECT COUNT(*) as total FROM configuracoes");
  if (totalConfig === 0) {
    await db.query(
      `INSERT INTO configuracoes (id, descricao_proposito) VALUES (1, ?)`,
      ["Plataforma académica para partilha de materiais de estudo, comunicação entre estudantes e resumos gerados por inteligência artificial."]
    );
    console.log("✅ Migração: linha de configuração por defeito criada.");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS cursos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL UNIQUE
    )
  `);
  const [[{ total: totalCursos }]] = await db.query("SELECT COUNT(*) as total FROM cursos");
  if (totalCursos === 0) {
    await db.query("INSERT INTO cursos (nome) VALUES ('Geral')");
    console.log("✅ Migração: curso por defeito 'Geral' criado.");
  }

  // ── Tabelas das funcionalidades de comunidade ─────────────────────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id            INT NOT NULL AUTO_INCREMENT,
      usuario_id    INT NULL,
      acao          VARCHAR(100) NOT NULL,
      recurso       VARCHAR(100),
      recurso_id    INT,
      descricao     TEXT,
      dados_antigos JSON,
      dados_novos   JSON,
      data_hora     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      ip_origem     VARCHAR(45),
      PRIMARY KEY (id),
      KEY usuario_id (usuario_id),
      KEY idx_auditoria_data_acao (data_hora, acao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // ON DELETE SET NULL: apagar uma conta não pode apagar o registo do que ela fez.
  await garantirChaveEstrangeira("auditoria", "auditoria_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL");

  await db.query(`
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id            INT NOT NULL AUTO_INCREMENT,
      material_id   INT NOT NULL,
      usuario_id    INT NOT NULL,
      nota          INT NOT NULL,
      comentario    TEXT,
      data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY material_usuario (material_id, usuario_id),
      KEY usuario_id (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await garantirChaveEstrangeira("avaliacoes", "avaliacoes_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
  await garantirChaveEstrangeira("avaliacoes", "avaliacoes_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

  await db.query(`
    CREATE TABLE IF NOT EXISTS comentarios_materiais (
      id            INT NOT NULL AUTO_INCREMENT,
      material_id   INT NOT NULL,
      usuario_id    INT NOT NULL,
      conteudo      TEXT NOT NULL,
      data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY material_id (material_id),
      KEY usuario_id (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await garantirChaveEstrangeira("comentarios_materiais", "comentarios_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
  await garantirChaveEstrangeira("comentarios_materiais", "comentarios_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

  await db.query(`
    CREATE TABLE IF NOT EXISTS reputacao_usuarios (
      id            INT NOT NULL AUTO_INCREMENT,
      usuario_id    INT NOT NULL UNIQUE,
      pontos        INT NOT NULL DEFAULT 0,
      materiais_submetidos INT NOT NULL DEFAULT 0,
      materiais_aprovados INT NOT NULL DEFAULT 0,
      media_avaliacoes DECIMAL(3,2),
      emblema       VARCHAR(50),
      data_atualizacao TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await garantirChaveEstrangeira("reputacao_usuarios", "reputacao_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscricoes_disciplinas (
      id            INT NOT NULL AUTO_INCREMENT,
      usuario_id    INT NOT NULL,
      disciplina    VARCHAR(150) NOT NULL,
      data_subscricao TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY usuario_disciplina (usuario_id, disciplina)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await renomearColunaSeExistir("subscricoes_disciplinas", "data_subscrition", "data_subscricao");
  await garantirChaveEstrangeira("subscricoes_disciplinas", "subscricoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

  await db.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id    INT NOT NULL AUTO_INCREMENT,
      nome  VARCHAR(50) NOT NULL UNIQUE,
      cor   CHAR(7) NOT NULL DEFAULT '#ffd700',
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS materiais_tags (
      id           INT NOT NULL AUTO_INCREMENT,
      material_id  INT NOT NULL,
      tag_id       INT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY material_tag (material_id, tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await garantirChaveEstrangeira("materiais_tags", "materiais_tags_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
  await garantirChaveEstrangeira("materiais_tags", "materiais_tags_ibfk_2", "(tag_id) REFERENCES tags (id) ON DELETE CASCADE");
}

module.exports = { correrMigracoes };
