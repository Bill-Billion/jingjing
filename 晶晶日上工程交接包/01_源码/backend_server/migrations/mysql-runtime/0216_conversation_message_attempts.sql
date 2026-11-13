CREATE TABLE conversation_message_attempts (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 command_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 domain ENUM('COMMERCIAL','AUDITION') NOT NULL,
 source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 outcome ENUM('ALLOWED','REJECTED') NOT NULL,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (id),
 UNIQUE KEY uq_conversation_attempt_command (command_key),
 KEY ix_conversation_risk_page (domain,source_id,outcome,id)
) ENGINE=InnoDB
