CREATE TABLE customization_submissions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submission_number INT UNSIGNED NOT NULL,
 template_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 template_snapshot_json JSON NOT NULL,
 template_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 answers_json JSON NOT NULL,
 answers_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submitted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submitted_at DATETIME(3) NOT NULL,
 UNIQUE KEY customization_submission_version(request_id,submission_number),
 FOREIGN KEY(request_id) REFERENCES customization_requests(id),
 FOREIGN KEY(template_version_id) REFERENCES customization_templates(id),
 FOREIGN KEY(submitted_by) REFERENCES identity_accounts(id),
 CHECK(submission_number>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
