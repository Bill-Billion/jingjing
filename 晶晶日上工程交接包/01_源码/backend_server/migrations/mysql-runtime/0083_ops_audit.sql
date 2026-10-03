CREATE TABLE ops_audit (
id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, object_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, event_code VARCHAR(80) NOT NULL, object_version INT UNSIGNED NOT NULL,
reason VARCHAR(1000) NOT NULL, request_id VARCHAR(128) NOT NULL,
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY ops_audit_object(object_id,id),
FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
