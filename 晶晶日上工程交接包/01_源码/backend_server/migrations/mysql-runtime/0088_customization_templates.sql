CREATE TABLE customization_templates (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 category_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 template_version INT UNSIGNED NOT NULL,
 template_snapshot_json JSON NOT NULL,
 template_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_ref VARCHAR(500) NOT NULL,
 published_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 published_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY customization_template_version(category_code,template_version),
 FOREIGN KEY(published_by) REFERENCES identity_accounts(id),
 CHECK(template_version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
