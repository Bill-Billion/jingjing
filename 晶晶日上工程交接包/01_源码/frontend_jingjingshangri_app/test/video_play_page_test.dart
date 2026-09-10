import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/pages/video_lib/video_play_page.dart';

void main() {
  group('formatVideoPosition 视频时间格式化', () {
    test('零与个位数秒补零', () {
      expect(formatVideoPosition(Duration.zero), '0:00');
      expect(formatVideoPosition(const Duration(seconds: 5)), '0:05');
    });

    test('分钟:秒', () {
      expect(formatVideoPosition(const Duration(seconds: 65)), '1:05');
      expect(formatVideoPosition(const Duration(minutes: 12, seconds: 34)), '12:34');
    });

    test('超过一小时用 h:mm:ss', () {
      expect(formatVideoPosition(const Duration(hours: 1, minutes: 2, seconds: 5)),
          '1:02:05');
    });

    test('负时长回落到 0:00，不出负号', () {
      expect(formatVideoPosition(const Duration(seconds: -9)), '0:00');
    });
  });
}
