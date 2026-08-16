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
  PRIMARY KEY (id),
  KEY autor_id (autor_id),
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
  CONSTRAINT mensagens_estudantes_ibfk_1 FOREIGN KEY (user_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
