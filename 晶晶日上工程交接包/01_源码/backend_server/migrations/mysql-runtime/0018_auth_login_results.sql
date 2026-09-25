CREATE TABLE auth_login_results (
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 encrypted_token TEXT NOT NULL,
 expires_ms BIGINT UNSIGNED NOT NULL,
 FOREIGN KEY(token_hash) REFERENCES auth_sessions(token_hash),
 INDEX auth_result_expiry(expires_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
