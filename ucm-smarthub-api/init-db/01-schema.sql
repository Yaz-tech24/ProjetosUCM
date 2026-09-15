-- Schema inicial da base de dados UCM SmartHub — espelha exactamente o
-- schema em uso (extraído via SHOW CREATE TABLE da base de dados de
-- desenvolvimento), para que uma instalação Docker nova arranque idêntica.
--
-- Este ficheiro só é executado automaticamente pelo container MySQL quando o
-- volume de dados está vazio (primeiro arranque). As tabelas `configuracoes`
-- e `cursos`, e as colunas adicionadas depois do lançamento inicial
-- (avatar_url, reset_token, ia_sinalizado, etc., já incluídas abaixo),
-- continuam também a ser criadas/migradas em runtime por runMigrations() em
-- server.js de forma idempotente.

CREATE TABLE IF NOT EXISTS usuarios (
  id                  INT NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(100) NOT NULL,
  email               VARCHAR(100) NOT NULL,
  senha               VARCHAR(255) DEFAULT NULL,
  curso               VARCHAR(100) DEFAULT NULL,
  papel               ENUM('estudante', 'professor', 'admin') DEFAULT 'estudante',
  data_criacao        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  avatar_url          VARCHAR(255) DEFAULT NULL,
  reset_token         VARCHAR(255) DEFAULT NULL,
  reset_token_expira  DATETIME DEFAULT NULL,
  numero_estudante    VARCHAR(50) DEFAULT NULL,
  telefone            VARCHAR(30) DEFAULT NULL,
  email_verificado    TINYINT(1) NOT NULL DEFAULT 0,
  email_token         VARCHAR(255) DEFAULT NULL,
  email_token_expira  DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS materiais (
  id             INT NOT NULL AUTO_INCREMENT,
  titulo         VARCHAR(200) NOT NULL,
  cadeira        VARCHAR(100) NOT NULL,
  tipo           ENUM('PDF', 'Vídeo') NOT NULL,
  url_arquivo    VARCHAR(255) NOT NULL,
  autor_id       INT DEFAULT NULL,
  data_upload    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  status         VARCHAR(20) DEFAULT 'pendente',
  ia_sinalizado  TINYINT(1) NOT NULL DEFAULT 0,
  ia_motivo      TEXT,
  resumo_texto     MEDIUMTEXT DEFAULT NULL,
  resumo_gerado_em DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY autor_id (autor_id),
  KEY idx_materiais_status_data (status, data_upload),
  CONSTRAINT materiais_ibfk_1 FOREIGN KEY (autor_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mensagens_estudantes (
  id          INT NOT NULL AUTO_INCREMENT,
  user_id     INT NOT NULL,
  message     TEXT NOT NULL,
  `timestamp` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  curso       VARCHAR(100) NOT NULL DEFAULT 'Geral',
  PRIMARY KEY (id),
  KEY user_id (user_id),
  KEY idx_mensagens_curso_timestamp (curso, `timestamp`),
  CONSTRAINT mensagens_estudantes_ibfk_1 FOREIGN KEY (user_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logging de Auditoria — registar todas as ações administrativas críticas
CREATE TABLE IF NOT EXISTS auditoria (
  id            INT NOT NULL AUTO_INCREMENT,
  usuario_id    INT,
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
  KEY idx_auditoria_data_acao (data_hora, acao),
  CONSTRAINT auditoria_ibfk_1 FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sistema de Avaliações (stars + comentários)
CREATE TABLE IF NOT EXISTS avaliacoes (
  id            INT NOT NULL AUTO_INCREMENT,
  material_id   INT NOT NULL,
  usuario_id    INT NOT NULL,
  nota          INT NOT NULL COMMENT 'Escala 1-5',
  comentario    TEXT,
  data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY material_usuario (material_id, usuario_id),
  KEY usuario_id (usuario_id),
  CONSTRAINT avaliacoes_ibfk_1 FOREIGN KEY (material_id) REFERENCES materiais (id) ON DELETE CASCADE,
  CONSTRAINT avaliacoes_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Comentários em Materiais
CREATE TABLE IF NOT EXISTS comentarios_materiais (
  id            INT NOT NULL AUTO_INCREMENT,
  material_id   INT NOT NULL,
  usuario_id    INT NOT NULL,
  conteudo      TEXT NOT NULL,
  data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY material_id (material_id),
  KEY usuario_id (usuario_id),
  CONSTRAINT comentarios_ibfk_1 FOREIGN KEY (material_id) REFERENCES materiais (id) ON DELETE CASCADE,
  CONSTRAINT comentarios_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sistema de Reputação
CREATE TABLE IF NOT EXISTS reputacao_usuarios (
  id            INT NOT NULL AUTO_INCREMENT,
  usuario_id    INT NOT NULL UNIQUE,
  pontos        INT NOT NULL DEFAULT 0,
  materiais_submetidos INT NOT NULL DEFAULT 0,
  materiais_aprovados INT NOT NULL DEFAULT 0,
  media_avaliacoes DECIMAL(3,2),
  emblema       VARCHAR(50),
  data_atualizacao TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT reputacao_ibfk_1 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Subscrições a Disciplinas
CREATE TABLE IF NOT EXISTS subscricoes_disciplinas (
  id            INT NOT NULL AUTO_INCREMENT,
  usuario_id    INT NOT NULL,
  disciplina    VARCHAR(100) NOT NULL,
  data_subscricao TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuario_disciplina (usuario_id, disciplina),
  CONSTRAINT subscricoes_ibfk_1 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quotas de Upload por Utilizador
