CREATE TABLE auth_phone_changes (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 old_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, new_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, encrypted_phones TEXT NULL,
 old_mask VARCHAR(20) NOT NULL, new_mask VARCHAR(20) NOT NULL,
 current_status ENUM('AWAITING_OLD','AWAITING_NEW','READY','COMPLETED','CANCELLED','EXPIRED') NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1, active_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 expires_ms BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id), KEY phone_change_account(account_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
