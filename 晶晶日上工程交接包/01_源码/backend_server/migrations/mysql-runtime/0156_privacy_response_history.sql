CREATE TABLE privacy_responses (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 result_json JSON NOT NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reviewer_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(request_id) REFERENCES privacy_requests(id),
 FOREIGN KEY(reviewer_account_id) REFERENCES identity_accounts(id),
 UNIQUE privacy_response_version(request_id,object_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
