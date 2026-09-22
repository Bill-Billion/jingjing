CREATE TABLE platform_jobs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  task_type VARCHAR(80) NOT NULL,
  business_key VARCHAR(191) NOT NULL,
  provider VARCHAR(80) NULL,
  provider_task_id VARCHAR(191) NULL,
  status ENUM('PENDING','RUNNING','RETRY','SUCCEEDED','FAILED','BLOCKED') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL,
  next_run_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_owner VARCHAR(191) NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(6) NULL,
  last_error VARCHAR(80) NULL,
  payload_ref VARCHAR(512) NOT NULL,
  result_ref VARCHAR(512) NULL,
  intent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY job_business (task_type, business_key),
  KEY job_due (status, next_run_at),
  KEY job_expired (status, lease_until),
  CONSTRAINT job_attempts_valid CHECK (max_attempts BETWEEN 1 AND 1000),
  CONSTRAINT job_lease_valid CHECK (
    (status='RUNNING' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status<>'RUNNING' AND lease_owner IS NULL AND lease_token IS NULL AND lease_until IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
