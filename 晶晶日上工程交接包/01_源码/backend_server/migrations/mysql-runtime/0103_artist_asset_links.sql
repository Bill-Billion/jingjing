CREATE TABLE artist_asset_links (
 asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 person_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 acting_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY(asset_id) REFERENCES supply_assets(id),
 FOREIGN KEY(person_id) REFERENCES artist_people(id),
 FOREIGN KEY(acting_party_id) REFERENCES parties(id),
 INDEX artist_materials(person_id,asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
