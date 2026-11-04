import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/offline/demo_models.dart';
import 'package:jingjingshangri_app/offline/demo_store.dart';

class MemoryDemoPersistence implements DemoPersistence {
  DemoRow? data;
  bool fail = false;
  @override
  Future<DemoRow?> read() async => data == null ? null : copyDemo(data!);
  @override
  Future<void> write(DemoRow value) async {
    if (fail) throw StateError('disk full');
    data = copyDemo(value);
  }

  @override
  Future<void> close() async {}
}

DemoRow orderInput(String key) => {
      'requestKey': key,
      'recipient': '妈妈',
      'occasion': '生日',
      'brief': '愿你健康快乐',
      'material': demoImage,
      'consent': true,
    };
DemoRow noticeInput(String key) => {
      'requestKey': key,
      'title': '城市短片',
      'role': '书店店员',
      'city': '苏州',
      'brief': '拍摄一天',
      'requirements': '自然表演与本人形象资料',
      'deadline': '2027-01-20T12:00:00Z',
    };

void main() {
  late MemoryDemoPersistence disk;
  late DemoStore store;
  final now = DateTime.utc(2027, 1, 1);
  setUp(() async {
    disk = MemoryDemoPersistence();
    store = DemoStore(disk, clock: () => now);
    await store.load();
  });
  tearDown(() => store.dispose());
  Future<void> account(String id) => store.send('switch', {'id': id});

  test('blessing from first submission through feedback, 30/40/30 and receipt',
      () async {
    final id = await store.send('order_create', orderInput('first'));
    expect(store.find('orders', id)!['status'], 'submitted');
    await store.send('order_quote', {'id': id});
    final contract = store.find('orders', id)!['contract'];
    await store.send('order_sign', {'id': id, 'consent': true});
    await Future.wait(List.generate(
        5, (_) => store.send('order_pay', {'id': id, 'phase': 'deposit'})));
    expect(store.list('payments'), hasLength(1));
    await store.send('order_produce', {'id': id});
    await store.send('order_feedback', {'id': id, 'feedback': '请增加一句祝福'});
    expect(store.find('orders', id)!['version'], 2);
    await store.send('order_produce', {'id': id});
    await store.send('order_confirm', {'id': id});
    await store.send('order_produce', {'id': id});
    await store.send('order_confirm', {'id': id});
    await store.send('order_pay', {'id': id, 'phase': 'middle'});
    await store.send('order_produce', {'id': id});
    await store.send('order_confirm', {'id': id});
    await store.send('order_pay', {'id': id, 'phase': 'tail'});
    await store.send('order_produce', {'id': id});
    await store.send('order_confirm', {'id': id});
    expect(store.find('orders', id)!['status'], 'received');
    expect(
        store.list('payments').map((r) => r['cents']), [30000, 40000, 30000]);
    expect(store.find('orders', id)!['contract'], contract);
    await store.send('order_pay', {'id': id, 'phase': 'deposit'});
    expect(store.list('payments'), hasLength(3));
  });

  test('creation retries are idempotent and changed payload is rejected',
      () async {
    final id = await store.send('order_create', orderInput('retry'));
    expect(await store.send('order_create', orderInput('retry')), id);
    await expectLater(
        store.send(
            'order_create', {...orderInput('retry'), 'brief': 'different'}),
        throwsA(isA<DemoFailure>()));
    expect(store.list('orders'), hasLength(1));
  });

  test(
      'wrong roles, premature payment, missing consent and unknown actions fail atomically',
      () async {
    final id = await store.send('order_create', orderInput('permission'));
    await expectLater(store.send('order_pay', {'id': id, 'phase': 'tail'}),
        throwsA(isA<DemoFailure>()));
    await store.send('order_quote', {'id': id});
    await expectLater(
        store.send('order_sign', {'id': id}), throwsA(isA<DemoFailure>()));
    await account('member');
    expect(store.list('orders'), isEmpty);
    await expectLater(
        store.send('order_quote', {'id': id}), throwsA(isA<DemoFailure>()));
    await expectLater(
        store.send('artist_approve'), throwsA(isA<DemoFailure>()));
    await expectLater(store.send('unknown'), throwsA(isA<DemoFailure>()));
    expect(store.snapshot['payments'], isEmpty);
  });

  test('artist profile authorization and audition cross-account completion',
      () async {
    await account('artist');
    await store.send('artist_save', {...store.artist, 'name': '新的艺名'});
    expect(store.artist['status'], 'draft');
    await expectLater(store.send('artist_submit'), throwsA(isA<DemoFailure>()));
    await store.send('artist_submit', {'consent': true});
    await store.send('artist_approve');
    await account('customer');
    final id = await store.send('audition_create', {
      'requestKey': 'audition-1',
      'date': '2027-01-03T14:00:00Z',
      'brief': '生活化表演',
    });
    await store.send('audition_pay', {'id': id});
    await store.send('audition_pay', {'id': id});
    expect(store.list('payments'), hasLength(1));
    await expectLater(
        store.send('audition_accept', {'id': id}), throwsA(isA<DemoFailure>()));
    await account('artist');
    expect(store.list('auditions').single['id'], id);
    await store.send('audition_accept', {'id': id});
    await store.send('audition_deliver', {
      'id': id,
      'photo': 'assets/images/artist_1.jpg',
      'video': demoAuditionVideo
    });
    await store.send('audition_approve', {'id': id});
    await expectLater(store.send('audition_confirm', {'id': id}),
        throwsA(isA<DemoFailure>()));
    await account('customer');
    await store.send('audition_confirm', {'id': id});
    expect(store.find('auditions', id)!['status'], 'completed');
    expect(store.project['status'], 'open');
  });

  test('participation is independent and requires personal confirmation',
      () async {
    await account('artist');
    for (final action in ['project_apply', 'project_select']) {
      await store.send(action);
    }
    await expectLater(
        store.send('project_confirm'), throwsA(isA<DemoFailure>()));
    await store.send('project_confirm', {'consent': true});
    await store.send('project_pay');
    await store.send('project_pay');
    await store.send('project_start');
    await store.send('project_complete');
    expect(store.project['status'], 'completed');
    expect(store.list('payments'), hasLength(1));
    expect(store.snapshot['notices'], isEmpty);
  });

  test('organization invite, accept, permissions, revocation and reinvite',
      () async {
    await account('owner');
    await store.send('org_save', {...store.organization, 'name': '新机构（演示）'});
    await store.send('org_invite');
    await expectLater(
        store.send('org_permissions', {
          'permissions': ['查看艺人资料']
        }),
        throwsA(isA<DemoFailure>()));
    await account('member');
    await store.send('org_accept');
    await expectLater(store.send('org_remove'), throwsA(isA<DemoFailure>()));
    await account('owner');
    await store.send('org_permissions', {
      'permissions': ['查看艺人资料', '协助试镜']
    });
    await account('member');
    expect(store.organization['permissions'], hasLength(2));
    await account('owner');
    await store.send('org_remove');
    expect(store.organization['permissions'], isEmpty);
    await store.send('org_invite');
    expect(store.organization['memberStatus'], 'invited');
  });

  test(
      'notice draft, rejection, publish, submission and interest do not auto-cast',
      () async {
    await account('producer');
    final id = await store.send('notice_create', noticeInput('notice'));
    await store.send('notice_submit', {'id': id, 'consent': true});
    await store.send('notice_reject', {'id': id});
    await store.send('notice_edit',
        {...noticeInput('notice'), 'id': id, 'requirements': '自然表演，提交模卡和介绍'});
    await store.send('notice_submit', {'id': id, 'consent': true});
    await store.send('notice_publish', {'id': id});
    await account('artist');
    final application = await store
        .send('notice_apply', {'id': id, 'note': '期待合作', 'consent': true});
    expect(
        await store
            .send('notice_apply', {'id': id, 'note': '期待合作', 'consent': true}),
        application);
    final snapshot = store.find('applications', application)!['artistSnapshot'];
    await store.send('artist_save', {...store.artist, 'name': '后来改名'});
    await account('producer');
    await store.send('notice_interest', {'id': application});
    expect(store.find('applications', application)!['serviceTask'], isNotNull);
    expect(
        store.find('applications', application)!['artistSnapshot'], snapshot);
    expect(store.project['status'], 'open');
    expect(store.snapshot['payments'], isEmpty);
  });

  test('drafts are private and expired notice is not published', () async {
    await account('producer');
    final id = await store.send('notice_create', noticeInput('private'));
    await account('artist');
    expect(store.find('notices', id), isNull);
    await expectLater(
        store
            .send('notice_apply', {'id': id, 'note': 'hello', 'consent': true}),
        throwsA(isA<DemoFailure>()));
    await account('producer');
    await expectLater(
        store.send('notice_edit',
            {...noticeInput('private'), 'id': id, 'deadline': '2020-01-01'}),
        throwsA(isA<DemoFailure>()));
  });

  test(
      'disk failure rolls back, queue recovers, restart keeps identity and records',
      () async {
    disk.fail = true;
    final before = store.snapshot;
    await expectLater(
        store.send('order_create', orderInput('failed')), throwsStateError);
    expect(store.snapshot, before);
    disk.fail = false;
    final id = await store.send('order_create', orderInput('failed'));
    await account('artist');
    final restarted = DemoStore(disk, clock: () => now);
    await restarted.load();
    expect(restarted.actor, 'artist');
    await restarted.send('switch', {'id': 'customer'});
    expect(restarted.find('orders', id)!['recipient'], '妈妈');
    restarted.dispose();
  });

  test('queued stale action cannot adopt newly selected identity', () async {
    final switching = store.send('switch', {'id': 'owner'});
    final stale = store.send('org_invite');
    await switching;
    await expectLater(stale, throwsA(isA<DemoFailure>()));
    expect(store.organization['memberStatus'], 'removed');
    await store.send('org_invite');
    expect(store.organization['memberStatus'], 'invited');
  });

  test('reset requires confirmation and affects all five accounts', () async {
    await store.send('order_create', orderInput('reset'));
    await account('owner');
    await store.send('org_invite');
    await expectLater(
        store.reset(confirmed: false), throwsA(isA<DemoFailure>()));
    expect(store.actor, 'owner');
    await store.reset(confirmed: true);
    expect(store.snapshot, demoSeed());
    final restarted = DemoStore(disk);
    await restarted.load();
    expect(restarted.snapshot, demoSeed());
    restarted.dispose();
  });

  test('remote media and invalid appointments are refused', () async {
    await expectLater(
        store.send('order_create',
            {...orderInput('url'), 'material': 'https://example.com/a.jpg'}),
        throwsA(isA<DemoFailure>()));
    await expectLater(
        store.send('audition_create',
            {'requestKey': 'past', 'date': '2020-01-01', 'brief': 'hello'}),
        throwsA(isA<DemoFailure>()));
    expect(store.list('orders'), isEmpty);
    expect(store.list('auditions'), isEmpty);
  });
}
