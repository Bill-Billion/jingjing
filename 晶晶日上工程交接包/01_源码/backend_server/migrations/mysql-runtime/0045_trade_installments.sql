CREATE TABLE trade_installments (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 installment_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(order_id,installment_key), FOREIGN KEY(order_id) REFERENCES trade_records(id), FOREIGN KEY(payment_id) REFERENCES trade_records(id)
) ENGINE=InnoDB
