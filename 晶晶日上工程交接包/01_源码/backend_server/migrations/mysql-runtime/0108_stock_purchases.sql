CREATE TABLE stock_purchases (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 listing_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 buyer_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 KEY stock_buyer(buyer_party_id,order_id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id),
 FOREIGN KEY(listing_id) REFERENCES stock_listings(id),
 FOREIGN KEY(buyer_party_id) REFERENCES parties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
