CREATE TABLE organization_batch_items (
 batch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 item_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json JSON NOT NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(batch_id,item_key),
 FOREIGN KEY(batch_id) REFERENCES organization_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
