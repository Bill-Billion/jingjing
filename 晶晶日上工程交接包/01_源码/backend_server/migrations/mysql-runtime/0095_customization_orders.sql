CREATE TABLE customization_orders (
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY customization_quote_order(quote_id),
 UNIQUE KEY customization_order(order_id),
 FOREIGN KEY(request_id) REFERENCES customization_requests(id),
 FOREIGN KEY(submission_id) REFERENCES customization_submissions(id),
 FOREIGN KEY(quote_id) REFERENCES trade_records(id),
 FOREIGN KEY(order_id) REFERENCES trade_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
