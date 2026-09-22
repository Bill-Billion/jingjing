CREATE TABLE party_memberships (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 role_code ENUM('OWNER','MEMBER') NOT NULL,
 current_status ENUM('ACTIVE','SUSPENDED','REVOKED') NOT NULL,
 consent_invitation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 object_version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY party_account(party_id,account_id),
 INDEX account_memberships(account_id,current_status),
 FOREIGN KEY(party_id) REFERENCES parties(id),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(consent_invitation_id) REFERENCES party_invitations(id),
 CONSTRAINT membership_consent CHECK((role_code='OWNER' AND consent_invitation_id IS NULL) OR (role_code='MEMBER' AND consent_invitation_id IS NOT NULL)),
 CONSTRAINT membership_version CHECK(object_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
