CREATE TABLE finance_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_code VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY finance_notice(party_id,id), FOREIGN KEY(record_id) REFERENCES finance_records(id), FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB
