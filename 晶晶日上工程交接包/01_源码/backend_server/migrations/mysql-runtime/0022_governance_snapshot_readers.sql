CREATE TABLE governance_snapshot_readers (
 snapshot_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(snapshot_id,account_id),
 KEY governance_reader_account(account_id,snapshot_id),
 FOREIGN KEY(snapshot_id) REFERENCES governance_snapshots(id),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
