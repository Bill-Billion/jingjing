import 'dart:io';
import 'dart:typed_data';
import 'package:video_player/video_player.dart';

class PrivateVideo {
  PrivateVideo._(this.controller, this.directory);
  final VideoPlayerController controller;
  final Directory directory;
  static Future<PrivateVideo> create(Uint8List bytes,
      {String mediaType = 'video/mp4'}) async {
    final extension = const {
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav'
    }[mediaType];
    if (extension == null) throw ArgumentError.value(mediaType, 'mediaType');
    final directory =
        await Directory.systemTemp.createTemp('jingjing-private-preview-');
    try {
      final file = File('${directory.path}/preview.$extension');
      await file.writeAsBytes(bytes, flush: true);
      return PrivateVideo._(VideoPlayerController.file(file), directory);
    } catch (_) {
      await directory.delete(recursive: true);
      rethrow;
    }
  }

  Future<void> dispose() async {
    try {
      await controller.dispose();
    } finally {
      if (await directory.exists()) await directory.delete(recursive: true);
    }
  }
}
