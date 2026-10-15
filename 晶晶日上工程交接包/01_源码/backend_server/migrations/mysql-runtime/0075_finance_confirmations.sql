CREATE TABLE finance_confirmations (
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 decision ENUM('APPROVED','REJECTED') NOT NULL, reason VARCHAR(2000) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(record_id,party_id), FOREIGN KEY(record_id) REFERENCES finance_records(id),
 FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB
