import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../engagement/community_support.dart';
import '../customization/private_draft_guard.dart';
import '../stock/v5_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'wallet_api.dart';
import 'wallet_models.dart';

const _refundStates = {
  'IN_REVIEW': '申请待审核',
  'APPROVED': '已核定，尚未核实到账',
  'REJECTED': '审核未通过',
  'CANCELLED': '发送渠道前已取消',
  'SUBMITTING': '正在提交渠道',
  'UNKNOWN': '渠道结果待核对',
  'SUCCEEDED': '退款到账已核实',
  'CLOSED': '渠道已关闭，非到账',
};
Map<String, dynamic> _refund(Map<String, dynamic> r, {String? id}) {
  communityRequire(communityId(r['id']) &&
      (id == null || r['id'] == id) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      communityId(r['recharge_id']) &&
      _refundStates.containsKey(r['current_status']) &&
      r['requested_minor'] is int &&
      r['requested_minor'] > 0 &&
      r['amount_minor'] is int &&
      r['amount_minor'] >= 0 &&
      r['amount_minor'] <= r['requested_minor'] &&
      r['currency'] == 'CNY' &&
      r['reason'] is String &&
      r['task_scheduled'] is bool &&
      ['SELF', 'GUARDIAN'].contains(r['applicant_kind']) &&
      v5Date(r['created_at']) &&
      (r['submitted_at'] == null || v5Date(r['submitted_at'])) &&
      (r['settled_at'] == null || v5Date(r['settled_at'])));
  return r;
}

class _RefundApi extends CommunityApi {
  _RefundApi(AccountSession session, this.guardian) : super(session, 'wallet');
  final bool guardian;
  @override
  bool get personal => guardian;
  String get collection =>
      guardian ? 'guardian-recharge-refunds' : 'recharge-refunds';
}

class RechargeRefundsPage extends StatelessWidget {
  const RechargeRefundsPage({super.key, this.guardian = false});
  final bool guardian;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'wallet',
      route: guardian ? '/wallet/guardian-refunds' : '/wallet/refunds',
      title: guardian ? '监护充值退款' : '本人充值退款',
      partyRequired: !guardian,
      builder: (s) => _RefundScreen(session: s, guardian: guardian));
}

class _RefundScreen extends StatefulWidget {
  const _RefundScreen({required this.session, required this.guardian});
  final AccountSession session;
  final bool guardian;
  @override
  State<_RefundScreen> createState() => _RefundState();
}

class _RefundState extends CommunityPageState<_RefundScreen> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'wallet';
  @override
  late final _RefundApi api = _RefundApi(session, widget.guardian);
  @override
  String get recoveryPrefix => '${api.prefix}${api.collection}';
  List<Map<String, dynamic>> rows = [];
  Map<String, dynamic>? record;
  String? id, cursor, rechargeCursor;
  final seen = <String>{}, rechargeSeen = <String>{};
  List<WalletRecord> recharges = [];
  String? selectedRecharge, guardianLink, childParty, linkCursor;
  List<Map<String, dynamic>> guardianLinks = [], guardianRecharges = [];
  final linkSeen = <String>{};
  List<Map<String, dynamic>> get refundSources => widget.guardian
      ? guardianRecharges
      : [
          for (final r in recharges) {'id': r.id, ...r.data}
        ];
  final guard = GlobalKey<PrivateDraftGuardState>();
  List<String> evidence = [];
  bool sourceBusy = false, agreed = false;
  late final amount = field(), reason = field(), cancellation = field();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void clearPrivate() {
    rows = [];
    record = null;
    recharges = [];
    evidence = [];
    selectedRecharge = null;
    cursor = null;
    rechargeCursor = null;
    agreed = false;
    guardianLinks = [];
    guardianRecharges = [];
    guardianLink = null;
    childParty = null;
    linkCursor = null;
    linkSeen.clear();
  }

  @override
  void validateResult(Map<String, dynamic> value) {
    _refund(value);
    // Recovery is bound to the frozen original command, never today's form.
    if (recovery != null) {
      final suffix = recoverySuffix ?? '';
      final original = communityMap(recovery!['body']);
      if (suffix == api.collection) {
        communityRequire(value['recharge_id'] == original['recharge_id'] &&
            value['requested_minor'] == original['amount_minor'] &&
            value['applicant_kind'] == (widget.guardian ? 'GUARDIAN' : 'SELF'));
      } else {
        final match =
            RegExp(r'^recharge-refunds/([0-9a-fA-F-]{36})/cancellation$')
                .firstMatch(suffix);
        communityRequire(
            !widget.guardian && match != null && value['id'] == match[1]);
      }
    }
  }

  @override
  Future<void> load() async => readPage();
  Future<void> readPage({bool more = false}) async {
    if (more && (checking || cursor == null)) return;
    final t = ++ticket, epoch = session.epoch;
    final target = id, before = more ? cursor : null;
    setState(() {
      checking = true;
      error = null;
      if (!more) {
        rows = [];
        cursor = null;
        seen.clear();
        record = null;
      }
    });
    bool current() =>
        mounted && t == ticket && epoch == session.epoch && target == id;
    try {
      if (!widget.guardian) WalletApi(session).owner();
      final data = await api.read(
          target == null ? api.collection : '${api.collection}/$target',
          account: widget.guardian,
          query: target == null
              ? {'limit': 20, if (before != null) 'cursor': before}
              : null);
      if (!current()) return;
      if (target != null) {
        final parsed = _refund(data, id: target);
        setState(() => record = parsed);
      } else {
        final list = communityItems(data).map((r) => _refund(r)).toList();
        final next = data['next_cursor'];
        communityRequire(next == null ||
            communityId(next) && next != before && seen.add(next));
        setState(() {
          rows = [...rows, ...list];
          cursor = next;
        });
      }
    } catch (e) {
      if (current()) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  Future<void> sources({bool more = false}) async {
    if (sourceBusy ||
        !enabled ||
        checking ||
        widget.guardian && guardianLink == null) return;
    final epoch = session.epoch,
        sourceTicket = ticket,
        before = more ? rechargeCursor : null;
    setState(() {
      sourceBusy = true;
      error = null;
      if (!more) {
        recharges = [];
        guardianRecharges = [];
        childParty = null;
        rechargeCursor = null;
        rechargeSeen.clear();
        selectedRecharge = null;
        agreed = false;
      }
    });
    try {
      if (widget.guardian) {
        final link = guardianLink;
        final page = await api.read('guardian-recharge-refund-options',
            account: true,
            query: {
              'guardian_link_id': link,
              'limit': 20,
              if (before != null) 'cursor': before
            });
        if (!mounted ||
            epoch != session.epoch ||
            sourceTicket != ticket ||
            link != guardianLink) return;
        communityRequire(page['guardian_link_id'] == link &&
            communityId(page['child_party_id']));
        final next = page['next_cursor'], items = communityItems(page);
        communityRequire(next == null ||
            communityId(next) && next != before && rechargeSeen.add(next));
        for (final r in items) {
          communityRequire(communityId(r['id']) &&
              r['object_version'] is int &&
              r['object_version'] > 0 &&
              r['current_status'] == 'SUCCEEDED' &&
              r['currency'] == 'CNY' &&
              r['amount_minor'] is int &&
              r['refunded_minor'] is int &&
              r['amount_minor'] >= r['refunded_minor'] &&
              r['refunded_minor'] >= 0);
        }
        setState(() {
          childParty = page['child_party_id'];
          guardianRecharges = [...guardianRecharges, ...items];
          rechargeCursor = next;
        });
        return;
      }
      final page = await WalletApi(session).records('RECHARGE', cursor: before);
      if (!mounted || epoch != session.epoch || sourceTicket != ticket) return;
      communityRequire(page.cursor == null ||
          page.cursor != before && rechargeSeen.add(page.cursor!));
      setState(() {
        recharges = [
          ...recharges,
          ...page.items.where((r) => r.status == 'SUCCEEDED')
        ];
        rechargeCursor = page.cursor;
      });
    } catch (e) {
      if (mounted && epoch == session.epoch && sourceTicket == ticket)
        setState(() => fail(e));
    } finally {
      if (mounted) setState(() => sourceBusy = false);
    }
  }

  Future<void> readGuardianLinks({bool more = false}) async {
    if (sourceBusy || !enabled || checking) return;
    final epoch = session.epoch, t = ticket, before = more ? linkCursor : null;
    setState(() {
      sourceBusy = true;
      error = null;
      if (!more) {
        guardianLinks = [];
        guardianLink = null;
        childParty = null;
        guardianRecharges = [];
        selectedRecharge = null;
        agreed = false;
        linkSeen.clear();
      }
    });
    try {
      final page = await CommunityApi(session, 'guardians').read('records',
          account: true,
          query: {'limit': 20, if (before != null) 'cursor': before});
      if (!mounted || epoch != session.epoch || t != ticket) return;
      final next = page['next_cursor'];
      communityRequire(next == null ||
          communityId(next) && next != before && linkSeen.add(next));
      // The list is a minimal index. Identity/child fields belong to the
      // permission-checked detail and must not be inferred from a list item.
      final links = <Map<String, dynamic>>[];
      for (final item in communityItems(page).where((r) =>
          r['kind'] == 'LINK' && r['current_status'] == 'ACTIVE')) {
        communityRequire(communityId(item['id']));
        final link = await CommunityApi(session, 'guardians')
            .read('records/${item['id']}', account: true);
        if (!mounted || epoch != session.epoch || t != ticket) return;
        communityRequire(link['id'] == item['id'] && link['kind'] == 'LINK');
        if (link['guardian_account_id'] == session.account?['id'] &&
            link['current_status'] == 'ACTIVE') links.add(link);
      }
      for (final r in links)
        communityRequire(
            communityId(r['id']) && communityId(r['child_account_id']));
      setState(() {
        guardianLinks = [...guardianLinks, ...links];
        linkCursor = next;
      });
    } catch (e) {
      if (mounted && epoch == session.epoch && t == ticket)
        setState(() => fail(e));
    } finally {
      if (mounted) setState(() => sourceBusy = false);
    }
  }

  @override
  Future<void> reconcilePending() async {
    final suffix = recoverySuffix ?? '';
    final match = RegExp(r'^recharge-refunds/([0-9a-fA-F-]{36})/cancellation$')
        .firstMatch(suffix);
    if (match != null)
      id = match[1];
    else if (suffix != api.collection)
      throw const AccountError(400, 'INVALID_ACTION');
    await load();
  }

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    id = _refund(value)['id'];
    agreed = false;
    guard.currentState?.markSaved();
    await load();
  }

  Future<void> requestRefund() async {
    if (!enabled || checking || sourceBusy || !agreed) return;
    final epoch = session.epoch;
    try {
      WalletApi(session)
          .owner(); // Evidence is uploaded under the guardian's own personal party.
      final source =
          refundSources.firstWhere((r) => r['id'] == selectedRecharge);
      if (widget.guardian)
        communityRequire(communityId(guardianLink) && communityId(childParty));
      final money = communityMinor(amount.text, '申请退款金额');
      final data = source;
      communityRequire(
          data['amount_minor'] is int && data['refunded_minor'] is int);
      if (money > data['amount_minor'] - data['refunded_minor'])
        throw const AccountError(400, '申请金额超过本次读取的充值未退款金额');
      if (evidence.isEmpty || evidence.length > 20)
        throw const AccountError(400, '请上传1至20份退款依据');
      final result = await act(
          api.collection,
          {
            'recharge_id': source['id'],
            if (widget.guardian) ...{
              'guardian_link_id': guardianLink,
              'child_party_id': childParty
            },
            'amount_minor': money,
            'reason': communityRequired(reason.text, '退款原因', max: 2000),
            'evidence_asset_ids': List<String>.from(evidence)
          },
          reload: false,
          account: widget.guardian,
          validate: (r) => communityRequire(r['recharge_id'] == source['id'] &&
              r['requested_minor'] == money &&
              r['applicant_kind'] == (widget.guardian ? 'GUARDIAN' : 'SELF')));
      if (result != null && mounted && epoch == session.epoch) {
        id = result['id'];
        agreed = false;
        guard.currentState?.markSaved();
        await load();
      }
    } catch (e) {
      if (mounted && epoch == session.epoch)
        setState(() => error = communityError(e));
    }
  }

  Future<void> cancelRefund() async {
    final r = record;
    if (!enabled || checking || r == null || widget.guardian) return;
    final epoch = session.epoch;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('取消这笔退款申请？'),
                content: const Text('仅在尚未发送渠道且服务器允许时取消，不影响原充值事实。'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('返回')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('确认取消'))
                ]));
    if (confirmed != true ||
        !mounted ||
        epoch != session.epoch ||
        !enabled ||
        checking ||
        record?['id'] != r['id'] ||
        record?['object_version'] != r['object_version']) return;
    try {
      await act('recharge-refunds/${r['id']}/cancellation',
          {'reason': communityRequired(cancellation.text, '取消原因', max: 2000)},
          version: r['object_version'],
          validate: (value) => communityRequire(value['id'] == r['id']));
    } catch (e) {
      if (mounted && epoch == session.epoch)
        setState(() => error = communityError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = !enabled || checking || sourceBusy;
    final r = record;
    return PrivateDraftGuard(
        key: guard,
        session: session,
        controllers: controllers,
        value: () => {
              'recharge': selectedRecharge,
              'guardian_link': guardianLink,
              'child_party': childParty,
              'evidence': evidence,
              'agreed': agreed
            },
        locked: locked,
        child: tradeScaffold(context, widget.guardian ? '监护充值退款' : '本人充值退款', [
          const Text('申请、核定、渠道处理与实际到账分别记录；审核通过不等于退款到账。'),
          ...feedback,
          if (id == null) ...[
            for (final item in rows)
              tradeSection(_refundStates[item['current_status']]!, [
                communityFact('原充值', item['recharge_id']),
                communityFact('申请金额', communityMoney(item['requested_minor'])),
                tradeButton(
                    '查看原退款申请',
                    locked
                        ? null
                        : () {
                            id = item['id'];
                            load();
                          },
                    outline: true)
              ]),
            if (!checking && error == null && rows.isEmpty)
              const Text('当前没有可读取的充值退款申请。'),
            if (cursor != null)
              tradeButton('继续读取申请', locked ? null : () => readPage(more: true),
                  outline: true),
            tradeButton('刷新申请', locked ? null : load, outline: true),
            if (widget.guardian) ...[
              const Text('以监护人本人的身份申请。先选择有效监护关系，再读取该子女的原充值；证明须使用监护人自己的个人身份上传。'),
              tradeButton('读取本人的有效监护关系', locked ? null : readGuardianLinks,
                  outline: true),
              for (final link in guardianLinks)
                RadioListTile<String>(
                    value: link['id'],
                    groupValue: guardianLink,
                    title: Text(
                        '${communityMap(link['data'])['relationship']} · 子女 ${communityShort(link['child_account_id'])}'),
                    onChanged: locked
                        ? null
                        : (v) => setState(() {
                              guardianLink = v;
                              childParty = null;
                              guardianRecharges = [];
                              rechargeCursor = null;
                              selectedRecharge = null;
                              agreed = false;
                            })),
              if (linkCursor != null)
                tradeButton('继续读取监护关系',
                    locked ? null : () => readGuardianLinks(more: true),
                    outline: true),
              tradeButton(
                  '监护管理',
                  locked
                      ? null
                      : () => Navigator.pushNamed(
                          context, '/contract-six/guardians'),
                  outline: true),
            ],
            tradeSection(widget.guardian ? '申请退回子女原充值' : '申请退回本人原充值', [
              const Text('按已到账充值选择。显示的未退款金额不代表全部可立即退回，最终以审核、资金占用及渠道核实为准。'),
              tradeButton(
                  widget.guardian ? '读取所选子女的原充值' : '读取本人充值',
                  locked || widget.guardian && guardianLink == null
                      ? null
                      : () => sources(),
                  outline: true),
              for (final source in refundSources)
                RadioListTile<String>(
                    value: source['id'],
                    groupValue: selectedRecharge,
                    title: Text(
                        '${communityMoney(source['amount_minor'])} · ${source['id']}'),
                    subtitle:
                        Text('已退款 ${communityMoney(source['refunded_minor'])}'),
                    onChanged: locked
                        ? null
                        : (v) => setState(() {
                              selectedRecharge = v;
                              agreed = false;
                            })),
              if (rechargeCursor != null)
                tradeButton('继续读取充值', locked ? null : () => sources(more: true),
                    outline: true),
              TextField(
                  controller: amount,
                  enabled: !locked,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '申请金额（元）'),
                  onChanged: (_) => setState(() => agreed = false)),
              TextField(
                  controller: reason,
                  enabled: !locked,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: '退款原因'),
                  onChanged: (_) => setState(() => agreed = false)),
              SupplyFiles(
                  api: SupplyApi(session),
                  purpose: 'REVIEW_EVIDENCE',
                  ids: evidence,
                  maxFiles: 20,
                  enabled: !locked,
                  onChanged: (ids) => setState(() {
                        evidence = ids;
                        agreed = false;
                      })),
              CheckboxListTile(
                  value: agreed,
                  title: const Text('已核对原充值、申请金额与本次证据；申请不保证到账'),
                  onChanged: locked
                      ? null
                      : (v) => setState(() => agreed = v == true)),
              tradeButton(
                  '提交退款申请',
                  locked || !agreed || selectedRecharge == null
                      ? null
                      : requestRefund),
            ]),
          ] else ...[
            if (r != null)
              tradeSection(_refundStates[r['current_status']]!, [
                communityFact('申请编号', r['id']),
                communityFact('记录版本', r['object_version']),
                communityFact('原充值', r['recharge_id']),
                communityFact('申请类型',
                    r['applicant_kind'] == 'GUARDIAN' ? '监护人申请' : '本人申请'),
                communityFact('申请金额', communityMoney(r['requested_minor'])),
                communityFact('核定金额', communityMoney(r['amount_minor'])),
                communityFact('原因', r['reason']),
                communityFact('申请时间', communityDate(r['created_at'])),
                communityFact('提交渠道时间', communityDate(r['submitted_at'])),
                communityFact('渠道终态时间（不等于到账）', communityDate(r['settled_at'])),
                communityFact(
                    '已安排处理任务', r['task_scheduled'] == true ? '是，仍须核实结果' : '否'),
                if (!widget.guardian &&
                    ['IN_REVIEW', 'APPROVED']
                        .contains(r['current_status'])) ...[
                  communityField(cancellation, '取消原因', enabled: !locked),
                  tradeButton('取消未发送的申请', locked ? null : cancelRefund,
                      outline: true),
                ],
              ]),
            tradeButton('重读当前申请', locked ? null : load, outline: true),
            tradeButton(
                '返回退款列表',
                locked
                    ? null
                    : () {
                        id = null;
                        load();
                      },
                outline: true),
          ],
        ]));
  }
}
