CREATE TABLE auth_challenges (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 phone_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('PENDING','SENT','UNKNOWN','CONSUMED','EXPIRED') NOT NULL,
 expires_ms BIGINT UNSIGNED NOT NULL,
 resend_ms BIGINT UNSIGNED NOT NULL,
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(phone_hash) REFERENCES auth_subjects(phone_hash),
 INDEX auth_challenge_phone(phone_hash,current_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
