CREATE TABLE supply_asset_refs (
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(record_id,asset_id),
 FOREIGN KEY(record_id) REFERENCES supply_records(id),
 FOREIGN KEY(asset_id) REFERENCES supply_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
