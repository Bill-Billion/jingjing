import 'dart:async';
import 'package:flutter/foundation.dart';
import 'demo_engine.dart';
import 'demo_models.dart';

abstract class DemoPersistence {
  Future<DemoRow?> read();
  Future<void> write(DemoRow value);
  Future<void> close();
}

class DemoStore extends ChangeNotifier {
  DemoStore(this.persistence, {DateTime Function()? clock})
      : clock = clock ?? DateTime.now;
  final DemoPersistence persistence;
  final DateTime Function() clock;
  DemoRow? _data;
  Future<void>? _tail;
  bool _disposed = false;

  DemoRow get snapshot => copyDemo(_data!);
  String get actor => _data!['actor'] as String;
  DemoAccount get account => demoAccounts.firstWhere((a) => a.id == actor);
  DemoRow get artist => copyDemo(_data!['artist'] as DemoRow);
  DemoRow get organization => copyDemo(_data!['organization'] as DemoRow);
  DemoRow get project => copyDemo(_data!['project'] as DemoRow);

  Future<void> load() async {
    final saved = await persistence.read();
    if (saved != null) {
      if (saved['schema'] != 1 ||
          !demoAccounts.any((a) => a.id == saved['actor']) ||
          ![
            'orders',
            'auditions',
            'notices',
            'applications',
            'payments',
            'messages'
          ].every((key) => saved[key] is List)) {
        throw const DemoFailure('本机演示资料版本不兼容，请保留资料或确认后重置。');
      }
      _data = saved;
    } else {
      final seeded = demoSeed();
      await persistence.write(seeded);
      _data = seeded;
    }
    if (!_disposed) notifyListeners();
  }

  List<DemoRow> list(String table) {
    final all = (snapshot[table] as List).cast<DemoRow>();
    return all
        .where((row) => switch (table) {
              'orders' => row['customer'] == actor,
              'auditions' => row['customer'] == actor || row['artist'] == actor,
              'notices' =>
                row['status'] == 'published' || row['producer'] == actor,
              'applications' => row['artist'] == actor || actor == 'producer',
              'messages' => row['to'] == actor,
              'payments' => row['actor'] == actor,
              _ => false,
            })
        .toList();
  }

  DemoRow? find(String table, String id) {
    final rows = list(table).where((row) => row['id'] == id);
    return rows.isEmpty ? null : rows.first;
  }

  /// Serializes mutations; a failed disk write never publishes partial state.
  /// Actor is captured when enqueued, so a stale page cannot act as a new user.
  Future<String> send(String action, [DemoRow input = const {}]) {
    final actorAtStart = actor;
    final safeInput = copyDemo(input);
    final result = Completer<String>();
    _tail = (_tail ?? Future<void>.value()).then((_) async {
      try {
        final next = snapshot;
        final id =
            DemoEngine(next, actorAtStart, clock()).apply(action, safeInput);
        next['revision'] = (next['revision'] as int) + 1;
        await persistence.write(next);
        _data = next;
        if (!_disposed) notifyListeners();
        result.complete(id);
      } catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }

  Future<void> reset({required bool confirmed}) {
    if (!confirmed) return Future.error(const DemoFailure('重置需要再次确认。'));
    final result = Completer<void>();
    _tail = (_tail ?? Future<void>.value()).then((_) async {
      try {
        final next = demoSeed();
        await persistence.write(next);
        _data = next;
        if (!_disposed) notifyListeners();
        result.complete();
      } catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
