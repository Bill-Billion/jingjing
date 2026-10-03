import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/supply/supply_api.dart';
import 'package:jingjingshangri_app/supply/supply_files.dart';
import 'package:jingjingshangri_app/supply/supply_models.dart';
import '../account/fake_account_api.dart';
import '../contracts/contract_fixtures.dart' show contractSession;
import 'supply_fixtures.dart';

void main() {
  test('严格校验返回字段、所有权、内外状态及独立权利人；读取允许历史零证明', () {
    SupplyDto.record(profileData(), orgId);
    SupplyDto.record(workData(), orgId);
    final history = workData();
    history['data']['version']['content']['evidence_ids'] = [];
    SupplyDto.record(history, orgId);
    for (final invalid in [
      workData()..remove('object_version'),
      workData()..['owner_party_id'] = personId,
      workData()..['current_status'] = 'APPROVED',
      workData()..['data']['credits'] = [],
      workData()..['data']['version']['current_status'] = 'REVIEWS_COMPLETE'
    ]) {
      expect(
          () => SupplyDto.record(invalid, orgId), throwsA(isA<AccountError>()));
    }
    expect(
        () => SupplyDto.asset(
            assetData()..['current_status'] = 'UPLOADING', orgId),
        throwsA(isA<AccountError>()));
  });
  test('最高revision来自完整分页，不取id列表首行；每页带身份头', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/records')) {
        return envelope({
          'items': [
            profileData(
                id: r.queryParameters['cursor'] == null ? profileId : laterId,
                revision: r.queryParameters['cursor'] == null ? 1 : 3,
                status: r.queryParameters['cursor'] == null
                    ? 'APPROVED'
                    : 'PENDING_REVIEW')
          ],
          'next_cursor': r.queryParameters['cursor'] == null ? laterId : null
        });
      }
      return adapter.defaultReply(r);
    });
    final api = SupplyApi(await contractSession(adapter));
    expect((await api.latestProfile())!['revision'], 3);
    final calls =
        adapter.requests.where((r) => r.path.endsWith('/records')).toList();
    expect(calls.length, 2);
    expect(calls.last.queryParameters,
        {'kind': 'PROFILE', 'limit': 20, 'cursor': laterId});
    expect(calls.every((r) => r.headers['X-Acting-Party'] == orgId), isTrue);
  });
  test('MEMBER和已撤销权限身份不读取私有资源，PENDING_REVIEW OWNER可读', () async {
    final adapter = FakeAccountAdapter();
    final session = await contractSession(adapter, owner: false);
    final api = SupplyApi(session);
    await expectLater(api.record(versionId), throwsA(isA<AccountError>()));
    expect(adapter.requests.length, 1);
    session.select(identity(personId));
    session.denySupply();
    await expectLater(api.record(versionId), throwsA(isA<AccountError>()));
    expect(adapter.requests.length, 1);
  });
  test('未知写入锁定原payload和幂等键；成功后释放', () async {
    var calls = 0;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/profiles')) {
        return ++calls == 1
            ? envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true)
            : envelope(profileData(status: 'PENDING_REVIEW'));
      }
      return adapter.defaultReply(r);
    });
    final api = SupplyApi(await contractSession(adapter));
    final body = profileBody();
    await expectLater(
        api.write('/api/v1/supply/profiles', body, kind: 'PROFILE'),
        throwsA(isA<AccountError>()));
    body['display_name'] = '被修改';
    expect(
        api.pending('/api/v1/supply/profiles')!['body']['display_name'], '作者');
    await expectLater(
        api.write('/api/v1/supply/profiles', body),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PENDING_OPERATION_CHANGED')));
    await api.write('/api/v1/supply/profiles', profileBody(), kind: 'PROFILE');
    final writes =
        adapter.requests.where((r) => r.path.endsWith('/profiles')).toList();
    expect(writes.length, 2);
    expect(writes[0].headers['Idempotency-Key'],
        writes[1].headers['Idempotency-Key']);
    expect(api.pending('/api/v1/supply/profiles'), isNull);
  });
  test('格式不完整的2xx回执不能解除原操作锁', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/profiles')
            ? envelope({'id': profileId})
            : adapter.defaultReply(r));
    final api = SupplyApi(await contractSession(adapter));
    await expectLater(
        api.write('/api/v1/supply/profiles', profileBody(), kind: 'PROFILE'),
        throwsA(isA<AccountError>()));
    expect(api.pending('/api/v1/supply/profiles'), isNotNull);
  });
  test('提交与撤回使用原record版本的quoted If-Match，412不保留未知操作', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/actions')
            ? envelope({'code': 'OBJECT_VERSION_MISMATCH'},
                status: 412, error: true)
            : adapter.defaultReply(r));
    final api = SupplyApi(await contractSession(adapter));
    await expectLater(
        api.write('/api/v1/supply/work-versions/$versionId/actions',
            {'action': 'SUBMIT', 'reason': null},
            version: 7),
        throwsA(isA<AccountError>()));
    expect(adapter.requests.last.headers['If-Match'], '"7"');
    expect(
        api.pending('/api/v1/supply/work-versions/$versionId/actions'), isNull);
  });
  test('真实上传为raw bytes且验证READY、大小、哈希后才能引用', () async {
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/assets')
            ? envelope(assetData())
            : adapter.defaultReply(r));
    final api = SupplyApi(await contractSession(adapter));
    await api.upload(bytes, 'WORK_CONTENT', 'text/plain');
    final r = adapter.requests.last;
    expect(r.data, orderedEquals(bytes));
    expect(r.headers['Content-Type'], 'application/octet-stream');
    expect(r.queryParameters,
        {'purpose': 'WORK_CONTENT', 'media_type': 'text/plain'});
    expect(r.headers['Authorization'], 'Bearer ${'x' * 43}');
    await expectLater(
        api.upload(Uint8List(maxSupplyBytes + 1), 'WORK_CONTENT', 'text/plain'),
        throwsA(isA<AccountError>()));
  });
  test('流式文件读取拒绝伪报大小、超过上限和空文件', () async {
    expect(
        await supplyPickedBytes(PlatformFile(
            name: 'proof.txt',
            size: 3,
            readStream: Stream.value([65, 66, 67]))),
        orderedEquals(bytes));
    await expectLater(
        supplyPickedBytes(PlatformFile(
            name: 'proof.txt',
            size: 1,
            readStream: Stream.value([65, 66, 67]))),
        throwsA(isA<AccountError>()));
    await expectLater(
        supplyPickedBytes(
            PlatformFile(name: 'proof.txt', size: maxSupplyBytes + 1)),
        throwsA(isA<AccountError>()));
  });
  test('私有下载携带当前Bearer且不接受JSON URL或坏内容', () async {
    var corrupt = false;
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/content')) {
        return ResponseBody.fromBytes(corrupt ? [88] : bytes, 200, headers: {
          'content-type': ['application/octet-stream']
        });
      }
      if (r.path.contains('/assets/')) return envelope(assetData());
      return adapter.defaultReply(r);
    });
    final api = SupplyApi(await contractSession(adapter));
    expect(await api.download(assetId), orderedEquals(bytes));
    expect(
        adapter.requests.last.headers['Authorization'], 'Bearer ${'x' * 43}');
    corrupt = true;
    await expectLater(
        api.download(assetId),
        throwsA(isA<AccountError>()
            .having((e) => e.code, 'code', 'PRIVATE_CONTENT_MISMATCH')));
  });
  test('下载在途时并行403撤权，迟到字节不得回到页面', () async {
    final lateBytes = Completer<ResponseBody>(), started = Completer<void>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/content')) {
        started.complete();
        return lateBytes.future;
      }
      if (r.path.contains('/assets/')) return envelope(assetData());
      if (r.path.contains('/records/')) {
        return envelope({'code': 'FORBIDDEN'}, status: 403, error: true);
      }
      return adapter.defaultReply(r);
    });
    final session = await contractSession(adapter), api = SupplyApi(session);
    final download = api.download(assetId);
    final rejected = expectLater(download, throwsA(isA<AccountError>()));
    await started.future;
    await expectLater(api.record(versionId), throwsA(isA<AccountError>()));
    lateBytes.complete(ResponseBody.fromBytes(bytes, 200, headers: {
      'content-type': ['application/octet-stream']
    }));
    await rejected;
    expect(session.supplyAccessDenied, isTrue);
  });
  test('A→B→A切换清空待操作，迟到写入不得重建私有pending', () async {
    final delayed = Completer<ResponseBody>();
    late FakeAccountAdapter adapter;
    adapter = FakeAccountAdapter(
        handler: (r) => r.path.endsWith('/profiles')
            ? delayed.future
            : adapter.defaultReply(r));
    final session = await contractSession(adapter), api = SupplyApi(session);
    final future =
        api.write('/api/v1/supply/profiles', profileBody(), kind: 'PROFILE');
    final rejected = expectLater(future, throwsA(isA<AccountError>()));
    session.select(identity(personId));
    session.select(identity(orgId));
    delayed.complete(
        envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'}, status: 503, error: true));
    await rejected;
    expect(api.pending('/api/v1/supply/profiles'), isNull);
  });
}
