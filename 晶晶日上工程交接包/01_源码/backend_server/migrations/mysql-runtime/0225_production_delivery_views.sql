CREATE TABLE production_delivery_views (
 delivery_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 buyer_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 viewed_at DATETIME(3) NOT NULL,
 source_code ENUM('HTTP_PRIVATE_BYTES','LEGACY_RECEIPT') NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(delivery_id,account_id),
 KEY delivery_view_account(account_id,project_id),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(project_id) REFERENCES production_records(id),
 FOREIGN KEY(version_id) REFERENCES production_records(id),
 FOREIGN KEY(buyer_party_id) REFERENCES parties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
