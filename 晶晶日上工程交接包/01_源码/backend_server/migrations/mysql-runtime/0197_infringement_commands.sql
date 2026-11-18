CREATE TABLE infringement_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 fingerprint CHAR(64) NOT NULL,
 result_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(result_id) REFERENCES infringement_cases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
