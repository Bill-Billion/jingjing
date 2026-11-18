CREATE TABLE invoice_events (
 invoice_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, object_version INT UNSIGNED NOT NULL, actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_kind ENUM('APPLICANT','OPERATOR') NOT NULL, action_code VARCHAR(32) NOT NULL,
 body_json JSON NOT NULL, body_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(invoice_id,object_version), FOREIGN KEY(invoice_id) REFERENCES invoice_requests(id), FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
