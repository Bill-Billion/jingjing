CREATE TABLE ops_read_snapshots (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_ids_json JSON NOT NULL, content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id), FOREIGN KEY(party_id) REFERENCES parties(id),
 KEY snapshot_expiry(account_id,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
