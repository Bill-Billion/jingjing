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
      syncCandidates = <WalletRecord>[],
      recentRecharges = <WalletRecord>[];
  WalletSummary? summary;
  String kind = 'RECHARGE';
  String? ruleId, cursor, error, notice, ruleNotice, rechargeNotice;
  bool busy = false, missing = false, rechargesBusy = false;
  int rechargeTicket = 0;
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
    rechargeTicket++;
    recentRecharges.clear();
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
      rechargeTicket++;
      rechargesBusy = false;
      rechargeNotice = null;
      recentRecharges.clear();
      if (!more) {
        rows.clear();
        cursor = null;
      }
    });
    try {
      switch (widget.mode) {
        case 'summary':
        case 'recharge':
        case 'level-six':
          final readSummary = await api.summary();
          if (!mounted || t != ticket) return null;
          api.check(epoch, p);
          summary = readSummary;
          missing = false;
        case 'points':
        case 'scout':
          final readSummary = await api.summary();
          if (!mounted || t != ticket) return null;
          api.check(epoch, p);
          summary = readSummary;
          missing = false;
          rules.clear();
          try {
            final readRules = await api.rules();
            if (!mounted || t != ticket) return null;
            api.check(epoch, p);
            rules.addAll(readRules);
          } on AccountError {
            if (!mounted || t != ticket) return null;
            api.check(epoch, p);
            ruleNotice = '等级与续年规则暂未读到，已保留真实成长和会员年金额；可重新核对。';
          }
        case 'rules':
          rules.clear();
          final readRules = await api.rules();
          if (!mounted || t != ticket) return null;
          api.check(epoch, p);
          rules.addAll(readRules);
        case 'records':
          final r = await api.records(kind, cursor: more ? cursor : null);
          if (!mounted || t != ticket) return null;
          api.check(epoch, p);
          rows.addAll(r.items);
          cursor = r.cursor;
        case 'sync':
          syncCandidates.clear();
          String? next;
          final seen = <String>{};
          do {
            final r = await api.records('EARNING', cursor: next);
            if (!mounted || t != ticket) return null;
            api.check(epoch, p);
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
          if (['summary', 'points', 'scout', 'recharge']
                  .contains(widget.mode) &&
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

  Future<void> loadRechargePreview() async {
    if (busy || rechargesBusy || summary == null) return;
    final t = ++rechargeTicket, epoch = widget.session.epoch;
    final read = <String, WalletRecord>{};
    final seen = <String>{};
    String? next;
    setState(() {
      rechargesBusy = true;
      recentRecharges.clear();
      rechargeNotice = '正在读取充值记录，最多 5 页；不会阻塞余额。';
    });
    try {
      final owner = api.owner();
      for (var pageNumber = 0; pageNumber < 5; pageNumber++) {
        api.check(epoch, owner);
        if (!mounted || t != rechargeTicket) return;
        final page = await api.records('RECHARGE', cursor: next);
        if (!mounted || t != rechargeTicket) return;
        api.check(epoch, owner);
        for (final r in page.items) {
          v5Require(v5Date(r.data['created_at'] ?? r.data['occurred_at']));
          final old = read[r.id];
          if (old == null ||
              (r.raw['object_version'] as int) >=
                  (old.raw['object_version'] as int)) {
            read[r.id] = r;
          }
        }
        next = page.cursor;
        if (next == null) break;
        v5Require(seen.add(next));
      }
      final sorted = read.values.toList()
        ..sort((a, b) {
          final order = DateTime.parse(b.data['created_at'] ?? b.data['occurred_at'])
              .compareTo(DateTime.parse(a.data['created_at'] ?? a.data['occurred_at']));
          return order != 0 ? order : b.id.compareTo(a.id);
        });
      if (!mounted || t != rechargeTicket) return;
      setState(() {
        recentRecharges.addAll(sorted.take(3));
        rechargeNotice = next == null
            ? '本次已读至分页末尾，共 ${read.length} 笔，展示其中时间最近的最多三笔；分页不是一致性快照，不保证并发变化下全量最新。'
            : '已达 5 页读取上限，共读取 ${read.length} 笔；仅展示已读取记录中时间最近的最多三笔，不代表全部最近充值。';
      });
    } on AccountError {
      if (mounted && t == rechargeTicket) {
        setState(() {
          recentRecharges.clear();
          rechargeNotice = '充值记录未能完整核对，本次不展示局部结果；余额不受影响，可重读或进入完整流水。';
        });
      }
    } finally {
      if (mounted && t == rechargeTicket) {
        setState(() => rechargesBusy = false);
      }
    }
  }

  void cancelRechargePreview() {
    setState(() {
      rechargeTicket++;
      rechargesBusy = false;
      recentRecharges.clear();
      rechargeNotice = '已停止后续分页并忽略在途返回；尚未完成读取，不代表没有充值记录。';
    });
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
          'records' => '资金流水',
          'level-six' => '六级独立资质',
          'sync' => '核对原订单晶钻',
          _ => '消费钱包'
        };
    return V5Frame(
        api: api,
        title: title,
        footer:
            (s != null && ['summary', 'points', 'scout', 'recharge'].contains(widget.mode)) || widget.mode == 'records'
                ? _footer()
                : null,
        children: [
          tradeHeading(widget.mode == 'scout' ? '进阶星探' : widget.mode == 'points' ? '我的晶钻' : title,
              eyebrow: switch (widget.mode) {
                'summary' => '当前托管渠道暂未接通',
                'points' => '消费成长 / 权益使用',
                'recharge' => '充值到你的消费余额',
                'records' => '每一笔，都有来处',
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
            _metric('可消费余额', v5Money(s.raw['available_balance_minor']),
                description: '用于平台内符合条件的消费'),
            _metric('冻结金额', v5Money(s.raw['reserved_balance_minor']), size: 24,
                description: '付款中预留，查看相关订单与解除条件'),
            tradeSection('余额用于消费', [
              const Text('充值余额不可提现、不可转让；与艺人经营收入分开。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              tradeFact('账面余额', v5Money(s.raw['recorded_balance_minor'])),
              appNotice('充值托管与余额付款服务尚未接通。这里按服务器展示真实账本。')
            ]),
            tradeSection('充值记录预览', [
              const Text('按需读取，最多 5 页（100 条），按真实申请时间排序；旧记录无申请时间时采用实际入账时间。待核实不代表到账。'),
              appNotice(rechargeNotice ?? '尚未读取充值记录；余额已单独读取，不以未加载当作没有记录。'),
              if (rechargesBusy) const LinearProgressIndicator(),
              for (final r in recentRecharges) _recordTile(r),
              tradeButton(rechargesBusy ? '停止读取' : '读取充值记录预览',
                  busy ? null : rechargesBusy ? cancelRechargePreview : loadRechargePreview,
                  outline: true),
              tradeButton('查看全部充值记录',
                  busy ? null : () => go('/wallet/records?kind=RECHARGE'),
                  outline: true),
            ]),
            _entry('本人充值退款申请', '查看原充值、提交依据及核对退款到账', '/wallet/refunds'),
            _entry('监护充值退款进度', '按当前监护权限读取已有申请', '/wallet/guardian-refunds'),
            _entry('消费与退款记录', '按关联订单查看资金变化', '/wallet/records?kind=CASH_SPEND'),
            _entry('星探会员年充值', '本会员年累计充值与实际资格', '/wallet/scout'),
            _entry('艺人收入', '查看经营结算与收益收款，单独记账', '/finance'),
            _entry('我的晶钻', '消费成长与晶钻来源分别核对', '/wallet/points'),
            tradeButton('阅读规则与本次充值限制', () => go('/wallet/rules'),
                outline: true),
            tradeButton('核对某笔原订单的晶钻', () => go('/wallet/sync'), outline: true),
            tradeButton('六级独立资质申请与进度', () => go('/wallet/level-six'),
                outline: true),
          ],
          if (widget.mode == 'points' && s != null) ...[
            if (s.raw['cumulative_points'] != null)
              _metric('累计获得晶钻', s.raw['cumulative_points']['net_issued'],
                  description: '累计含各类来源；使用不影响累计，退款撤回按原批次核对。')
            else
              appNotice('当前服务器尚未提供累计获得晶钻，暂不以可用余额代替。'),
            _metric('当前可用晶钻', s.raw['available_points'],
                description: '可用于符合条件的抽奖和兑换，实际资格以专用规则为准。'),
            ..._scoutProgress(s).take(1),
            _entry('星探权益', '查看真实会员年与成长门槛', '/wallet/scout'),
            tradeSection('晶钻与消费成长', [
              if (s.raw['cumulative_points'] != null)
                tradeFact('历史已发放 / 已撤回',
                    '${s.raw['cumulative_points']['issued']} / ${s.raw['cumulative_points']['withdrawn']}'),
              tradeFact('退款待冲回', s.raw['points_pending_reversal']),
              tradeFact('消费成长', s.raw['qualifying_growth']),
              appNotice('充值不是消费。使用、过期和免费奖励不会增加消费成长；退款按原消费承诺冲回，不追收现金。'),
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
            tradeSection('晶钻办理入口', [
              const Text('先读取各业务当前规则，不以钱包余额推断已经取得参加资格。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final entry in [
                  ('兑换与制作金', '/redemption'),
                  ('我的权益', '/redemption?view=grants'),
                  ('已审抽奖活动', '/redemption?view=pools'),
                  ('原次抽奖结果', '/redemption?view=draws'),
                  ('榜单与月冠军', '/engagement?view=rankings'),
                ])
                  OutlinedButton(
                      onPressed: busy || api.pendingOperations.isNotEmpty
                          ? null : () => go(entry.$2),
                      child: Text(entry.$1)),
              ]),
            ]),
            tradeButton('查看实际通告发布资格', () => go('/notices/new'), outline: true),
          ],
          if (widget.mode == 'scout' && s != null) ...[
            if (s.membership['active'] != true)
              Container(
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                      border: Border.all(color: AccountTheme.danger),
                      borderRadius: BorderRadius.circular(16)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('会员特权当前未生效',
                        style: TextStyle(color: AccountTheme.danger, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text(_reason(s.membership['reason'], '请核对服务器当前资格')),
                    const Text('成长记录仍按真实账本保留；成年实名普通通告不以星探等级为门槛。'),
                  ]))
            else
              appNotice('服务器当前会员资格有效；这不表示本次充值刚恢复，也不增加成长等级。'),

            Container(
                padding: const EdgeInsets.all(18),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                    color: const Color(0xFF202320),
                    borderRadius: BorderRadius.circular(18)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.membership['active'] == true
                      ? '${s.membership['level']}级 · 星探会员'
                      : '星探特权暂未生效',
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(s.membership['valid_until'] == null
                      ? _reason(s.membership['reason'], '请核对当前会员年资格')
                      : '会员有效至 ${tradeDate(s.membership['valid_until'])}',
                      style: const TextStyle(color: Color(0xFFDDDFDA), fontSize: 12)),
                  const SizedBox(height: 8),
                  Text('本人 · ${widget.session.party?['display_name'] ?? '当前个人身份'}',
                      style: const TextStyle(color: Color(0xFFDDDFDA), fontSize: 12)),
                ])),
            _metric('合格消费成长', s.raw['qualifying_growth']),
            ..._scoutProgress(s),
            if (s.raw['cumulative_points'] != null)
              _metric('累计获得晶钻', s.raw['cumulative_points']['net_issued'],
                  description: '按服务器累计净发放记录，不以当前可用余额替代。')
            else
              appNotice('当前未提供累计获得晶钻，不从成长等级或余额推算。'),
            ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('查看会员年与实际资格'),
                children: [
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
            tradeSection('权益与参加条件', [
              const Text('普通通告：成年实名即可按业务规则提交，不要求星探等级。',
                  style: TextStyle(color: AccountTheme.text, height: 1.6)),
              const SizedBox(height: 10),
              const Text('投递、合作与平台活动仍按对应业务核对资格；会员身份不代替本人授权或业务审核。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
            ]),
            _entry('普通通告发布资格', '读取本人真实资格，不以星探等级拦截', '/notices/new'),
            _entry('核对原充值记录', '充值进入消费余额，不是会费；是否恢复由服务器核定', '/wallet/records?kind=RECHARGE'),
            _entry('查看成长等级与会员规则', '按本人当前有效规则核对权益与活动要求', '/wallet/rules'),
            _entry('六级独立资质', '成长达到门槛后仍须独立审核', '/wallet/level-six'),
            tradeSection('充值与续期', [
              const Text('充值进入消费余额，不直接奖励晶钻，也不增加消费成长。续期按本人规则的充值门槛核对，不购买等级。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
              const SizedBox(height: 10),
              const Text('会员特权冻结不等于失去普通通告资格；成年实名用户仍可按普通通告规则办理。实际活动资格请在对应业务核对。',
                  style: TextStyle(color: AccountTheme.muted, height: 1.6)),
            ]),
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
            _metric('当前可用余额', v5Money(s.raw['available_balance_minor']),
                size: 28, description: '以本人当前账本为准，充值申请不是到账事实。'),
            appNotice(const bool.fromEnvironment('CLIENT_TEST_ONLY')
                ? '模拟余额充值，不涉及真实资金。成功后记入测试账本，充值不直接赠消费晶钻。'
                : '消费者充值托管尚未接通。本页按实际接口核对未开通结果；未产生充值、到账或自动扣款事实。充值不是会费，也不直接赠消费晶钻。'),
            V5Form(
                key: const ValueKey('wallet-recharge-form'),
                api: api,
                title: '核对本次充值',
                action: const bool.fromEnvironment('CLIENT_TEST_ONLY')
                    ? '模拟充值'
                    : '核对充值服务状态',
                suffix: '/recharges',
                fields: const [V5Field('amount', '本次申请充值金额（元）', type: 'money')],
                extra: (values, change, enabled) => [
                  const SizedBox(height: 12),
                  const Text('快捷填写金额（仍需核对并提交）',
                      style: TextStyle(color: AccountTheme.muted, fontSize: 12)),
                  for (final amount in ['100', '300', ''])
                    Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                            color: (amount.isEmpty
                                    ? !['100', '300'].contains(values['amount'])
                                    : values['amount'] == amount)
                                ? AccountTheme.selectedSurface
                                : AccountTheme.surface,
                            borderRadius: BorderRadius.circular(14),
                            child: Material(type: MaterialType.transparency, child: ListTile(
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14)),
                                title: Text(amount.isEmpty ? '其他金额' : '¥$amount'),
                                subtitle: Text(amount.isEmpty ? '在本次金额中自行填写' : '填写申请金额，不自动提交'),
                                trailing: Icon((amount.isEmpty
                                        ? !['100', '300'].contains(values['amount'])
                                        : values['amount'] == amount)
                                    ? Icons.radio_button_checked
                                    : Icons.radio_button_unchecked,
                                    color: AccountTheme.accent),
                                onTap: enabled ? () => change('amount', amount) : null)))),

                  ..._rechargeEstimate(values['amount'], s),
                  tradeSection('余额使用限制', [
                    const Text('余额仅用于符合条件的平台消费，不可提现、转让；与艺人经营收入分开。',
                        style: TextStyle(color: AccountTheme.text, height: 1.6)),
                    const Divider(height: 24),
                    const Text('真实充值与余额付款服务未接通时，不把申请或核对状态当作到账。',
                        style: TextStyle(color: AccountTheme.muted, height: 1.6)),
                  ]),
                  const Text('充值不赠晶钻，也不增加消费成长或购买会员等级。',
                      style: TextStyle(color: AccountTheme.accent, height: 1.6)),

                  const Text('快捷项只填写申请金额，不表示已充值或已到账。',
                      style: TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.5)),
                ],
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
            Row(children: [
              const Expanded(child: Text('消费钱包',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AccountTheme.vermilion, fontWeight: FontWeight.w700))),
              Expanded(child: TextButton(
                  onPressed: busy ? null : () => go('/finance'),
                  child: const Text('艺人收益'))),
            ]),
            const Divider(),
            SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final entry in walletKinds.entries)
                    Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                            label: Text(entry.value),
                            selected: kind == entry.key,
                            onSelected: busy ? null : (selected) {
                              if (!selected || kind == entry.key) return;
                              setState(() => kind = entry.key);
                              load();
                            })),
                ])),
            const SizedBox(height: 16),
            appNotice('按账户与类别分别查询，不合并两类余额。查看记录核对真实状态、关联订单和付款凭证。'),
            for (final r in rows) _recordTile(r),
            if (!busy && rows.isEmpty && error == null) appNotice('本类当前没有本人可读的真实记账记录。'),
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
          _entry('个人月度限额', '查看本人当前限额与使用情况', '/wallet/limits'),
          tradeButton('重新核对本页', busy ? null : () => load(), outline: true),
        ]);
  }

  List<Widget> _rechargeEstimate(String? text, WalletSummary s) {
    int amount;
    try {
      amount = v5InputMoney(text);
    } on AccountError {
      return [appNotice('填写有效金额后显示余额算术估算，不表示充值服务已开通。')];
    }
    if (amount <= 0) return [];
    return [
      tradeSection('条件估算 · 非到账结果', [
        tradeFact('本次申请', v5Money(amount)),
        tradeFact('若全额到账且无其他变动，可用余额',
            v5Money((s.raw['available_balance_minor'] as int) + amount)),
        const Text('仅按当前余额加申请金额计算。实际充值限制、审核与到账以服务器核定为准；不推算会员恢复或新有效期，充值不奖励晶钻、消费成长或等级。',
            style: TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
      ]),
    ];
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
          Text('$growth / $next 消费成长',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          LinearProgressIndicator(
              value: (growth / next).clamp(0, 1).toDouble()),
          const SizedBox(height: 10),
          Text('下一门槛 $next · 还差 ${next - growth} 消费成长',
              style: const TextStyle(fontSize: 13, color: AccountTheme.muted)),
        ],
      ]),
      tradeSection('本会员年充值进度', [
        Text('${v5Money(renewal)} / ${v5Money(threshold)}',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        LinearProgressIndicator(
            value: (renewal / threshold).clamp(0, 1).toDouble()),
        const SizedBox(height: 10),
        tradeFact('本规则会员年充值门槛', v5Money(threshold)),
        tradeFact('距本规则充值门槛', v5Money(renewal >= threshold ? 0 : threshold - renewal)),
        Text(
            renewal >= threshold ? '已达本版门槛' : '尚未达到本版门槛',
            style: const TextStyle(fontSize: 13, color: AccountTheme.muted)),
        const SizedBox(height: 10),
        const Text('会员资格以服务器核实为准。充值本身不发晶钻，也不增加消费成长。',
            style: TextStyle(
                fontSize: 12, color: AccountTheme.muted, height: 1.6)),
      ]),
    ];
  }

  Future<void> _chooseRecordKind() async {
    final selected = await showModalBottomSheet<String>(
        context: context,
        builder: (sheetContext) => SafeArea(
            child: SingleChildScrollView(child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final entry in walletKinds.entries)
                    ListTile(
                        title: Text(entry.value),
                        selected: kind == entry.key,
                        trailing: kind == entry.key
                            ? const Icon(Icons.check, color: AccountTheme.accent) : null,
                        onTap: () => Navigator.pop(sheetContext, entry.key)),
                ]))));
    if (!mounted || selected == null || selected == kind || busy) return;
    setState(() => kind = selected);
    await load();
  }

  Widget _footer() => AnimatedBuilder(
      animation: api,
      builder: (context, _) {
        final locked =
            busy || api.writes > 0 || api.pendingOperations.isNotEmpty;
        if (widget.mode == 'recharge') {
          return _footerPair(
              OutlinedButton(
                  onPressed: locked ? null : () => go('/wallet/rules'),
                  child: const Text('充值规则', textAlign: TextAlign.center)),
              const FilledButton(
                  onPressed: null,
                  child: Text(bool.fromEnvironment('CLIENT_TEST_ONLY')
                      ? '在表单核对并模拟充值' : '充值服务暂未开放',
                      textAlign: TextAlign.center)),
              firstFlex: 2, secondFlex: 3);
        }
        if (widget.mode == 'records') {
          return _footerPair(
              OutlinedButton(
                  onPressed: locked ? null : () => go('/wallet/rules'),
                  child: const Text('账本规则', textAlign: TextAlign.center)),
              OutlinedButton(
                  onPressed: locked ? null : _chooseRecordKind,
                  child: const Text('筛选类别', textAlign: TextAlign.center)));
        }
        final actions = switch (widget.mode) {
          'points' => [
              ('查看晶钻明细', '/wallet/records?kind=EARNING'),
              ('去权益商城', '/redemption')
            ],
          'scout' => [('星探规则', '/wallet/rules'), ('充值到消费余额', '/wallet/recharge')],
          _ => [
              ('查看资金流水', '/wallet/records?kind=RECHARGE'),
              ('余额充值', '/wallet/recharge')
            ],
        };
        return _footerPair(
            OutlinedButton(
                onPressed: locked ? null : () => go(actions[0].$2),
                child: Text(actions[0].$1, textAlign: TextAlign.center)),
            FilledButton(
                onPressed: locked ? null : () => go(actions[1].$2),
                child: Text(actions[1].$1, textAlign: TextAlign.center)),
            firstFlex: widget.mode == 'summary' ? 2 : 1,
            secondFlex: widget.mode == 'summary' ? 3 : 1);
      });

  Widget _footerPair(Widget first, Widget second,
          {int firstFlex = 1, int secondFlex = 1}) =>
      LayoutBuilder(builder: (context, constraints) {
        if (constraints.maxWidth < 340 ||
            MediaQuery.textScalerOf(context).scale(14) > 20) {
          return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [first, const SizedBox(height: 8), second]);
        }
        return Row(children: [
          Expanded(flex: firstFlex, child: first),
          const SizedBox(width: 10),
          Expanded(flex: secondFlex, child: second),
        ]);
      });

  // V5 46–49: quiet rounded metric surfaces, not generic icon banners.
  // Values always come from the validated wallet summary, never canvas examples.
  Widget _metric(String label, Object value, {String? description, double size = 32}) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
          color: AccountTheme.surface,
          borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: AccountTheme.muted, fontSize: 12)),
        const SizedBox(height: 8),
        Text('$value', style: TextStyle(
            color: AccountTheme.text, fontSize: size, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(description ?? (widget.mode == 'scout'
            ? '等级由真实消费成长，不提供付费升级。'
            : '金额按服务器实际账本核对，不提供提现或转账。'),
            style: const TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
        const Divider(height: 20),
      ]));

  Widget _entry(String title, String detail, String route) => AnimatedBuilder(
      animation: api,
      builder: (context, _) => Column(children: [
        ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(title, style: const TextStyle(fontSize: 15)),
            subtitle: Text(detail,
                style: const TextStyle(color: AccountTheme.muted, fontSize: 12, height: 1.6)),
            trailing: const Icon(Icons.chevron_right, size: 18, color: AccountTheme.muted),
            onTap: busy || api.writes > 0 || api.pendingOperations.isNotEmpty
                ? null : () => go(route)),
        const Divider(height: 1),
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
  Widget _recordTile(WalletRecord r) {
    final d = r.data;
    final amount = d['amount_minor'];
    final points = d['points'];
    return ExpansionTile(
        key: ValueKey('wallet-record-${r.raw['id']}'),
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 12),
        title: LayoutBuilder(builder: (context, constraints) {
          final value = amount is int ? v5Money(amount)
              : points is int ? '$points 晶钻' : null;
          final summary = Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(walletKinds[r.kind] ?? '个人账本',
                style: const TextStyle(fontSize: 15)),
            const SizedBox(height: 6),
            Text([
              if (d['occurred_at'] != null) tradeDate(d['occurred_at'])
              else if (d['created_at'] != null) '申请 ${tradeDate(d['created_at'])}',
              walletStates[r.status] ?? r.status,
            ].join(' · '),
                style: const TextStyle(color: AccountTheme.muted, fontSize: 12)),
          ]);
          if (value == null) return summary;
          final stacked = constraints.maxWidth < 300 ||
              MediaQuery.textScalerOf(context).scale(14) > 20;
          final metric = Text(value,
              textAlign: stacked ? TextAlign.start : TextAlign.end,
              style: const TextStyle(color: AccountTheme.text,
                  fontSize: 22, fontWeight: FontWeight.w700));
          return stacked
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  summary, const SizedBox(height: 10), metric,
                ])
              : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(flex: 3, child: summary),
                  const SizedBox(width: 12),
                  Expanded(flex: 2, child: metric),
                ]);
        }),
        trailing: const Icon(Icons.expand_more, size: 18),
        children: _recordBody(r));
  }

  List<Widget> _recordBody(WalletRecord r) {
    final d = r.data;
    return [
      tradeSection(walletKinds[r.kind] ?? '个人账本', [
        Wrap(spacing: 8, runSpacing: 8, children: [
          Chip(label: Text(walletStates[r.status] ?? r.status)),
          if (r.raw['pending_reason'] != null)
            const Chip(label: Text('仍有条件待核对')),
        ]),
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
