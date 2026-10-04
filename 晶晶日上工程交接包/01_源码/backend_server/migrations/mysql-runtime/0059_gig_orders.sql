CREATE TABLE gig_orders (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 offer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 commission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 FOREIGN KEY(order_id) REFERENCES trade_records(id), FOREIGN KEY(offer_id) REFERENCES gig_records(id),
 FOREIGN KEY(commission_id) REFERENCES gig_records(id)
) ENGINE=InnoDB
