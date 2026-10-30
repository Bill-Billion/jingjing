CREATE TABLE support_tickets (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind ENUM('FEEDBACK','REPORT') NOT NULL,
 title VARCHAR(200) NOT NULL,
 target_json JSON NULL,
 current_status ENUM('SUBMITTED','PROCESSING','NEEDS_INFO','ANSWERED','CLOSED') NOT NULL DEFAULT 'SUBMITTED',
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id), FOREIGN KEY(party_id) REFERENCES parties(id),
 KEY support_own(created_by,party_id,id), KEY support_queue(current_status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
