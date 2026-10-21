CREATE TABLE artist_avatar_links (
 avatar_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 person_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY person_avatars(person_id,avatar_id),
 FOREIGN KEY(person_id) REFERENCES artist_people(id),
 FOREIGN KEY(avatar_id) REFERENCES supply_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
