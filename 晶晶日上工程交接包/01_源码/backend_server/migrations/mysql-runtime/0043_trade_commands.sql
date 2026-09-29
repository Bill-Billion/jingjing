CREATE TABLE trade_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(result_id) REFERENCES trade_records(id)
) ENGINE=InnoDB
