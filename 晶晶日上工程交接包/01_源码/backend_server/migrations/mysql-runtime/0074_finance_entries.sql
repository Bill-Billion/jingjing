CREATE TABLE finance_entries (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fact_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 category ENUM('ACCRUAL','ADJUSTMENT','PAYOUT','PAYOUT_RETURN') NOT NULL,
 amount_minor BIGINT NOT NULL,
 source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY finance_fact(agreement_id,fact_key,party_id),
 KEY finance_party(agreement_id,party_id,id), FOREIGN KEY(agreement_id) REFERENCES finance_records(id),
 FOREIGN KEY(source_id) REFERENCES finance_records(id), FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB
