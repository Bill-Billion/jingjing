CREATE TABLE gig_rankings (
 rule_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 as_of CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 PRIMARY KEY(rule_id,as_of), FOREIGN KEY(rule_id) REFERENCES gig_records(id), FOREIGN KEY(record_id) REFERENCES gig_records(id)
) ENGINE=InnoDB
