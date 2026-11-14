CREATE TABLE gig_settlement_archives (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 settlement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY (order_id),
 CONSTRAINT fk_gig_archive_order FOREIGN KEY (order_id) REFERENCES trade_records(id),
 CONSTRAINT fk_gig_archive_settlement FOREIGN KEY (settlement_id) REFERENCES finance_records(id)
) ENGINE=InnoDB
