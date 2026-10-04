CREATE TABLE legacy_rows (
 import_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 table_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 row_index INT UNSIGNED NOT NULL,
 data_json JSON NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(import_id,table_name,row_index),
 FOREIGN KEY(import_id) REFERENCES legacy_imports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
