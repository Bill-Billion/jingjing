CREATE TABLE guardian_usage (
 child_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 local_date CHAR(10) NOT NULL,
 seconds_reserved INT UNSIGNED NOT NULL DEFAULT 0,
 spend_reserved_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 slot_until VARCHAR(24) NULL,
 PRIMARY KEY(child_account_id,local_date),
 FOREIGN KEY(child_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
