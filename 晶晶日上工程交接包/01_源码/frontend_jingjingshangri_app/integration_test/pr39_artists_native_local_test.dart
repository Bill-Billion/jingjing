import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/app.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/services/user_provider.dart';
import 'package:jingjingshangri_app/artists/artists_files.dart';

const origin = String.fromEnvironment('NATIVE_ORIGIN');
const controlToken = String.fromEnvironment('NATIVE_CONTROL');
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  Map<String, dynamic> data = {};
  AccountSession? session;
  NavigatorState? navigator;
  Future<Map<String, dynamic>> control(String action,
      [Map<String, dynamic> args = const {}]) async {
    debugPrint(
        'NATIVE_ARTISTS_STEP $action ${args['scenario'] ?? args['name'] ?? args['decision'] ?? ''}');
    final client = HttpClient();
    try {
      final r = await client.postUrl(Uri.parse('$origin/__native/control'));
      r.headers.set('Authorization', 'Bearer $controlToken');
      r.headers.contentType = ContentType.json;
      r.write(jsonEncode({'action': action, ...args}));
      final response = await r.close();
      final j = jsonDecode(await utf8.decoder.bind(response).join())
          as Map<String, dynamic>;
      expect(response.statusCode, 200, reason: '$action: $j');
      return j;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> frames(WidgetTester t, [int n = 5]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> wait(WidgetTester t, Finder f) async {
    for (var i = 0; i < 180 && f.evaluate().isEmpty; i++) {
      await frames(t, 1);
    }
    if (f.evaluate().isEmpty) {
      debugPrint('MISSING $f');
      debugPrint(find
          .byType(Text)
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .whereType<String>()
          .join(' | '));
    }
    expect(f, findsWidgets);
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
      if (find.byType(Scrollable).evaluate().isNotEmpty)
        await t.drag(find.byType(Scrollable).first, const Offset(0, -400));
      await frames(t, 2);
    }
    await wait(t, f);
    await t.ensureVisible(f.first);
    await frames(t, 2);
  }

  Future<void> press(WidgetTester t, Finder f) async {
    await reveal(t, f);
    await t.tap(f.first);
    await frames(t);
  }

  Future<void> shot(WidgetTester t, String name) async {
    await frames(t);
    await control('capture', {'name': name});
  }

  Future<void> boot(WidgetTester t, String scenario,
      [String role = 'artist']) async {
    if (session != null) await session!.logout();
    runApp(const SizedBox.shrink());
    await frames(t);
    data = await control('setup',
        {'scenario': scenario, 'role': role, 'fresh': role == 'artist'});
    final a = data['account'];
    final legacy = UserProvider();
    await legacy.logout();
    final dio = Dio(BaseOptions(
        baseUrl: origin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        followRedirects: false,
        validateStatus: (_) => true));
    final api = AccountApi(dio: dio);
    final account =
        await api.request('GET', '/api/v1/me', token: a['bearer_token']);
    expect(account['id'], a['account_id']);
    var first = true;
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      debugPrint('NATIVE_HTTP ${o.method} ${o.uri.path}');
      if (first &&
          o.method == 'POST' &&
          o.path.endsWith('/api/v1/auth/sessions')) {
        first = false;
        h.resolve(Response<dynamic>(requestOptions: o, statusCode: 200, data: {
          'data': {
            'access_token': a['bearer_token'],
            'token_type': 'Bearer',
            'account': account
          }
        }));
      } else {
        h.next(o);
      }
    }, onResponse: (r, h) {
      debugPrint(
          'NATIVE_HTTP_RESULT ${r.statusCode} ${r.requestOptions.uri.path}');
      h.next(r);
    }));
    session = AccountSession(api: api);
    await session!
        .login('local-synthetic-$role', 'local-bootstrap', 'local-only');
    await session!.loadParties();
    session!.select(
        session!.parties.singleWhere((r) => r['party']['id'] == a['party_id']));
    runApp(MultiProvider(
        providers: [
          ChangeNotifierProvider<UserProvider>.value(value: legacy),
          ChangeNotifierProvider<AccountSession>.value(value: session!)
        ],
        child: const Directionality(
            textDirection: TextDirection.ltr,
            child: Banner(
                message: '本机模拟测试',
                location: BannerLocation.topEnd,
                child: JingjingShangriApp()))));
    await wait(t, find.byType(NavigationBar));
    navigator = Navigator.of(t.element(find.byType(NavigationBar)));
    await frames(t, 8);
  }

  Future<void> open(WidgetTester t, String route) async {
    debugPrint('NATIVE_ROUTE $route');
    final nav = navigator!;
    nav.popUntil((r) => r.isFirst);
    await frames(t);
    nav.pushNamed(route);
    await frames(t, 12);
    for (var i = 0;
        i < 150 && find.byType(LinearProgressIndicator).evaluate().isNotEmpty;
        i++) {
      await frames(t, 1);
    }
  }

  String form(String mode, {String? record, String? person}) =>
      '/artists/form?mode=$mode&personId=${person ?? data['person_id']}${person == null || person == data['person_id'] ? '&avatarId=${data['avatar_id']}' : ''}${record == null ? '' : '&recordId=$record'}';
  String record(String id) =>
      '/artists/record?personId=${data['person_id']}&recordId=$id';
  Future<void> select(WidgetTester t, String label, String option) async {
    final f = find.byWidgetPredicate((w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == label);
    await reveal(t, f);
    for (var i = 0;
        i < 150 &&
            t.widget<DropdownButtonFormField<String>>(f).onChanged == null;
        i++) {
      await frames(t, 1);
    }
    expect(t.widget<DropdownButtonFormField<String>>(f).onChanged, isNotNull);
    await press(t, f);
    await wait(t, find.text(option));
    await press(t, find.text(option).last);
  }

  Future<void> field(WidgetTester t, String key, String text) async {
    final f = find.byKey(ValueKey('artist-field-$key'));
    await reveal(t, f);
    await t.enterText(f.first, text);
    FocusManager.instance.primaryFocus?.unfocus();
    await frames(t);
  }

  Future<void> submit(WidgetTester t) async {
    await press(t, find.byKey(const ValueKey('artist-submit')));
    await press(t, find.text('确认办理'));
    await frames(t, 10);
  }

  int picker = 0;
  Future<void> upload(WidgetTester t, String category) async {
    final owner = category == 'evidence'
        ? find.byWidgetPredicate(
            (w) => w is ArtistFiles && w.key == null && w.onChanged != null)
        : find.byKey(ValueKey(category));
    await reveal(t, owner);
    final before = t.widget<ArtistFiles>(owner.first).ids.length;
    final button = find.descendant(
        of: owner.first,
        matching: find.byKey(const ValueKey('artist-upload-REVIEW_EVIDENCE')));
    await reveal(t, button);
    final name = 'upload-${picker++}';
    await control('pick', {'name': name});
    await t.tap(button.first);
    await frames(t);
    for (var i = 0;
        i < 180 && t.widget<ArtistFiles>(owner.first).ids.length == before;
        i++) {
      await frames(t, 1);
    }
    expect(t.widget<ArtistFiles>(owner.first).ids.length, before + 1,
        reason: 'Native picker/upload $category');
  }

  Future<void> classified(WidgetTester t, {bool supplement = false}) async {
    for (final k in [
      'model_card_asset_id',
      'lifestyle_asset_ids',
      'full_body_asset_ids'
    ]) {
      await upload(t, k);
    }
    await field(t, 'personal_introduction',
        supplement ? '原生补件后的合成简介' : '原生系统选择器提交的合成简介');
    await field(t, 'resume', '合成履历，只测试字段与权限，不是真人资历');
  }

  testWidgets('Android认证免费服务同申请多角色闭环与异常边界', (t) async {
    expect(Platform.isAndroid, true);
    expect(Uri.parse(origin).host, '127.0.0.1');
    if (!const bool.fromEnvironment('NATIVE_RESUME_NEGATIVES')) {
      await boot(t, 'APPROVE');
      // A real first free request commits; the local proxy drops only its response.
      await open(t, form('SERVICE'));
      await select(t, '选择当前已审服务商品', '首次创建服务 · 永久免费');
      await control('drop-free');
      await submit(t);
      await reveal(t, find.text('恢复原艺人操作'));
      await shot(t, 'android-free-unknown');
      await press(t, find.text('恢复原艺人操作'));
      await press(t, find.text('确认办理'));
      await wait(t, find.text('创建与托管'));
      await reveal(t, find.text('等待人工交付基础形象与声音档案。'));
      data = {...data, ...await control('check-free')};
      await shot(t, 'android-free-recovered');
      data = {...data, ...await control('deliver')};
      await open(t, record(data['creation_id']));
      await reveal(t, find.text('私人档案交付'));
      await shot(t, 'android-free-delivered');
      await open(t, form('SERVICE'));
      await select(t, '选择当前已审服务商品', '数字人托管 · 永久免费');
      await submit(t);
      await wait(t, find.text('创建与托管'));
      await reveal(t, find.text('永久免费，无需续费。仅登记托管权益，云服务尚未启用。'));
      expect(find.text('查看服务原订单'), findsNothing);
      await shot(t, 'android-perpetual-hosting');
      for (final scenario in ['APPROVE', 'REJECT', 'WITHDRAW']) {
        if (scenario != 'APPROVE') await boot(t, scenario);
        await open(t, form('HALO'));
        await select(t, '申请认证等级', 'L2认证审核');
        // The exact paid service is selected from server-owned records.
        final sf = find.byWidgetPredicate((w) =>
            w is DropdownButtonFormField<String> &&
            w.decoration.labelText == '沿用同一笔L2审核服务');
        await press(t, sf);
        await press(t, find.textContaining('审核服务 ').last);
        await classified(t);
        await press(t, find.text('本人确认所交形象、声音与证据的权属，并接受人工审核'));
        await upload(t, 'evidence');
        await submit(t);
        await wait(t, find.text('认证申请'));
        data = {...data, ...await control('submitted')};
        await shot(t, 'android-${scenario.toLowerCase()}-submitted');
        if (scenario == 'APPROVE') {
          await control('review', {'decision': 'NEEDS_MATERIAL'});
          await open(t, record(data['application_id']));
          await press(t, find.text('补齐这次申请的材料'));
          await press(t, find.text('替换分类资料，保留原版本'));
          await classified(t, supplement: true);
          await field(t, 'reason', '沿用原10元服务，替换分类资料，保留先前版本');
          await upload(t, 'evidence');
          await submit(t);
          await wait(t, find.text('认证申请'));
          await control('supplemented');
          await control('review', {'decision': 'APPROVE'});
        } else if (scenario == 'REJECT') {
          await control('review', {'decision': 'REJECT'});
        } else {
          await open(t, record(data['application_id']));
          await press(t, find.text('撤回这份认证申请'));
          await field(t, 'reason', '本人撤回本份申请，保留原审核费和原材料');
          await submit(t);
          await wait(t, find.text('认证申请'));
        }
        await open(t, record(data['application_id']));
        await reveal(
            t,
            find.text({
              'APPROVE': '审核通过',
              'REJECT': '未通过',
              'WITHDRAW': '已撤回'
            }[scenario]!));
        await shot(t, 'android-${scenario.toLowerCase()}-result');
        await open(t, record(data['service_id']));
        await press(t, find.text('查看服务原订单'));
        await wait(t, find.text('订单详情'));
        await shot(t, 'android-${scenario.toLowerCase()}-original-order');
        await control('complete-application');
      }
    } else {
      data = await control('state');
    }
    final ownPerson = data['person_id'] as String,
        ownApplication = data['application_id'] as String;
    await boot(t, 'WITHDRAW', 'agency');
    await open(t, form('HALO', person: ownPerson));
    await wait(t, find.text('当前无法读取'));
    expect(find.byKey(const ValueKey('artist-submit')), findsNothing);
    await shot(t, 'android-agency-no-self-certification');
    await control('checked-negative',
        {'name': '机构受托身份不能读取本人认证服务或代本人认证', 'role': 'agency'});
    await boot(t, 'WITHDRAW', 'agency');
    await open(t, form('SERVICE', person: ownPerson));
    await reveal(t, find.byKey(const ValueKey('artist-submit')));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    await shot(t, 'android-agency-no-free-service');
    await control(
        'checked-negative', {'name': '机构不能代本人申请免费创建或托管', 'role': 'agency'});
    await boot(t, 'WITHDRAW', 'minor');
    await open(t, form('HALO', person: data['minor_person_id']));
    await reveal(t, find.byKey(const ValueKey('artist-submit')));
    expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('artist-submit')))
            .onPressed,
        isNull);
    expect(find.textContaining('当前本人核验、办事身份、委托范围或记录状态不满足这一步。'), findsOneWidget);
    await shot(t, 'android-minor-blocked');
    await control('checked-negative',
        {'name': '未成年人本人认证入口保持关闭，使用自己的真人编号且未附成人数字人编号', 'role': 'minor'});
    await boot(t, 'WITHDRAW', 'outsider');
    await open(
        t, '/artists/record?personId=$ownPerson&recordId=$ownApplication');
    await wait(t, find.text('当前无法读取'));
    expect(find.text('原生系统选择器提交的合成简介'), findsNothing);
    expect(find.text('本人撤回本份申请，保留原审核费和原材料'), findsNothing);
    expect(find.text('查看服务原订单'), findsNothing);
    await shot(t, 'android-outsider-no-private-material');
    await control('checked-negative',
        {'name': '切换陌生账号，权限页不展示原本人申请、私有简介或原订单', 'role': 'outsider'});
    await control('finish');
    expect(t.takeException(), isNull);
  });
}
