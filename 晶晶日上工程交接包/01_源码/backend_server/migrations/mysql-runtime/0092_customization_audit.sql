CREATE TABLE customization_audit (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 template_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 object_version INT UNSIGNED NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 request_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY customization_request_history(request_id,object_version),
 FOREIGN KEY(request_id) REFERENCES customization_requests(id),
 FOREIGN KEY(template_version_id) REFERENCES customization_templates(id),
 FOREIGN KEY(actor_account_id) REFERENCES identity_accounts(id),
 CHECK(object_version>0),
 CHECK((request_id IS NOT NULL AND template_version_id IS NULL) OR (request_id IS NULL AND template_version_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
