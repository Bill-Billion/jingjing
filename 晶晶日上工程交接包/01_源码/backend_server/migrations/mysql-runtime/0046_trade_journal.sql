CREATE TABLE trade_journal (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 direction ENUM('RECEIPT','REFUND') NOT NULL,
 currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 amount_minor BIGINT UNSIGNED NOT NULL,
 provider_reference VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY trade_journal_source(source_id,direction),
 FOREIGN KEY(source_id) REFERENCES trade_records(id), FOREIGN KEY(order_id) REFERENCES trade_records(id), CHECK(amount_minor>0)
) ENGINE=InnoDB
