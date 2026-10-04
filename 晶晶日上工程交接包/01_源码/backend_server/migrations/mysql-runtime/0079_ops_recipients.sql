CREATE TABLE ops_recipients (
event_id BIGINT UNSIGNED NOT NULL, party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
PRIMARY KEY(party_id,event_id), FOREIGN KEY(event_id) REFERENCES ops_events(id), FOREIGN KEY(party_id) REFERENCES parties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
