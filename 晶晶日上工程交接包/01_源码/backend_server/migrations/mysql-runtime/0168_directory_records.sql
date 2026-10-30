CREATE TABLE directory_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('ORGANIZATION','FEATURED_ARTIST') NOT NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sort_order INT UNSIGNED NOT NULL DEFAULT 0,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('IN_REVIEW','APPROVED','REJECTED','WITHDRAWN','REPLACED') NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY directory_catalog(kind,current_status,sort_order,id),
 KEY directory_source(kind,source_id,current_status),
 KEY directory_owner(owner_party_id,id),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
