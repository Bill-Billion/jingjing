import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'customization_fixtures.dart';

const attachmentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const nextAttachmentId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
final attachmentBytes = Uint8List.fromList([115, 116, 111, 114, 121]);
Map<String, dynamic> attachment(
        {String id = attachmentId,
        String request = requestId,
        String name = '合成故事.txt',
        String status = 'READY',
        int version = 2,
        Uint8List? bytes}) =>
    {
      'id': id,
      'request_id': request,
      'display_name': name,
      'media_type': 'text/plain',
      'byte_size': (bytes ?? attachmentBytes).length,
      'content_sha256': sha256.convert(bytes ?? attachmentBytes).toString(),
      'current_status': status,
      'object_version': version,
    };
