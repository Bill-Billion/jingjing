CREATE TABLE project_participation_amendments (
 previous_agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 replacement_agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 activated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 activated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(previous_agreement_id) REFERENCES project_records(id),
 FOREIGN KEY(replacement_agreement_id) REFERENCES project_records(id),
 FOREIGN KEY(activated_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
