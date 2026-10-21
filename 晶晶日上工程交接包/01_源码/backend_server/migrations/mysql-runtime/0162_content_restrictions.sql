CREATE TABLE content_restrictions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 target_kind ENUM('ASSET','ARTIST_LISTING','STOCK_LISTING','NOTICE','PRODUCTION_VERSION') NOT NULL,
 target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 execution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 released_by_execution CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 current_status ENUM('ACTIVE','RELEASED') NOT NULL DEFAULT 'ACTIVE',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(execution_id) REFERENCES privacy_executions(id),
 INDEX content_restriction_target(target_kind,target_id,current_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
