CREATE TABLE artist_audit (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 person_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 event_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_ref VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY person_history(person_id,created_at,id),
 FOREIGN KEY(person_id) REFERENCES artist_people(id),
 FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
