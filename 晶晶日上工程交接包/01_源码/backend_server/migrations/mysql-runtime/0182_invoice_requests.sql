CREATE TABLE invoice_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, buyer_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, issuer_party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL, currency CHAR(3) NOT NULL,
 requested_minor BIGINT UNSIGNED NOT NULL, occupied_minor BIGINT UNSIGNED NOT NULL,
 current_status ENUM('REQUESTED','NEEDS_INFO','APPROVED','DOCUMENT_REVIEW','ISSUED','CORRECTION_REQUESTED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'REQUESTED',
 object_version INT UNSIGNED NOT NULL DEFAULT 1, header_json JSON NOT NULL, header_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 issued_document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, pending_document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES trade_records(id), FOREIGN KEY(buyer_party_id) REFERENCES parties(id), FOREIGN KEY(issuer_party_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES identity_accounts(id),
 KEY invoice_order(order_id,id), KEY invoice_buyer(buyer_party_id,id), KEY invoice_queue(current_status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
