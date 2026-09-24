CREATE TABLE governance_rules (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 rule_key VARCHAR(100) NOT NULL,
 version_label VARCHAR(64) NOT NULL,
 content_json JSON NOT NULL,
 current_status ENUM('DRAFT','IN_REVIEW','APPROVED','EFFECTIVE','RETIRED') NOT NULL DEFAULT 'DRAFT',
 effective_at DATETIME(3) NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY governance_rule_version (rule_key,version_label),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 CHECK(object_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
