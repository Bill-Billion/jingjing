CREATE TABLE organization_batches (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_json JSON NOT NULL,
 payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
