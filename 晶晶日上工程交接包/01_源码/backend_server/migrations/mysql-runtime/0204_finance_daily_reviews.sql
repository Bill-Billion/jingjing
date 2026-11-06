CREATE TABLE finance_daily_reviews (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 report_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 reviewed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 data_json JSON NOT NULL, data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY finance_daily_review_version(report_id,object_version),
 FOREIGN KEY(report_id) REFERENCES finance_daily_reports(id),
 FOREIGN KEY(reviewed_by) REFERENCES identity_accounts(id)
) ENGINE=InnoDB
