CREATE TABLE gig_commission_entries (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 commission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 data_json JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gig_commission_version(commission_id,object_version), FOREIGN KEY(commission_id) REFERENCES gig_records(id)
) ENGINE=InnoDB
