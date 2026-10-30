CREATE TABLE stock_sales_publications (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 seller_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 spec_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 rule_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(40) NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 KEY stock_publication_options(seller_party_id,current_status,id),
 FOREIGN KEY(seller_party_id) REFERENCES parties(id),
 FOREIGN KEY(spec_id) REFERENCES trade_records(id),
 FOREIGN KEY(rule_id) REFERENCES governance_rules(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
