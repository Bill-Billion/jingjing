ALTER TABLE media_tasks
 ADD COLUMN output_checkpoint_json JSON NULL,
 ADD COLUMN output_checkpoint_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
