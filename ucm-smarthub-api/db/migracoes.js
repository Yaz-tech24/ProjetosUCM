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

// Regra ON DELETE de uma FK existente (CASCADE, SET NULL, RESTRICT/NO ACTION).
async function regraDeleteDaChave(tabela, nome) {
  const [[linha]] = await db.query(
    `SELECT DELETE_RULE AS regra FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [tabela, nome]
  );
  return linha?.regra || null;
}

// Garante que uma FK existe COM a regra ON DELETE pretendida — uma chave
// criada por um esquema antigo com a regra errada é recriada.
async function garantirChaveComRegra(tabela, nome, definicao, regra) {
  const actual = await regraDeleteDaChave(tabela, nome);
  if (actual === regra) return;
  if (actual) {
    await db.query(`ALTER TABLE \`${tabela}\` DROP FOREIGN KEY \`${nome}\``);
    console.log(`✅ Migração: chave estrangeira '${nome}' tinha ON DELETE ${actual} — recriada com ${regra}.`);
  }
  await db.query(`ALTER TABLE \`${tabela}\` ADD CONSTRAINT \`${nome}\` FOREIGN KEY ${definicao} ON DELETE ${regra}`);
}

// ─── Registo de migrações ─────────────────────────────────────────────────
// Cada migração tem um nome único e corre UMA vez: depois de terminar sem
// erro fica registada em `migracoes` e é saltada nos arranques seguintes.
// As funções continuam idempotentes por dentro (information_schema), o que
// permite (a) correr este ficheiro contra bases de dados criadas por versões
// anteriores sem registo, e (b) repetir uma migração à mão apagando a linha.
// Migrações de DADOS (backfills, correcções) entram aqui como qualquer outra
// — não só alterações de esquema.
async function garantirTabelaMigracoes() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migracoes (
      nome        VARCHAR(120) NOT NULL,
      aplicada_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      duracao_ms  INT NULL,
      PRIMARY KEY (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

const MIGRACOES = [
  {
    nome: "0001_colunas_tabelas_antigas",
    correr: async () => {
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
    },
  },
  {
    nome: "0002_indices_iniciais",
    correr: async () => {
      // ── Índices ─────────────────────────────────────────────────────────────
      // Quase todas as leituras de materiais filtram por status e ordenam por
      // data_upload; o histórico de chat filtra por curso e ordena por timestamp.
      await criarIndice("materiais", "idx_materiais_status_data", "status, data_upload");
      await criarIndice("mensagens_estudantes", "idx_mensagens_curso_timestamp", "curso, timestamp");
    },
  },
  {
    nome: "0003_configuracoes_e_cursos",
    correr: async () => {
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
    },
  },
  {
    nome: "0004_comunidade",
    correr: async () => {
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
    },
  },
  {
    nome: "0005_seguranca_2fa_sessoes",
    correr: async () => {
      // ── Segurança: códigos de recuperação 2FA e sessões ────────────────────
      await db.query(`
        CREATE TABLE IF NOT EXISTS codigos_recuperacao_2fa (
          id          INT NOT NULL AUTO_INCREMENT,
          usuario_id  INT NOT NULL,
          codigo_hash CHAR(64) NOT NULL,
          usado_em    DATETIME NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY codigo_hash (codigo_hash),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("codigos_recuperacao_2fa", "codigos_2fa_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS sessoes (
          jti         CHAR(36) NOT NULL,
          usuario_id  INT NOT NULL,
          dispositivo VARCHAR(255) NULL,
          ip          VARCHAR(45) NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          ultimo_uso  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          expira_em   DATETIME NOT NULL,
          revogada_em DATETIME NULL,
          PRIMARY KEY (jti),
          KEY usuario_revogada (usuario_id, revogada_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("sessoes", "sessoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
    },
  },
  {
    nome: "0006_materiais_contagens_texto_versoes",
    correr: async () => {
      // ── Materiais: contagens, texto para pesquisa, versões, formato original ─
      await adicionarColuna("materiais", "visualizacoes", "INT NOT NULL DEFAULT 0");
      await adicionarColuna("materiais", "downloads", "INT NOT NULL DEFAULT 0");
      await adicionarColuna("materiais", "texto_extraido", "MEDIUMTEXT NULL");
      await adicionarColuna("materiais", "texto_indexado_em", "DATETIME NULL");
      await adicionarColuna("materiais", "versao", "INT NOT NULL DEFAULT 1");
      await adicionarColuna("materiais", "formato_original", "VARCHAR(10) NULL");
      await adicionarColuna("materiais", "notas_versao", "VARCHAR(500) NULL");
      if (!(await indiceExiste("materiais", "ft_materiais_texto"))) {
        await db.query("CREATE FULLTEXT INDEX ft_materiais_texto ON materiais (titulo, texto_extraido)");
        console.log("✅ Migração: índice FULLTEXT criado em materiais.");
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS materiais_acessos (
          id          INT NOT NULL AUTO_INCREMENT,
          material_id INT NOT NULL,
          usuario_id  INT NULL,
          tipo        ENUM('abertura','download') NOT NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY material_data (material_id, criado_em),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("materiais_acessos", "acessos_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("materiais_acessos", "acessos_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL");

      await db.query(`
        CREATE TABLE IF NOT EXISTS versoes_materiais (
          id          INT NOT NULL AUTO_INCREMENT,
          material_id INT NOT NULL,
          versao      INT NOT NULL,
          url_arquivo VARCHAR(255) NOT NULL,
          notas       VARCHAR(500) NULL,
          autor_id    INT NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY material_versao (material_id, versao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("versoes_materiais", "versoes_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("versoes_materiais", "versoes_ibfk_2", "(autor_id) REFERENCES usuarios (id) ON DELETE SET NULL");
    },
  },
  {
    nome: "0007_quizzes",
    correr: async () => {
      // ── Quizzes por IA ─────────────────────────────────────────────────────
      await db.query(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id          INT NOT NULL AUTO_INCREMENT,
          material_id INT NOT NULL,
          perguntas   JSON NOT NULL,
          modelo      VARCHAR(60) NULL,
          gerado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY material_id (material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("quizzes", "quizzes_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS quiz_resultados (
          id         INT NOT NULL AUTO_INCREMENT,
          quiz_id    INT NOT NULL,
          usuario_id INT NOT NULL,
          pontuacao  INT NOT NULL,
          total      INT NOT NULL,
          respostas  JSON NOT NULL,
          criado_em  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY usuario_quiz (usuario_id, quiz_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("quiz_resultados", "quiz_resultados_ibfk_1", "(quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("quiz_resultados", "quiz_resultados_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
    },
  },
  {
    nome: "0008_favoritos_colecoes",
    correr: async () => {
      // ── Favoritos e colecções ──────────────────────────────────────────────
      await db.query(`
        CREATE TABLE IF NOT EXISTS favoritos (
          id          INT NOT NULL AUTO_INCREMENT,
          usuario_id  INT NOT NULL,
          material_id INT NOT NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY usuario_material (usuario_id, material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("favoritos", "favoritos_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("favoritos", "favoritos_ibfk_2", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS colecoes (
          id            INT NOT NULL AUTO_INCREMENT,
          usuario_id    INT NOT NULL,
          nome          VARCHAR(100) NOT NULL,
          descricao     VARCHAR(500) NULL,
          publica       TINYINT(1) NOT NULL DEFAULT 0,
          slug          CHAR(12) NOT NULL,
          criado_em     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY slug (slug),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("colecoes", "colecoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS colecoes_materiais (
          id            INT NOT NULL AUTO_INCREMENT,
          colecao_id    INT NOT NULL,
          material_id   INT NOT NULL,
          ordem         INT NOT NULL DEFAULT 0,
          adicionado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY colecao_material (colecao_id, material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("colecoes_materiais", "colecoes_materiais_ibfk_1", "(colecao_id) REFERENCES colecoes (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("colecoes_materiais", "colecoes_materiais_ibfk_2", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
    },
  },
  {
    nome: "0009_perguntas_respostas",
    correr: async () => {
      // ── Perguntas e respostas ──────────────────────────────────────────────
      await db.query(`
        CREATE TABLE IF NOT EXISTS perguntas (
          id                 INT NOT NULL AUTO_INCREMENT,
          disciplina         VARCHAR(150) NOT NULL,
          usuario_id         INT NOT NULL,
          titulo             VARCHAR(200) NOT NULL,
          conteudo           TEXT NOT NULL,
          resolvida          TINYINT(1) NOT NULL DEFAULT 0,
          resposta_aceite_id INT NULL,
          visualizacoes      INT NOT NULL DEFAULT 0,
          criado_em          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          atualizado_em      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY disciplina_data (disciplina, criado_em),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("perguntas", "perguntas_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS respostas (
          id          INT NOT NULL AUTO_INCREMENT,
          pergunta_id INT NOT NULL,
          usuario_id  INT NOT NULL,
          conteudo    TEXT NOT NULL,
          criado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY pergunta_id (pergunta_id),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("respostas", "respostas_ibfk_1", "(pergunta_id) REFERENCES perguntas (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("respostas", "respostas_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
    },
  },
  {
    nome: "0010_notificacoes_denuncias_calendario",
    correr: async () => {
      // ── Notificações, denúncias, calendário ────────────────────────────────
      await db.query(`
        CREATE TABLE IF NOT EXISTS notificacoes (
          id         INT NOT NULL AUTO_INCREMENT,
          usuario_id INT NOT NULL,
          tipo       VARCHAR(40) NOT NULL,
          titulo     VARCHAR(150) NOT NULL,
          mensagem   VARCHAR(500) NULL,
          link       VARCHAR(255) NULL,
          lida       TINYINT(1) NOT NULL DEFAULT 0,
          criado_em  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY usuario_lida_data (usuario_id, lida, criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("notificacoes", "notificacoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS denuncias (
          id           INT NOT NULL AUTO_INCREMENT,
          tipo         ENUM('material','comentario','mensagem','pergunta','resposta') NOT NULL,
          recurso_id   INT NOT NULL,
          usuario_id   INT NULL,
          motivo       VARCHAR(40) NOT NULL,
          detalhes     VARCHAR(1000) NULL,
          estado       ENUM('pendente','resolvida','ignorada') NOT NULL DEFAULT 'pendente',
          resolvida_por INT NULL,
          resolvida_em DATETIME NULL,
          criado_em    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY estado_data (estado, criado_em),
          KEY recurso (tipo, recurso_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("denuncias", "denuncias_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL");

      await db.query(`
        CREATE TABLE IF NOT EXISTS eventos_calendario (
          id                INT NOT NULL AUTO_INCREMENT,
          disciplina        VARCHAR(150) NOT NULL,
          titulo            VARCHAR(150) NOT NULL,
          descricao         TEXT NULL,
          tipo              ENUM('teste','entrega','aula','outro') NOT NULL DEFAULT 'outro',
          data_inicio       DATETIME NOT NULL,
          data_fim          DATETIME NULL,
          criado_por        INT NULL,
          lembrete_enviado  TINYINT(1) NOT NULL DEFAULT 0,
          criado_em         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY disciplina_data (disciplina, data_inicio),
          KEY lembrete (lembrete_enviado, data_inicio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("eventos_calendario", "eventos_ibfk_1", "(criado_por) REFERENCES usuarios (id) ON DELETE SET NULL");
    },
  },
  // ── Leitura: progresso, marcadores e notas por página ────────────────────
  {
    nome: "0011_leitura_progresso_anotacoes",
    correr: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS leituras (
          id            INT NOT NULL AUTO_INCREMENT,
          usuario_id    INT NOT NULL,
          material_id   INT NOT NULL,
          pagina        INT NOT NULL DEFAULT 1,
          total_paginas INT NULL,
          atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY usuario_material (usuario_id, material_id),
          KEY usuario_data (usuario_id, atualizado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("leituras", "leituras_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("leituras", "leituras_ibfk_2", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS anotacoes (
          id            INT NOT NULL AUTO_INCREMENT,
          usuario_id    INT NOT NULL,
          material_id   INT NOT NULL,
          pagina        INT NOT NULL DEFAULT 1,
          tipo          ENUM('marcador','nota') NOT NULL DEFAULT 'nota',
          texto         VARCHAR(2000) NOT NULL,
          cor           CHAR(7) NULL,
          criado_em     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY usuario_material_pagina (usuario_id, material_id, pagina)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("anotacoes", "anotacoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("anotacoes", "anotacoes_ibfk_2", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
    },
  },

  // ── Flashcards com repetição espaçada ────────────────────────────────────
  {
    nome: "0012_flashcards",
    correr: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS flashcards (
          id          INT NOT NULL AUTO_INCREMENT,
          material_id INT NOT NULL,
          ordem       INT NOT NULL DEFAULT 0,
          frente      VARCHAR(500) NOT NULL,
          verso       VARCHAR(1000) NOT NULL,
          modelo      VARCHAR(60) NULL,
          gerado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY material_ordem (material_id, ordem)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("flashcards", "flashcards_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");

      await db.query(`
        CREATE TABLE IF NOT EXISTS flashcards_revisoes (
          id              INT NOT NULL AUTO_INCREMENT,
          usuario_id      INT NOT NULL,
          flashcard_id    INT NOT NULL,
          facilidade      DECIMAL(4,2) NOT NULL DEFAULT 2.50,
          intervalo_dias  INT NOT NULL DEFAULT 0,
          repeticoes      INT NOT NULL DEFAULT 0,
          total_revisoes  INT NOT NULL DEFAULT 0,
          proxima_revisao DATE NULL,
          ultima_revisao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY usuario_flashcard (usuario_id, flashcard_id),
          KEY usuario_proxima (usuario_id, proxima_revisao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("flashcards_revisoes", "flashcards_revisoes_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("flashcards_revisoes", "flashcards_revisoes_ibfk_2", "(flashcard_id) REFERENCES flashcards (id) ON DELETE CASCADE");
    },
  },

  // ── Pedidos de materiais ("Alguém tem…?") ────────────────────────────────
  {
    nome: "0013_pedidos_materiais",
    correr: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS pedidos_materiais (
          id            INT NOT NULL AUTO_INCREMENT,
          usuario_id    INT NOT NULL,
          disciplina    VARCHAR(150) NOT NULL,
          titulo        VARCHAR(200) NOT NULL,
          descricao     VARCHAR(1000) NULL,
          estado        ENUM('aberto','atendido','fechado') NOT NULL DEFAULT 'aberto',
          material_id   INT NULL,
          atendido_por  INT NULL,
          atendido_em   DATETIME NULL,
          criado_em     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY estado_disciplina (estado, disciplina, criado_em),
          KEY usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("pedidos_materiais", "pedidos_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("pedidos_materiais", "pedidos_ibfk_2", "(material_id) REFERENCES materiais (id) ON DELETE SET NULL");
      await garantirChaveEstrangeira("pedidos_materiais", "pedidos_ibfk_3", "(atendido_por) REFERENCES usuarios (id) ON DELETE SET NULL");

      await db.query(`
        CREATE TABLE IF NOT EXISTS pedidos_apoios (
          id         INT NOT NULL AUTO_INCREMENT,
          pedido_id  INT NOT NULL,
          usuario_id INT NOT NULL,
          criado_em  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY pedido_usuario (pedido_id, usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("pedidos_apoios", "pedidos_apoios_ibfk_1", "(pedido_id) REFERENCES pedidos_materiais (id) ON DELETE CASCADE");
      await garantirChaveEstrangeira("pedidos_apoios", "pedidos_apoios_ibfk_2", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
    },
  },

  // ── Conquistas (badges) ───────────────────────────────────────────────────
  {
    nome: "0014_conquistas",
    correr: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS conquistas (
          id         INT NOT NULL AUTO_INCREMENT,
          usuario_id INT NOT NULL,
          codigo     VARCHAR(40) NOT NULL,
          obtida_em  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY usuario_codigo (usuario_id, codigo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("conquistas", "conquistas_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
      // Eventos que só o cliente conhece (ex: guardou um PDF para offline) —
      // guardados à parte para as conquistas conseguirem contá-los.
      await db.query(`
        CREATE TABLE IF NOT EXISTS eventos_utilizador (
          id         INT NOT NULL AUTO_INCREMENT,
          usuario_id INT NOT NULL,
          tipo       VARCHAR(40) NOT NULL,
          referencia INT NOT NULL DEFAULT 0,
          criado_em  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY usuario_tipo_ref (usuario_id, tipo, referencia)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("eventos_utilizador", "eventos_utilizador_ibfk_1", "(usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE");
    },
  },

  // ── Traduções de resumos (cache) ─────────────────────────────────────────
  {
    nome: "0015_traducoes",
    correr: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS traducoes (
          id          INT NOT NULL AUTO_INCREMENT,
          material_id INT NOT NULL,
          campo       VARCHAR(20) NOT NULL,
          idioma      CHAR(2) NOT NULL,
          texto       MEDIUMTEXT NOT NULL,
          origem_hash CHAR(64) NOT NULL,
          gerado_em   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY material_campo_idioma (material_id, campo, idioma)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await garantirChaveEstrangeira("traducoes", "traducoes_ibfk_1", "(material_id) REFERENCES materiais (id) ON DELETE CASCADE");
    },
  },

  // ── Denúncias: classificação assistida por IA ────────────────────────────
  {
    nome: "0016_denuncias_ia",
    correr: async () => {
      await adicionarColuna("denuncias", "ia_classificacao", "VARCHAR(30) NULL");
      await adicionarColuna("denuncias", "ia_sugestao", "VARCHAR(20) NULL");
      await adicionarColuna("denuncias", "ia_motivo", "VARCHAR(300) NULL");
    },
  },

  // ── Digest semanal por email ─────────────────────────────────────────────
  {
    nome: "0017_digest_semanal",
    correr: async () => {
      await adicionarColuna("usuarios", "digest_semanal", "TINYINT(1) NOT NULL DEFAULT 1");
      await adicionarColuna("usuarios", "ultimo_digest_em", "DATETIME NULL");
    },
  },

  // ── Chat: salas por disciplina e partilha de materiais ───────────────────
  {
    nome: "0018_chat_salas_materiais",
    correr: async () => {
      // Salas de disciplina usam o nome da cadeira (até 150 caracteres) com
      // prefixo — a coluna nasceu com 100.
      const [[coluna]] = await db.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH AS tamanho FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mensagens_estudantes' AND COLUMN_NAME = 'curso'`
      );
      if (coluna && Number(coluna.tamanho) < 160) {
        await db.query("ALTER TABLE mensagens_estudantes MODIFY COLUMN curso VARCHAR(160) NOT NULL DEFAULT 'Geral'");
        console.log("✅ Migração: mensagens_estudantes.curso alargada para 160 caracteres.");
      }
      await adicionarColuna("mensagens_estudantes", "material_id", "INT NULL");
      await garantirChaveEstrangeira("mensagens_estudantes", "mensagens_ibfk_material", "(material_id) REFERENCES materiais (id) ON DELETE SET NULL");
    },
  },

  // ── Chaves do esquema base com a regra ON DELETE errada ─────────────────
  // init-db/01-schema.sql criava auditoria_ibfk_1 sem ON DELETE SET NULL:
  // numa instalação nova, eliminar uma conta falhava por causa dos registos
  // de auditoria (a migração 0004 saltava a FK por já existir com esse nome).
  {
    nome: "0019_auditoria_fk_set_null",
    correr: async () => {
      await garantirChaveComRegra("auditoria", "auditoria_ibfk_1", "(usuario_id) REFERENCES usuarios (id)", "SET NULL");
      await garantirChaveComRegra("denuncias", "denuncias_ibfk_1", "(usuario_id) REFERENCES usuarios (id)", "SET NULL");
      await garantirChaveComRegra("materiais_acessos", "acessos_ibfk_2", "(usuario_id) REFERENCES usuarios (id)", "SET NULL");
    },
  },
];

async function estadoMigracoes() {
  await garantirTabelaMigracoes();
  const [aplicadas] = await db.query("SELECT nome, aplicada_em, duracao_ms FROM migracoes ORDER BY nome");
  const nomesAplicadas = new Set(aplicadas.map(m => m.nome));
  return {
    total: MIGRACOES.length,
    aplicadas: aplicadas.length,
    pendentes: MIGRACOES.filter(m => !nomesAplicadas.has(m.nome)).map(m => m.nome),
    ultima: aplicadas.length ? aplicadas[aplicadas.length - 1] : null,
  };
}

async function correrMigracoes() {
  await garantirTabelaMigracoes();
  const [linhas] = await db.query("SELECT nome FROM migracoes");
  const aplicadas = new Set(linhas.map(l => l.nome));
  let corridas = 0;
  for (const migracao of MIGRACOES) {
    if (aplicadas.has(migracao.nome)) continue;
    const inicio = Date.now();
    await migracao.correr();
    await db.query("INSERT INTO migracoes (nome, duracao_ms) VALUES (?, ?) ON DUPLICATE KEY UPDATE aplicada_em = NOW(), duracao_ms = VALUES(duracao_ms)", [migracao.nome, Date.now() - inicio]);
    corridas++;
    console.log(`✅ Migração '${migracao.nome}' aplicada (${Date.now() - inicio} ms).`);
  }
  if (corridas === 0) console.log(`[Migrações] Esquema actualizado (${MIGRACOES.length} migrações registadas).`);
  return corridas;
}

module.exports = { correrMigracoes, estadoMigracoes, MIGRACOES, colunaExiste, adicionarColuna, indiceExiste, criarIndice, garantirChaveEstrangeira, garantirChaveComRegra, regraDeleteDaChave };
