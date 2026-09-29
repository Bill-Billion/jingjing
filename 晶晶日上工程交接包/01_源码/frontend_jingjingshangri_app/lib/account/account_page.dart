import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../pages/login/login_page.dart';
import 'account_theme.dart';
import '../contracts/contract_page.dart';
import 'account_api.dart';
import 'account_session.dart';

const _capabilities = {
  'AUTHOR': '作者',
  'SCRIPT_SUPPLIER': '剧本供给方',
  'PRODUCER': '制作方',
  'MCN': '经纪机构',
  'BRAND_CLIENT': '品牌客户',
};
String _status(dynamic value) =>
    const {
      'ACTIVE': '有效',
      'PENDING_REVIEW': '待审核',
      'APPROVED': '已通过',
      'REJECTED': '未通过',
      'SUSPENDED': '已停用',
      'CLOSED': '已关闭',
      'INVITED': '等待本人回应',
      'ACCEPTED': '已接受',
      'DECLINED': '已拒绝',
      'REVOKED': '已撤回 / 移除',
      'EXPIRED': '已过期',
    }[value] ??
    '$value';
String _time(dynamic value) {
  final parsed = DateTime.tryParse('$value')?.toLocal();
  if (parsed == null) return '$value';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${parsed.year}-${two(parsed.month)}-${two(parsed.day)} ${two(parsed.hour)}:${two(parsed.minute)}';
}

class AccountPage extends StatefulWidget {
  const AccountPage({super.key, this.embedded = false});
  final bool embedded;
  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> {
  late AccountSession _session;
  int? _seenEpoch;
  int _load = 0;
  bool _busy = false;
  String? _error;
  String? _notice;
  List<Map<String, dynamic>> _invitations = [];
  List<Map<String, dynamic>> _members = [];
  String? _invitationCursor;
  String? _memberCursor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _session = context.watch<AccountSession>();
    if (_seenEpoch != _session.epoch) {
      _seenEpoch = _session.epoch;
      _load++;
      _members = [];
      _invitations = [];
      _memberCursor = null;
      _invitationCursor = null;
      _error = null;
      _notice = null;
      _busy = false;
      if (_session.isLoggedIn) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _refresh();
        });
      }
    }
  }

  Future<void> _refresh() async {
    if (!_session.isLoggedIn) return;
    final ticket = ++_load;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _session.loadParties();
      await _session.refreshParty();
      final inbox =
          await _session.read('/api/v1/me/invitations', query: {'limit': 20});
      Map<String, dynamic>? members;
      final party = _session.partyId;
      if (party != null && _session.allows('MANAGE_MEMBERS')) {
        members = await _session.read('/api/v1/parties/$party/members',
            actingParty: party, query: {'limit': 20});
      }
      if (!mounted || ticket != _load) return;
      setState(() {
        _invitations = AccountSession.maps(inbox['items']);
        _invitationCursor = inbox['next_cursor'] as String?;
        _members = members == null ? [] : AccountSession.maps(members['items']);
        _memberCursor = members?['next_cursor'] as String?;
      });
    } on AccountError catch (e) {
      if (mounted && ticket == _load) setState(() => _error = e.message);
    } finally {
      if (mounted && ticket == _load) setState(() => _busy = false);
    }
  }

  Future<void> _perform(Future<void> Function() action, String success,
      {bool refresh = true}) async {
    if (_busy) return;
    final epoch = _session.epoch;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
      if (!mounted || epoch != _session.epoch) return;
      setState(() => _notice = success);
      if (refresh) await _refresh();
    } on AccountError catch (e) {
      if (mounted && epoch == _session.epoch) {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted && epoch == _session.epoch) setState(() => _busy = false);
    }
  }

  Future<void> _more(String kind) async {
    await _perform(() async {
      if (kind == 'parties') {
        await _session.loadParties(more: true);
        return;
      }
      final party = _session.partyId;
      final result = await _session.read(
        kind == 'members'
            ? '/api/v1/parties/$party/members'
            : '/api/v1/me/invitations',
        actingParty: kind == 'members' ? party : null,
        query: {
          'limit': 20,
          'cursor': kind == 'members' ? _memberCursor : _invitationCursor
        },
      );
      if (!mounted) return;
      setState(() {
        if (kind == 'members') {
          _members.addAll(AccountSession.maps(result['items']));
          _memberCursor = result['next_cursor'] as String?;
        } else {
          _invitations.addAll(AccountSession.maps(result['items']));
          _invitationCursor = result['next_cursor'] as String?;
        }
      });
    }, '已加载更多', refresh: false);
  }

  Future<bool> _confirm(String title, String message) async =>
      await showDialog<bool>(
        context: context,
        builder: (dialogContext) => Theme(
            data: AccountTheme.data,
            child: AlertDialog(
              title: Text(title),
              content: Text(message),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    child: const Text('取消')),
                FilledButton(
                    onPressed: () => Navigator.pop(dialogContext, true),
                    child: const Text('确认')),
              ],
            )),
      ) ??
      false;

  Future<void> _name({bool create = false}) async {
    final epoch = _session.epoch;
    final party = _session.party;
    final path =
        create ? '/api/v1/organizations' : '/api/v1/parties/${party!['id']}';
    final pending = _session.pending(create ? 'POST' : 'PATCH', path,
        actingParty: create ? null : party!['id'] as String);
    final result = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (_) => Theme(
            data: AccountTheme.data,
            child: _NameDialog(
              title: create ? '创建机构' : '修改机构名称',
              initial: pending?['body']?['display_name'] as String? ??
                  (create ? '' : '${party?['display_name'] ?? ''}'),
              uncertain: pending != null,
              submit: (value) async {
                if (epoch != _session.epoch) {
                  throw const AccountError(0, 'CONTEXT_CHANGED');
                }
                if (create) {
                  await _session.write('POST', '/api/v1/organizations',
                      body: {'display_name': value});
                } else {
                  await _session.write(
                      'PATCH', '/api/v1/parties/${party!['id']}',
                      actingParty: party['id'] as String,
                      version: (pending?['version'] ?? party['object_version'])
                          as int,
                      body: {'display_name': value});
                }
              },
            )));
    if (!mounted || epoch != _session.epoch) return;
    if (result != null) {
      setState(() => _notice = create ? '机构已创建，状态为待审核。' : '机构名称已更新。');
    }
    await _refresh();
  }

  Future<void> _invite() async {
    final epoch = _session.epoch;
    final id = _session.partyId!;
    final pending = _session.pending('POST', '/api/v1/parties/$id/invitations',
        actingParty: id);
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (_) => Theme(
          data: AccountTheme.data,
          child: _InviteDialog(
              pending: pending,
              submit: (accountId, expiresAt) async {
                if (epoch != _session.epoch) {
                  throw const AccountError(0, 'CONTEXT_CHANGED');
                }
                return _session.write('POST', '/api/v1/parties/$id/invitations',
                    actingParty: id,
                    body: {
                      'invitee_account_id': accountId,
                      'expires_at': expiresAt
                    });
              })),
    );
    if (result == null || !mounted || epoch != _session.epoch) return;
    _session.rememberInvitation(result);
    setState(() => _notice = '邀请已发出，须由对方本人接受。');
  }

  Future<void> _respond(
      Map<String, dynamic> invitation, String decision) async {
    final epoch = _session.epoch;
    final agree = decision == 'ACCEPT';
    if (!await _confirm(
        agree ? '接受机构邀请' : '拒绝机构邀请',
        agree
            ? '加入机构 ${invitation['party_id']}？成员身份不等于获得付款、作品使用或商业代理权。'
            : '拒绝这份邀请？')) {
      return;
    }
    if (!mounted || epoch != _session.epoch) return;
    await _perform(() async {
      final party = invitation['party_id'] as String;
      await _session.write('POST',
          '/api/v1/parties/$party/invitations/${invitation['invitation_id']}/responses',
          actingParty: party,
          version: invitation['object_version'] as int,
          body: {'decision': decision});
    }, agree ? '已接受邀请，可以在身份列表中选择该机构。' : '已拒绝邀请。');
  }

  Future<void> _revoke(Map<String, dynamic> invitation) async {
    final epoch = _session.epoch;
    if (!await _confirm(
        '撤回邀请', '撤回发给账号 ${invitation['invitee_account_id']} 的邀请？')) {
      return;
    }
    if (!mounted || epoch != _session.epoch) return;
    await _perform(() async {
      final party = invitation['party_id'] as String;
      final result = await _session.write('POST',
          '/api/v1/parties/$party/invitations/${invitation['invitation_id']}/revocations',
          actingParty: party, version: invitation['object_version'] as int);
      _session.rememberInvitation({...invitation, ...result});
    }, '邀请已撤回。', refresh: false);
  }

  Future<void> _remove(Map<String, dynamic> member) async {
    final epoch = _session.epoch;
    final party = _session.partyId!;
    if (!await _confirm(
        '移除普通成员', '移除账号 ${member['account_id']}？其个人账号和其他机构身份不受影响。')) {
      return;
    }
    if (!mounted || epoch != _session.epoch) return;
    await _perform(() async {
      await _session.write(
          'DELETE', '/api/v1/parties/$party/members/${member['account_id']}',
          actingParty: party, version: member['object_version'] as int);
    }, '成员已移除。');
  }

  Future<void> _logout() async {
    if (!await _confirm('退出登录', '退出当前账号？下次使用需重新验证手机号。')) return;
    if (!mounted) return;
    await _perform(_session.logout, '已退出登录', refresh: false);
  }

  Widget _card(String title, List<Widget> children, {String? subtitle}) => Card(
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 19, fontWeight: FontWeight.w700)),
                if (subtitle != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 7),
                      child: Text(subtitle,
                          style: const TextStyle(
                              color: AccountTheme.muted, height: 1.5))),
                const SizedBox(height: 16),
                ...children
              ],
            )),
      );
  Widget _small(String value) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(value,
          style: const TextStyle(color: AccountTheme.muted, height: 1.5)));
  Widget _id(String title, dynamic value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _small(title),
          SelectableText('$value', style: const TextStyle(fontSize: 12)),
        ]),
      );
  Widget _button(String title, VoidCallback callback, {IconData? icon}) =>
      OutlinedButton.icon(
        onPressed: _busy ? null : callback,
        icon: Icon(icon ?? Icons.chevron_right, size: 18),
        label: Text(title),
      );

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    final party = session.party;
    final pendingCapability = session.partyId == null
        ? null
        : session.pending(
            'POST', '/api/v1/parties/${session.partyId}/capabilities',
            actingParty: session.partyId);
    final body = !session.isLoggedIn
        ? Center(
            child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.manage_accounts_outlined,
                  size: 52, color: AccountTheme.accent),
              const SizedBox(height: 16),
              const Text('登录后管理账号与机构', style: TextStyle(fontSize: 20)),
              const SizedBox(height: 10),
              Text(session.authNotice ?? '使用真实短信验证码登录；旧版体验账号不能办理机构事务。',
                  textAlign: TextAlign.center),
              if (session.hasPendingLogout)
                TextButton(
                    onPressed: session.retryLogout,
                    child: const Text('重试通知服务器退出')),
              const SizedBox(height: 20),
              FilledButton(
                  onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                          builder: (_) => const LoginPage())),
                  child: const Text('手机号登录')),
            ]),
          ))
        : RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
              children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  Card(
                      color: AccountTheme.surface,
                      child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_error!,
                                    style: const TextStyle(
                                        color: AccountTheme.danger)),
                                TextButton(
                                    onPressed: _busy ? null : _refresh,
                                    child: const Text('刷新当前记录')),
                              ]))),
                if (_notice != null)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Text(_notice!,
                          style: const TextStyle(color: AccountTheme.accent))),
                _card(
                    '账号与机构',
                    [
                      Text('${session.account?['display_name'] ?? '我的账号'}',
                          style: const TextStyle(fontSize: 17)),
                      const SizedBox(height: 10),
                      _id('我的账号编号 · 邀请方需要此编号', session.account?['id']),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        _button(
                            '复制账号编号',
                            () => Clipboard.setData(ClipboardData(
                                text: '${session.account?['id']}')),
                            icon: Icons.copy),
                        _button('退出登录', _logout, icon: Icons.logout),
                      ]),
                    ],
                    subtitle: '管理账号、机构和成员，按授权阅读保存的合同。'),
                _card(
                    '选择办事身份',
                    [
                      if (session.parties.isEmpty) _small('暂无可用身份，请刷新获取。'),
                      ...session.parties.map((row) {
                        final value = row['party'] as Map;
                        final selected = value['id'] == session.partyId;
                        return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                  alignment: Alignment.centerLeft,
                                  side: BorderSide(
                                      color: selected
                                          ? AccountTheme.accent
                                          : AccountTheme.border),
                                  padding: const EdgeInsets.all(14)),
                              onPressed: _busy ||
                                      ['SUSPENDED', 'CLOSED']
                                          .contains(value['current_status'])
                                  ? null
                                  : () => session.select(row),
                              child: Row(children: [
                                Icon(selected
                                    ? Icons.radio_button_checked
                                    : Icons.radio_button_off),
                                const SizedBox(width: 12),
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Text('${value['display_name']}'),
                                      const SizedBox(height: 5),
                                      Text(
                                          '${value['kind'] == 'ORGANIZATION' ? '机构' : '个人'} · ${_status(value['current_status'])}',
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: AccountTheme.muted)),
                                    ]))
                              ]),
                            ));
                      }),
                      if (session.partiesCursor != null)
                        _button('加载更多身份', () => _more('parties')),
                      if ((session.account?['allowed_actions'] as List? ?? [])
                          .contains('CREATE_ORGANIZATION'))
                        _button('创建机构', () => _name(create: true),
                            icon: Icons.add_business_outlined),
                    ],
                    subtitle: '切换只选择代表谁办事，具体权限由服务器核对。'),
                if (party != null)
                  _card('作者与作品', [
                    _small('申请作者资格，管理作品版本与私有权利证明。'),
                    _button('进入作者与作品',
                        () => Navigator.pushNamed(context, '/supply')),
                  ]),
                _card('合同与原约定', [
                  _small('输入指定合同编号，查看当时保存的内容与规则。'),
                  _button(
                      '读取指定合同',
                      () => Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => const ContractPage())),
                      icon: Icons.description_outlined),
                ]),
                if (party != null)
                  _card('${party['display_name']}', [
                    _id('当前身份编号', party['id']),
                    _small(
                        '状态：${_status(party['current_status'])} · ${session.isOwner ? '负责人' : '普通成员'}'),
                    if (party['kind'] == 'ORGANIZATION' &&
                        session.isOwner &&
                        session.allows('READ_PARTY'))
                      _button('修改机构名称', _name, icon: Icons.edit_outlined),
                    const SizedBox(height: 10),
                    const Text('申请能力',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 10),
                    if (pendingCapability != null) ...[
                      _small('上次能力申请结果尚未确认，请先核对原申请。'),
                      _button(
                          '重试原申请',
                          () => _perform(() async {
                                final id = session.partyId!;
                                await session.write(
                                    'POST', '/api/v1/parties/$id/capabilities',
                                    actingParty: id,
                                    body: Map<String, dynamic>.from(
                                        pendingCapability['body'] as Map));
                              }, '原申请已确认，请查看最新状态。')),
                    ],
                    ..._capabilities.entries.map((entry) {
                      final matches = (party['capabilities'] as List? ?? [])
                          .where((c) => c['code'] == entry.key);
                      final current = matches.isEmpty ? null : matches.first;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(entry.value),
                        subtitle: Text(current == null
                            ? '尚未申请'
                            : _status(current['current_status'])),
                        trailing: current == null &&
                                pendingCapability == null &&
                                session.allows('REQUEST_CAPABILITY')
                            ? TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _perform(() async {
                                          final id = session.partyId!;
                                          await session.write('POST',
                                              '/api/v1/parties/$id/capabilities',
                                              actingParty: id,
                                              body: {'code': entry.key});
                                        }, '${entry.value}申请已提交，等待审核。'),
                                child: const Text('申请'))
                            : null,
                      );
                    }),
                    _small('申请不代表认证通过。审核、所有权转移、本人退出机构尚未开放。'),
                  ]),
                _card(
                    '收到的机构邀请',
                    [
                      if (_invitations.isEmpty) _small('暂无邀请。对方需使用上方账号编号邀请你。'),
                      ..._invitations.map((invitation) => Padding(
                          padding: const EdgeInsets.only(bottom: 18),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _id('邀请机构编号', invitation['party_id']),
                                _id('邀请人账号编号',
                                    invitation['inviter_account_id']),
                                _small(
                                    '${_status(invitation['current_status'])} · 截止 ${_time(invitation['expires_at'])}'),
                                if (invitation['current_status'] == 'INVITED')
                                  Wrap(spacing: 8, children: [
                                    _button('接受',
                                        () => _respond(invitation, 'ACCEPT'),
                                        icon: Icons.check),
                                    _button('拒绝',
                                        () => _respond(invitation, 'DECLINE'),
                                        icon: Icons.close),
                                  ]),
                                const Divider(),
                              ]))),
                      if (_invitationCursor != null)
                        _button('加载更多邀请', () => _more('invitations')),
                    ],
                    subtitle: '邀请属于你的账号。请先核对机构编号与邀请人，接受后才会成为成员。'),
                if (session.allows('MANAGE_MEMBERS')) ...[
                  _card(
                      '邀请成员',
                      [
                        _button('填写账号编号和截止时间', _invite,
                            icon: Icons.person_add_alt_1),
                        const SizedBox(height: 12),
                        ...session.sentInvitations
                            .where((i) => i['party_id'] == session.partyId)
                            .map((invitation) => Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      _id('收件人账号',
                                          invitation['invitee_account_id']),
                                      _id('邀请编号', invitation['invitation_id']),
                                      _small(
                                          '${_status(invitation['current_status'])} · 发送回执 · 截止 ${_time(invitation['expires_at'])}'),
                                      if (invitation['current_status'] ==
                                          'INVITED')
                                        _button('撤回这份邀请',
                                            () => _revoke(invitation)),
                                      const Divider(),
                                    ])),
                      ],
                      subtitle:
                          '下方仅保存本次登录发出的回执，可能已被对方处理。历史发件列表接口尚未开放；撤回时服务器会核对最新版本。'),
                  _card(
                      '机构成员',
                      [
                        if (_members.isEmpty) _small('暂无成员记录。'),
                        ..._members.map((member) => Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _id(
                                      member['role_code'] == 'OWNER'
                                          ? '负责人账号'
                                          : '普通成员账号',
                                      member['account_id']),
                                  _small(_status(member['current_status'])),
                                  if (member['role_code'] != 'OWNER' &&
                                      member['current_status'] == 'ACTIVE')
                                    _button('移除成员', () => _remove(member),
                                        icon: Icons.person_remove_outlined),
                                  const Divider(),
                                ])),
                        if (_memberCursor != null)
                          _button('加载更多成员', () => _more('members')),
                      ],
                      subtitle: '只有负责人可以管理成员；负责人不可移除。'),
                ],
              ],
            ));
    return AccountTheme(
        child: Scaffold(
      backgroundColor: AccountTheme.canvas,
      appBar: AppBar(
          automaticallyImplyLeading: !widget.embedded,
          title: const Text('我的账号'),
          actions: [
            if (session.isLoggedIn)
              IconButton(
                  tooltip: '刷新',
                  onPressed: _busy ? null : _refresh,
                  icon: const Icon(Icons.refresh))
          ]),
      body: body,
    ));
  }
}

class _NameDialog extends StatefulWidget {
  const _NameDialog(
      {required this.title,
      required this.initial,
      required this.submit,
      this.uncertain = false});
  final String title;
  final String initial;
  final bool uncertain;
  final Future<void> Function(String) submit;
  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final TextEditingController _name =
      TextEditingController(text: widget.initial);
  bool _busy = false;
  String? _error;
  bool _stale = false;
  late bool _uncertain = widget.uncertain;
  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final value = _name.text.trim();
    if (value.isEmpty || value.runes.length > 120) {
      setState(() => _error = '请填写 1–120 个字的机构名称。');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(value);
      if (mounted) Navigator.pop(context, value);
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _uncertain = e.uncertain;
          _stale = [401, 403, 404, 412].contains(e.status) ||
              e.code == 'CONTEXT_CHANGED';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !_busy,
      child: AlertDialog(
        title: Text(widget.title),
        content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: _name,
              enabled: !_busy && !_stale && !_uncertain,
              maxLength: 120,
              decoration: const InputDecoration(labelText: '机构名称')),
          if (_uncertain) const Text('上次结果尚未确认，已保留原内容，请重试原操作。'),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AccountTheme.danger)),
        ])),
        actions: [
          TextButton(
              onPressed: _busy ? null : () => Navigator.pop(context),
              child: const Text('返回')),
          FilledButton(
              onPressed: _busy || _stale ? null : _submit,
              child: Text(_busy
                  ? '提交中…'
                  : _uncertain
                      ? '重试原操作'
                      : '提交'))
        ],
      ));
}

class _InviteDialog extends StatefulWidget {
  const _InviteDialog({required this.submit, this.pending});
  final Map<String, dynamic>? pending;
  final Future<Map<String, dynamic>> Function(String, String) submit;
  @override
  State<_InviteDialog> createState() => _InviteDialogState();
}

class _InviteDialogState extends State<_InviteDialog> {
  late final _account = TextEditingController(
      text: widget.pending?['body']?['invitee_account_id'] as String? ?? '');
  late DateTime? _expiry =
      DateTime.tryParse('${widget.pending?['body']?['expires_at']}')?.toLocal();
  late bool _uncertain = widget.pending != null;
  bool _busy = false;
  bool _stale = false;
  String? _error;
  @override
  void dispose() {
    _account.dispose();
    super.dispose();
  }

  Future<void> _pickTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
        context: context,
        initialDate: _expiry ?? now,
        firstDate: DateTime(now.year, now.month, now.day),
        lastDate: DateTime(9999));
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context,
        initialTime: _expiry == null
            ? TimeOfDay.now()
            : TimeOfDay.fromDateTime(_expiry!));
    if (time == null || !mounted) return;
    setState(() => _expiry =
        DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _submit() async {
    if (!RegExp(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')
        .hasMatch(_account.text.trim())) {
      setState(() => _error = '请复制对方提供的完整账号编号（不是手机号）。');
      return;
    }
    if (_expiry == null || (!_uncertain && !_expiry!.isAfter(DateTime.now()))) {
      setState(() => _error = '请自行选择未来的邀请截止时间。');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.submit(
          _account.text.trim(), _expiry!.toUtc().toIso8601String());
      if (mounted) Navigator.pop(context, result);
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _uncertain = e.uncertain;
          _stale =
              [401, 403, 404].contains(e.status) || e.code == 'CONTEXT_CHANGED';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !_busy,
      child: AlertDialog(
        title: const Text('邀请机构成员'),
        content: SingleChildScrollView(
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              const Text('请向本人索取账号编号，不通过手机号搜索。对方接受前不会成为成员。'),
              const SizedBox(height: 16),
              TextField(
                  controller: _account,
                  enabled: !_busy && !_stale && !_uncertain,
                  decoration: const InputDecoration(labelText: '对方账号编号')),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                  onPressed: _busy || _stale || _uncertain ? null : _pickTime,
                  icon: const Icon(Icons.calendar_today),
                  label: Text(_expiry == null
                      ? '选择截止日期与时间'
                      : _time(_expiry!.toIso8601String()))),
              const Text('按本机时区显示，发送时转换为 UTC。',
                  style: TextStyle(color: AccountTheme.muted, fontSize: 12)),
              if (_uncertain) const Text('上次结果尚未确认，已保留原收件人和截止时间，请重试原操作。'),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: const TextStyle(color: AccountTheme.danger))),
            ])),
        actions: [
          TextButton(
              onPressed: _busy ? null : () => Navigator.pop(context),
              child: const Text('返回')),
          FilledButton(
              onPressed: _busy || _stale ? null : _submit,
              child: Text(_busy
                  ? '发送中…'
                  : _uncertain
                      ? '重试原操作'
                      : '发送邀请'))
        ],
      ));
}
