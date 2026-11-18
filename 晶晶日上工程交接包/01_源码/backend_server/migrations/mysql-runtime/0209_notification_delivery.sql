CREATE TABLE notification_deliveries (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 source_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 event_id BIGINT UNSIGNED NULL,
 category VARCHAR(16) NOT NULL,
 current_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 reason VARCHAR(64) NULL,
 retry_at DATETIME(3) NULL,
 dispatched_at DATETIME(3) NULL,
 provider_receipt VARCHAR(128) NULL,
 simulated BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX notification_dispatch(current_status,retry_at),
 INDEX notification_account(account_id,category,dispatched_at),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
