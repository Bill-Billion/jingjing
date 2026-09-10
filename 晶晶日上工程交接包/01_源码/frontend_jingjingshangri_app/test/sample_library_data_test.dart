// A8（第41轮）：锁定选剧库样片数据契约
// 1) MockData.sampleLibrary() 与后端 /api/samples/library 同构（genres + 按题材分组的 library）；
// 2) 黄帝史诗挂真实样片、七宗罪·人性局作为能力演示落在悬疑推理；无成片的自有 IP 视频槽必须为空（不臆造）；
// 3) demo/断网回退 getSampleLibrary 必须返回页面真正读取的 'library' 键（修复历史 'list' 错配导致离线全空）。
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jingjingshangri_app/services/api_service.dart';
import 'package:jingjingshangri_app/services/app_mode.dart';
import 'package:jingjingshangri_app/services/mock_data.dart';

void main() {
  group('MockData.sampleLibrary 数据契约', () {
    final data = MockData.sampleLibrary();

    test('genres 为固定 7 题材且顺序稳定', () {
      expect(data['genres'], [
        '古装逆袭', '都市甜宠', '悬疑推理', '家庭伦理', '青春校园', '职场商战', '军旅谍战',
      ]);
      expect(data['isDemo'], isTrue);
    });

    test('library 按题材分组且字段类型正确', () {
      final lib = data['library'] as Map;
      expect(lib.containsKey('古装逆袭'), isTrue);
      expect(lib.containsKey('悬疑推理'), isTrue);
      for (final entry in lib.entries) {
        final rows = entry.value as List;
        for (final raw in rows) {
          final m = raw as Map;
          expect(m['title'], isNotEmpty);
          expect(m['characters'], isA<List>());
          expect(m['tags'], isA<List>());
          expect(m['market_data'], isA<Map>());
          expect(m['status'], 'active');
        }
      }
    });

    test('黄帝史诗·天下合挂真实样片（古装逆袭）', () {
      final row = (data['library']['古装逆袭'] as List).first as Map;
      expect(row['title'], '黄帝史诗·天下合');
      expect(row['video_url'], '/uploads/samples/huangdi_ttx.mp4');
      expect(row['cover_url'], '/uploads/samples/huangdi_ttx_cover.jpg');
    });

    test('七宗罪·人性局落在悬疑推理并带样片', () {
      final row = (data['library']['悬疑推理'] as List).first as Map;
      expect(row['title'], '七宗罪·人性局');
      expect(row['video_url'], '/uploads/samples/renxingju_7sins.mp4');
      expect(row['cover_url'], '/uploads/samples/renxingju_7sins_cover.jpg');
    });

    test('暂无成片的自有 IP 视频槽留空，不臆造', () {
      final longwu = (data['library']['青春校园'] as List).first as Map;
      final border = (data['library']['军旅谍战'] as List).first as Map;
      expect(longwu['title'], '少年龙武');
      expect(longwu['video_url'], '');
      expect(border['title'], '边境暗影');
      expect(border['video_url'], '');
    });
  });

  group('getSampleLibrary demo 回退', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({'connMode': 'demo'});
      await AppMode.instance.load();
      await ApiService().init();
    });
    tearDown(() async {
      await AppMode.instance.setMode(ConnMode.demo);
    });

    test('demo 模式返回页面读取的 library 键且含样片', () async {
      final res = await ApiService().getSampleLibrary();
      expect(res.containsKey('library'), isTrue, reason: '历史回退误用 list 键导致离线全空');
      final lib = res['library'] as Map;
      final hd = (lib['古装逆袭'] as List).first as Map;
      expect(hd['video_url'], '/uploads/samples/huangdi_ttx.mp4');
      final rx = (lib['悬疑推理'] as List).first as Map;
      expect(rx['video_url'], '/uploads/samples/renxingju_7sins.mp4');
    });
  });
}
