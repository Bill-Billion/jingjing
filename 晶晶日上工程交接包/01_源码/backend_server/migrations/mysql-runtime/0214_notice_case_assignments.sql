CREATE TABLE notice_case_assignments (
 case_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (case_id,object_version),
 CONSTRAINT fk_notice_assignment_case FOREIGN KEY (case_id) REFERENCES notice_records(id)
) ENGINE=InnoDB
