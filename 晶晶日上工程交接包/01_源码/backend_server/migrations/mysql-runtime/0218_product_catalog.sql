CREATE TABLE IF NOT EXISTS product_catalog_entities (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 next_revision INT UNSIGNED NOT NULL DEFAULT 2,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY catalog_entity_code(kind,code)
) ENGINE=InnoDB
