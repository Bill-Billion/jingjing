CREATE TABLE finance_external_refs (
 reference_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY(record_id) REFERENCES finance_records(id)
) ENGINE=InnoDB
