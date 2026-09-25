CREATE TABLE license_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('PRODUCT','RESERVATION','EVIDENCE','GRANT','PROJECT','BINDING','READING') NOT NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 counterparty_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 work_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY license_owner(owner_party_id,kind,id), KEY license_work(work_id,kind,id), KEY license_parent(parent_id,kind),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id), FOREIGN KEY(counterparty_id) REFERENCES parties(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id), FOREIGN KEY(parent_id) REFERENCES license_records(id),
 CHECK(object_version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
