CREATE TABLE invoice_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, invoice_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(invoice_id) REFERENCES invoice_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
