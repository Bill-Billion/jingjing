CREATE TABLE auth_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_ms BIGINT UNSIGNED NOT NULL,
 revoked BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 INDEX auth_sessions_expiry(expires_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
