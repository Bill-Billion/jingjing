CREATE TABLE privacy_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 current_status ENUM('RECEIVED','PROCESSING','AWAITING_REVIEW','FOLLOW_UP','RESPONDED','REOPENED') NOT NULL DEFAULT 'RECEIVED',
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 request_json JSON NOT NULL,
 request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 response_due_on VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 calendar_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 proposal_json JSON NULL,
 proposal_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 proposed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 result_json JSON NULL,
 result_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(proposed_by) REFERENCES identity_accounts(id),
 INDEX privacy_own(account_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
