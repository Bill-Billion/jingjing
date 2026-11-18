import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../customization/private_draft_guard.dart';
import '../engagement/community_support.dart';
import '../stock/v5_support.dart';
import '../trade/trade_widgets.dart';

class ConsumerLimits {
  ConsumerLimits(this.raw, String party) {
    v5Require(v5Id(raw['id']) &&
        raw['party_id'] == party &&
        v5Int(raw['object_version'], min: 1) &&
        raw['scope'] == 'PERSONAL_CASH_ONLY' &&
        raw['accounting_basis'] ==
            'GROSS_MONTH_REQUESTS_RECEIPTS_AND_OPEN_ATTEMPTS' &&
        v5Date(raw['as_of']));
    final limits = v5Map(raw['limits']),
        usage = v5Map(raw['usage']),
        pending = v5Map(raw['pending']);
    for (final k in ['RECHARGE', 'PAYMENT']) {
      final limit = limits[k], u = v5Map(usage[k]), p = pending[k];
      v5Require((limit == null || v5Int(limit)) &&
          v5Int(u['used_minor']) &&
          v5Int(u['pending_minor']) &&
          u['pending_minor'] <= u['used_minor'] &&
          (u['remaining_minor'] == null || v5Int(u['remaining_minor'])) &&
          u['over_limit'] is bool);
      if (p != null) {
        final d = v5Map(p);
        v5Require((d['monthly_limit_minor'] == null ||
                v5Int(d['monthly_limit_minor'])) &&
            v5Date(d['confirm_after']) &&
            v5Date(d['requested_at']) &&
            v5Int(d['cooling_hours'], min: 1));
      }
    }
    v5Require(v5Map(raw['period'])['timezone'] == 'Asia/Shanghai');
  }
  final Map<String, dynamic> raw;
  int get version => raw['object_version'] as int;
}

class ConsumerLimitsPage extends StatelessWidget {
  const ConsumerLimitsPage({super.key});
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'wallet',
      route: '/wallet/limits',
      personal: true,
      builder: (s) => _LimitsScreen(session: s));
}

class _LimitsScreen extends StatefulWidget {
  const _LimitsScreen({required this.session});
  final AccountSession session;
  @override
  State<_LimitsScreen> createState() => _LimitsScreenState();
}

class _LimitsScreenState extends CommunityPageState<_LimitsScreen> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'wallet';
  @override
  String get recoveryPrefix => '/api/v1/wallet/consumer-controls';
  ConsumerLimits? data;
  final history = <Map<String, dynamic>>[];
  String? cursor;
  String kind = 'PAYMENT';
  bool agreed = false;
  late final amount = field();
  final guard = GlobalKey<PrivateDraftGuardState>();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void clearPrivate() {
    data = null;
    history.clear();
    cursor = null;
    agreed = false;
  }

  @override
  void validateResult(Map<String, dynamic> r) {
    ConsumerLimits(r, session.partyId!);
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      checking = true;
      error = null;
      agreed = false;
    });
    try {
      final r =
          ConsumerLimits(await api.read('consumer-controls'), session.partyId!);
      if (!mounted || t != ticket) return;
      setState(() => data = r);
    } catch (e) {
      if (mounted && t == ticket) {
        data = null;
        fail(e);
      }
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  @override
  Future<void> reconcilePending() async {
    await load();
    if (data == null) throw const AccountError(503, 'CURRENT_LIMITS_REQUIRED');
  }

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    await load();
    guard.currentState?.markSaved();
  }

  Future<void> change(String action) async {
    if (!enabled || checking || !agreed || data == null) return;
    final body = <String, dynamic>{'kind': kind};
    try {
      if (action == 'change') {
        body['monthly_limit_minor'] = amount.text.trim().isEmpty
            ? null
            : communityMinor(amount.text, '月度上限', zero: true);
      }
    } catch (e) {
      setState(() => fail(e));
      return;
    }
    final suffix = 'consumer-controls${action == 'change' ? '' : '/$action'}';
    final result = await act(suffix, body, version: data!.version);
    if (!mounted) return;
    if (result != null) {
      agreed = false;
      amount.clear();
      guard.currentState?.markSaved();
    } else if (recovery == null) {
      final message = error;
      await load();
      if (mounted) setState(() => error = message);
    }
  }

  Future<void> readHistory({bool more = false}) async {
    if (busy || checking || more && cursor == null) return;
    final t = ++ticket, previous = cursor;
    setState(() {
      checking = true;
      error = null;
      if (!more) {
        history.clear();
        cursor = null;
      }
    });
    try {
      final r = await api.read('consumer-controls/history',
          query: {'limit': 20, if (more) 'cursor': previous});
      final items = communityItems(r);
      for (final i in items) {
        communityRecord(i, kind: 'CONSUMER_LIMIT_EVENT');
      }
      communityRequire(r['next_cursor'] == null ||
          communityId(r['next_cursor']) && r['next_cursor'] != previous);
      if (!mounted || t != ticket) return;
      setState(() {
        history.addAll(items);
        cursor = r['next_cursor'] as String?;
      });
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  String money(Object? n) => n == null ? '本人未另设上限' : communityMoney(n);
  @override
  Widget build(BuildContext context) {
    final d = data?.raw,
        p = d == null ? null : communityMap(d['pending'])[kind],
        pending = communityMaybeMap(p);
    final ready = p != null &&
        DateTime.parse('${d!['as_of']}')
                .compareTo(DateTime.parse('${pending['confirm_after']}')) >=
            0;
    return PrivateDraftGuard(
        key: guard,
        session: session,
        controllers: controllers,
        value: () => [kind, agreed],
        locked: busy || checking || recovery != null,
        child: tradeScaffold(
            context,
            '个人月度限额',
            [
              communityHeading(
                  '本人充值与现金消费限额', '降低立即生效；提高或取消上限须等待后本人确认。设置不开户、不充值、不创建会员。'),
              ...feedback,
              tradeButton('刷新本人限额', busy || checking ? null : load,
                  outline: true),
              if (d != null) ...[
                communityFact('统计月份（北京时间）', communityMap(d['period'])['month']),
                communityFact('服务器核对时间', communityDate(d['as_of'])),
                for (final k in ['PAYMENT', 'RECHARGE'])
                  communitySection(k == 'PAYMENT' ? '本人现金消费' : '本人充值', [
                    communityFact(
                        '当前月度上限', money(communityMap(d['limits'])[k])),
                    communityFact(
                        '已占用额度',
                        money(communityMap(
                            communityMap(d['usage'])[k])['used_minor'])),
                    communityFact(
                        '其中待确认',
                        money(communityMap(
                            communityMap(d['usage'])[k])['pending_minor'])),
                    communityFact(
                        '剩余额度',
                        money(communityMap(
                            communityMap(d['usage'])[k])['remaining_minor'])),
                    if (communityMap(d['pending'])[k] != null) ...[
                      communityFact(
                          '申请调整为',
                          money(communityMap(communityMap(d['pending'])[k])[
                              'monthly_limit_minor'])),
                      communityFact(
                          '本人最早可确认时间',
                          communityDate(communityMap(
                              communityMap(d['pending'])[k])['confirm_after'])),
                    ] else
                      const Text('本类别没有待生效申请。')
                  ]),
                appNotice(
                    '0停止新的相应付费，留空只表示本人未另设上限，平台和年龄限制仍有效。占用包含待确认请求；退款退钱但不恢复本月额度，取消未发送的付款才释放占用。'),
                communitySelect(
                    '本次额度类别',
                    kind,
                    const [('PAYMENT', '本人现金消费'), ('RECHARGE', '本人充值')],
                    enabled && !checking
                        ? (v) => setState(() {
                              kind = v!;
                              agreed = false;
                            })
                        : null),
                communityField(amount, '新月度上限（元；留空申请取消本人上限）',
                    keyboard:
                        const TextInputType.numberWithOptions(decimal: true),
                    enabled: enabled && !checking),
                communityCheck(
                    '已核对当前额度、占用与本次办理事项',
                    agreed,
                    enabled && !checking
                        ? (v) => setState(() => agreed = v == true)
                        : null),
                tradeButton(
                    '修改本人的月度上限',
                    enabled && !checking && agreed
                        ? () => change('change')
                        : null),
                if (p != null) ...[
                  appNotice('到期不会自动提高，须刷新并由本人确认。'),
                  tradeButton(
                      '本人确认已到期的提额申请',
                      enabled && !checking && agreed && ready
                          ? () => change('confirm')
                          : null),
                  tradeButton(
                      '取消待生效的提额申请',
                      enabled && !checking && agreed
                          ? () => change('cancel')
                          : null,
                      outline: true)
                ],
              ],
              tradeButton('查看本人变更记录', busy || checking ? null : readHistory,
                  outline: true),
              for (final r in history)
                communitySection('额度变更记录', [
                  communityFact(
                      '操作',
                      const {
                        'CHANGE': '修改额度',
                        'CONFIRM': '本人确认提高',
                        'CANCEL': '取消提额申请'
                      }[communityMap(r['data'])['action']]),
                  communityFact(
                      '类别',
                      communityMap(r['data'])['kind'] == 'PAYMENT'
                          ? '现金消费'
                          : '充值'),
                  communityFact(
                      '发生时间', communityDate(communityMap(r['data'])['at'])),
                  communityFact(
                      '原上限',
                      money(communityMap(
                          communityMap(communityMap(r['data'])['before'])[
                              'limits'])[communityMap(r['data'])['kind']])),
                  communityFact(
                      '操作后上限',
                      money(communityMap(
                          communityMap(communityMap(r['data'])['after'])[
                              'limits'])[communityMap(r['data'])['kind']])),
                ]),
              if (cursor != null)
                tradeButton('读取更多变更',
                    busy || checking ? null : () => readHistory(more: true),
                    outline: true),
            ],
            locked: busy || recovery != null,
            onBack: () => guard.currentState?.back()));
  }
}
