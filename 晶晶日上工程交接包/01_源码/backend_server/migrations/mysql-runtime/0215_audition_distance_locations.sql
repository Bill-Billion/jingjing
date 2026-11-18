CREATE TABLE audition_distance_locations (
 offer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 enabled BOOLEAN NOT NULL,
 latitude_grid SMALLINT NULL,
 longitude_grid SMALLINT NULL,
 consent_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 notice_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 updated_at TIMESTAMP(3) NOT NULL,
 PRIMARY KEY (offer_id),
 CONSTRAINT fk_audition_distance_offer FOREIGN KEY (offer_id) REFERENCES audition_records(id),
 CONSTRAINT chk_audition_distance_grid CHECK (
  (enabled=1 AND latitude_grid IS NOT NULL AND longitude_grid IS NOT NULL AND latitude_grid BETWEEN -9000 AND 9000 AND longitude_grid BETWEEN -18000 AND 17999)
  OR (enabled=0 AND latitude_grid IS NULL AND longitude_grid IS NULL)
 )
) ENGINE=InnoDB
