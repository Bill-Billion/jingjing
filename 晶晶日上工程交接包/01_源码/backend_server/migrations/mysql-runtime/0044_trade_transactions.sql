CREATE TABLE trade_transactions (
 provider VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 environment VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 transaction_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(provider,environment,transaction_ref), UNIQUE KEY trade_payment_receipt(payment_id),
 FOREIGN KEY(payment_id) REFERENCES trade_records(id)
) ENGINE=InnoDB
