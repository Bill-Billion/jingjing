CREATE TABLE customization_quotes (
 quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY customization_quotes_list(request_id,quote_id),
 FOREIGN KEY(quote_id) REFERENCES trade_records(id),
 FOREIGN KEY(request_id) REFERENCES customization_requests(id),
 FOREIGN KEY(submission_id) REFERENCES customization_submissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
