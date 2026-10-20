CREATE TABLE privacy_events (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_code VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 message TEXT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(request_id) REFERENCES privacy_requests(id),
 FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
