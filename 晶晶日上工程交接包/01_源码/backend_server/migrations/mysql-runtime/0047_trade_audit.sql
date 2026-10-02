CREATE TABLE trade_audit (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 actor_kind ENUM('ACCOUNT','PROVIDER') NOT NULL,
 event_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(record_id) REFERENCES trade_records(id), FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB
