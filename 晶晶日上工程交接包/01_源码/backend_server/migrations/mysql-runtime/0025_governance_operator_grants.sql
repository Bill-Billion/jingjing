CREATE TABLE governance_operator_grants (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 action_code ENUM('CREATE_RULE','READ_RULE','RULE_IN_REVIEW','RULE_APPROVED','RULE_EFFECTIVE','RULE_RETIRED','SEAL') NOT NULL,
 enabled BOOLEAN NOT NULL,
 expires_at DATETIME(3) NULL,
 object_version INT UNSIGNED NOT NULL,
 UNIQUE KEY governance_operator_action(account_id,action_code),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 CHECK(object_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
