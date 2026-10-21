CREATE TABLE engagement_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind VARCHAR(24) NOT NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 source_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(32) NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY engagement_source(source_key),
 KEY engagement_owner(kind,owner_party_id,id),
 KEY engagement_parent(parent_id,kind),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
