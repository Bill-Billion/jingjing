CREATE TABLE notice_links (
 submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 case_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 FOREIGN KEY(submission_id) REFERENCES notice_records(id),
 FOREIGN KEY(case_id) REFERENCES notice_records(id),
 FOREIGN KEY(quote_id) REFERENCES trade_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
