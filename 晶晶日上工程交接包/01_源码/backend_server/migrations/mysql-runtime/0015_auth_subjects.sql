CREATE TABLE auth_subjects (
 phone_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 next_send_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
