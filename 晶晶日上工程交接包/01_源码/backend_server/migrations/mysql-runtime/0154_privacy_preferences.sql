CREATE TABLE privacy_preferences (
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 object_version INT UNSIGNED NOT NULL,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
