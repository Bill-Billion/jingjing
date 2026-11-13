CREATE TABLE IF NOT EXISTS product_catalog_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 revision INT UNSIGNED NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY catalog_entity_revision(entity_id,revision),
 CONSTRAINT catalog_record_entity FOREIGN KEY(entity_id) REFERENCES product_catalog_entities(id),
 CONSTRAINT catalog_record_author FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB
