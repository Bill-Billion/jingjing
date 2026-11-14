CREATE TABLE support_events (
 ticket_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_kind ENUM('APPLICANT','SUPPORT') NOT NULL,
 action_code VARCHAR(32) NOT NULL,
 body_json JSON NOT NULL, body_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(ticket_id,object_version), FOREIGN KEY(ticket_id) REFERENCES support_tickets(id),
 FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
