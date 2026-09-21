CREATE TABLE platform_provider_readiness_history (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  readiness_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  object_version INT UNSIGNED NOT NULL,
  current_status VARCHAR(40) NOT NULL,
  config_revision VARCHAR(128) NOT NULL,
  reason_code VARCHAR(80) NULL,
  evidence_ref VARCHAR(128) NULL,
  actor_ref VARCHAR(128) NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY readiness_history_version (readiness_id,object_version),
  CONSTRAINT readiness_history_parent FOREIGN KEY (readiness_id) REFERENCES platform_provider_readiness(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
