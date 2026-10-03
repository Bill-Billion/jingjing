CREATE TABLE gig_notifications (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_code VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY gig_notice(party_id,record_id,event_code),
 FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(record_id) REFERENCES gig_records(id)
) ENGINE=InnoDB
