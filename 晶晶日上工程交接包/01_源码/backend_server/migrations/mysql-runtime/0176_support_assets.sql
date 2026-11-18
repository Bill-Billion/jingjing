CREATE TABLE support_asset_refs (
 ticket_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(ticket_id,object_version,asset_id),
 FOREIGN KEY(ticket_id,object_version) REFERENCES support_events(ticket_id,object_version),
 FOREIGN KEY(asset_id) REFERENCES supply_assets(id), KEY support_asset_usage(asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
