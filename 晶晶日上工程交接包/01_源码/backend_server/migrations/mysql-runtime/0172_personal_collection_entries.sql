CREATE TABLE personal_collection_entries (
 sequence_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 collection ENUM('FAVORITE','HISTORY') NOT NULL,
 target_kind ENUM('ARTIST','STOCK','NOTICE') NOT NULL,
 target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 expires_at DATETIME(3) NULL,
 UNIQUE KEY personal_collection_target(account_id,collection,target_kind,target_id),
 KEY personal_collection_page(account_id,collection,sequence_id),
 KEY personal_collection_expiry(collection,expires_at),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
