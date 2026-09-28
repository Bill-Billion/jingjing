CREATE TABLE governance_sources (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 source_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content_json JSON NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('DRAFT','REVIEWED','WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reviewed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 review_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY governance_source_ref(source_ref),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 FOREIGN KEY(reviewed_by) REFERENCES identity_accounts(id),
 CHECK(object_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
