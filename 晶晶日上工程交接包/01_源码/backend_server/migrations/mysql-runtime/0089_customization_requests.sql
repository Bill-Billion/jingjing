CREATE TABLE customization_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 template_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 category_title VARCHAR(160) NOT NULL,
 template_snapshot_json JSON NOT NULL,
 template_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 answers_json JSON NOT NULL,
 answers_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('DRAFT','SUBMITTED','INTAKE') NOT NULL DEFAULT 'DRAFT',
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 submission_number INT UNSIGNED NOT NULL DEFAULT 0,
 submitted_at DATETIME(3) NULL,
 intake_at DATETIME(3) NULL,
 intake_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY customization_creator(party_id,created_by,id),
 KEY customization_intake(current_status,id),
 FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 FOREIGN KEY(party_id) REFERENCES parties(id),
 FOREIGN KEY(template_version_id) REFERENCES customization_templates(id),
 FOREIGN KEY(intake_by) REFERENCES identity_accounts(id),
 CHECK(object_version>0),
 CHECK((current_status='DRAFT' AND submission_number=0 AND submitted_at IS NULL AND intake_at IS NULL AND intake_by IS NULL) OR
       (current_status='SUBMITTED' AND submission_number>0 AND submitted_at IS NOT NULL AND intake_at IS NULL AND intake_by IS NULL) OR
       (current_status='INTAKE' AND submission_number>0 AND submitted_at IS NOT NULL AND intake_at IS NOT NULL AND intake_by IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
