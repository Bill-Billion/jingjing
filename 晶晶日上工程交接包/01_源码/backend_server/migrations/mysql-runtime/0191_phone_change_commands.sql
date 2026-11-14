CREATE TABLE auth_phone_change_commands (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, error_code VARCHAR(64) NULL,
 FOREIGN KEY(change_id) REFERENCES auth_phone_changes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
