CREATE TABLE ops_reads (
event_id BIGINT UNSIGNED NOT NULL, account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(account_id,party_id,event_id),
FOREIGN KEY(event_id) REFERENCES ops_events(id), FOREIGN KEY(account_id) REFERENCES identity_accounts(id), FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
