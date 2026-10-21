CREATE TABLE customization_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json MEDIUMTEXT NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id),
 CHECK((result_json IS NULL AND result_sha256 IS NULL) OR (result_json IS NOT NULL AND result_sha256 IS NOT NULL AND JSON_VALID(result_json)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
