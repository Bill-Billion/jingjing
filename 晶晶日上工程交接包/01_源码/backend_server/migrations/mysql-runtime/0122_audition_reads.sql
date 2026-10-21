CREATE TABLE audition_reads (
 booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(booking_id,account_id,message_id),
 FOREIGN KEY(booking_id) REFERENCES audition_records(id),
 FOREIGN KEY(account_id) REFERENCES identity_accounts(id),
 FOREIGN KEY(message_id) REFERENCES audition_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
