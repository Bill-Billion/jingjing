import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/cocreation/creation_options.dart';
import 'package:jingjingshangri_app/engagement/community_support.dart';
import '../account/fake_account_api.dart';
import '../customization/customization_fixtures.dart';
import '../engagement/community_safety_test.dart' show communitySession;

Map<String, dynamic> creationRule([String id = secondTemplateId]) => {
      'id': id,
      'content_sha256': 'a' * 64,
      'rule': {
        'version': '本次合成规则',
        'participation_terms': '每人独立确认',
        'max_people': 20,
        'extension_days': 7,
        'benefit': {'kind': 'SERVICE'}
      },
    };
Map<String, dynamic> creationProducer() => {
      'id': orgId,
      'display_name': '平台合成承制方',
      'role': 'PLATFORM_CONTRACTING_PARTY',
    };
void main() {
  test('按本人故事读取两种上下文，空页继续分页，规则摘要不错误重算', () async {
    final a = FakeAccountAdapter(handler: (r) {
      if (!r.path.endsWith('creation-options')) {
        return FakeAccountAdapter().defaultReply(r);
      }
      expect(r.headers['X-Acting-Party'], personId);
      expect(r.queryParameters['request_id'], requestId);
      if (r.queryParameters['kind'] == 'PRODUCER') {
        return envelope({
          'items': [creationProducer()],
          'next_cursor': null,
          'unavailable_reason': null
        });
      }
      return envelope({
        'items': r.queryParameters['cursor'] == null ? [] : [creationRule()],
        'next_cursor': r.queryParameters['cursor'] == null ? templateId : null,
        'unavailable_reason': null
      });
    });
    final s = await communitySession(a);
    final options = await CocreationCreationOptions.load(
        CommunityApi(s, 'cocreation'), requestId);
    expect(options.rules.single['id'], secondTemplateId);
    expect(options.producers.single['id'], orgId);
    expect(
        a.requests.where((r) => r.path.endsWith('creation-options')).length, 3);
    expect(a.requests.where((r) => r.path.endsWith('/rules')), isEmpty);
  });
  test('拒绝循环游标和伪承制方上下文', () async {
    for (final badProducer in [false, true]) {
      final a = FakeAccountAdapter(handler: (r) {
        if (!r.path.endsWith('creation-options')) {
          return FakeAccountAdapter().defaultReply(r);
        }
        return envelope({
          'items': badProducer
              ? [
                  {...creationProducer(), 'role': 'MEMBER'}
                ]
              : [],
          'next_cursor': badProducer ? null : templateId,
          'unavailable_reason': null
        });
      });
      final s = await communitySession(a);
      await expectLater(
          CocreationCreationOptions.load(
              CommunityApi(s, 'cocreation'), requestId),
          throwsA(isA<AccountError>()));
    }
  });
  test('服务器业务拒绝不伪造目录', () async {
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('creation-options')
            ? envelope({'code': 'COCREATION_BEFORE_QUOTE_REQUIRED'},
                status: 409, error: true)
            : FakeAccountAdapter().defaultReply(r));
    final s = await communitySession(a);
    await expectLater(
        CocreationCreationOptions.load(
            CommunityApi(s, 'cocreation'), requestId),
        throwsA(isA<AccountError>().having(
            (e) => e.code, 'code', 'COCREATION_BEFORE_QUOTE_REQUIRED')));
  });
  test('换身份后的迟到承制方和规则不能使用', () async {
    final delayed = Completer<ResponseBody>();
    final a = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('creation-options')
            ? delayed.future
            : FakeAccountAdapter().defaultReply(r));
    final s = await communitySession(a);
    final result = CocreationCreationOptions.load(
        CommunityApi(s, 'cocreation'), requestId);
    final assertion = expectLater(
        result,
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'CONTEXT_CHANGED')));
    s.select(identity(orgId));
    delayed.complete(envelope(
        {'items': [], 'next_cursor': null, 'unavailable_reason': null}));
    await assertion;
  });
}
