import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/production/production_api.dart';
import 'package:jingjingshangri_app/production/production_models.dart';
import '../account/fake_account_api.dart';
import '../trade/trade_api_test.dart' show buyerSession;
import 'production_fixtures.dart';

const feedbackPath =
    '/api/v1/production/versions/$productionVersionId/feedback';
void main() {
  test('实际PROJECT VERSION FILE FEEDBACK DTO不依赖昵称、时间或动作字段', () {
    for (final kind in ['PROJECT', 'VERSION', 'FILE', 'FEEDBACK']) {
      final r = ProductionRecord.parse(productionData(kind));
      expect(r.kind, kind);
      expect(r.raw.containsKey('created_time'), false);
      expect(r.raw.containsKey('allowed_actions'), false);
    }
    final v = ProductionRecord.parse(productionData('VERSION'));
    expect(
        v.accepted(
            ProductionRecord.parse(productionData('PROJECT', accepted: true))),
        true);
    final p = productionData('PROJECT', accepted: true);
    p['data']['current']['SCRIPT'] = otherVersionId;
    expect(v.accepted(ProductionRecord.parse(p)), false);
  });
  test('拒绝未知状态、额外假时间和错误版本或修改次数', () {
    for (final field in ['object_version', 'current_status', 'created_time']) {
      final r = productionData('VERSION');
      r[field] = field == 'object_version' ? 1.0 : 'fake';
      expect(() => ProductionRecord.parse(r), throwsA(isA<AccountError>()));
    }
    final p = productionData('PROJECT');
    p['data']['change_requests'] = -1;
    expect(() => ProductionRecord.parse(p), throwsA(isA<AccountError>()));
  });
  test('当前已审版本确认携带Bearer身份IfMatch与原幂等请求，四项检查完整', () async {
    final adapter = productionAdapter(stage: 'SAMPLE'),
        s = await buyerSession(adapter),
        api = ProductionApi(s);
    final result = await api.feedback(
        ProductionRecord.parse(productionData('VERSION', stage: 'SAMPLE')),
        ProductionRecord.parse(productionData('PROJECT', stage: 'SAMPLE')),
        'ACCEPT',
        '已核对本版内容。',
        {for (final k in productionCheckNames('SAMPLE')) k: true});
    expect(result.kind, 'FEEDBACK');
    final request = adapter.requests.last;
    expect(request.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(request.headers['X-Acting-Party'], personId);
    expect(request.headers['If-Match'], '"3"');
    expect(request.headers['Idempotency-Key'], isNotEmpty);
    expect(request.data['checklist'], {
      'script_reviewed': true,
      'specification_reviewed': true,
      'audio_reviewed': true,
      'branding_reviewed': true
    });
  });
  test('历史版本、已确认版本、不全检查及修改额度不能生成新意见', () async {
    final adapter = productionAdapter(),
        s = await buyerSession(adapter),
        api = ProductionApi(s);
    final v = ProductionRecord.parse(productionData('VERSION')),
        p = ProductionRecord.parse(productionData('PROJECT'));
    expect(() => api.feedback(v, p, 'ACCEPT', '确认', {}),
        throwsA(isA<AccountError>()));
    expect(
        () => api.feedback(
            v,
            ProductionRecord.parse(productionData('PROJECT', accepted: true)),
            'ACCEPT',
            '确认',
            {'script_reviewed': true}),
        throwsA(isA<AccountError>()));
    final limit = productionData('PROJECT');
    limit['data']['change_requests'] = 2;
    expect(
        () => api.feedback(
            v, ProductionRecord.parse(limit), 'REQUEST_CHANGES', '修改', null),
        throwsA(isA<AccountError>()));
    final old = productionData('PROJECT');
    old['data']['current']['SCRIPT'] = otherVersionId;
    expect(
        () => api.feedback(
            v, ProductionRecord.parse(old), 'REQUEST_CHANGES', '修改', null),
        throwsA(isA<AccountError>()));
    expect(adapter.requests.where((r) => r.path == feedbackPath), isEmpty);
  });
  test('实际成员可读取被指派项目，买方成员不可提交意见', () async {
    final adapter = productionAdapter(), s = await buyerSession(adapter);
    s.select(identity(orgId, owner: false));
    expect((await ProductionApi(s).page()).items.length, 1);
    expect(
        () => ProductionApi(s).feedback(
            ProductionRecord.parse(productionData('VERSION')),
            ProductionRecord.parse(productionData('PROJECT')),
            'REQUEST_CHANGES',
            '修改',
            null),
        throwsA(isA<AccountError>()));
  });
  test('503后先核对已知结果与反馈列表，再用原body版本key恢复', () async {
    var writes = 0;
    final adapter = productionAdapter(
        override: (r) => r.path == feedbackPath && ++writes == 1
            ? envelope({'code': 'SERVICE_UNAVAILABLE'},
                status: 503, error: true)
            : null);
    final s = await buyerSession(adapter), api = ProductionApi(s);
    final v = ProductionRecord.parse(productionData('VERSION')),
        p = ProductionRecord.parse(productionData('PROJECT'));
    await expectLater(api.feedback(v, p, 'REQUEST_CHANGES', '放慢对白', null),
        throwsA(isA<AccountError>()));
    final original = adapter.requests.last;
    expect(s.productionPending.single['body'],
        {'decision': 'REQUEST_CHANGES', 'note': '放慢对白', 'checklist': null});
    await api.retry(feedbackPath);
    expect(adapter.requests.last.headers['Idempotency-Key'],
        original.headers['Idempotency-Key']);
    expect(adapter.requests.last.data, original.data);
    expect(adapter.requests.last.headers['If-Match'],
        original.headers['If-Match']);
    expect(
        adapter.requests.where((r) =>
            r.path.endsWith('/records') &&
            r.queryParameters['kind'] == 'FEEDBACK'),
        isNotEmpty);
    expect(s.productionPending, isEmpty);
  });
  test('不完整成功响应保留已知resultId，恢复不能更换原内容', () async {
    var writes = 0;
    final adapter = productionAdapter(
        override: (r) => r.path == feedbackPath && ++writes == 1
            ? envelope({'id': productionFeedbackId})
            : null);
    final s = await buyerSession(adapter), api = ProductionApi(s);
    await expectLater(
        api.feedback(
            ProductionRecord.parse(productionData('VERSION')),
            ProductionRecord.parse(productionData('PROJECT')),
            'REQUEST_CHANGES',
            '原说明',
            null),
        throwsA(isA<AccountError>()));
    expect(s.productionPending.single['resultId'], productionFeedbackId);
    await expectLater(
        api.feedback(
            ProductionRecord.parse(productionData('VERSION')),
            ProductionRecord.parse(productionData('PROJECT')),
            'REQUEST_CHANGES',
            '另一个说明',
            null),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    await api.retry(feedbackPath);
    expect(
        adapter.requests.where((r) =>
            r.path == '/api/v1/production/records/$productionFeedbackId'),
        isNotEmpty);
  });
  test('412不会保留旧决定，重新读取版本才能发新的确认', () async {
    var writes = 0;
    final adapter = productionAdapter(
        override: (r) => r.path == feedbackPath && ++writes == 1
            ? envelope({'code': 'VERSION_CONFLICT'}, status: 412, error: true)
            : null);
    final s = await buyerSession(adapter), api = ProductionApi(s);
    await expectLater(
        api.feedback(
            ProductionRecord.parse(productionData('VERSION')),
            ProductionRecord.parse(productionData('PROJECT')),
            'REQUEST_CHANGES',
            '原说明',
            null),
        throwsA(isA<AccountError>()));
    expect(s.productionPending, isEmpty);
    final next = ProductionRecord.parse(productionData('VERSION', version: 4));
    await api.feedback(next, ProductionRecord.parse(productionData('PROJECT')),
        'REQUEST_CHANGES', '重新核对说明', null);
    expect(adapter.requests.last.headers['If-Match'], '"4"');
    expect(adapter.requests.last.data['note'], '重新核对说明');
  });
  test('私有内容每次Bearer读取并核对FILE大小和摘要，不使用object_key公开地址', () async {
    final adapter = productionAdapter(),
        s = await buyerSession(adapter),
        api = ProductionApi(s);
    final v = ProductionRecord.parse(productionData('VERSION'));
    expect((await api.content(v)).bytes, productionBytes());
    await api.content(v);
    final reads =
        adapter.requests.where((r) => r.path.endsWith('/content')).toList();
    expect(reads.length, 2);
    expect(reads.last.queryParameters, {'variant': 'preview'});
    expect(reads.last.headers['Authorization'], 'Bearer ${'x' * 43}');
    expect(reads.last.headers['X-Acting-Party'], personId);
    expect(adapter.requests.any((r) => r.path.contains('private/production')),
        false);
  });
  test('字节损坏停止展示，无权读取清理制作私有作用域', () async {
    final bad = productionAdapter(
        override: (r) => r.path.endsWith('/content')
            ? binaryReply(Uint8List.fromList([0, 1]))
            : null);
    final s = await buyerSession(bad);
    await expectLater(
        ProductionApi(s)
            .content(ProductionRecord.parse(productionData('VERSION'))),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
    final denied = productionAdapter(
        override: (r) => r.path.endsWith('/content')
            ? envelope({'code': 'PRODUCTION_PARTY_FORBIDDEN'},
                status: 403, error: true)
            : null);
    final d = await buyerSession(denied), epoch = d.epoch;
    await expectLater(
        ProductionApi(d)
            .content(ProductionRecord.parse(productionData('VERSION'))),
        throwsA(isA<AccountError>()));
    expect(d.productionAccessDenied, true);
    expect(d.epoch, greaterThan(epoch));
    expect(d.productionPending, isEmpty);
    await d.logout();
    expect(d.productionAccessDenied, false);
  });
  test('身份切换丢弃迟到成功与未知写入，不能将原意见带给新身份', () async {
    final response = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) =>
            r.path == feedbackPath ? response.future : adapter.defaultReply(r));
    final s = await buyerSession(adapter), api = ProductionApi(s);
    final pending = api.feedback(
        ProductionRecord.parse(productionData('VERSION')),
        ProductionRecord.parse(productionData('PROJECT')),
        'REQUEST_CHANGES',
        '原说明',
        null);
    final assertion = expectLater(
        pending,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    s.select(identity(orgId));
    response.complete(envelope(productionData('FEEDBACK')));
    await assertion;
    expect(s.productionPending, isEmpty);
  });
  test('生成readiness默认未开通，只有真实服务状态可展示', () async {
    final adapter = productionAdapter(), s = await buyerSession(adapter);
    expect(
        (await ProductionApi(s)
            .readiness(productionProjectId))['current_status'],
        'NOT_ENABLED');
    expect(
        adapter.requests
            .any((r) => r.method == 'POST' && r.path.contains('generation')),
        false);
  });
}
