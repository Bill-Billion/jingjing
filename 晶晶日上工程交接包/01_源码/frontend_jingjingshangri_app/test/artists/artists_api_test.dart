import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/artists/artists_api.dart';
import 'package:jingjingshangri_app/artists/artists_models.dart';
import '../account/fake_account_api.dart';
import 'artists_fixtures.dart';

Matcher accountError(String code) =>
    isA<AccountError>().having((e) => e.code, 'code', code);
void main() {
  test('DTO核对真人、数字人、记录绑定，拒绝跨人或假长期模型', () {
    final p = ArtistPerson.parse(personData());
    expect(() => ArtistAvatar.parse({...avatarData(), 'person_id': orgId}, p),
        throwsA(accountError('INVALID_ARTIST_RESPONSE')));
    expect(() => ArtistRecord.parse(artistRecord(), orgId),
        throwsA(accountError('INVALID_ARTIST_RESPONSE')));
    final avatar = avatarData();
    avatar['data']['long_lived_model_status'] = 'READY';
    expect(() => ArtistAvatar.parse(avatar, p),
        throwsA(accountError('INVALID_ARTIST_RESPONSE')));
    expect(ArtistDetail.parse(detailData(), personKey).avatars.single.id,
        avatarKey);
  });
  test('服务按kind校验HALO空数字人与禁止自动扣款，不补默认价格/秒数', () {
    final r = artistRecord(kind: 'SERVICE', status: 'READY');
    r['avatar_id'] = null;
    r['data']['kind'] = 'HALO_REVIEW';
    r['data']['specification'] = serviceSpec(kind: 'HALO_REVIEW');
    expect(ArtistRecord.parse(r, personKey).avatarId, isNull);
    r['avatar_id'] = avatarKey;
    expect(
        () => ArtistRecord.parse(r, personKey), throwsA(isA<AccountError>()));
    r['avatar_id'] = null;
    r['data']['auto_debit_enabled'] = true;
    expect(
        () => ArtistRecord.parse(r, personKey), throwsA(isA<AccountError>()));
    final s = servicesData();
    s['offers']['items'][0].remove('price_minor');
    expect(() => ArtistServices.parse(s), throwsA(isA<AccountError>()));
  });
  test('账号级服务/公开目录不带主体头，本人名单才带当前身份', () async {
    final a = artistAdapter(), s = await artistSession(a), api = ArtistsApi(s);
    await api.services();
    await api.catalog(city: '上海', tag: '纪录', audition: true);
    await api.people();
    final reads =
        a.requests.where((r) => r.path.startsWith(artistRoot)).toList();
    expect(reads[0].headers.containsKey('X-Acting-Party'), false);
    expect(reads[1].headers.containsKey('X-Acting-Party'), false);
    expect(reads[2].headers['X-Acting-Party'], personId);
    expect(reads[1].queryParameters,
        {'limit': 20, 'city': '上海', 'tag': '纪录', 'audition': 'true'});
  });
  test('503恢复同body/version/key，修改原内容在发送前拒绝', () async {
    var writes = 0;
    final path = '$artistRoot/people/$personKey/records/$recordKey/withdrawals';
    final a = artistAdapter(
            override: (r) => r.path == path
                ? ++writes == 1
                    ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                        status: 503, error: true)
                    : envelope(artistRecord(status: 'WITHDRAWN', version: 3))
                : null),
        s = await artistSession(a),
        api = ArtistsApi(s);
    await expectLater(api.post(path, {'reason': '本人明确撤回'}, version: 2),
        throwsA(isA<AccountError>()));
    final key = a.requests.last.headers['Idempotency-Key'];
    await expectLater(api.post(path, {'reason': '不能换内容'}, version: 2),
        throwsA(accountError('PENDING_OPERATION_CHANGED')));
    expect(writes, 1);
    await api.retry(path);
    final r = a.requests.last;
    expect(r.data, {'reason': '本人明确撤回'});
    expect(r.headers['If-Match'], '"2"');
    expect(r.headers['Idempotency-Key'], key);
    expect(s.artistsPending, isEmpty);
  });
  test('真实409存储未知码保留原字节/query/key，不能换文件', () async {
    var tries = 0;
    final path = '$artistRoot/people/$personKey/assets';
    final a = artistAdapter(
            override: (r) => r.path == path && ++tries == 1
                ? envelope({'code': 'ASSET_UPLOAD_RECONCILIATION_REQUIRED'},
                    status: 409, error: true)
                : null),
        s = await artistSession(a),
        api = ArtistsApi(s),
        p = ArtistPerson.parse(personData());
    await expectLater(
        api.upload(p, artistBytes, 'CONSENT_EVIDENCE', 'text/plain'),
        throwsA(
            isA<AccountError>().having((e) => e.uncertain, 'uncertain', true)));
    final first = a.requests.last;
    expect(api.pending(path)?['bytes'], artistBytes);
    await expectLater(
        api.upload(
            p, Uint8List.fromList([5]), 'CONSENT_EVIDENCE', 'text/plain'),
        throwsA(accountError('PENDING_OPERATION_CHANGED')));
    expect(tries, 1);
    await api.upload(p, artistBytes, 'CONSENT_EVIDENCE', 'text/plain');
    expect(a.requests.last.headers['Idempotency-Key'],
        first.headers['Idempotency-Key']);
    expect(a.requests.last.queryParameters, first.queryParameters);
    expect(s.artistsPending, isEmpty);
  });
  test('上传成功返回坏哈希仍保留待核对原请求，私有下载坏哈希拒绝', () async {
    final a = artistAdapter(
            override: (r) => r.path.endsWith('/assets')
                ? envelope({...assetData(), 'content_sha256': 'b' * 64})
                : r.path.endsWith('/content')
                    ? ResponseBody.fromBytes([9, 9], 200,
                        headers: {
                          'content-type': ['application/octet-stream']
                        })
                    : null),
        s = await artistSession(a),
        api = ArtistsApi(s),
        p = ArtistPerson.parse(personData());
    await expectLater(
        api.upload(p, artistBytes, 'CONSENT_EVIDENCE', 'text/plain'),
        throwsA(accountError('INVALID_ARTIST_RESPONSE')));
    expect(s.artistsPending.length, 1);
    await expectLater(api.download(p, assetKey),
        throwsA(accountError('PRIVATE_CONTENT_MISMATCH')));
  });
  for (final kind in ['json', 'write', 'upload', 'bytes']) {
    for (final logout in [false, true]) {
      test('$kind迟到结果在${logout ? '退出' : 'A→B→A'}后不恢复私有内容或pending', () async {
        final deferred = Completer<ResponseBody>();
        final path = kind == 'bytes'
            ? '$artistRoot/assets/$assetKey/content'
            : kind == 'upload'
                ? '$artistRoot/people/$personKey/assets'
                : '$artistRoot/people';
        final a = artistAdapter(
                override: (r) => r.path == path ? deferred.future : null),
            s = await artistSession(a);
        final Future<dynamic> f = switch (kind) {
          'json' => s.read(path, actingParty: personId),
          'write' => s.write('POST', path,
              actingParty: personId, body: {'display_name': '原输入'}),
          'upload' => s.upload(path, artistBytes,
              actingParty: personId,
              query: {
                'purpose': 'CONSENT_EVIDENCE',
                'media_type': 'text/plain'
              },
              validate: (_) {}),
          _ => s.readBytes(path, actingParty: personId)
        };
        final expectation =
            expectLater(f, throwsA(accountError('CONTEXT_CHANGED')));
        await Future<void>.delayed(Duration.zero);
        if (logout) {
          await s.logout();
        } else {
          s.select(identity(orgId));
          s.select(identity(personId));
        }
        deferred.complete(kind == 'bytes'
            ? ResponseBody.fromBytes(artistBytes, 200, headers: {
                'content-type': ['application/octet-stream']
              })
            : envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true));
        await expectation;
        expect(s.artistsPending, isEmpty);
        expect(s.supplyAccessDenied, false);
      });
    }
  }
  for (final bytes in [false, true]) {
    for (final status in [403, 404]) {
      test('艺人${bytes ? '字节' : 'JSON'}$status独立清权，不误标作者失权', () async {
        final path = bytes
            ? '$artistRoot/assets/$assetKey/content'
            : '$artistRoot/people';
        final a = artistAdapter(
                override: (r) => r.path == path
                    ? envelope({'code': 'FORBIDDEN'},
                        status: status, error: true)
                    : null),
            s = await artistSession(a);
        await expectLater(
            bytes
                ? s.readBytes(path, actingParty: personId)
                : s.read(path, actingParty: personId),
            throwsA(isA<AccountError>()));
        expect(s.artistsAccessDenied, true);
        expect(s.supplyAccessDenied, false);
        expect(s.artistsPending, isEmpty);
        await s.retrySupplyAccess();
        expect(s.artistsAccessDenied, true);
        await s.retryArtistsAccess();
        expect(s.artistsAccessDenied, false);
      });
    }
  }
  test('已撤回机构委托不产生代办范围，分页游标循环会拒绝', () async {
    final a = artistAdapter(
            override: (r) => r.path.endsWith('/records')
                ? envelope({
                    'items': [
                      artistRecord(kind: 'DELEGATION', status: 'WITHDRAWN')
                    ],
                    'next_cursor': null
                  })
                : null),
        s = await artistSession(a),
        api = ArtistsApi(s);
    s.select(identity(orgId));
    expect(await api.actions(ArtistDetail.parse(detailData(), personKey)),
        isEmpty);
    final b = artistAdapter(
            override: (r) => r.path.endsWith('/records')
                ? envelope({
                    'items': <Map<String, dynamic>>[],
                    'next_cursor': recordKey
                  })
                : null),
        t = await artistSession(b);
    await expectLater(ArtistsApi(t).allRecords(personKey, 'CONSENT'),
        throwsA(isA<AccountError>()));
  });
}
