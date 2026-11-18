import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_picker/src/platform/file_picker_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/auditions/auditions_pages.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');

class SyntheticPicker extends FilePickerPlatform {
  @override
  Future<FilePickerResult?> pickFiles(
      {String? dialogTitle,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Function(FilePickerStatus)? onFileLoading,
      int compressionQuality = 0,
      bool allowMultiple = false,
      bool withData = false,
      bool withReadStream = false,
      bool lockParentWindow = false,
      bool readSequential = false,
      bool cancelUploadOnWindowBlur = true}) async {
    final bytes =
        Uint8List.fromList(utf8.encode('synthetic test evidence only'));
    return FilePickerResult([
      PlatformFile(
          name: 'synthetic.txt',
          size: bytes.length,
          bytes: bytes,
          readStream: Stream.value(bytes))
    ]);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> extra = const {}]) async {
    final client = HttpClient();
    try {
      final q = await client.postUrl(Uri.parse('$origin/__native/control'));
      q.headers.set('Authorization', 'Bearer $controlToken');
      q.headers.contentType = ContentType.json;
      q.write(jsonEncode({'action': action, ...extra}));
      final r = await q.close();
      final text = await utf8.decoder.bind(r).join();
      expect(r.statusCode, 200, reason: '$action: $text');
      return Map<String, dynamic>.from(jsonDecode(text));
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> reveal(WidgetTester t, Finder f) async {
    if (f.evaluate().isEmpty && find.byType(Scrollable).evaluate().isNotEmpty) {
      t
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await frames(t, 2);
    }
    for (var i = 0; i < 40 && f.evaluate().isEmpty; i++) {
      if (find.byType(Scrollable).evaluate().isNotEmpty) {
        await t.drag(find.byType(Scrollable).first, const Offset(0, -300));
      }
      await frames(t, 2);
    }
    if (f.evaluate().isEmpty) {
      debugPrint(
          'AFTERCARE_LABELS ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().join(' | ')}');
    }
    expect(f, findsWidgets);
    await Scrollable.ensureVisible(t.element(f.first), alignment: .4);
    await frames(t, 2);
  }

  Future<void> tap(WidgetTester t, Finder f) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t, 2);
    await reveal(t, f);
    await t.tap(f.first.hitTestable());
    await frames(t);
  }

  Finder choice(String label) => find.byWidgetPredicate((w) =>
      w is DropdownButtonFormField<String> && w.decoration.labelText == label);
  Finder input(String label) => find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == label);
  Future<void> fill(WidgetTester t, String label, String value) async {
    final f = input(label);
    await reveal(t, f);
    await t.enterText(f, value);
    await frames(t, 2);
  }

  Future<void> submit(WidgetTester t, String name) async {
    await tap(t, find.widgetWithText(FilledButton, name));
    await tap(t, find.text('确认办理'));
    await frames(t, 12);
  }

  testWidgets('试镜拒接恢复和出发后安全争议', (t) async {
    final oldPicker = FilePickerPlatform.instance;
    FilePickerPlatform.instance = SyntheticPicker();
    addTearDown(() => FilePickerPlatform.instance = oldPicker);
    final fixture = await control('setup', {'role': 'seller'}),
        a = fixture['account'];
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 90),
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio),
        me = await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (q, h) {
      if (first && q.method == 'POST' && q.path == '/api/v1/auth/sessions') {
        first = false;
        h.resolve(Response<dynamic>(requestOptions: q, statusCode: 200, data: {
          'data': {
            'access_token': a['bearer_token'],
            'token_type': 'Bearer',
            'account': me
          }
        }));
      } else {
        h.next(q);
      }
    }));
    final session = AccountSession(api: api);
    await session.login('synthetic', 'synthetic', 'synthetic');
    await session.loadParties();
    session.select(
        session.parties.singleWhere((p) => p['party']['id'] == a['party_id']));
    Future<void> mount(String id, String action) async {
      await t.pumpWidget(ChangeNotifierProvider<AccountSession>.value(
          value: session,
          child: MaterialApp(
              key: ValueKey('$id:$action'),
              home: AuditionsPage(mode: 'action', id: id, action: action),
              onGenerateRoute: (settings) {
                final u = Uri.parse(settings.name ?? '');
                return MaterialPageRoute<void>(
                    builder: (_) => AuditionsPage(
                        mode: u.path == '/auditions/action'
                            ? 'action'
                            : 'booking',
                        id: u.queryParameters['bookingId'],
                        action: u.queryParameters['action']));
              })));
      await frames(t, 15);
    }

    final decline = fixture['decline_booking'] as String;
    await mount(decline, 'decision');
    await tap(t, choice('本次接单选择'));
    await tap(t, find.text('明确拒绝，按原单申请退款').last);
    await fill(t, '本次接拒说明', '仅合成测试：无法参加');
    await submit(t, '接受或拒绝本次邀约');
    await reveal(t, find.text('原操作结果待核对'));
    await control('capture', {'name': 'native-decline-pending'});
    await tap(t, find.text('恢复原本单办理请求'));
    await frames(t, 15);
    final declined = await control('verify-decline');
    expect(declined['refund_is_verified'], false);
    final refunded = await control('web-refund');
    expect(refunded['refund_is_verified'], true);
    final safety = fixture['safety_booking'] as String;
    await mount(safety, 'decision');
    await tap(t, choice('本次接单选择'));
    await tap(t, find.text('明确接受本次预约').last);
    await fill(t, '本次接拒说明', '仅合成测试：确认预约');
    await submit(t, '接受或拒绝本次邀约');
    await mount(safety, 'travel');
    await tap(t, choice('真实行程节点'));
    await tap(t, find.text('现在记录实际出发').last);
    await tap(t, find.text('我确认这是真实发生的本次行程节点'));
    await tap(t, find.widgetWithText(FilledButton, '记录真实出发与到场'));
    await reveal(t, find.text('请先上传本次真实行程的私有依据，再记录出发或到场。'));
    await tap(t, find.text('选择并上传文件'));
    await reveal(t, find.text('私有文件已上传，可以引用到这份资料中。'));
    await submit(t, '记录真实出发与到场');
    await mount(safety, 'cancel');
    await fill(t, '具体问题与双方情况', '仅合成测试：现场安全发生变化');
    await tap(t, find.text('本次涉及安全离场或安全问题'));
    await submit(t, '取消、争议或安全离场');
    await tap(t, find.text('为本次争议补交私有依据'));
    await tap(t, find.text('选择并上传文件'));
    await reveal(t, find.text('私有文件已上传，可以引用到这份资料中。'));
    await submit(t, '为本次争议补交私有依据');
    await reveal(t, find.text('原操作结果待核对'));
    await control('capture', {'name': 'native-evidence-pending'});
    await tap(t, find.text('恢复原本单办理请求'));
    await frames(t, 12);
    final disputed = await control('verify-safety');
    expect(disputed['status'], 'DISPUTED');
    await control('complete');
    session.dispose();
  });
}
