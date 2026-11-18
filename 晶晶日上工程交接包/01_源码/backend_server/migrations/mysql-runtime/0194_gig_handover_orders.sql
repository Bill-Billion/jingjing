CREATE TABLE gig_handover_orders (
 relation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(relation_id,order_id),
 FOREIGN KEY(relation_id) REFERENCES gig_records(id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
