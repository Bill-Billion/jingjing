CREATE TABLE project_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('PROJECT','ROLE','CANDIDATE','PLAN','EDITION','CHANNEL','RELEASE','EXTERNAL_EVENT') NOT NULL,
 project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY project_kind(project_id,kind,id), FOREIGN KEY(project_id) REFERENCES project_records(id),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
