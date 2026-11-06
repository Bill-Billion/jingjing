import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Only local, non-authenticating references are retained: no phone, token,
/// request body or private account details. An unknown result is never retried.
class ClosureReference {
  const ClosureReference(this.accountId, this.requestId, this.confirmed);
  final String accountId, requestId;
  final bool confirmed;
  Map<String, dynamic> toJson() => {
        'account_id': accountId,
        'request_id': requestId,
        'confirmed': confirmed,
      };
}

class ClosureReferenceStore {
  static const key = 'jx.privacy.closure.references.v1';
  static final _uuid = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
  static bool _running = false;
  static final _waiters = <Completer<void>>[];

  @visibleForTesting
  static void resetQueueForTesting() {
    _running = false;
    _waiters.clear();
  }

  static Future<T> _locked<T>(Future<T> Function() work) async {
    if (_running) {
      final turn = Completer<void>();
      _waiters.add(turn);
      await turn.future;
    } else {
      _running = true;
    }
    try {
      return await work();
    } finally {
      if (_waiters.isEmpty) {
        _running = false;
      } else {
        _waiters.removeAt(0).complete();
      }
    }
  }

  static Future<List<ClosureReference>> _read() async {
    final raw = (await SharedPreferences.getInstance()).getString(key);
    if (raw == null) return [];
    try {
      final data = jsonDecode(raw);
      if (data is! List || data.length > 32) throw const FormatException();
      final result = <ClosureReference>[];
      for (final item in data) {
        if (item is! Map ||
            item.length != 3 ||
            item['account_id'] is! String ||
            item['request_id'] is! String ||
            !_uuid.hasMatch(item['account_id']) ||
            !_uuid.hasMatch(item['request_id']) ||
            item['confirmed'] is! bool) {
          throw const FormatException();
        }
        result.add(ClosureReference(
            item['account_id'], item['request_id'], item['confirmed']));
      }
      return result;
    } catch (_) {
      // Do not erase damaged evidence and then issue another closure request.
      throw StateError('CLOSURE_REFERENCE_INVALID');
    }
  }

  static Future<List<ClosureReference>> read({String? accountId}) =>
      _locked(() async {
        final all = await _read();
        return accountId == null
            ? all
            : all.where((r) => r.accountId == accountId).toList();
      });

  static Future<void> begin(String accountId, String requestId) =>
      _locked(() async {
        if (!_uuid.hasMatch(accountId) || !_uuid.hasMatch(requestId)) {
          throw StateError('CLOSURE_REFERENCE_INVALID');
        }
        final all = await _read();
        if (all.any((r) => r.accountId == accountId && !r.confirmed)) {
          throw StateError('CLOSURE_RESULT_UNRESOLVED');
        }
        if (all.length >= 32) throw StateError('CLOSURE_REFERENCE_FULL');
        all.add(ClosureReference(accountId, requestId, false));
        if (!await (await SharedPreferences.getInstance())
            .setString(key, jsonEncode(all.map((r) => r.toJson()).toList()))) {
          throw StateError('CLOSURE_REFERENCE_UNAVAILABLE');
        }
      });

  static Future<void> finish(String accountId, String requestId,
          {required bool confirmed}) =>
      _locked(() async {
        final all = await _read();
        final index = all.indexWhere((r) =>
            r.accountId == accountId &&
            r.requestId == requestId &&
            !r.confirmed);
        if (index < 0) throw StateError('CLOSURE_REFERENCE_CHANGED');
        if (confirmed) {
          all[index] = ClosureReference(accountId, requestId, true);
        } else {
          all.removeAt(index); // A definite pre-commit rejection only.
        }
        if (!await (await SharedPreferences.getInstance())
            .setString(key, jsonEncode(all.map((r) => r.toJson()).toList()))) {
          throw StateError('CLOSURE_REFERENCE_UNAVAILABLE');
        }
      });
}

/// Logged-out users can explicitly reveal their locally stored reference. It
/// does not query a closed account or assert that data erasure has completed.
class ClosureReferenceNotice extends StatefulWidget {
  const ClosureReferenceNotice({super.key, this.accountId});
  final String? accountId;
  @override
  State<ClosureReferenceNotice> createState() => _ClosureReferenceNoticeState();
}

class _ClosureReferenceNoticeState extends State<ClosureReferenceNotice> {
  late Future<List<ClosureReference>> references;
  bool reveal = false;
  @override
  void initState() {
    super.initState();
    references = ClosureReferenceStore.read(accountId: widget.accountId);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<ClosureReference>>(
      future: references,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Text('本机注销申请编号暂不能读取，请联系工作人员核对；不要重复提交。');
        }
        final rows = snapshot.data ?? [];
        if (rows.isEmpty) return const SizedBox.shrink();
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextButton(
              onPressed: () => setState(() => reveal = !reveal),
              child: const Text('查看本机保存的注销申请编号')),
          if (reveal)
            for (final r in rows) ...[
              SelectableText('申请编号：${r.requestId}'),
              Text(r.confirmed
                  ? '账号访问已关闭；资料、历史备份和供应商处理仍需分别核对。'
                  : '注销结果尚未确认，请凭此编号联系工作人员核对；不要重复提交。'),
              TextButton(
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: r.requestId)),
                  child: const Text('复制申请编号')),
            ]
        ]);
      });
}
