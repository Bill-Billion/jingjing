-- Contract 20261029: separately reviewed development/publication facts and royalty statements.
ALTER TABLE license_records MODIFY COLUMN kind ENUM('PRODUCT','RESERVATION','EVIDENCE','GRANT','PROJECT','BINDING','READING','PROCUREMENT_EVENT','ROYALTY_STATEMENT') NOT NULL;
