CREATE TABLE trade_license_orders (
 reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 CONSTRAINT fk_trade_license_reservation FOREIGN KEY (reservation_id) REFERENCES license_records(id),
 CONSTRAINT fk_trade_license_order FOREIGN KEY (order_id) REFERENCES trade_records(id)
) ENGINE=InnoDB;
