// Object URLs contain only permission-checked bytes and are revoked on dispose.
// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:typed_data';
import 'package:video_player/video_player.dart';

class PrivateVideo {
  PrivateVideo._(this.controller, this.url);
  final VideoPlayerController controller;
  final String url;
  static Future<PrivateVideo> create(Uint8List bytes,
      {String mediaType = 'video/mp4'}) async {
    if (!['video/mp4', 'audio/mpeg', 'audio/wav'].contains(mediaType)) {
      throw ArgumentError.value(mediaType, 'mediaType');
    }
    final url = html.Url.createObjectUrlFromBlob(html.Blob([bytes], mediaType));
    return PrivateVideo._(
        VideoPlayerController.networkUrl(Uri.parse(url)), url);
  }

  Future<void> dispose() async {
    html.Url.revokeObjectUrl(url);
    await controller.dispose();
  }
}
