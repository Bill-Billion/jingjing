CREATE TABLE personal_collection_settings (
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 history_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
