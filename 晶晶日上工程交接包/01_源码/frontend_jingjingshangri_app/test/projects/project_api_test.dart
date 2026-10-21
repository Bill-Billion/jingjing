import 'dart:async';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/projects/project_api.dart';
import 'package:jingjingshangri_app/projects/project_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'project_fixtures.dart';

void main() {
  test('实际八类DTO与公开摘要解析，记录hash不依赖额外动作或日期字段', () {
    for (final k in projectKinds) {
      expect(ProjectRecord.parse(projectData(k)).kind, k);
    }
    expect(ProjectCatalogue.parse(projectCatalogueData()).items.length, 2);
  });
  test('拒绝摘要缺报名版本、记录内容损坏、浮点版本、假剩余名额', () {
    final c = projectCatalogueData();
    c['items'][0]['roles'][0].remove('object_version');
    expect(() => ProjectCatalogue.parse(c), throwsA(isA<AccountError>()));
    for (final key in ['content_sha256', 'object_version', 'remaining_slots']) {
      final d = projectData('PLAN');
      d[key] = key == 'object_version' ? 2.0 : 'fake';
      expect(() => ProjectRecord.parse(d), throwsA(isA<AccountError>()));
    }
  });
  test('报价0元需显式输入且金额精确，不接受浮点文本/科学计数/超界', () {
    expect(projectParseYuan('0'), 0);
    expect(projectParseYuan('100.01'), 10001);
    expect(projectParseYuan('9000000000.00'), 900000000000);
    for (final v in ['', '1.005', '1e2', '-1', '9000000000.01']) {
      expect(projectParseYuan(v), null);
    }
  });
  test('本人同意须审核有效且覆盖项目公开用途地域完整期间，私人不替代', () {
    final c = projectSupply('CONSENT'), s = projectScopeData();
    expect(projectConsentEligible(c, avatarKey, s), true);
    for (final key in ['purposes', 'territories', 'valid_until']) {
      final d = projectSupply('CONSENT');
      d['data']['consent'][key] = key == 'purposes'
          ? ['PRIVATE']
          : key == 'territories'
              ? ['US']
              : '2027-01-01T00:00:00.000Z';
      expect(projectConsentEligible(d, avatarKey, s), false);
    }
    final d = projectSupply('CONSENT');
    d['current_status'] = 'WITHDRAWN';
    expect(projectConsentEligible(d, avatarKey, s), false);
    expect(projectConsentEligible(c, consentKey, s), false);
  });
  test('公开目录无需actingParty，角色报名直接用公开版本与本人Bearer', () async {
    final a = projectsAdapter(),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    final c = await api.catalogue();
    expect(a.requests.last.headers.containsKey('X-Acting-Party'), false);
    await api.apply(projectMap(c.items.first['roles'][0]), {
      'avatar_id': avatarKey,
      'consent_id': consentKey,
      'amount_minor': 10001,
      'note': '按此角色报名'
    });
    final r = a.requests.last;
    expect(r.headers['If-Match'], '"3"');
    expect(r.headers['X-Acting-Party'], personId);
    expect(r.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(r.headers['Idempotency-Key'], isNotEmpty);
    expect(a.requests.any((r) => r.path == '/api/v1/projects/records/$roleKey'),
        false);
  });
  test('成员不能写或读私有项目，公开目录仍可读取', () async {
    final a = projectsAdapter(), s = await buyerSession(a);
    s.select(identity(orgId, owner: false));
    final api = ProjectsApi(s);
    await api.catalogue();
    expect(() => api.record(projectKey), throwsA(isA<AccountError>()));
  });
  test('确认顺序准确hash、不把其他版本的前置同意用于本版', () {
    final r = projectData('PLAN');
    r['data']['confirmers'] = [
      {'party_id': orgId, 'responsibility': '前置权利方', 'after_party_ids': []},
      {
        'party_id': personId,
        'responsibility': '本人确认',
        'after_party_ids': [orgId]
      }
    ];
    r['content_sha256'] = projectDigest(r['data']);
    final v = ProjectRecord.parse(r),
        p = ProjectRecord.parse(projectData('PROJECT'));
    expect(projectCanConfirm(v, p, personId, []), false);
    final c = {
      'party_id': orgId,
      'decision': 'APPROVED',
      'content_sha256': 'f' * 64
    };
    expect(projectCanConfirm(v, p, personId, [c]), false);
    c['content_sha256'] = v.hash;
    expect(projectCanConfirm(v, p, personId, [c]), true);
  });
  test('确认POST原记录未升版，必须GET confirmations证明本人决定', () async {
    final a = projectsAdapter(),
        s = await buyerSession(a),
        api = ProjectsApi(s),
        r = ProjectRecord.parse(projectData('PLAN'));
    final result = await api.confirm(
        r,
        ProjectRecord.parse(projectData('PROJECT')),
        [],
        'APPROVED',
        '同意本版全部约定。');
    expect(result.version, r.version);
    expect(a.requests.last.method, 'GET');
    expect(a.requests.last.path, confirmPath);
    final w = a.requests
        .firstWhere((r) => r.path == confirmPath && r.method == 'POST');
    expect(w.data['content_sha256'], r.hash);
    expect(s.projectsPending, isEmpty);
  });
  test('确认已提交但证据GET断流保留key与resultId，恢复核对原准确决定', () async {
    var reads = 0;
    final a = projectsAdapter(
        override: (r) =>
            r.path == confirmPath && r.method == 'GET' && ++reads == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null);
    final s = await buyerSession(a),
        api = ProjectsApi(s),
        p = ProjectRecord.parse(projectData('PROJECT')),
        r = ProjectRecord.parse(projectData('PLAN'));
    await expectLater(
        api.confirm(r, p, [], 'APPROVED', '原决定'), throwsA(isA<AccountError>()));
    expect(s.projectsPending.single['resultId'], planKey);
    final original = a.requests
        .firstWhere((r) => r.path == confirmPath && r.method == 'POST');
    await api.retry(confirmPath);
    final retry = a.requests
        .where((r) => r.path == confirmPath && r.method == 'POST')
        .last;
    expect(
        retry.headers['Idempotency-Key'], original.headers['Idempotency-Key']);
    expect(retry.data, original.data);
    expect(retry.headers['If-Match'], original.headers['If-Match']);
    expect(s.projectsPending, isEmpty);
  });
  test('POST仅APPROVED无本人确认也保持未知，不伪报本人成功', () async {
    final a = projectsAdapter(
            override: (r) => r.path == confirmPath && r.method == 'POST'
                ? envelope(projectData('PLAN'))
                : null),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    await expectLater(
        api.confirm(ProjectRecord.parse(projectData('PLAN')),
            ProjectRecord.parse(projectData('PROJECT')), [], 'APPROVED', '同意'),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONFIRMATION_RESULT_UNKNOWN')));
    expect(s.projectsPending, hasLength(1));
  });
  test('报名503恢复先读取角色及候选，重试原key/body/version', () async {
    var count = 0;
    final a = projectsAdapter(
            override: (r) => r.path.endsWith('/applications') && ++count == 1
                ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                    status: 503, error: true)
                : null),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    final role = projectMap(projectCatalogueData()['items'][0]['roles'][0]);
    await expectLater(
        api.apply(role, {
          'avatar_id': avatarKey,
          'consent_id': consentKey,
          'amount_minor': 0,
          'note': '明确零元约定'
        }),
        throwsA(isA<AccountError>()));
    final original = a.requests.last;
    await api.retry('/api/v1/projects/roles/$roleKey/applications');
    expect(a.requests.last.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(a.requests.last.data, original.data);
    expect(a.requests.where((r) => r.queryParameters['kind'] == 'CANDIDATE'),
        isNotEmpty);
  });
  test('412清原请求，重新读取后新确认使用新版本并需新决定', () async {
    var writes = 0;
    final a = projectsAdapter(
            override: (r) =>
                r.path == confirmPath && r.method == 'POST' && ++writes == 1
                    ? envelope({'code': 'VERSION_CONFLICT'},
                        status: 412, error: true)
                    : null),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    await expectLater(
        api.confirm(ProjectRecord.parse(projectData('PLAN')),
            ProjectRecord.parse(projectData('PROJECT')), [], 'APPROVED', '旧决定'),
        throwsA(isA<AccountError>()));
    expect(s.projectsPending, isEmpty);
    await api.confirm(
        ProjectRecord.parse(projectData('PLAN', version: 3)),
        ProjectRecord.parse(projectData('PROJECT')),
        [],
        'APPROVED',
        '重新阅读的新决定');
    final r = a.requests
        .lastWhere((r) => r.path == confirmPath && r.method == 'POST');
    expect(r.headers['If-Match'], '"3"');
    expect(r.data['reason'], '重新阅读的新决定');
  });
  test('身份切换丢弃迟到项目响应并清未知私有操作', () async {
    final wait = Completer<ResponseBody>();
    late FakeAccountAdapter a;
    a = FakeAccountAdapter(
        handler: (r) => r.path == '/api/v1/projects/records/$projectKey'
            ? wait.future
            : a.defaultReply(r));
    final s = await buyerSession(a),
        api = ProjectsApi(s),
        f = api.record(projectKey);
    await Future<void>.delayed(Duration.zero);
    s.select(identity(orgId));
    wait.complete(envelope(projectData('PROJECT')));
    await expectLater(
        f,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    expect(s.projectsPending, isEmpty);
  });
  test('403私有读取清作用域，不能返回模拟项目', () async {
    final a = projectsAdapter(
            override: (r) => r.path.endsWith(projectKey)
                ? envelope({'code': 'PROJECT_PARTY_FORBIDDEN'},
                    status: 403, error: true)
                : null),
        s = await buyerSession(a),
        epoch = s.epoch;
    await expectLater(
        ProjectsApi(s).record(projectKey), throwsA(isA<AccountError>()));
    expect(s.projectsAccessDenied, true);
    expect(s.epoch, greaterThan(epoch));
    expect(s.projectsPending, isEmpty);
  });
  test('空分页仍有next_cursor继续加载，权限过滤不虚报总数', () async {
    var reads = 0;
    final a = projectsAdapter(
            override: (r) => r.path.endsWith('/records') &&
                    r.queryParameters['kind'] == 'PLAN'
                ? envelope(++reads == 1
                    ? {'items': [], 'next_cursor': planKey}
                    : {
                        'items': [projectData('PLAN')],
                        'next_cursor': null
                      })
                : null),
        s = await buyerSession(a);
    expect(await ProjectsApi(s).all(projectKey, 'PLAN'), hasLength(1));
    expect(reads, 2);
  });

  test('报名未commit的503恢复只核对公开摘要，不越权读取私有ROLE', () async {
    var writes = 0;
    final a = projectsAdapter(
            override: (r) => r.path == '/api/v1/projects/records/$roleKey'
                ? envelope({'code': 'PROJECT_NOT_FOUND'},
                    status: 404, error: true)
                : r.path.endsWith('/applications') && ++writes == 1
                    ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                        status: 503, error: true)
                    : r.path == '/api/v1/projects/projects'
                        ? envelope({'items': [], 'next_cursor': null})
                        : null),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    await expectLater(
        api.apply(projectMap(projectCatalogueData()['items'][0]['roles'][0]), {
          'avatar_id': avatarKey,
          'consent_id': consentKey,
          'amount_minor': 10001,
          'note': '原报名'
        }),
        throwsA(isA<AccountError>()));
    await api.retry('/api/v1/projects/roles/$roleKey/applications');
    expect(s.projectsPending, isEmpty);
    expect(s.projectsAccessDenied, false);
    expect(a.requests.any((r) => r.path == '/api/v1/projects/records/$roleKey'),
        false);
  });
  test('真实Supply记录没有hash字段，资料与同意选项依实际DTO读取', () async {
    final a = projectsAdapter(),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    expect((await api.supplyChoices('AVATAR')).single['data']['display_name'],
        '本人的登记资料');
    expect((await api.supplyChoices('CONSENT')).single['current_status'],
        'APPROVED');
    expect(a.requests.last.headers['X-Acting-Party'], personId);
  });
  test('成功写入仍须属于原角色，错误关联响应保留原请求结果未知', () async {
    final a = projectsAdapter(override: (r) {
          if (!r.path.endsWith('/applications')) return null;
          final d = projectData('CANDIDATE', status: 'APPLIED');
          d['data']['role_id'] = avatarKey;
          d['content_sha256'] = projectDigest(d['data']);
          return envelope(d);
        }),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    await expectLater(
        api.apply(projectMap(projectCatalogueData()['items'][0]['roles'][0]), {
          'avatar_id': avatarKey,
          'consent_id': consentKey,
          'amount_minor': 10001,
          'note': '当前角色报名'
        }),
        throwsA(isA<AccountError>().having((e) => e.uncertain, '结果未知', true)));
    expect(s.projectsPending.single['body']['note'], '当前角色报名');
    expect(s.projectsPending.single['resultId'], candidateKey);
  });
  test('附件按当前身份受控读取并核对服务器元数据，损坏内容不可下载', () async {
    final content = [65, 66, 67];
    var corrupt = false;
    final a = projectsAdapter(override: (r) {
          if (r.path == '/api/v1/supply/assets/$assetKey') {
            return envelope({
              'id': assetKey,
              'owner_party_id': personId,
              'purpose': 'RIGHTS_EVIDENCE',
              'media_type': 'text/plain',
              'byte_size': content.length,
              'content_sha256': sha256.convert(content).toString(),
              'current_status': 'READY'
            });
          }
          if (r.path.endsWith('/evidence/$assetKey')) {
            return ResponseBody.fromBytes(corrupt ? [65, 66, 68] : content, 200,
                headers: {
                  Headers.contentTypeHeader: ['application/octet-stream']
                });
          }
          return null;
        }),
        s = await buyerSession(a),
        api = ProjectsApi(s);
    final r = ProjectRecord.parse(projectData('PLAN'));
    expect(await api.evidence(r, assetKey), content);
    expect(a.requests.last.headers['X-Acting-Party'], personId);
    expect(a.requests.last.headers['Authorization'], startsWith('Bearer '));
    corrupt = true;
    await expectLater(
        api.evidence(r, assetKey),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
  });
}
