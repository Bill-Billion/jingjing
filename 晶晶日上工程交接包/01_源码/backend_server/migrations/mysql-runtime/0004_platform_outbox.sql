CREATE TABLE platform_outbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  event_key VARCHAR(191) NOT NULL,
  job_spec JSON NOT NULL,
  intent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('PENDING','DISPATCHED','BLOCKED') NOT NULL DEFAULT 'PENDING',
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  last_error VARCHAR(80) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  dispatched_at DATETIME(6) NULL,
  UNIQUE KEY outbox_event (event_key),
  KEY outbox_pending (status, created_at),
  CONSTRAINT outbox_job FOREIGN KEY (job_id) REFERENCES platform_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
