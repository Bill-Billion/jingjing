CREATE TABLE cocreation_cast (
 member_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, avatar_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 locked_json JSON NULL, locked_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 PRIMARY KEY(member_id,avatar_id), FOREIGN KEY(member_id) REFERENCES cocreation_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
