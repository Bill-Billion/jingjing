CREATE TABLE license_receipt_uses (
 payee_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 receipt_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(payee_party_id,currency,receipt_ref),
 FOREIGN KEY(reservation_id) REFERENCES license_records(id), FOREIGN KEY(payee_party_id) REFERENCES parties(id)
) ENGINE=InnoDB
