CREATE TABLE manual_sample_requests (
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 data_json JSON NOT NULL,
 data_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 CONSTRAINT fk_manual_sample_request FOREIGN KEY(request_id) REFERENCES customization_requests(id)
) ENGINE=InnoDB;
