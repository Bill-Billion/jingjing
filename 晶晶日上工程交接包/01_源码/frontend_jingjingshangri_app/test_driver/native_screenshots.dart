import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() async {
  final directory = Directory(Platform.environment['JX_IOS_EVIDENCE_DIR'] ??
      'build/native-integration-screenshots');
  await directory.create(recursive: true);
  await integrationDriver(onScreenshot: (name, bytes, [args]) async {
    if (!RegExp(r'^ios-[a-z0-9-]+$').hasMatch(name) ||
        bytes.length < 8 ||
        bytes.take(8).join(',') != '137,80,78,71,13,10,26,10') {
      return false;
    }
    await File('${directory.path}/$name.png').writeAsBytes(bytes);
    return true;
  });
}
