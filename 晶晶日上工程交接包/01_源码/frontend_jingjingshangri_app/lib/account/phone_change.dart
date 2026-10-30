import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'account_api.dart';
import 'account_session.dart';
import 'account_theme.dart';
import '../engagement/community_support.dart';
import '../pages/login/login_page.dart';
import '../trade/trade_widgets.dart';

const phoneChangePrefix = '/api/v1/me/phone-changes';
const phoneChangeStates = {
  'AWAITING_OLD': '验证原手机号',
  'AWAITING_NEW': '验证新手机号',
  'READY': '两边已验证，等待本人确认',
  'COMPLETED': '手机号已变更',
  'CANCELLED': '申请已取消',
  'EXPIRED': '申请已过期'
};
Map<String, dynamic> phoneChangeRecord(Map<String, dynamic> r) {
  communityRequire(communityId(r['id']) &&
      phoneChangeStates.containsKey(r['current_status']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['can_continue'] is bool &&
      r['requires_relogin'] is bool &&
      r['recovery_route'] == 'SUPPORT_TICKET_REVIEW_ONLY');
  for (final key in ['old_phone_mask', 'new_phone_mask']) {
    communityRequire(
        r[key] is String && RegExp(r'^\d{3}\*{4}\d{4}$').hasMatch(r[key]));
  }
  communityRequire(DateTime.tryParse('${r['expires_at']}') != null);
  final challenges = communityRows(r['challenges']);
  final sides = <String>{};
  communityRequire(challenges.length <= 2);
  for (final c in challenges) {
    communityRequire(communityId(c['id']) &&
        ['OLD', 'NEW'].contains(c['side']) &&
        sides.add(c['side']) &&
        ['PENDING', 'SENT', 'UNKNOWN', 'CONSUMED', 'EXPIRED']
            .contains(c['current_status']) &&
        c['attempts_remaining'] is int &&
        c['attempts_remaining'] >= 0 &&
        DateTime.tryParse('${c['expires_at']}') != null &&
        DateTime.tryParse('${c['resend_after']}') != null);
  }
  communityRequire(
      r['current_status'] == 'COMPLETED' || !r['requires_relogin']);
  return r;
}

String phoneChangeError(Object e) {
  if (e is! AccountError) return '暂时无法核对换号进度，请重新读取。';
  if (e.status == 412) return '进度已有变化，已重新读取。请核对新状态，再主动确认本次操作。';
  return const {
        'RECENT_LOGIN_REQUIRED': '需要在最近10分钟内重新验证登录，再开始换号。',
        'PHONE_CHANGE_BINDING_CHANGED': '原手机号与当前账号不一致，请核对后填写。',
        'PHONE_CHANGE_TARGET_UNAVAILABLE': '新手机号暂不可绑定，请换用其他号码；本次不会合并账号。',
        'PHONE_CHANGE_SAME_NUMBER': '新手机号需与原手机号不同。',
        'PHONE_CHANGE_ALREADY_ACTIVE': '已有换号申请，请读取当前进度。',
        'PHONE_CHANGE_SESSION_MISMATCH': '申请由另一登录会话发起，请回原设备办理或等待过期。',
        'INVALID_PHONE_CHANGE_CODE': '验证码不正确。请核对对应号码的验证码及剩余尝试次数。',
        'PHONE_CHANGE_CHALLENGE_UNAVAILABLE': '本次验证码已不可用，请核对进度后主动重新发送。',
        'PHONE_CHANGE_STEP_REQUIRED': '验证步骤已有变化，请按当前进度继续。',
        'SMS_NOT_READY': '短信发送结果尚未确认，请先读取进度；不会自动重发。',
        'PHONE_CHANGE_SMS_UNAVAILABLE': '原短信请求已不可继续，请读取进度，等待允许后主动重新发送。',
        'RATE_LIMITED': '操作太频繁，请等待服务器允许的时间后主动重试。',
        'PHONE_CHANGE_NOT_ACTIVE': '此申请已结束或过期，请读取当前结果。',
        'IDEMPOTENCY_CONFLICT': '原请求内容不一致，请保留当前进度并联系人工核查。',
      }[e.code] ??
      communityError(e);
}

class PhoneChangePage extends StatelessWidget {
  const PhoneChangePage({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    if (!s.isLoggedIn) {
      return tradeScaffold(context, '更换手机号', [
        tradeHeading('重新验证登录', eyebrow: '账号安全 / 同一个账号'),
        Text(s.authNotice ?? '请先登录，再更换本人手机号。'),
        const Text('若刚才已确认换号，请使用新手机号登录，随后读取换号结果。'),
        tradeButton(
            '验证手机号并登录',
            () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const LoginPage(
                        returnRoute: '/account/phone-change')))),
      ]);
    }
    // An acting-party change must preserve this account-level verification.
    return _PhoneChange(
        key: ValueKey((s, s.account?['id'], s.loginEpoch)), session: s);
  }
}

class _PhoneChange extends StatefulWidget {
  const _PhoneChange({super.key, required this.session});
  final AccountSession session;
  @override
  State<_PhoneChange> createState() => _PhoneChangeState();
}

class _PhoneChangeState extends State<_PhoneChange> {
  final oldPhone = TextEditingController(),
      newPhone = TextEditingController(),
      code = TextEditingController();
  Map<String, dynamic>? record;
  String? error, notice;
  bool busy = false,
      loaded = false,
      confirmed = false,
      reconciled = false,
      newRequest = false,
      leaving = false;
  Timer? clock;
  DateTime? retryAt;
  int ticket = 0;
  AccountSession get s => widget.session;
  List<Map<String, dynamic>> get pending =>
      s.pendingForPrefix(phoneChangePrefix, personal: true);
  bool get throttled => retryAt?.isAfter(DateTime.now()) == true;
  bool get locked => busy || pending.isNotEmpty || throttled;
  bool get draft =>
      oldPhone.text.isNotEmpty ||
      newPhone.text.isNotEmpty ||
      code.text.isNotEmpty;
  @override
  void initState() {
    super.initState();
    for (final c in [oldPhone, newPhone, code]) {
      c.addListener(changed);
    }
    clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && (record != null || retryAt != null)) setState(() {});
    });
    load();
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    ticket++;
    clock?.cancel();
    oldPhone.dispose();
    newPhone.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> load() async {
    if (busy) return;
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final d = await s.read('$phoneChangePrefix/current');
      communityRequire(d.containsKey('request'));
      final r = d['request'] == null
          ? null
          : phoneChangeRecord(communityMap(d['request']));
      if (!mounted || t != ticket) return;
      setState(() {
        if (record?['current_status'] != r?['current_status']) code.clear();
        record = r;
        loaded = true;
        reconciled = true;
        confirmed = false;
      });
      if (r?['requires_relogin'] == true) s.requirePhoneRelogin();
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = phoneChangeError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> relogin() async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('重新验证本人登录'),
                content: const Text('当前登录会退出。请用当前绑定手机号重新登录，再开始换号。'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('取消')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('退出并重新登录'))
                ]));
    if (yes != true || !mounted) return;
    await s.logout();
    if (mounted) {
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) =>
                  const LoginPage(returnRoute: '/account/phone-change')));
    }
  }

  Future<void> send(String operation, {Map<String, dynamic>? original}) async {
    if (busy ||
        throttled ||
        original == null && pending.isNotEmpty ||
        original != null && !reconciled) {
      return;
    }
    String path;
    Map<String, dynamic> body;
    int? version;
    try {
      if (original != null) {
        path = original['path'];
        body = communityMap(original['body']);
        version = original['version'];
      } else if (operation == 'create') {
        final a = oldPhone.text.trim(), b = newPhone.text.trim();
        if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(a) ||
            !RegExp(r'^1[3-9]\d{9}$').hasMatch(b) ||
            a == b) {
          throw const AccountError(400, '请填写不同且有效的原手机号和新手机号');
        }
        path = phoneChangePrefix;
        body = {'old_phone': a, 'new_phone': b};
      } else {
        final r = record!;
        if (r['can_continue'] != true ||
            DateTime.parse(r['expires_at']).isBefore(DateTime.now())) {
          return;
        }
        path = '$phoneChangePrefix/${r['id']}/$operation';
        version = r['object_version'];
        final side = r['current_status'] == 'AWAITING_OLD' ? 'OLD' : 'NEW';
        body = operation == 'challenges' ? {'side': side} : <String, dynamic>{};
        if (operation == 'verifications') {
          final c = communityRows(r['challenges'])
              .where((c) => c['side'] == side)
              .first;
          if (!RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
            throw const AccountError(400, '请填写本次收到的6位验证码');
          }
          body = {
            'side': side,
            'challenge_id': c['id'],
            'code': code.text.trim()
          };
        }
        if (operation == 'confirmation' && !confirmed) return;
      }
      setState(() {
        busy = true;
        error = null;
        notice = null;
        reconciled = false;
      });
      final r = phoneChangeRecord(await s.write('POST', path,
          body: body, version: version, validate: phoneChangeRecord));
      if (!mounted) return;
      setState(() {
        record = r;
        loaded = true;
        newRequest = false;
        confirmed = false;
        oldPhone.clear();
        newPhone.clear();
        code.clear();
        notice = r['current_status'] == 'COMPLETED'
            ? '换号已完成，请使用新手机号重新登录。'
            : '当前步骤已记录，请按服务器返回的进度继续。';
      });
      if (r['requires_relogin'] == true) s.requirePhoneRelogin();
    } catch (e) {
      if (!mounted) return;
      final message = phoneChangeError(e);
      if (e is AccountError && e.status == 429) retryAt = e.retryAt;
      if (e is AccountError &&
          [400, 409, 412, 429].contains(e.status) &&
          s.isLoggedIn) {
        setState(() => busy = false);
        await load();
      }
      if (mounted) {
        setState(() {
          error = message;
          confirmed = false;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> cancel() async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('取消当前换号？'),
                content: const Text('当前绑定手机号保持不变，本次验证码会失效。'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('继续办理')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('确认取消'))
                ]));
    if (yes == true && mounted) await send('cancellation');
  }

  Future<void> leave() async {
    if (busy) return;
    if (draft) {
      final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: const Text('离开换号页面？'),
                  content: const Text('未提交的号码和验证码会清空；已提交的申请可回来读取。'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('继续填写')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('确认离开'))
                  ]));
      if (yes != true || !mounted) return;
    }
    setState(() => leaving = true);
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(context, '/account');
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = record, state = r?['current_status'];
    final active = ['AWAITING_OLD', 'AWAITING_NEW', 'READY'].contains(state);
    final can = r?['can_continue'] == true &&
        DateTime.parse(r!['expires_at']).isAfter(DateTime.now());
    final side = state == 'AWAITING_OLD' ? 'OLD' : 'NEW';
    final matches = r == null
        ? <Map<String, dynamic>>[]
        : communityRows(r['challenges'])
            .where((c) => c['side'] == side)
            .toList();
    final c = matches.isEmpty ? null : matches.first;
    final wait = c == null
        ? 0
        : DateTime.parse(c['resend_after'])
                .difference(DateTime.now())
                .inSeconds +
            1;
    final verify = can &&
        c?['current_status'] == 'SENT' &&
        c!['attempts_remaining'] > 0 &&
        DateTime.parse(c['expires_at']).isAfter(DateTime.now());
    return PopScope(
        canPop: leaving || !draft && !busy,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) leave();
        },
        child: tradeScaffold(
            context,
            '更换手机号',
            [
              tradeHeading('更换手机号', eyebrow: '账号安全 / 本人办理'),
              const Text('账号、订单、作品与机构关系保留。换号先验证原手机号，再验证新手机号，最后由你明确确认。'),
              if (busy) const LinearProgressIndicator(),
              if (error != null)
                Text(error!,
                    style: const TextStyle(color: AccountTheme.danger)),
              if (notice != null) Text(notice!),
              if (throttled)
                Text(
                    '请等待至 ${communityDate(retryAt!.toIso8601String())} 后主动重试。'),
              for (final op in pending)
                tradeSection('原操作结果尚未确定', [
                  const Text('原内容、版本和请求编号已保留在本次登录内。先读取进度，再恢复原请求；不会自动发送或重发验证码。'),
                  tradeButton('先核对当前进度', busy ? null : load, outline: true),
                  tradeButton('按原请求继续核对',
                      busy || !reconciled ? null : () => send('', original: op),
                      outline: true),
                ]),
              if (r != null && !newRequest)
                tradeSection(phoneChangeStates[state]!, [
                  tradeFact('原手机号', r['old_phone_mask']),
                  tradeFact('新手机号', r['new_phone_mask']),
                  tradeFact('申请有效至', communityDate(r['expires_at'])),
                  if (state == 'COMPLETED')
                    const Text('手机号变更已完成。当前登录可继续使用，不必再次跳转登录。'),
                  if (active && !can)
                    const Text('本次申请不能在当前会话继续，请回原登录设备办理或等待申请过期后重试。'),
                  if (can && state != 'READY') ...[
                    Text(side == 'OLD' ? '本步骤验证原手机号。' : '原手机号已验证，本步骤验证新手机号。'),
                    if (c != null) ...[
                      tradeFact(
                          '本次验证码状态',
                          const {
                            'SENT': '已发送',
                            'UNKNOWN': '发送结果未知',
                            'PENDING': '正在发送',
                            'CONSUMED': '已验证',
                            'EXPIRED': '已过期'
                          }[c['current_status']]),
                      tradeFact('剩余尝试', c['attempts_remaining']),
                      tradeFact('验证码有效至', communityDate(c['expires_at'])),
                    ],
                    tradeButton(
                        wait > 0
                            ? '请等待 $wait 秒后发送'
                            : '发送${side == 'OLD' ? '原' : '新'}手机号验证码',
                        locked || wait > 0 ? null : () => send('challenges'),
                        outline: true),
                    TextField(
                        controller: code,
                        enabled: !locked && verify,
                        maxLength: 6,
                        keyboardType: TextInputType.number,
                        obscureText: true,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: const InputDecoration(labelText: '本次验证码')),
                    tradeButton('验证${side == 'OLD' ? '原' : '新'}手机号',
                        locked || !verify ? null : () => send('verifications')),
                  ],
                  if (can && state == 'READY') ...[
                    const Text('确认后所有旧登录会失效，请使用上方新手机号重新登录。'),
                    CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: confirmed,
                        title: const Text('已核对新手机号，确认变更并结束旧登录'),
                        onChanged: locked
                            ? null
                            : (v) => setState(() => confirmed = v == true)),
                    tradeButton(
                        '确认更换手机号',
                        locked || !confirmed
                            ? null
                            : () => send('confirmation')),
                  ],
                  if (can)
                    tradeButton('取消本次换号', locked ? null : cancel,
                        outline: true),
                  if (!active)
                    tradeButton('开始新的换号申请',
                        locked ? null : () => setState(() => newRequest = true),
                        outline: true),
                ]),
              if (loaded && (r == null || newRequest))
                tradeSection('开始本人换号', [
                  const Text('开始前需要最近10分钟内验证登录。原手机号不可用时，请走人工核查。'),
                  TextField(
                      controller: oldPhone,
                      enabled: !locked,
                      maxLength: 11,
                      keyboardType: TextInputType.phone,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(labelText: '原手机号')),
                  TextField(
                      controller: newPhone,
                      enabled: !locked,
                      maxLength: 11,
                      keyboardType: TextInputType.phone,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(labelText: '新手机号')),
                  tradeButton('开始验证', locked ? null : () => send('create')),
                  tradeButton('重新验证登录', locked ? null : relogin, outline: true),
                ]),
              tradeButton('重新读取换号进度', busy ? null : load, outline: true),
              tradeButton(
                  '原手机号不可用，申请人工核查',
                  busy
                      ? null
                      : () => Navigator.pushNamed(context, '/support/new'),
                  outline: true),
              const Text('人工核查不保证换号获准；不会绕过本人验证或自动合并账号。'),
            ],
            locked: busy,
            onBack: leave));
  }
}
