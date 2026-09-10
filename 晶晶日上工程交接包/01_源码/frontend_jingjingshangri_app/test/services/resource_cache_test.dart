import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/services/resource_cache.dart';

void main() {
  late DateTime now;
  DateTime clock() => now;

  setUp(() => now = DateTime(2026, 9, 6, 12));

  test('RC1 首次加载调用 loader 一次并返回数据', () async {
    final c = ResourceCache(clock: clock);
    var calls = 0;
    final v = await c.fetch('k', () async {
      calls++;
      return 'a';
    });
    expect(v, 'a');
    expect(calls, 1);
    expect(c.peek<String>('k'), 'a');
  });

  test('RC2 TTL 新鲜期内重复读取不再请求', () async {
    final c = ResourceCache(ttl: const Duration(seconds: 10), clock: clock);
    var calls = 0;
    Future<String> load() async {
      calls++;
      return 'v$calls';
    }

    expect(await c.fetch('k', load), 'v1');
    now = now.add(const Duration(seconds: 5)); // 仍在 TTL 内
    expect(await c.fetch('k', load), 'v1');
    expect(calls, 1);
  });

  test('RC3 并发同 key 请求去重，loader 只执行一次', () async {
    final c = ResourceCache(clock: clock);
    var calls = 0;
    final gate = Completer<String>();
    Future<String> load() async {
      calls++;
      return gate.future;
    }

    final f1 = c.fetch('k', load);
    final f2 = c.fetch('k', load); // 在途，应复用同一 Future
    expect(c.isLoading('k'), true);
    gate.complete('shared');
    expect(await Future.wait([f1, f2]), ['shared', 'shared']);
    expect(calls, 1);
  });

  test('RC4 stale 时立即回旧值并后台 SWR 刷新', () async {
    final c = ResourceCache(ttl: const Duration(seconds: 10), clock: clock);
    var calls = 0;
    Future<int> load() async {
      calls++;
      return calls; // 第一次 1，第二次 2
    }

    expect(await c.fetch('n', load), 1);
    now = now.add(const Duration(seconds: 30)); // 过期
    final updated = Completer<int>();
    c.onUpdated = (k, v) => updated.complete(v as int);

    final returned = await c.fetch('n', load); // 应立即返回旧值 1
    expect(returned, 1);
    expect(await updated.future, 2); // 后台刷新完成通知新值
    expect(c.peek<int>('n'), 2);
    expect(calls, 2);
  });

  test('RC5 后台刷新失败保留旧值并走 onUpdateError', () async {
    final c = ResourceCache(ttl: const Duration(seconds: 1), clock: clock);
    var attempt = 0;
    Future<String> load() async {
      attempt++;
      if (attempt == 1) return 'old';
      throw StateError('network down');
    }

    expect(await c.fetch('e', load), 'old');
    now = now.add(const Duration(seconds: 10));
    final err = Completer<Object>();
    c.onUpdateError = (k, e) => err.complete(e);

    final returned = await c.fetch('e', load); // SWR 立即回旧值
    expect(returned, 'old');
    expect(await err.future, isA<StateError>());
    expect(c.peek<String>('e'), 'old'); // 旧值不丢
  });

  test('RC6 force=true 强制刷新并覆盖缓存', () async {
    final c = ResourceCache(clock: clock);
    var calls = 0;
    Future<int> load() async => ++calls;
    expect(await c.fetch('f', load), 1);
    expect(await c.fetch('f', load, force: true), 2);
    expect(c.peek<int>('f'), 2);
  });

  test('RC7 invalidate 后过期、remove 后清空', () async {
    final c = ResourceCache(ttl: const Duration(seconds: 100), clock: clock);
    var calls = 0;
    Future<int> load() async => ++calls;
    await c.fetch('g', load);
    c.invalidate('g'); // 标记过期但保留数据
    expect(c.hasData('g'), true);
    now = now.add(const Duration(seconds: 1));
    await c.fetch('g', load); // 过期 → SWR 后台刷新
    await Future<void>.delayed(Duration.zero);
    expect(calls, 2);
    c.remove('g');
    expect(c.hasData('g'), false);
  });

  test('RC8 clear 清空全部会话缓存', () async {
    final c = ResourceCache(clock: clock);
    await c.fetch('a', () async => 1);
    await c.fetch('b', () async => 2);
    expect(c.hasData('a'), true);
    c.clear();
    expect(c.hasData('a'), false);
    expect(c.hasData('b'), false);
  });
}
