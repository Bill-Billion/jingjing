CREATE TABLE governance_operator_history (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 grant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 enabled BOOLEAN NOT NULL,
 expires_at DATETIME(3) NULL,
 authority_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reason VARCHAR(500) NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY governance_grant_history(grant_id,object_version),
 FOREIGN KEY(grant_id) REFERENCES governance_operator_grants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
