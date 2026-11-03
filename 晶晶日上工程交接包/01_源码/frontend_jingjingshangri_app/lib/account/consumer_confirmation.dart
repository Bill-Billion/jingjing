import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'account_api.dart';
import 'account_session.dart';
import 'account_theme.dart';

Map<String, dynamic>? consumptionTarget(
    String path, Map<String, dynamic>? b, String key) {
  if (path == '/api/v1/trade/payments' &&
      b?['order_id'] is String &&
      b?['installment_key'] is String) {
    return {
      'kind': 'PAYMENT',
      'order_id': b!['order_id'],
      'installment_key': b['installment_key'],
      'request_key': key
    };
  }
  if (path == '/api/v1/wallet/recharges' && b?['amount_minor'] is int) {
    return {
      'kind': 'RECHARGE',
      'amount_minor': b!['amount_minor'],
      'request_key': key
    };
  }
  if (path == '/api/v1/redemption/draws' &&
      b?['pool_id'] is String &&
      [1, 10].contains(b?['count'])) {
    return {
      'kind': 'LOTTERY',
      'pool_id': b!['pool_id'],
      'count': b['count'],
      'request_key': key
    };
  }
  final m = RegExp(r'^/api/v1/trade/payments/([a-f0-9-]{36})/reconciliation$')
      .firstMatch(path);
  return m == null ? null : {'kind': 'PAYMENT_RECORD', 'payment_id': m[1]};
}

Map<String, dynamic> consumerPreview(
    Map<String, dynamic> p, Map<String, dynamic> target) {
  final t = p['target'];
  // PAYMENT_RECORD is resolved server-side to the original PAYMENT binding.
  // The published preview deliberately omits payment_id; confirmation must
  // still send the original PAYMENT_RECORD target, never the expanded fields.
  final matches = t is Map &&
      (target['kind'] == 'PAYMENT_RECORD'
          ? t.length == 5 &&
              t['kind'] == 'PAYMENT' &&
              t['order_id'] is String &&
              RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
                  .hasMatch(t['order_id']) &&
              t['installment_key'] is String &&
              (t['installment_key'] as String).isNotEmpty &&
              (t['installment_key'] as String).length <= 128 &&
              t['request_key'] is String &&
              (t['request_key'] as String).isNotEmpty &&
              (t['request_key'] as String).length <= 128 &&
              t['amount_minor'] is int &&
              t['amount_minor'] > 0 &&
              t['amount_minor'] <= 9007199254740991
          : target.entries.every((x) => t[x.key] == x.value));
  if (p['configured'] is! bool ||
      p['required'] is! bool ||
      p['reasons'] is! List ||
      (p['reasons'] as List).any((x) => x is! String) ||
      !matches ||
      p['required'] == true &&
          (p['configured'] != true ||
              p['message'] is! String ||
              '${p['message']}'.trim().isEmpty ||
              !RegExp(r'^[a-f0-9]{64}$').hasMatch('${p['preview_sha256']}') ||
              p['expires_in_seconds'] is! int ||
              p['expires_in_seconds'] < 1)) {
    throw const AccountError(503, '消费提示无法核对，未继续消费', uncertain: true);
  }
  return p;
}

class _Consumption {
  _Consumption(this.target);
  final Map<String, dynamic> target;
  bool sent = false;
  String? ackKey, hash;
}

class ConsumerConfirmationController extends ChangeNotifier {
  ConsumerConfirmationController(this.session) {
    _epoch = session.epoch;
    session.addListener(_changed);
  }
  final AccountSession session;
  final _operations = <String, _Consumption>{};
  final _random = Random.secure();
  int _epoch = 0, generation = 0;
  bool _disposed = false, _active = false;
  String? phase, message;
  Map<String, dynamic>? preview;
  Completer<bool>? _choice;
  static const prefix = '/api/v1/wallet/consumer-risk';
  static const renewal = {
    'CONSUMER_RISK_CONFIRMATION_REQUIRED',
    'CONSUMER_RISK_CONFIRMATION_EXPIRED',
    'CONSUMER_RISK_PREVIEW_CHANGED'
  };
  void _publish() {
    if (!_disposed) notifyListeners();
  }

  String _key() =>
      'consumer-${List.generate(24, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
  void _changed() {
    if (_epoch == session.epoch) return;
    _epoch = session.epoch;
    generation++;
    _operations.clear();
    choose(false);
    _active = false;
    preview = null;
    message = null;
    _publish();
  }

  void choose(bool value) {
    final c = _choice;
    _choice = null;
    phase = null;
    if (c != null && !c.isCompleted) c.complete(value);
    _publish();
  }

  void _check(int g) {
    if (_disposed ||
        g != generation ||
        session.epoch != _epoch ||
        !session.isLoggedIn) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<void> _ask(String p, int g) async {
    _check(g);
    phase = p;
    _choice = Completer<bool>();
    final future = _choice!.future;
    _publish();
    final ok = await future;
    _check(g);
    if (!ok) throw const AccountError(409, '已停止本次消费，请核对原业务状态');
  }

  Future<Map<String, dynamic>> guard(
      String path,
      Map<String, dynamic>? body,
      String key,
      String? party,
      Future<Map<String, dynamic>> Function() send,
      ConsumerTransport transport) async {
    final target = consumptionTarget(path, body, key);
    if (target == null) return send();
    if (!session.isLoggedIn || party != session.partyId) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
    if (session.selected?['party']?['kind'] != 'PERSON') return send();
    if (_active) throw const AccountError(409, '请先处理当前消费确认');
    _active = true;
    final g = generation,
        c = _operations.putIfAbsent(key, () => _Consumption(target));
    try {
      for (;;) {
        _check(g);
        if (!c.sent) {
          if (c.ackKey != null) {
            message = '上次阅读确认结果待核对，将沿原确认请求恢复。';
            await _ask('recover', g);
            try {
              await transport('POST', '$prefix/confirm', key: c.ackKey, body: {
                'target': c.target,
                'preview_sha256': c.hash,
                'read_confirmed': true
              });
            } on AccountError catch (e) {
              if (renewal.contains(e.code)) {
                c.ackKey = null;
                c.hash = null;
              } else {
                rethrow;
              }
            }
          }
          Map<String, dynamic>? p;
          try {
            p = consumerPreview(
                await transport('GET', '$prefix/preview', query: c.target),
                c.target);
          } on AccountError catch (e) {
            if (c.target['kind'] != 'PAYMENT_RECORD' ||
                e.code != 'CONSUMER_TARGET_NOT_PENDING') {
              rethrow;
            }
          }
          _check(g);
          preview = p;
          if (p != null &&
              p['configured'] == false &&
              c.target['kind'] == 'LOTTERY') {
            final pool = await transport(
                'GET', '/api/v1/redemption/pools/${c.target['pool_id']}');
            _check(g);
            if (pool['data']?['config']?['source_profile'] ==
                'CONTRACT_20261029') {
              throw const AccountError(409, 'CONSUMER_POLICY_NOT_CONFIGURED');
            }
          }
          if (p?['required'] == true) {
            message = '请阅读本次提示并主动确认；确认成功后才继续原操作。';
            await _ask('read', g);
            c.ackKey = _key();
            c.hash = p!['preview_sha256'];
            try {
              final ack = await transport('POST', '$prefix/confirm',
                  key: c.ackKey,
                  body: {
                    'target': c.target,
                    'preview_sha256': c.hash,
                    'read_confirmed': true
                  });
              _check(g);
              if (ack['current_status'] != 'CONFIRMED' ||
                  ack['owner_party_id'] != party ||
                  ack['data']?['preview']?['preview_sha256'] != c.hash) {
                throw const AccountError(503, '阅读确认返回无法核对，请恢复原确认',
                    uncertain: true);
              }
            } on AccountError catch (e) {
              if (renewal.contains(e.code)) {
                c.ackKey = null;
                c.hash = null;
                message = '规则或消费状态已变化，请重新读取并确认。';
                await _ask('preview', g);
                continue;
              }
              rethrow;
            }
          }
        }
        _check(g);
        c.sent = true;
        try {
          final result = await send();
          _check(g);
          if (_operations.length > 32) {
            _operations.remove(_operations.keys.first);
          }
          return result;
        } on AccountError catch (e) {
          if (renewal.contains(e.code)) {
            c.sent = false;
            c.ackKey = null;
            c.hash = null;
            message = '原确认已过期或规则变化；原消费请求保留，请重新读取。';
            await _ask('preview', g);
            continue;
          }
          rethrow;
        }
      }
    } on AccountError catch (e) {
      if (g == generation && !e.uncertain) _operations.remove(key);
      rethrow;
    } finally {
      if (g == generation) {
        _active = false;
        phase = null;
        preview = null;
        message = null;
        _choice = null;
        _publish();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    generation++;
    session.removeListener(_changed);
    choose(false);
    super.dispose();
  }
}

class ConsumerConfirmation extends StatefulWidget {
  const ConsumerConfirmation({super.key, required this.child});
  final Widget child;
  @override
  State<ConsumerConfirmation> createState() => _ConsumerConfirmationState();
}

class _ConsumerConfirmationState extends State<ConsumerConfirmation> {
  ConsumerConfirmationController? controller;
  AccountSession? session;
  bool read = false;
  String? lastPhase;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (controller == null) {
      session = context.read<AccountSession>();
      controller = ConsumerConfirmationController(session!);
      session!.api.consumptionGuard = controller!.guard;
    }
  }

  @override
  void dispose() {
    session?.api.consumptionGuard = null;
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: controller!,
      child: widget.child,
      builder: (_, child) {
        final c = controller!, p = c.preview;
        if (lastPhase != c.phase) {
          lastPhase = c.phase;
          read = false;
        }
        final amount = p?['target']?['amount_minor'];
        return Stack(children: [
          child!,
          if (c.phase != null)
            Positioned.fill(
                child: Material(
                    color: Colors.black54,
                    child: SafeArea(
                        child: Center(
                            child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 620),
                                child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Material(
                                        color: AccountTheme.canvas,
                                        child: SingleChildScrollView(
                                            padding: const EdgeInsets.all(20),
                                            child: Column(
                                                mainAxisSize: MainAxisSize.min,
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  const Text('本次消费提示',
                                                      style: TextStyle(
                                                          fontSize: 22,
                                                          fontWeight:
                                                              FontWeight.bold)),
                                                  const SizedBox(height: 12),
                                                  Text(c.message ?? ''),
                                                  if (c.phase == 'read' &&
                                                      p != null) ...[
                                                    const SizedBox(height: 12),
                                                    Text('${p['message']}',
                                                        style: const TextStyle(
                                                            fontWeight:
                                                                FontWeight
                                                                    .bold)),
                                                    if (amount is int)
                                                      Text(p['target']
                                                                  ['kind'] ==
                                                              'LOTTERY'
                                                          ? '本次 $amount 晶钻'
                                                          : '本次 ¥ ${(amount / 100).toStringAsFixed(2)}'),
                                                    for (final r
                                                        in p['reasons'] as List)
                                                      Text(
                                                          '• ${consumerReason(r.toString())}'),
                                                    Text(
                                                        '依据规则 ${p['rule_id']}；确认 ${p['expires_in_seconds']} 秒内有效。最终结果以原业务记录为准。'),
                                                    CheckboxListTile(
                                                        contentPadding:
                                                            EdgeInsets.zero,
                                                        value: read,
                                                        onChanged: (v) =>
                                                            setState(() =>
                                                                read =
                                                                    v == true),
                                                        title: const Text(
                                                            '我已阅读本次提示，愿意继续原操作'))
                                                  ],
                                                  Wrap(spacing: 12, children: [
                                                    TextButton(
                                                        onPressed: () =>
                                                            c.choose(false),
                                                        child:
                                                            const Text('暂不继续')),
                                                    FilledButton(
                                                        onPressed: c.phase ==
                                                                    'read' &&
                                                                !read
                                                            ? null
                                                            : () =>
                                                                c.choose(true),
                                                        child: Text(c.phase ==
                                                                'read'
                                                            ? '已阅读，继续原操作'
                                                            : c.phase ==
                                                                    'recover'
                                                                ? '恢复原阅读确认'
                                                                : '重新读取当前提示'))
                                                  ])
                                                ])))))))))
        ]);
      });
}

String consumerReason(String code) =>
    const {
      'FREQUENT_CASH_REQUESTS': '短时多笔消费',
      'LARGE_RECHARGE': '单次大额充值',
      'LARGE_NIGHT_SPENDING': '夜间大额消费',
      'RATIONAL_LOTTERY_PARTICIPATION': '抽奖前理性参与提示',
      'FREQUENT_LOTTERY': '频繁抽奖'
    }[code] ??
    code;
