CREATE TABLE artist_people (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 display_name VARCHAR(120) NOT NULL,
 current_status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
 identity_status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNVERIFIED',
 age_band VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNKNOWN',
 identity_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 identity_valid_until DATETIME(3) NULL,
 identity_record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY person_party(owner_party_id),
 UNIQUE KEY verified_real_person(identity_key),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 CHECK(object_version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
