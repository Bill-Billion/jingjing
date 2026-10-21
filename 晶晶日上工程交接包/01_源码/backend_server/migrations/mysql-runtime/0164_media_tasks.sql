CREATE TABLE media_tasks (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 command_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 task_kind ENUM('MARK_VIDEO','MODERATE_FILE') NOT NULL,
 source_kind ENUM('SUPPLY_ASSET','PRODUCTION_VERSION') NOT NULL,
 source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_json JSON NOT NULL,
 request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('QUEUED','EXECUTED','BLOCKED') NOT NULL DEFAULT 'QUEUED',
 job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json JSON NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB;
