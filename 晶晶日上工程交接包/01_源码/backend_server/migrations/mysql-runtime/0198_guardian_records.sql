CREATE TABLE guardian_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('LINK','SPEND','REFUND','INFORMATION') NOT NULL,
 parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 guardian_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 child_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(40) NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(guardian_account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(child_account_id) REFERENCES identity_accounts(id),
 INDEX guardian_child(child_account_id,kind,current_status),
 INDEX guardian_owner(guardian_account_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
