CREATE TABLE production_order_lines (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 line_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 PRIMARY KEY(order_id,line_id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id), FOREIGN KEY(project_id) REFERENCES production_records(id)
) ENGINE=InnoDB
