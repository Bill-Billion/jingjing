CREATE TABLE auth_rate_limits (
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 window_ms BIGINT UNSIGNED NOT NULL,
 hits INT UNSIGNED NOT NULL,
 INDEX auth_rate_expiry(window_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
