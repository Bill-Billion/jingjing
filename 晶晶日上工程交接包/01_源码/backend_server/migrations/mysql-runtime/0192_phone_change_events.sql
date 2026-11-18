CREATE TABLE auth_phone_change_events (
 change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, object_version INT UNSIGNED NOT NULL, action_code VARCHAR(40) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(change_id,object_version), FOREIGN KEY(change_id) REFERENCES auth_phone_changes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
