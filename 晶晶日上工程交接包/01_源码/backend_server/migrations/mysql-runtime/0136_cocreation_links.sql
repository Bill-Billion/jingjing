CREATE TABLE cocreation_rooms (
 room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE, project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 FOREIGN KEY (room_id) REFERENCES cocreation_records(id),
 FOREIGN KEY (request_id) REFERENCES customization_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin
