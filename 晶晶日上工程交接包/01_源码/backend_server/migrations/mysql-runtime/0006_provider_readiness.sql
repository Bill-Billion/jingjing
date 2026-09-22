CREATE TABLE platform_provider_readiness (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  provider_kind VARCHAR(40) NOT NULL,
  provider_code VARCHAR(100) NOT NULL,
  capability_code VARCHAR(100) NOT NULL,
  environment ENUM('LOCAL','SANDBOX','PRODUCTION') NOT NULL,
  current_status ENUM('NOT_IMPLEMENTED','IMPLEMENTED','CONFIGURED','SANDBOX_VERIFIED','PRODUCTION_VERIFIED','WAITING_PROVIDER_APPROVAL','DISABLED_BY_PRODUCT') NOT NULL,
  config_revision VARCHAR(128) NOT NULL,
  object_version INT UNSIGNED NOT NULL,
  reason_code VARCHAR(80) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY provider_capability_environment (provider_kind,provider_code,capability_code,environment),
  CONSTRAINT provider_version_positive CHECK (object_version>0),
  CONSTRAINT provider_verified_environment CHECK (
    (current_status<>'SANDBOX_VERIFIED' OR environment='SANDBOX') AND
    (current_status<>'PRODUCTION_VERIFIED' OR environment='PRODUCTION'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
