CREATE TABLE cocreation_members (
 room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, person_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, member_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 PRIMARY KEY(room_id,person_id), FOREIGN KEY(room_id) REFERENCES cocreation_records(id),
 FOREIGN KEY(person_id) REFERENCES artist_people(id), FOREIGN KEY(member_id) REFERENCES cocreation_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
