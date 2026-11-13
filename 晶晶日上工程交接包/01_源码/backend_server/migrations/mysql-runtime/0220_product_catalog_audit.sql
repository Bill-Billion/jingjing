CREATE TABLE IF NOT EXISTS product_catalog_audit (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_code VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_ref VARCHAR(160) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT catalog_audit_record FOREIGN KEY(record_id) REFERENCES product_catalog_records(id)
) ENGINE=InnoDB
