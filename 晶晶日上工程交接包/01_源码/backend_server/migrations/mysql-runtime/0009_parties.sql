CREATE TABLE parties (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind ENUM('PERSON','ORGANIZATION') NOT NULL,
 display_name VARCHAR(120) NOT NULL,
 personal_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('PENDING_REVIEW','ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'PENDING_REVIEW',
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(personal_account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 CONSTRAINT party_person_owner CHECK((kind='PERSON' AND personal_account_id IS NOT NULL) OR (kind='ORGANIZATION' AND personal_account_id IS NULL)),
 CONSTRAINT party_version CHECK(object_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
