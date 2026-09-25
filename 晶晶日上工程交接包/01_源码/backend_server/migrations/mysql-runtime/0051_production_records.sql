CREATE TABLE production_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('PROJECT','FILE','VERSION','FEEDBACK','GENERATION','DIGITAL_ASSET') NOT NULL,
 project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY production_project(project_id,kind,id), KEY production_order(order_id,kind,id),
 FOREIGN KEY(project_id) REFERENCES production_records(id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id), CHECK(object_version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
