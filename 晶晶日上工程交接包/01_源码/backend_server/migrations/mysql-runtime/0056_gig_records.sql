CREATE TABLE gig_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('RULE','RELATION','GIG','OFFER','COMMISSION','RANKING') NOT NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 counterparty_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY gig_parties(owner_party_id,counterparty_id,kind,id), KEY gig_parent(parent_id,kind,id),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id), FOREIGN KEY(counterparty_id) REFERENCES parties(id),
 FOREIGN KEY(parent_id) REFERENCES gig_records(id), FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
