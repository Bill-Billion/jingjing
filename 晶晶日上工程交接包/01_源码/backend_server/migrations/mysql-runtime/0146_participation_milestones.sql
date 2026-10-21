CREATE TABLE project_participation_milestones (
 agreement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 installment_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 evidence_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reason TEXT NOT NULL,
 PRIMARY KEY(agreement_id,installment_key),
 FOREIGN KEY(agreement_id) REFERENCES project_records(id),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(evidence_asset_id) REFERENCES supply_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
