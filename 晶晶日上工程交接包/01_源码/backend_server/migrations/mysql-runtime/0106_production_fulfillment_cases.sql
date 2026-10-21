CREATE TABLE production_fulfillment_cases (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 change_order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY fulfillment_cases(project_id,id), UNIQUE KEY fulfillment_change_order(change_order_id),
 FOREIGN KEY(project_id) REFERENCES production_records(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 FOREIGN KEY(change_order_id) REFERENCES trade_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
