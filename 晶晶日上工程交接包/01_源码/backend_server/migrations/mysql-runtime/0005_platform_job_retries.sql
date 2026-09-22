CREATE TABLE platform_job_retries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_ref VARCHAR(191) NOT NULL,
  reason_ref VARCHAR(512) NOT NULL,
  previous_status VARCHAR(16) NOT NULL,
  previous_error VARCHAR(80) NULL,
  attempts_before INT UNSIGNED NOT NULL,
  max_attempts_before INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY retry_job (job_id, created_at),
  CONSTRAINT retry_job FOREIGN KEY (job_id) REFERENCES platform_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
