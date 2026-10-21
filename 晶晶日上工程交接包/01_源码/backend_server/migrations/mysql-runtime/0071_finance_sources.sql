CREATE TABLE finance_sources (
 source_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 FOREIGN KEY(agreement_id) REFERENCES finance_records(id)
) ENGINE=InnoDB
