CREATE TABLE consumer_risk_policy (
 singleton_id TINYINT UNSIGNED PRIMARY KEY,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 object_version INT UNSIGNED NOT NULL,
 FOREIGN KEY(record_id) REFERENCES wallet_records(id),
 CHECK(singleton_id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
