CREATE TABLE privacy_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json JSON NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
