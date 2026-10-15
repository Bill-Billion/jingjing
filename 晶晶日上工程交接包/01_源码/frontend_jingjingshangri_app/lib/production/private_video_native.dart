import 'dart:io';
import 'dart:typed_data';
import 'package:video_player/video_player.dart';

class PrivateVideo {
  PrivateVideo._(this.controller, this.directory);
  final VideoPlayerController controller;
  final Directory directory;
  static Future<PrivateVideo> create(Uint8List bytes) async {
    final directory =
        await Directory.systemTemp.createTemp('jingjing-private-preview-');
    try {
      final file = File('${directory.path}/preview.mp4');
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
