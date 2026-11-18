CREATE TABLE guardian_sessions (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 child_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 link_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 slot_until VARCHAR(24) NOT NULL,
 seconds_reserved INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (child_account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY (link_id) REFERENCES guardian_records(id)
) ENGINE=InnoDB;
