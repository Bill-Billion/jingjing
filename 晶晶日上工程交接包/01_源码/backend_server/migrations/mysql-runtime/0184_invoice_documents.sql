CREATE TABLE invoice_documents (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, invoice_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('PENDING','REJECTED','ISSUED','SUPERSEDED') NOT NULL DEFAULT 'PENDING',
 content_json JSON NOT NULL, content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(invoice_id) REFERENCES invoice_requests(id), FOREIGN KEY(created_by) REFERENCES identity_accounts(id), FOREIGN KEY(asset_id) REFERENCES supply_assets(id), KEY invoice_documents_list(invoice_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
