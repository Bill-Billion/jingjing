import 'dart:convert';
import 'dart:async';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../trade/trade_widgets.dart';

bool communityId(Object? value) =>
    value is String &&
    RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
        .hasMatch(value);
void communityRequire(bool ok) {
  if (!ok) {
    throw const AccountError(503, 'INVALID_COMMUNITY_RESPONSE',
        uncertain: true);
  }
}

Map<String, dynamic> communityMap(Object? value) {
  communityRequire(value is Map);
  return Map<String, dynamic>.from(value as Map);
}

Map<String, dynamic> communityMaybeMap(Object? value) =>
    value == null ? {} : communityMap(value);
List<Map<String, dynamic>> communityRows(Object? value) {
  communityRequire(value is List);
  return (value as List).map(communityMap).toList();
}

List<Map<String, dynamic>> communityItems(Map<String, dynamic> value) =>
    communityRows(value['items']);
Object? _communityCanonical(Object? v) {
  if (v is Map) {
    final keys = v.keys.cast<String>().toList()..sort();
    return {for (final k in keys) k: _communityCanonical(v[k])};
  }
  if (v is List) return v.map(_communityCanonical).toList();
  return v;
}

String communityDigest(Object? value) => sha256
    .convert(utf8.encode(jsonEncode(_communityCanonical(value))))
    .toString();
Map<String, dynamic> communityRecord(Object? raw, {String? id, String? kind}) {
  final r = communityMap(raw);
  communityRequire(communityId(r['id']) &&
      (id == null || r['id'] == id) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['current_status'] is String &&
      (kind == null || r['kind'] == kind));
  if (r.containsKey('kind')) {
    communityRequire(r['kind'] is String &&
        r['data'] is Map &&
        r['content_sha256'] is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(r['content_sha256']) &&
        communityDigest(r['data']) == r['content_sha256']);
  }
  return r;
}

String communityText(Object? value, {String empty = '暂无记录'}) =>
    value == null || value == '' ? empty : '$value';
String communityShort(Object? value) {
  final t = communityText(value);
  return t.length > 20
      ? '${t.substring(0, 8)}…${t.substring(t.length - 4)}'
      : t;
}

String communityDate(Object? value) => value == null
    ? '尚未确定'
    : DateTime.tryParse('$value')?.toLocal().toString().split('.').first ??
        '日期待核对';
String communityMoney(Object? value) {
  if (value is! int || value < 0) return '金额待核对';
  return '¥${(value / 100).toStringAsFixed(2)}';
}

String communityRequiredId(String value, String label) {
  if (!communityId(value.trim())) throw AccountError(400, '请选定有效的$label');
  return value.trim();
}

List<String> communityIds(String value, String label, {bool required = true}) {
  final ids =
      value.split(RegExp(r'[,，\s]+')).where((x) => x.isNotEmpty).toList();
  if (required && ids.isEmpty ||
      ids.any((x) => !communityId(x)) ||
      ids.toSet().length != ids.length) {
    throw AccountError(400, '请选定有效且不重复的$label');
  }
  return ids;
}

String communityRequired(String value, String label, {int max = 4000}) {
  final v = value.trim();
  if (v.isEmpty || v.length > max) {
    throw AccountError(400, '请填写$label（最多$max字）');
  }
  return v;
}

String communityInstant(String value, String label) {
  final d = DateTime.tryParse(value.trim());
  if (d == null) throw AccountError(400, '请填写有效的$label');
  return d.toUtc().toIso8601String();
}

int communityMinor(String text, String label, {bool zero = false}) {
  final t = text.trim();
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(t)) {
    throw AccountError(400, '$label请按元填写，最多两位小数');
  }
  final parts = t.split('.');
  final n = int.parse(parts[0]) * 100 +
      (parts.length == 1 ? 0 : int.parse(parts[1].padRight(2, '0')));
  if (n < (zero ? 0 : 1) || n > 9007199254740991) {
    throw AccountError(400, '$label金额无效');
  }
  return n;
}

String communityState(Object? status) =>
    const {
      'PREPARING': '筹备中',
      'VALID': '有效投票已记录',
      'SUSPENDED': '暂停计入，待核对',
      'VOID': '已判无效，晶钻依复核处理',
      'POINTS_RETURNED': '本票晶钻已返还',
      'REVOKED': '已撤回',
      'ASSIGNED': '已派单',
      'RULE_REVIEW_REQUIRED': '规则待独立复核',
      'PLATFORM_BUDGET_REVIEW_REQUIRED': '平台预算待核对',
      'OPEN': '招募中',
      'READY': '成团条件已核定',
      'UNFORMED': '人数不足，待处理',
      'PAUSED': '已暂停',
      'CANCELLED': '已取消',
      'REFUND_REQUIRED': '退款待办理',
      'REFUNDED': '退款已核实',
      'IN_REVIEW': '待独立审核',
      'APPROVED': '已审核',
      'REJECTED': '未通过',
      'AVAILABLE': '可使用',
      'PUBLISHED': '已发布',
      'ACTIVE': '有效',
      'INVITED': '待本人参加',
      'WITHDRAWN': '已退出',
      'HELD': '正在占用',
      'USED': '已核销',
      'EXPIRED': '已过期',
      'BOUND': '已绑定本人',
      'SCHEDULED': '排期已审核',
      'CONFIRMED': '本人已确认',
      'FULFILLED': '实际兑现已登记',
      'SETTLED': '结果已保存',
      'RETIRED': '已停用',
      'FINALIZED': '结果已核定',
      'ISSUED': '已发放，待实际兑现',
      'REDEEMED': '兑现证明已登记',
      'RECORDED': '已记录',
      'EFFECTIVE': '已生效',
      'ACCRUED': '已计提，非已到账',
      'SIMULATION_EXCLUDED': '模拟资金不计返佣',
      'REVERSED': '已冲回',
      'PENDING': '待处理',
      'RECEIVED': '已受理',
      'HANDLING': '处理中',
      'RESPONDED': '已有审核答复',
      'FOLLOW_UP': '仍有后续事项',
      'REOPENED': '异议处理中',
      'QUEUED': '已登记，等待处理',
      'WAITING_PROVIDER': '等待服务结果',
      'NEEDS_ATTENTION': '待工作人员核对',
      'MODEL_DELETED': '该模型已确认删除',
      'CONSENT_WITHDRAWN': '指定授权已撤回',
      'SUCCEEDED': '本次处理已核实',
      'SUPERSEDED': '已由新约定替代',
      'REWARD_FUNDED': '权益全额抵扣',
      'NOT_CONFIRMED': '整体完成尚待核实'
    }[status] ??
    communityText(status);
String communityError(Object error) {
  if (error is! AccountError) return '暂时无法读取，请稍后重新核对。';
  if (error.status == 412) return '这份记录已有新进展，已保留填写内容；请读取新版本后再次明确确认。';
  if ([401, 403, 404].contains(error.status)) return '记录不存在或当前身份已无权办理，私有内容已清空。';
  return const {
        'CUSTODY_PROVIDER_NOT_CONNECTED': '资金托管服务尚未接通，不能充值或以托管余额付款。',
        'CUSTOMIZATION_ORDER_EXISTS': '这份故事已有原订单，请从原订单继续；追加制作需关联有效创意工单。',
        'COCREATION_NOT_READY': '有效人数、资料、授权或首款尚未齐备。',
        'COCREATION_INVITATION_REQUIRED': '请先取得属于你本人的邀请。',
        'COCREATION_PARTICIPATION_REQUIRED': '参与条款已变化，请核对本次授权后重新确认。',
        'COCREATION_SNIPPET_NOT_READY': '该片段尚不满足领取条件。',
        'REDEMPTION_STOCK_UNAVAILABLE': '该权益库存不足或已停止兑换，请刷新目录。',
        'LOTTERY_STOCK_INSUFFICIENT': '奖品库存不足，本次未扣分，请刷新后再核对。',
        'REVIEW_FULFILLED_ORDER_REQUIRED':
            '这笔订单尚未同时满足正式付款、实际履约、无争议和双方独立要求，请先核对原订单。',
        'INVALID_REVIEW_MEDIA': '评价证明最多十份，请使用本人的评价或作品文件。',
        'VOTE_DAILY_LIMIT': '今天的投票次数已用完，请读取实际剩余次数。',
        'APPEAL_CLOSED': '当前不在公示异议期，或异议截止时间已过，请读取当前记录。',
        'VOTING_NOT_OPEN': '活动尚未开始、已经结束或候选状态有变，请重新核对。',
        'CONFIRMATION_RESULT_UNKNOWN': '尚未查到本人的准确会签记录，原内容和原编号已保留，请先重新核对。',
        'POINTS_INSUFFICIENT': '当前可用晶钻不足。',
        'POINTS_RECONCILIATION_REQUIRED': '尚有晶钻待冲回，暂不能投票、兑换或抽奖。',
        'PENDING_OPERATION_CHANGED': '原操作结果尚未确定，请先核对原记录并恢复原请求。',
        'INVALID_COMMUNITY_RESPONSE': '返回内容未通过核对，请重新读取。',
      }[error.code] ??
      (error.code.contains(RegExp(r'[\u4e00-\u9fff]'))
          ? error.code
          : error.message);
}

class CommunityApi {
  CommunityApi(this.session, this.domain) {
    if (![
      'engagement',
      'cocreation',
      'redemption',
      'privacy',
      'projects',
      'directory',
      'discovery',
      'support',
      'me/collections'
    ].contains(domain)) {
      throw ArgumentError.value(domain);
    }
  }
  final AccountSession session;
  final String domain;
  String get prefix => '/api/v1/$domain/';
  bool get personal =>
      ['privacy', 'me/collections', 'directory', 'discovery'].contains(domain);
  String? party(bool account) {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if ((domain == 'projects'
        ? session.projectsAccessDenied
        : session.isDomainDenied(prefix))) {
      throw const AccountError(403, 'ACCESS_DENIED');
    }
    if (account || personal) return null;
    if (session.partyId == null ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String? p) {
    if (session.epoch != epoch ||
        !session.isLoggedIn ||
        (domain == 'projects'
            ? session.projectsAccessDenied
            : session.isDomainDenied(prefix)) ||
        p != null && p != session.partyId) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  String path(String suffix) {
    if (suffix.startsWith('/') ||
        suffix.contains('..') ||
        suffix.contains('?') ||
        suffix.contains('#')) {
      throw const AccountError(400, 'INVALID_PATH');
    }
    return '$prefix$suffix';
  }

  Future<Map<String, dynamic>> read(String suffix,
      {bool account = false, Map<String, dynamic>? query}) async {
    final p = party(account), e = session.epoch;
    final r = await session.read(path(suffix), actingParty: p, query: query);
    check(e, p);
    return r;
  }

  Future<Map<String, dynamic>> write(String suffix, Map<String, dynamic> body,
      {bool account = false,
      int? version,
      String method = 'POST',
      FutureOr<void> Function(Map<String, dynamic>)? validate}) async {
    final p = party(account), e = session.epoch;
    final r = await session.write(method, path(suffix),
        actingParty: p, body: body, version: version, validate: (r) async {
      check(e, p);
      await validate?.call(r);
      check(e, p);
    });
    check(e, p);
    return r;
  }

  Map<String, dynamic>? pending(String suffix,
          {bool account = false, String method = 'POST'}) =>
      session.pending(method, path(suffix), actingParty: party(account));
  Future<Uint8List> bytes(String suffix,
      {bool account = false, String? sha256Value}) async {
    final p = party(account), e = session.epoch;
    final b = await session.readBytes(path(suffix), actingParty: p);
    check(e, p);
    if (sha256Value != null) {
      communityRequire(sha256.convert(b).toString() == sha256Value);
    }
    return b;
  }
}

class CommunityGate extends StatelessWidget {
  const CommunityGate(
      {super.key,
      required this.domain,
      required this.route,
      required this.title,
      required this.builder,
      this.partyRequired = true,
      this.embedded = false});
  final String domain, route, title;
  final bool partyRequired, embedded;
  final Widget Function(AccountSession) builder;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>(), prefix = '/api/v1/$domain/';
    final permitted = s.isLoggedIn &&
        !(domain == 'projects'
            ? s.projectsAccessDenied
            : s.isDomainDenied(prefix)) &&
        (!partyRequired ||
            s.partyId != null &&
                s.selected?['membership']?['current_status'] == 'ACTIVE' &&
                !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']));
    if (permitted) {
      return KeyedSubtree(
          key: ValueKey(
              '${s.epoch}:${partyRequired ? s.partyId : s.account?['id']}:$route'),
          child: builder(s));
    }
    return tradeScaffold(context, title, [
      appNotice(!s.isLoggedIn
          ? '请先登录，再查看属于你的业务。'
          : (domain == 'projects'
                  ? s.projectsAccessDenied
                  : s.isDomainDenied(prefix))
              ? '当前访问权限已失效，私有资料已清空。请重新核对身份。'
              : '请先选择有效的办事身份。'),
      tradeButton(
          '核对账号与身份',
          () => s.isLoggedIn
              ? Navigator.pushNamed(context, '/account')
              : Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => LoginPage(returnRoute: route)))),
      if ((domain == 'projects'
          ? s.projectsAccessDenied
          : s.isDomainDenied(prefix)))
        tradeButton('重新核对访问权限', () async {
          try {
            if (domain == 'projects') {
              await s.retryProjectsAccess();
            } else {
              await s.retryDomainAccess(prefix, personal: !partyRequired);
            }
          } catch (_) {}
        }, outline: true)
    ]);
  }
}

abstract class CommunityPageState<T extends StatefulWidget> extends State<T> {
  AccountSession get session;
  String get domain;
  CommunityApi get api => CommunityApi(session, domain);
  bool busy = false, checking = false;
  String? error, notice;
  int ticket = 0;
  final controllers = <TextEditingController>[];
  Map<String, dynamic>? recovery;
  String? recoverySuffix, recoveryMethod;
  bool recoveryAccount = false, reconciled = false;
  Future<void> load();
  void clearPrivate();
  Future<void> reconcilePending();
  FutureOr<void> validateResult(Map<String, dynamic> value) {
    communityRecord(value);
  }

  Future<void> recovered(Map<String, dynamic> value) async {
    await load();
  }

  @override
  void initState() {
    super.initState();
    final pending =
        session.pendingForPrefix(api.prefix, personal: api.personal);
    if (pending.isNotEmpty) {
      final op = pending.first, path = op['path'];
      if (path is String && path.startsWith(api.prefix)) {
        final fingerprint = jsonDecode(op['fingerprint'] as String) as List;
        recovery = Map<String, dynamic>.from(op);
        recoverySuffix = path.substring(api.prefix.length);
        recoveryMethod = fingerprint[2] as String;
        recoveryAccount = api.personal;
      }
    }
  }

  TextEditingController field([String text = '']) {
    final c = TextEditingController(text: text);
    controllers.add(c);
    return c;
  }

  @override
  void dispose() {
    ticket++;
    for (final c in controllers) {
      c.dispose();
    }
    super.dispose();
  }

  void fail(Object e) {
    if (!mounted) return;
    if (e is AccountError &&
        ([401, 403, 404].contains(e.status) ||
            e.code == 'CONTEXT_CHANGED' ||
            ['DELEGATION_REVOKED', 'CONSENT_WITHDRAWN', 'RIGHTS_UNAVAILABLE']
                .contains(e.code))) {
      clearPrivate();
      for (final c in controllers) {
        c.clear();
      }
      recovery = null;
      recoverySuffix = null;
      if (e.status != 401 && e.code != 'CONTEXT_CHANGED') {
        domain == 'projects'
            ? session.denyProjects()
            : session.denyDomain(api.prefix);
      }
    }
    error = communityError(e);
  }

  Future<Map<String, dynamic>?> act(String suffix, Map<String, dynamic> body,
      {int? version,
      bool account = false,
      String method = 'POST',
      bool reload = true,
      FutureOr<void> Function(Map<String, dynamic>)? validate}) async {
    if (busy || recovery != null) return null;
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final r = await api.write(suffix, body,
          version: version,
          account: account,
          method: method, validate: (r) async {
        await validateResult(r);
        await validate?.call(r);
      });
      if (!mounted || t != ticket) return null;
      notice = '本次操作已记录，请以服务器返回的状态为准。';
      if (reload) await load();
      return r;
    } catch (e) {
      if (mounted && t == ticket) {
        recovery = api.pending(suffix, account: account, method: method);
        if (recovery != null) {
          recoverySuffix = suffix;
          recoveryMethod = method;
          recoveryAccount = account;
          reconciled = false;
        }
        fail(e);
      }
      return null;
    } finally {
      if (mounted && t == ticket) {
        setState(() => busy = false);
      } else if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> recover() async {
    if (recovery == null || recoverySuffix == null || !reconciled || busy) {
      return;
    }
    final op = Map<String, dynamic>.from(recovery!),
        suffix = recoverySuffix!,
        account = recoveryAccount,
        method = recoveryMethod ?? 'POST';
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await api.write(suffix, communityMap(op['body']),
          version: op['version'] as int?,
          account: account,
          method: method,
          validate: validateResult);
      if (!mounted) return;
      setState(() {
        recovery = null;
        recoverySuffix = null;
        reconciled = false;
        notice = '已按原编号核对原请求结果。';
      });
      await recovered(result);
    } catch (e) {
      if (mounted) {
        setState(() {
          recovery = api.pending(suffix, account: account, method: method);
          if (recovery == null) recoverySuffix = null;
          reconciled = false;
          fail(e);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  List<Widget> get feedback => [
        if (busy || checking) const LinearProgressIndicator(),
        if (error != null)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(error!,
                  style: const TextStyle(
                      color: AccountTheme.danger, height: 1.5))),
        if (notice != null) appNotice(notice!),
        if (recovery != null)
          communitySection('上次操作结果尚未确定', [
            const Text('保留原内容和原编号。先读取当前记录，核对后才继续原请求，避免重复扣分、下单或授权。'),
            if (communityMaybeMap(recovery?['body'])['count'] != null)
              communityFact(
                  '原抽取次数', communityMaybeMap(recovery?['body'])['count']),
            if (communityMaybeMap(recovery?['body'])['reason'] != null)
              communityFact(
                  '原提交说明', communityMaybeMap(recovery?['body'])['reason']),
            if (communityMaybeMap(recovery?['body'])['details'] is String)
              communityFact(
                  '原申请内容', communityMaybeMap(recovery?['body'])['details']),
            communityFact('原记录版本', recovery?['version'] ?? '此操作建立新记录'),
            tradeButton(
                '先核对当前记录',
                busy || checking
                    ? null
                    : () async {
                        setState(() {
                          checking = true;
                          error = null;
                          reconciled = false;
                        });
                        try {
                          await reconcilePending();
                          if (mounted && error == null) {
                            setState(() => reconciled = true);
                          }
                        } catch (e) {
                          if (mounted) setState(() => fail(e));
                        } finally {
                          if (mounted) setState(() => checking = false);
                        }
                      },
                outline: true),
            tradeButton('使用原编号继续核对', busy || !reconciled ? null : recover,
                outline: true)
          ])
      ];
  bool get enabled => !busy && recovery == null;
  Future<void> savePrivate(String suffix, String filename,
      {String? hash, bool account = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final bytes =
          await api.bytes(suffix, account: account, sha256Value: hash);
      if (!mounted) return;
      final saved = await FilePicker.saveFile(fileName: filename, bytes: bytes);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '文件已交给浏览器，请在下载记录核对。'
            : saved == null
                ? '已取消保存，文件未存入设备。'
                : '文件已保存，请在设备中核对。');
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

Widget communityHeading(String title, String subtitle, {String? eyebrow}) =>
    Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        tradeHeading(title, eyebrow: eyebrow),
        Text(subtitle,
            style: const TextStyle(
                fontSize: 14, height: 1.6, color: AccountTheme.muted)),
      ]),
    );

Widget communitySection(String title, List<Widget> children) => Container(
    margin: const EdgeInsets.only(bottom: 20),
    padding: const EdgeInsets.symmetric(vertical: 16),
    decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AccountTheme.border))),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      const SizedBox(height: 14),
      ...children
    ]));
Widget communityFact(String label, Object? value) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Wrap(spacing: 12, runSpacing: 4, children: [
      Text(label, style: const TextStyle(color: AccountTheme.muted)),
      SelectableText(communityText(value), style: const TextStyle(height: 1.5))
    ]));
Widget communityField(TextEditingController c, String label,
        {int lines = 1, TextInputType? keyboard, bool enabled = true}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: TextField(
            controller: c,
            enabled: enabled,
            maxLines: lines,
            keyboardType: keyboard,
            decoration: InputDecoration(labelText: label),
            onChanged: (_) {}));
Widget communitySelect(String label, String? selected,
        List<(String, String)> options, ValueChanged<String?>? changed) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: DropdownButtonFormField<String>(
            key: ValueKey('$label:$selected'),
            initialValue:
                options.any((x) => x.$1 == selected) ? selected : null,
            isExpanded: true,
            decoration: InputDecoration(labelText: label),
            items: [
              for (final x in options)
                DropdownMenuItem(
                    value: x.$1,
                    child: Text(x.$2, overflow: TextOverflow.ellipsis))
            ],
            onChanged: changed));
Widget communityCheck(String label, bool value, ValueChanged<bool?>? changed) =>
    CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        value: value,
        onChanged: changed,
        title: Text(label, style: const TextStyle(height: 1.5)),
        controlAffinity: ListTileControlAffinity.leading);
Widget communityRecordId(Map<String, dynamic> row) =>
    ExpansionTile(title: const Text('记录依据'), children: [
      communityFact('记录编号', row['id']),
      if (row['content_sha256'] != null)
        communityFact('内容校验', row['content_sha256'])
    ]);

Widget communityDateField(
        BuildContext context, TextEditingController controller, String label,
        {bool enabled = true, VoidCallback? onChanged}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: StatefulBuilder(
            builder: (context, refresh) => InkWell(
                onTap: !enabled
                    ? null
                    : () async {
                        final existing =
                                DateTime.tryParse(controller.text)?.toLocal(),
                            now = DateTime.now(),
                            initial = existing ?? now;
                        final day = await showDatePicker(
                            context: context,
                            initialDate:
                                initial.year < 1900 || initial.year > 2200
                                    ? now
                                    : initial,
                            firstDate: DateTime(1900),
                            lastDate: DateTime(2200, 12, 31),
                            helpText: '选择$label的日期');
                        if (day == null || !context.mounted) return;
                        final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay.fromDateTime(initial),
                            helpText: '选择$label的时间');
                        if (time == null || !context.mounted) return;
                        controller.text = DateTime(day.year, day.month, day.day,
                                time.hour, time.minute)
                            .toUtc()
                            .toIso8601String();
                        refresh(() {});
                        onChanged?.call();
                      },
                child: InputDecorator(
                    decoration: InputDecoration(
                        labelText: label,
                        enabled: enabled,
                        suffixIcon: const Icon(Icons.calendar_today_outlined)),
                    child: Text(controller.text.isEmpty
                        ? '选择日期和时间'
                        : communityDate(controller.text))))));
