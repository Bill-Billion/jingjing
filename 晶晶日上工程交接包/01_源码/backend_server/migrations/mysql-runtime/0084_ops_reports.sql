CREATE TABLE ops_reports (
id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
request_json JSON NOT NULL, request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, result_json JSON NULL, result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
FOREIGN KEY(created_by) REFERENCES identity_accounts(id), FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(job_id) REFERENCES platform_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
