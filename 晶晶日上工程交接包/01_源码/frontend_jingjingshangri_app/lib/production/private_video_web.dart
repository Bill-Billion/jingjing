// Object URLs contain only permission-checked bytes and are revoked on dispose.
// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:typed_data';
import 'package:video_player/video_player.dart';

class PrivateVideo {
  PrivateVideo._(this.controller, this.url);
  final VideoPlayerController controller;
  final String url;
  static Future<PrivateVideo> create(Uint8List bytes) async {
    final url =
        html.Url.createObjectUrlFromBlob(html.Blob([bytes], 'video/mp4'));
    return PrivateVideo._(
        VideoPlayerController.networkUrl(Uri.parse(url)), url);
  }

  Future<void> dispose() async {
    html.Url.revokeObjectUrl(url);
    await controller.dispose();
  }
}
