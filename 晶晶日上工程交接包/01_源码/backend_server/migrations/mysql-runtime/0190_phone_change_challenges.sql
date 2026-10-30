CREATE TABLE auth_phone_change_challenges (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, side ENUM('OLD','NEW') NOT NULL, phone_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE, code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('PENDING','SENT','UNKNOWN','CONSUMED','EXPIRED') NOT NULL,
 attempts INT UNSIGNED NOT NULL DEFAULT 0, expires_ms BIGINT UNSIGNED NOT NULL, resend_ms BIGINT UNSIGNED NOT NULL,
 FOREIGN KEY(change_id) REFERENCES auth_phone_changes(id), KEY phone_change_challenge(change_id,side,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
