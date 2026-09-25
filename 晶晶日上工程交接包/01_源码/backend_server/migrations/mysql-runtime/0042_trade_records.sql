CREATE TABLE trade_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('SPEC','QUOTE','ORDER','PAYMENT','REFUND','LEGACY') NOT NULL,
 buyer_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 merchant_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY trade_parties(buyer_party_id,merchant_party_id,kind,id), KEY trade_order(order_id,kind,id), KEY trade_parent(parent_id,kind,id),
 FOREIGN KEY(buyer_party_id) REFERENCES parties(id), FOREIGN KEY(merchant_party_id) REFERENCES parties(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id), FOREIGN KEY(parent_id) REFERENCES trade_records(id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id), CHECK(object_version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
