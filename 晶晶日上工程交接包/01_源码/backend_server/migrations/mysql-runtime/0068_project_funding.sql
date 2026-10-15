CREATE TABLE project_funding (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 line_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 candidate_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(order_id,line_id), FOREIGN KEY(order_id) REFERENCES trade_records(id),
 FOREIGN KEY(candidate_id) REFERENCES project_records(id)
) ENGINE=InnoDB
