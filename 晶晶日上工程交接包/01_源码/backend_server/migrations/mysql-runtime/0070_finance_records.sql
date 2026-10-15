CREATE TABLE finance_records (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('AGREEMENT','STATEMENT','RECEIPT','SETTLEMENT','ADJUSTMENT','PAYOUT','PAYOUT_EVIDENCE','DISPUTE','RESPONSE','RECONCILIATION') NOT NULL,
 agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 owner_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY finance_group(agreement_id,kind,id), FOREIGN KEY(agreement_id) REFERENCES finance_records(id),
 FOREIGN KEY(owner_party_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
