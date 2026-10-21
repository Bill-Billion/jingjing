CREATE TABLE ops_comments (
id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, domain VARCHAR(20) NOT NULL, record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
author_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, party_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, reply_to CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
body TEXT NOT NULL, current_status ENUM('VISIBLE','WITHDRAWN','HIDDEN') NOT NULL DEFAULT 'VISIBLE',
object_version INT UNSIGNED NOT NULL DEFAULT 1,
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
KEY ops_comment_object(domain,record_id,id), FOREIGN KEY(author_account_id) REFERENCES identity_accounts(id),
FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(reply_to) REFERENCES ops_comments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
