CREATE TABLE invoice_asset_refs (
 invoice_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, object_version INT UNSIGNED NOT NULL, asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, purpose ENUM('APPLICATION','DOCUMENT') NOT NULL,
 PRIMARY KEY(invoice_id,object_version,asset_id), FOREIGN KEY(invoice_id) REFERENCES invoice_requests(id), FOREIGN KEY(asset_id) REFERENCES supply_assets(id), KEY invoice_asset(asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
