import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../stock/v5_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'wallet_api.dart';
import 'wallet_models.dart';

class WalletPage extends StatelessWidget {
  const WalletPage({super.key, this.mode = 'summary', this.kind, this.orderId});
  final String mode;
  final String? kind, orderId;
  @override
  Widget build(BuildContext context) => V5Gate(
      domain: 'wallet',
      route: '/wallet/$mode',
      personal: true,
      builder: (s) =>
          _WalletScreen(session: s, mode: mode, kind: kind, orderId: orderId));
}

class _WalletScreen extends StatefulWidget {
  const _WalletScreen(
      {required this.session, required this.mode, this.kind, this.orderId});
  final AccountSession session;
  final String mode;
  final String? kind, orderId;
  @override
  State<_WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<_WalletScreen> {
  late final api = WalletApi(widget.session);
  final rules = <WalletRule>[],
      rows = <WalletRecord>[],
      syncCandidates = <WalletRecord>[];
  WalletSummary? summary;
  String kind = 'RECHARGE';
  String? ruleId, cursor, error, notice, ruleNotice;
  bool busy = false, missing = false;
  int ticket = 0, checkForm = 0;
  @override
  void initState() {
    super.initState();
    kind = widget.kind ?? 'RECHARGE';
    load();
  }

  @override
  void dispose() {
    ticket++;
    summary = null;
    rows.clear();
    super.dispose();
  }

  Future<int?> load({bool more = false, bool propagateError = false}) async {
    if (more && cursor == null) return null;
    final t = ++ticket, epoch = widget.session.epoch, p = api.owner();
    setState(() {
      busy = true;
      error = null;
      ruleNotice = null;
      if (!more) {
        rows.clear();
        cursor = null;
      }
    });
    try {
      switch (widget.mode) {
        case 'summary':
        case 'points':
        case 'recharge':
        case 'level-six':
          summary = await api.summary();
          missing = false;
        case 'scout':
          summary = await api.summary();
          missing = false;
          rules.clear();
          try {
            rules.addAll(await api.rules());
          } on AccountError {
            ruleNotice = '等级与续年规则暂未读到，已保留真实成长和会员年金额；可重新核对。';
          }
        case 'rules':
          rules.clear();
          rules.addAll(await api.rules());
        case 'records':
          final r = await api.records(kind, cursor: more ? cursor : null);
          rows.addAll(r.items);
          cursor = r.cursor;
        case 'sync':
          syncCandidates.clear();
          String? next;
          final seen = <String>{};
          do {
            final r = await api.records('EARNING', cursor: next);
            syncCandidates.addAll(
                r.items.where((e) => e.data['source_kind'] == 'CONSUMPTION'));
            next = r.cursor;
            if (next != null) v5Require(seen.add(next));
          } while (next != null);
        default:
          throw const AccountError(400, 'INVALID_PATH');
      }
      api.check(epoch, p);
      if (mounted && t == ticket) setState(() {});
      return null;
    } on AccountError catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          if (['summary', 'points', 'scout'].contains(widget.mode) &&
              e.status == 404 &&
              e.code == 'WALLET_NOT_FOUND') {
            missing = true;
            summary = null;
          } else {
            error = v5Error(e);
            summary = null;
          }
        });
      }
      if (propagateError) rethrow;
      return null;
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  void go(String route) => Navigator.pushNamed(context, route);
  @override
  Widget build(BuildContext context) {
    final s = summary,
        title = switch (widget.mode) {
          'points' => '晶钻中心',
          'scout' => '星探中心',
          'rules' => '阅读个人账本规则',
          'recharge' => '余额充值',
          'records' => walletKinds[kind] ?? '本人账本明细',
          'level-six' => '六级独立资质',
          'sync' => '核对原订单晶钻',
          _ => '消费钱包'
        };
    return V5Frame(
        api: api,
        title: title,
        footer:
            s != null && ['summary', 'points', 'scout'].contains(widget.mode)
                ? _footer()
                : null,
        children: [
          tradeHeading(widget.mode == 'scout' ? '进阶星探' : title,
              eyebrow: switch (widget.mode) {
                'summary' => '当前托管渠道暂未接通',
                'points' => '每次创作，都留下光',
                'scout' => '消费成长 / 认真出品',
                _ => '每一笔有来处 / 消费余额与艺人收入分开',
              }),
          V5RecoveryPanel(
              api: api,
              label: api.recoveryLabel,
              restore: api.restoreOperation,
              onRestored: (r) => go(r['kind'] == 'ACCOUNT'
                  ? '/wallet'
                  : '/wallet/records?kind=${r['kind']}')),
          if (busy) const LinearProgressIndicator(),
          if (error != null) appNotice(error!, icon: Icons.error_outline),
          if (notice != null) appNotice(notice!),
          if (ruleNotice != null) appNotice(ruleNotice!),
          if (missing) ...[
            appNotice('本人尚未开立消费者账本。请先阅读并接受当前有效规则，不能将尚无账本显示成余额已经到账。'),
            tradeButton('阅读规则并开立本人账本', () => go('/wallet/rules'))
          ],
          if (widget.mode == 'summary' && s != null) ...[
            tradeSection('我的消费者余额', [
              _metric('可消费余额', v5Money(s.raw['available_balance_minor'])),
              tradeFact('账面余额', v5Money(s.raw['recorded_balance_minor'])),
              tradeFact('付款中预留', v5Money(s.raw['reserved_balance_minor'])),
              appNotice('充值托管与余额付款服务尚未接通。这里按服务器展示真实账本，不提供提现或转账。')
            ]),
            tradeButton('查看晶钻与来源', () => go('/wallet/points'), outline: true),
            tradeButton('星探会员年与成长进度', () => go('/wallet/scout'), outline: true),
            tradeButton('艺人收入与收益收款', () => go('/finance'), outline: true),
            tradeButton('阅读规则与本次充值限制', () => go('/wallet/rules'),
                outline: true),
            tradeButton('核对某笔原订单的晶钻', () => go('/wallet/sync'), outline: true),
            tradeButton('六级独立资质申请与进度', () => go('/wallet/level-six'),
                outline: true),
          ],
          if (widget.mode == 'points' && s != null) ...[
            tradeSection('我的晶钻与消费成长', [
              _metric('当前可用晶钻', s.raw['available_points']),
              tradeFact('退款待冲回', s.raw['points_pending_reversal']),
              tradeFact('消费成长', s.raw['qualifying_growth']),
              appNotice('使用、过期和免费奖励不会冒算消费成长；退款才按原消费承诺冲回成长。不足晶钻由未来奖励抵扣，不追收现金。'),
              tradeFact('当前用途限制原因',
                  _reason(s.raw['points_block_reason'], '当前已接用途按具体业务规则核对'))
            ]),
            tradeButton('核对某笔原订单的晶钻', () => go('/wallet/sync'), outline: true),
            V5Form(
                key: ValueKey(checkForm),
                api: api,
                title: '北京时间每日签到',
                action: '按本人原规则核对今日签到',
                suffix: '/check-in',
                fields: const [],
                buildBody: (_) => {},
                parse: (d) => api.validate(d, kind: 'EARNING'),
                reload: () => load(propagateError: true),
                onSuccess: (_) async {
                  await load();
                  if (mounted) {
                    setState(() {
                      checkForm++;
                      notice = '今日签到已按原规则由服务器核对；免费晶钻不增加消费成长。';
                    });
                  }
                }),
            appNotice(
                '评价与分享奖励尚未开放。兑换、抽奖和投票须各自读取专用业务规则与资格，不用钱包旧汇总标志冒充已开放或永久关闭。'),
            tradeButton('查看实际通告发布资格', () => go('/notices/new'), outline: true),
          ],
          if (widget.mode == 'scout' && s != null) ...[
            tradeBanner(
                s.membership['active'] == true
                    ? '${s.membership['level']}级 · 星探会员'
                    : '星探特权暂未生效',
                s.membership['valid_until'] == null
                    ? _reason(s.membership['reason'], '请核对当前会员年资格')
                    : '会员有效至 ${tradeDate(s.membership['valid_until'])}'),
            _metric('合格消费成长', s.raw['qualifying_growth']),
            ..._scoutProgress(s),
            tradeSection('星探会员年与实际资格', [
              tradeFact(
                  '当前有效会员', s.membership['active'] == true ? '有效' : '未生效或已到期'),
              tradeFact('当前有效等级', s.membership['level']),
              tradeFact('已达到成长等级', s.membership['attained_level']),
              tradeFact(
                  '会员年有效至',
                  s.membership['valid_until'] == null
                      ? '尚无有效会员年'
                      : tradeDate(s.membership['valid_until'])),
              tradeFact(
                  '续年累计充值进度', v5Money(s.membership['renewal_credit_minor'])),
              tradeFact('资格原因', _reason(s.membership['reason'], '实际资格有效')),
              if (s.membership['level_six_review_required'] == true)
                appNotice('成长门槛已达到六级所需条件，仍须另行独立资质审核。')
            ]),
            appNotice('等级由真实消费成长，不提供付费升级；充值余额与成长、可用晶钻分别记账。'),
            tradeButton('六级独立资质申请与进度', () => go('/wallet/level-six'),
                outline: true),
          ],
          if (widget.mode == 'rules') ...[
            if (!busy && rules.isEmpty && error == null)
              appNotice('尚无本人可接受的有效规则；未配置时不开账户、不发奖励。'),
            DropdownButtonFormField<String>(
                initialValue: ruleId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '选择独立审核后生效的规则'),
                items: rules
                    .map((r) => DropdownMenuItem(
                        value: r.id, child: Text(r.rule['version'])))
                    .toList(),
                onChanged: busy || api.pending('/accounts') != null
                    ? null
                    : (v) => setState(() => ruleId = v)),
            if (ruleId != null && rules.any((r) => r.id == ruleId))
              ..._ruleBody(rules.firstWhere((r) => r.id == ruleId)),
          ],
          if (widget.mode == 'recharge' && s != null) ...[
            tradeSection('当前真实余额', [
              _metric('可消费余额', v5Money(s.raw['available_balance_minor'])),
              tradeFact('预留', v5Money(s.raw['reserved_balance_minor']))
            ]),
            appNotice(const bool.fromEnvironment('CLIENT_TEST_ONLY')
                ? '模拟余额充值，不涉及真实资金。成功后记入测试账本，充值不直接赠消费晶钻。'
                : '消费者充值托管尚未接通。本页按实际接口核对未开通结果；未产生充值、到账或自动扣款事实。充值不是会费，也不直接赠消费晶钻。'),
            V5Form(
                api: api,
                title: '核对本次充值',
                action: const bool.fromEnvironment('CLIENT_TEST_ONLY')
                    ? '模拟充值'
                    : '核对充值服务状态',
                suffix: '/recharges',
                fields: const [V5Field('amount', '本次申请充值金额（元）', type: 'money')],
                restore: (b) => {
                      'amount':
                          '${(b['amount_minor'] as int) ~/ 100}.${((b['amount_minor'] as int) % 100).toString().padLeft(2, '0')}'
                    },
                buildBody: (v) => {'amount_minor': v5InputMoney(v['amount'])},
                parse: (d) => api.validate(d, kind: 'RECHARGE'),
                reload: () => load(propagateError: true),
                onSuccess: (_) => go('/wallet/records?kind=RECHARGE')),
          ],
          if (widget.mode == 'records') ...[
            DropdownButtonFormField<String>(
                initialValue: kind,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '本人明细类别'),
                items: walletKinds.entries
                    .map((e) =>
                        DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged: busy
                    ? null
                    : (v) {
                        setState(() => kind = v!);
                        load();
                      }),
            for (final r in rows) ..._recordBody(r),
            if (!busy && rows.isEmpty) appNotice('本类当前没有本人可读的真实记账记录。'),
          ],
          if (widget.mode == 'sync') ...[
            appNotice('仅补查本人已有消费晶钻承诺对应的原订单。须同时满足真实付款、履约和售后条件；未符合时保留原等待原因。'),
            V5Form(
                api: api,
                title: '选择原消费承诺',
                action: '按原订单核对晶钻条件',
                suffix: '/earnings/sync',
                fields: [
                  V5Field('order_id', '本人已有承诺的原订单', choices: {
                    for (final r in syncCandidates)
                      r.data['order_id']:
                          '${_category(r.data['category'])} · ${walletStates[r.status]} · ${r.data['points']} 晶钻'
                  })
                ],
                initial: syncCandidates
                        .any((r) => r.data['order_id'] == widget.orderId)
                    ? {'order_id': widget.orderId}
                    : {},
                buildBody: (v) {
                  if (!syncCandidates
                      .any((r) => r.data['order_id'] == v['order_id'])) {
                    throw const AccountError(400, 'INVALID_ID');
                  }
                  return {'order_id': v['order_id']};
                },
                parse: (d) => api.validate(d, kind: 'EARNING'),
                reload: () => load(propagateError: true),
                onSuccess: (d) => setState(() => notice =
                    WalletRecord(d, api.owner()).raw['pending_reason'] == null
                        ? '原订单实际晶钻条件已核对，请查看该批次真实状态。'
                        : '当前仍等待：${_reason(d['pending_reason'], '请核对原订单')}')),
          ],
          if (widget.mode == 'level-six' && s != null) ...[
            tradeFact('服务器实际资格', s.membership['level']),
            tradeFact('成长对应已达等级', s.membership['attained_level']),
            appNotice('提交资质不直接获得六级，也不增加消费成长。当前会员年和成长须分别有效，由独立人员核对证据。'),
            V5Form(
                api: api,
                title: '提交独立资质',
                action: '提交六级独立资质审核',
                suffix: '/level-six',
                fields: const [
                  V5Field('valid_from', '资质有效开始', type: 'datetime'),
                  V5Field('valid_until', '资质有效截止', type: 'datetime'),
                  V5Field('terms', '真实资质范围与说明', type: 'multiline')
                ],
                restore: (b) => {
                      ...b,
                      'evidence_asset_ids':
                          (b['evidence_asset_ids'] as List).join(', ')
                    },
                buildBody: (v) {
                  final ids = v5InputIds(v['evidence_asset_ids'] ?? '');
                  if (ids.isEmpty || ids.length > 10) {
                    throw const AccountError(
                        400, 'WALLET_QUALIFICATION_INVALID');
                  }
                  return {
                    'valid_from': v5InputDate(v['valid_from']),
                    'valid_until': v5InputDate(v['valid_until']),
                    'terms': v['terms'],
                    'evidence_asset_ids': ids
                  };
                },
                parse: (d) => api.validate(d, kind: 'LEVEL_REVIEW'),
                reload: () => load(propagateError: true),
                onSuccess: (_) => go('/wallet/records?kind=LEVEL_REVIEW'),
                extra: (v, set, enabled) => [
                      SupplyFiles(
                          api: SupplyApi(widget.session),
                          purpose: 'RIGHTS_EVIDENCE',
                          ids: v5InputIds(v['evidence_asset_ids'] ?? ''),
                          enabled: enabled,
                          onChanged: (ids) =>
                              set('evidence_asset_ids', ids.join(', ')))
                    ]),
            tradeButton(
                '查看本人历次资质进度', () => go('/wallet/records?kind=LEVEL_REVIEW'),
                outline: true),
          ],
          if (cursor != null)
            tradeButton('继续读取下一页', busy ? null : () => load(more: true),
                outline: true),
          tradeButton('重新核对本页', busy ? null : () => load(), outline: true),
        ]);
  }

  List<Widget> _scoutProgress(WalletSummary s) {
    final rule = rules.where((r) => r.id == s.raw['rule_id']).firstOrNull;
    if (rule == null) {
      return [
        if (ruleNotice == null) appNotice('当前未返回与本人账本对应的规则，成长和续年进度比例待核对。')
      ];
    }
    final growth = s.raw['qualifying_growth'] as int;
    final levels = List<int>.from(rule.rule['growth_thresholds']);
    final next = levels.where((n) => n > growth).firstOrNull;
    final renewal = s.membership['renewal_credit_minor'] as int;
    final threshold = rule.rule['topup_threshold_minor'] as int;
    return [
      tradeSection('下一成长等级', [
        if (next == null)
          const Text('已达到本版最高成长门槛，实际资格仍按独立审核核对。')
        else ...[
          LinearProgressIndicator(
              value: (growth / next).clamp(0, 1).toDouble()),
          const SizedBox(height: 10),
          Text('距下一成长门槛还差 ${next - growth} 消费成长',
              style: const TextStyle(fontSize: 13, color: AccountTheme.muted)),
        ],
      ]),
      tradeSection('本会员年充值进度', [
        LinearProgressIndicator(
            value: (renewal / threshold).clamp(0, 1).toDouble()),
        const SizedBox(height: 10),
        Text(
            '${v5Money(renewal)} / ${v5Money(threshold)} · ${renewal >= threshold ? '已达本版门槛' : '尚未达到本版门槛'}',
            style: const TextStyle(fontSize: 13, color: AccountTheme.muted)),
        const SizedBox(height: 10),
        const Text('会员资格以服务器核实为准。充值本身不发晶钻，也不增加消费成长。',
            style: TextStyle(
                fontSize: 12, color: AccountTheme.muted, height: 1.6)),
      ]),
    ];
  }

  Widget _footer() => AnimatedBuilder(
      animation: api,
      builder: (context, _) {
        final locked =
            busy || api.writes > 0 || api.pendingOperations.isNotEmpty;
        final actions = switch (widget.mode) {
          'points' => [
              ('晶钻明细', '/wallet/records?kind=EARNING'),
              ('晶钻权益', '/redemption')
            ],
          'scout' => [('星探规则', '/wallet/rules'), ('充值与续年', '/wallet/recharge')],
          _ => [
              ('资金流水', '/wallet/records?kind=RECHARGE'),
              ('余额充值', '/wallet/recharge')
            ],
        };
        return Row(children: [
          Expanded(
              child: OutlinedButton(
                  onPressed: locked ? null : () => go(actions[0].$2),
                  child: Text(actions[0].$1, textAlign: TextAlign.center))),
          const SizedBox(width: 10),
          Expanded(
              child: FilledButton(
                  onPressed: locked ? null : () => go(actions[1].$2),
                  child: Text(actions[1].$1, textAlign: TextAlign.center))),
        ]);
      });

  Widget _metric(String label, Object value) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(label,
            style: const TextStyle(color: AccountTheme.muted, height: 1.5)),
        const SizedBox(height: 4),
        FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text('$value',
                style: const TextStyle(
                    fontSize: 28, height: 1.2, fontWeight: FontWeight.w700)))
      ]));

  String _reason(dynamic code, String whenNone) => code == null
      ? whenNone
      : const {
            'TOPUP_THRESHOLD_NOT_MET': '尚未达到原规则的会员年充值门槛',
            'MEMBERSHIP_EXPIRED': '原会员年已到期，续年资格尚未生效',
            'POINTS_REVERSAL_PENDING': '有退款晶钻等待未来奖励抵扣，相关用途暂缓',
            'VERIFIED_ADULT_REQUIRED': '需要有效的成年身份核验',
            'POINTS_USES_NOT_CONNECTED': '钱包汇总未接通晶钻用途，请按专用业务规则核对',
            'CUSTODY_PROVIDER_NOT_CONNECTED': '充值托管与余额付款服务尚未接通',
            'FULFILLMENT_PENDING': '原订单履约尚未完成',
            'AFTERCARE_RULE_PENDING': '原订单的售后期限规则尚待确认',
            'AFTERCARE_PENDING': '原订单仍在售后或争议处理中',
            'AFTERCARE_WINDOW': '原订单的售后核对期限尚未结束',
            'FULLY_REFUNDED': '原订单已全额退款',
            'PAYMENT_PENDING': '原订单付款尚待核实'
          }[code] ??
          '具体原因待核实，请重新读取原账本';

  String _category(dynamic c) =>
      const {
        'STOCK': '现货',
        'CUSTOMIZATION': '定制',
        'AUDITION': '试镜',
        'COMMERCIAL': '商单'
      }[c] ??
      '原消费';
  List<Widget> _ruleBody(WalletRule r) => [
        tradeSection('本版完整规则', [
          SelectableText(r.rule['terms']),
          tradeFact('会员年与晶钻批次期限',
              '${r.rule['membership_days']} 天 / ${r.rule['points_days']} 天'),
          tradeFact('会员年充值门槛', v5Money(r.rule['topup_threshold_minor'])),
          tradeFact('原消费晶钻率', '每元 ${r.rule['points_per_yuan']} 晶钻，按原净实付向下取整'),
          tradeFact('单笔充值上限', v5Money(r.rule['topup_limits']['single_minor'])),
          tradeFact('当日充值上限', v5Money(r.rule['topup_limits']['daily_minor'])),
          tradeFact('当月充值上限', v5Money(r.rule['topup_limits']['monthly_minor'])),
          tradeFact(
              '充值冷静间隔', '${r.rule['topup_limits']['cooling_minutes']} 分钟'),
          for (final c in v5Map(r.rule['aftercare_days']).entries)
            tradeFact('${_category(c.key)}履约后的售后期',
                c.value == null ? '规则未确定，不发消费晶钻' : '${c.value} 天'),
          tradeFact(
              '签到奖励',
              r.rule['free_awards']?['DAILY_CHECKIN'] == null
                  ? '未配置，不发放'
                  : '${r.rule['free_awards']['DAILY_CHECKIN']} 晶钻')
        ]),
        V5Form(
            key: ValueKey(r.id),
            api: api,
            title: '明确接受本版',
            action: '接受本版规则并开立个人账本',
            suffix: '/accounts',
            fields: const [
              V5Field('accepted', '我已完整阅读本版规则，理解充值、消费、晶钻和会员年分别记账', type: 'bool')
            ],
            buildBody: (v) {
              if (v['accepted'] != true) {
                throw const AccountError(
                    400, 'WALLET_RULE_ACCEPTANCE_REQUIRED');
              }
              return {'rule_id': r.id, 'rule_sha256': r.hash};
            },
            parse: (d) => api.validate(d, kind: 'ACCOUNT'),
            reload: () => load(propagateError: true),
            onSuccess: (_) =>
                Navigator.pushReplacementNamed(context, '/wallet')),
      ];
  List<Widget> _recordBody(WalletRecord r) {
    final d = r.data;
    return [
      tradeSection(walletKinds[r.kind] ?? '个人账本', [
        tradeFact('实际状态', walletStates[r.status]),
        if (r.kind == 'EARNING') ...[
          tradeFact(
              '来源',
              d['source_kind'] == 'CONSUMPTION'
                  ? '${_category(d['category'])} · 原真实消费'
                  : '免费奖励 · ${const {
                        'REGISTER': '注册',
                        'DAILY_CHECKIN': '北京时间每日签到',
                        'REVIEW': '已核实评价',
                        'SHARE': '已核实分享'
                      }[d['event_kind']] ?? d['event_kind']}'),
          tradeFact('本批次发放', d['points']),
          tradeFact('本批次已使用', d['spent']),
          tradeFact('本批次已过期', d['expired']),
          tradeFact('本批次退款冲回', d['reversed']),
          tradeFact('本批次成长冲回', d['growth_reversed']),
          tradeFact('未来奖励抵扣待冲回', d['pending_shortfall']),
          tradeFact('本批次先抵旧退款债额', d['debt_offset']),
          tradeFact('到期时间',
              d['expires_at'] == null ? '尚未实际发放' : tradeDate(d['expires_at'])),
          if (d['order_id'] != null)
            tradeButton('查看原订单与履约依据',
                () => go('/trade/record?recordId=${d['order_id']}'),
                outline: true),
        ],
        if (['RECHARGE', 'CASH_SPEND', 'CASH_REFUND'].contains(r.kind)) ...[
          tradeFact('原金额', v5Money(d['amount_minor'])),
          if (d['refunded_minor'] != null)
            tradeFact('原充值已退', v5Money(d['refunded_minor'])),
          if (d['order_id'] != null)
            tradeButton(
                '关联原订单', () => go('/trade/record?recordId=${d['order_id']}'),
                outline: true),
          if (d['payment_id'] != null)
            tradeButton(
                '关联原付款', () => go('/trade/record?recordId=${d['payment_id']}'),
                outline: true),
          if (d['refund_id'] != null)
            tradeButton(
                '关联原退款', () => go('/trade/record?recordId=${d['refund_id']}'),
                outline: true),
          if (d['occurred_at'] != null)
            tradeFact('实际记账时间', tradeDate(d['occurred_at'])),
          if (r.kind == 'CASH_SPEND')
            for (final a in d['allocations']) ...[
              tradeFact('本次原充值分配', v5Money(a['amount_minor'])),
              tradeFact('已退回该批次', v5Money(a['returned_minor']))
            ]
        ],
        if (r.kind == 'CASH_RECONCILIATION') ...[
          tradeFact('本人账本可用', v5Money(d['local_available_minor'])),
          tradeFact('托管回单可用', v5Money(d['provider_available_minor'])),
          appNotice('仅记录对账观察；存在差异不会自动补钱或扣钱。'),
          tradeFact('观察时间', tradeDate(d['observed_at']))
        ],
        if (r.kind == 'LEVEL_REVIEW') ...[
          tradeFact('资质说明', d['terms']),
          tradeFact('有效开始', tradeDate(d['valid_from'])),
          tradeFact('有效截止', tradeDate(d['valid_until'])),
          if (d['review'] != null) tradeFact('独立审核说明', d['review']['reason'])
        ],
        if (r.kind == 'POINT_HOLD') ...[
          tradeFact('预留晶钻', d['points']),
          tradeFact(
              '用途',
              const {
                'VOTE': '冠军投票',
                'REDEMPTION': '晶钻兑换',
                'LOTTERY': '专用抽奖'
              }[d['purpose']]),
          tradeFact('原预留截止', tradeDate(d['expires_at'])),
          appNotice('晶钻仅按具体业务预留与核销，不允许客户端自报任意扣分。')
        ],
      ])
    ];
  }
}
