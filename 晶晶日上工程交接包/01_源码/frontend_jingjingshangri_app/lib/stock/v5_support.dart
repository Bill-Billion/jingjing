import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../trade/trade_widgets.dart';

bool v5Id(dynamic v) =>
    v is String &&
    RegExp(r'^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$')
        .hasMatch(v);
bool v5Hash(dynamic v) => v is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(v);
bool v5Int(dynamic v, {int min = 0, int max = 900000000000}) =>
    v is int && v >= min && v <= max;
bool v5Date(dynamic v) => v is String && DateTime.tryParse(v) != null;
void v5Require(bool ok) {
  if (!ok) {
    throw const AccountError(502, 'INVALID_V5_RESPONSE', uncertain: true);
  }
}

Map<String, dynamic> v5Map(dynamic v) {
  v5Require(v is Map<String, dynamic>);
  return v as Map<String, dynamic>;
}

List<dynamic> v5Rows(dynamic v, {int max = 100}) {
  v5Require(v is List && v.length <= max);
  return v as List;
}

List<String> v5Ids(dynamic v, {int max = 100}) {
  final r = v5Rows(v, max: max);
  v5Require(r.every(v5Id) && r.toSet().length == r.length);
  return r.cast<String>();
}

String v5Money(int n) => '¥${n ~/ 100}.${(n % 100).toString().padLeft(2, '0')}';
List<String> v5InputIds(dynamic v) {
  final ids = '$v'
      .trim()
      .split(RegExp(r'[\s,，;；]+'))
      .where((x) => x.isNotEmpty)
      .toList();
  if (ids.any((x) => !v5Id(x)) || ids.toSet().length != ids.length) {
    throw const AccountError(400, 'INVALID_ID');
  }
  return ids;
}

int v5InputInt(dynamic v, {int min = 1, int max = 900000000000}) {
  final n = int.tryParse('$v');
  if (n == null || n < min || n > max) {
    throw const AccountError(400, 'INVALID_AMOUNT');
  }
  return n;
}

int v5InputMoney(dynamic v) {
  final s = '$v'.trim();
  if (!RegExp(r'^[0-9]+(?:\.[0-9]{1,2})?$').hasMatch(s)) {
    throw const AccountError(400, 'INVALID_AMOUNT');
  }
  final p = s.split('.');
  final n = int.parse(p[0]) * 100 +
      (p.length == 1 ? 0 : int.parse(p[1].padRight(2, '0')));
  if (n < 1 || n > 900000000000) {
    throw const AccountError(400, 'INVALID_AMOUNT');
  }
  return n;
}

String v5InputDate(dynamic v) {
  final d = DateTime.tryParse('$v');
  if (d == null) throw const AccountError(400, 'INVALID_DATE');
  return d.toUtc().toIso8601String();
}

String v5LocalDate(dynamic value) {
  final date = DateTime.tryParse('${value ?? ''}')?.toLocal();
  if (date == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${date.year}-${two(date.month)}-${two(date.day)} ${two(date.hour)}:${two(date.minute)}';
}

Future<String?> v5PickDateTime(BuildContext context, dynamic current) async {
  final initial =
      DateTime.tryParse('${current ?? ''}')?.toLocal() ?? DateTime.now();
  final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year < 1900 ? initial.year : 1900),
      lastDate: DateTime(initial.year > 2200 ? initial.year + 1 : 2200),
      helpText: '选择本地日期',
      cancelText: '返回',
      confirmText: '下一步',
      builder: (_, child) => AccountTheme(child: child!));
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
      helpText: '选择本地时间',
      cancelText: '返回',
      confirmText: '确定',
      builder: (_, child) => AccountTheme(child: child!));
  if (time == null || !context.mounted) return null;
  return v5LocalDate(
      DateTime(date.year, date.month, date.day, time.hour, time.minute)
          .toIso8601String());
}

Widget v5DateField(BuildContext context,
        {required String label,
        required dynamic value,
        required void Function(String) onChanged,
        TextEditingController? controller,
        bool enabled = true,
        bool required = true}) =>
    TextFormField(
        key: controller == null ? ValueKey('$label:$value') : null,
        controller: controller,
        initialValue: controller == null ? v5LocalDate(value) : null,
        enabled: enabled,
        readOnly: true,
        decoration: InputDecoration(
            labelText: label,
            hintText: '选择日期与时间',
            helperText: '按本机本地时间显示',
            prefixIcon: const Icon(Icons.calendar_today_outlined),
            suffixIcon: !required && '${value ?? ''}'.isNotEmpty
                ? IconButton(
                    tooltip: '清空$label',
                    onPressed: enabled ? () => onChanged('') : null,
                    icon: const Icon(Icons.clear))
                : null),
        onTap: enabled
            ? () async {
                final selected =
                    await v5PickDateTime(context, controller?.text ?? value);
                if (selected != null && context.mounted) onChanged(selected);
              }
            : null,
        validator: (v) =>
            required && (v == null || DateTime.tryParse(v) == null)
                ? '请选择$label'
                : null);

List<Map<String, dynamic>> v5InputSlots(dynamic raw) {
  if (raw is! List || raw.isEmpty || raw.length > 60) {
    throw const AccountError(400, 'INVALID_AUDITION_SLOTS');
  }
  return raw.map((slot) {
    final start = v5InputDate(slot['starts_at']),
        end = v5InputDate(slot['ends_at']);
    if (!DateTime.parse(start).isBefore(DateTime.parse(end))) {
      throw const AccountError(400, 'INVALID_AUDITION_SLOTS');
    }
    return {'starts_at': start, 'ends_at': end};
  }).toList();
}

Widget v5SlotsField(BuildContext context,
    {required dynamic value,
    required void Function(List<Map<String, dynamic>>) onChanged,
    required bool enabled}) {
  final slots = value is List
      ? value.map((slot) => Map<String, dynamic>.from(slot as Map)).toList()
      : <Map<String, dynamic>>[];
  return tradeSection('可预约时段', [
    if (slots.isEmpty) appNotice('尚未选择可预约时段；不会预填业务时间。'),
    for (var i = 0; i < slots.length; i++) ...[
      v5DateField(context,
          label: '第${i + 1}段开始时间',
          value: slots[i]['starts_at'],
          enabled: enabled, onChanged: (v) {
        slots[i]['starts_at'] = v;
        onChanged(slots);
      }),
      v5DateField(context,
          label: '第${i + 1}段结束时间',
          value: slots[i]['ends_at'],
          enabled: enabled, onChanged: (v) {
        slots[i]['ends_at'] = v;
        onChanged(slots);
      }),
      tradeButton(
          '移除第${i + 1}个时段',
          enabled
              ? () {
                  slots.removeAt(i);
                  onChanged(slots);
                }
              : null,
          outline: true)
    ],
    tradeButton(
        '添加可预约时段',
        enabled && slots.length < 60
            ? () => onChanged([
                  ...slots,
                  {'starts_at': '', 'ends_at': ''}
                ])
            : null,
        outline: true)
  ]);
}

class V5Page<T> {
  V5Page(this.items, this.cursor);
  final List<T> items;
  final String? cursor;
  static V5Page<T> parse<T>(Map<String, dynamic> d, T Function(dynamic) parse,
      {String? previous}) {
    v5Require(d['next_cursor'] == null ||
        v5Id(d['next_cursor']) && d['next_cursor'] != previous);
    return V5Page(v5Rows(d['items']).map(parse).toList(), d['next_cursor']);
  }
}

class V5Api extends ChangeNotifier {
  V5Api(this.session, this.domain);
  final AccountSession session;
  final String domain;
  int writes = 0;
  String get base => '/api/v1/$domain';
  bool get denied => switch (domain) {
        'stock' => session.stockAccessDenied,
        'notices' => session.noticesAccessDenied,
        'auditions' => session.auditionsAccessDenied,
        'wallet' => session.walletAccessDenied,
        'gigs' => session.gigsAccessDenied,
        _ => true,
      };
  List<Map<String, dynamic>> get pendingOperations => switch (domain) {
        'stock' => session.stockPending,
        'notices' => session.noticesPending,
        'auditions' => session.auditionsPending,
        'wallet' => session.walletPending,
        'gigs' => session.gigsPending,
        _ => [],
      };
  Future<void> retryAccess() => switch (domain) {
        'stock' => session.retryStockAccess(),
        'notices' => session.retryNoticesAccess(),
        'auditions' => session.retryAuditionsAccess(),
        'wallet' => session.retryWalletAccess(),
        'gigs' => session.retryGigsAccess(),
        _ => Future.value(),
      };
  String owner({bool personal = false}) {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    final assignedOrganizationMember = ['auditions', 'gigs'].contains(domain) &&
        session.party?['kind'] == 'ORGANIZATION' &&
        (session.selected?['membership']?['roles'] as List?)
                ?.contains('MEMBER') ==
            true;
    if (denied ||
        session.partyId == null ||
        !session.isOwner && !assignedOrganizationMember ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status']) ||
        personal && session.party?['kind'] != 'PERSON') {
      throw const AccountError(403, 'V5_OWNER_REQUIRED');
    }
    return session.partyId!;
  }

  void check(int epoch, String? party) {
    if (epoch != session.epoch ||
        !session.isLoggedIn ||
        denied ||
        party != null && party != owner()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  String path(String suffix) {
    if (!suffix.startsWith('/') || suffix.contains('..')) {
      throw const AccountError(400, 'INVALID_PATH');
    }
    return '$base$suffix';
  }

  String key(String id) {
    if (!v5Id(id)) throw const AccountError(400, 'INVALID_ID');
    return id;
  }

  Future<T> get<T>(String suffix, T Function(Map<String, dynamic>) parse,
      {bool account = false, Map<String, dynamic>? query}) async {
    final p = account ? null : owner(), epoch = session.epoch;
    final d = await session.read(path(suffix), actingParty: p, query: query);
    check(epoch, p);
    return parse(d);
  }

  Future<T> post<T>(String suffix, Map<String, dynamic> body,
      T Function(Map<String, dynamic>) parse,
      {int? version}) async {
    if (utf8.encode(jsonEncode(body)).length > 65536) {
      throw const AccountError(413, 'FORM_TOO_LARGE');
    }
    final p = owner(), epoch = session.epoch;
    writes++;
    notifyListeners();
    try {
      final d = await session.write('POST', path(suffix),
          actingParty: p, body: body, version: version, validate: (d) {
        parse(d);
      });
      check(epoch, p);
      return parse(d);
    } finally {
      writes--;
      notifyListeners();
    }
  }

  Map<String, dynamic>? pending(String suffix) =>
      session.pending('POST', path(suffix), actingParty: session.partyId);
  Future<T> retry<T>(String suffix, T Function(Map<String, dynamic>) parse,
      {Future<void> Function()? reread}) async {
    final op = pending(suffix);
    if (op == null || op['bytes'] != null) {
      throw const AccountError(409, 'NO_PENDING_OPERATION');
    }
    await reread?.call();
    return post(suffix, v5Map(op['body']), parse, version: op['version']);
  }

  Future<Uint8List> bytes(String suffix,
      {bool account = false, int max = 50 * 1024 * 1024}) async {
    final p = account ? null : owner(), epoch = session.epoch;
    final b = await session.readBytes(path(suffix), actingParty: p);
    check(epoch, p);
    v5Require(b.isNotEmpty && b.length <= max);
    return b;
  }
}

class V5Frame extends StatelessWidget {
  const V5Frame(
      {super.key,
      required this.api,
      required this.title,
      required this.children});
  final V5Api api;
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: api,
      builder: (context, _) => tradeScaffold(context, title, children,
          locked: api.writes > 0 ||
              api.pendingOperations.isNotEmpty ||
              api.session.pending('POST', '/api/v1/supply/assets',
                      actingParty: api.session.partyId) !=
                  null));
}

class V5Gate extends StatelessWidget {
  const V5Gate(
      {super.key,
      required this.domain,
      required this.route,
      required this.builder,
      this.account = false,
      this.personal = false});
  final String domain, route;
  final bool account, personal;
  final Widget Function(AccountSession) builder;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>(), api = V5Api(s, domain);
    var allowed = s.isLoggedIn && !api.denied;
    if (!account) {
      try {
        api.owner(personal: personal);
      } on AccountError {
        allowed = false;
      }
    }
    return allowed
        ? KeyedSubtree(
            key: ValueKey('${s.epoch}:${s.partyId}:$domain:$route'),
            child: builder(s))
        : tradeScaffold(context, '账号与权限', [
            tradeHeading('先确认办事身份', eyebrow: '本人记录 / 私有资料'),
            appNotice(api.denied
                ? '当前记录权限已失效，私有资料已清空。请重新核对身份。'
                : personal
                    ? '请选择本人的个人负责人身份。'
                    : ['auditions', 'gigs'].contains(domain)
                        ? '登录并选择有效本人、负责人或获授权机构成员身份后办理。'
                        : '登录并选择有效负责人身份后办理。'),
            tradeButton(
                '前往账号与身份',
                () => s.isLoggedIn
                    ? Navigator.pushNamed(context, '/account')
                    : Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => LoginPage(returnRoute: route)))),
            if (api.denied)
              tradeButton('重新核对权限', () async {
                try {
                  await api.retryAccess();
                } catch (_) {}
              }, outline: true),
          ]);
  }
}

String v5Error(AccountError e) {
  if (e.uncertain) return '本次操作结果待核对。请恢复原请求，不能另换内容或重复发起。';
  if (e.status == 412) return '记录已有新版本。输入已保留，请读取最新状态并重新确认。';
  if ([403, 404].contains(e.status)) return '当前身份不能读取或办理这份记录，私有内容已清空。';
  const messages = {
    'AUTHENTICATION_REQUIRED': '请先登录并核对办事身份。',
    'INVALID_ID': '请选择有效记录，或核对原记录编号。',
    'INVALID_AMOUNT': '金额须为正数且最多两位小数；次数和时限须为约定范围内整数。',
    'INVALID_DATE': '请填写有效日期和时间。',
    'INVALID_V5_RESPONSE': '接口返回未通过核对，请重新读取原记录。',
    'PENDING_OPERATION_CHANGED': '前一次操作尚未核实，请先恢复原内容。',
    'CUSTODY_PROVIDER_NOT_CONNECTED': '消费者资金托管服务尚未接通，本次未充值或扣款。',
    'PAYMENT_PROVIDER_NOT_ENABLED': '付款服务尚未启用，请保留原订单等待核对。',
    'STOCK_RIGHTS_HOLD': '作品权利已暂停，已购文件也需等待独立复核。',
    'STOCK_NOT_LISTED': '作品当前未公开销售，请重新读取商品。',
    'STOCK_LICENSE_NOT_ACTIVE': '本单许可尚未生效、已暂停或已撤回，请查看原付款和售后记录。',
    'STOCK_L1_REQUIRED': '现货销售需要实际有效的 L1 认证；不要求先购买 L2。',
    'STOCK_SALE_CONSENT_REQUIRED': '全部出镜人须有覆盖现货销售与公开展示的有效同意。',
    'STOCK_SEPARATE_PREVIEW_REQUIRED': '正式文件与预览须分别上传，内容不能相同。',
    'STOCK_RECEIPT_NOT_READY': '请先成功取得本次文件、刷新通知并标记已读，再明确确认收件。',
    'STOCK_AFTERCARE_PENDING': '本单售后正在处理，暂不能继续交付或付款。',
    'NOTICE_PRIVATE_CONTACT_FORBIDDEN': '通告与投稿不填写站外联系方式或付款引导。',
    'NOTICE_SUBMISSION_CONSENT_REQUIRED': '本次投递需要本人对具体接收方的合作投稿授权。',
    'AUDITION_L2_REQUIRED': '试镜方案需要实际有效的 L2 资格。',
    'AUDITION_OFFER_OWNER_CONTEXT_REQUIRED':
        '获授权机构成员可办理实际分派的预约与会话。首次方案和私人材料由负责人按实际授权办理。',
    'ARTIST_PERSONAL_CONFIRMATION_REQUIRED': '这项私人归档授权须由艺人本人单独确认。',
    'UNSAFE_AUDITION_REQUEST': '请核对用途和正规场地；当前预约不能通过安全条件。',
    'AUDITION_TIME_NOT_AVAILABLE': '请在所选可约窗口内选择本次真实起止时间，单次不超过24小时。',
    'COMMERCIAL_ORDER_REQUIRED': '只有原商业订单及其有效参与方可以进入本单会话。',
    'COMMERCIAL_ACCEPTANCE_REQUIRED': '本单尚未完成买方确认，暂不能开放会话。',
    'COMMERCIAL_CONVERSATION_AWAITING_PAYMENT': '原商业订单尚无核实收款，会话未开放。',
    'COMMERCIAL_CONVERSATION_FROZEN': '原订单或独立客服已冻结本单会话，当前不能继续写入或读取联系卡。',
    'COMMERCIAL_CONVERSATION_ARCHIVED': '本单会话已归档，当前不能继续写入或读取联系卡。',
    'COMMERCIAL_MESSAGE_HIDDEN': '本条消息已被独立客服隐藏，原附件与内容已清空。',
    'MESSAGE_REQUIRES_MODERATION': '请只填写本单业务内容，不包含站外联系方式或付款引导。',
    'CONTACT_CONSENT_REQUIRED': '请明确选择本单联系卡授予或撤回；授予时填写真实有效联系电话。',
    'AUDITION_DELIVERY_COUNT_MISMATCH': '取样数量须与本单审核规则一致。',
    'AUDITION_CONVERSATION_NOT_OPEN': '本单会话尚未开放或已冻结，请核对实际付款和接单状态。',
    'WALLET_ACCOUNT_REQUIRED': '尚未开立个人账本，请先阅读并接受有效规则。',
    'WALLET_NOT_FOUND': '本人的账本或订单记录尚不存在。',
    'WALLET_RULE_CHANGED': '规则版本已变化，请重新阅读并确认当前有效规则。',
    'FREE_REWARD_NOT_CONFIGURED': '本项免费奖励尚未配置，未发放晶钻。',
    'POINTS_REVERSAL_PENDING': '退款对应晶钻待冲回，将从未来奖励抵扣，不追收现金。',
    'PRIVATE_CONTENT_MISMATCH': '私有文件校验失败，本次不能记为成功查看。',
    'CONTEXT_CHANGED': '办事身份已变化，原页面私有内容已清空。',
  };
  return messages[e.code] ?? '本次未能办理，请核对原记录。原因：${e.code}';
}

class V5Field {
  const V5Field(this.keyName, this.label,
      {this.type = 'text', this.required = true, this.choices, this.hint});
  final String keyName, label, type;
  final bool required;
  final Map<String, String>? choices;
  final String? hint;
}

Future<bool> v5Confirm(
    BuildContext context, V5Api api, String title, List<Widget> facts) {
  final epoch = api.session.epoch, party = api.session.partyId;
  return showDialog<bool>(
      context: context,
      builder: (c) => AnimatedBuilder(
          animation: api.session,
          builder: (context, _) {
            final same = epoch == api.session.epoch &&
                party == api.session.partyId &&
                api.session.isLoggedIn &&
                !api.denied;
            return AccountTheme(
                child: AlertDialog(
                    title: Text(title),
                    content: SingleChildScrollView(
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: same
                                ? facts
                                : [appNotice('办事身份已变化，原确认内容已清空。')])),
                    actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('返回核对')),
                  FilledButton(
                      onPressed: same ? () => Navigator.pop(c, true) : null,
                      child: const Text('确认办理'))
                ]));
          })).then((v) => v == true);
}

class V5Form extends StatefulWidget {
  const V5Form(
      {super.key,
      required this.api,
      required this.title,
      required this.action,
      required this.suffix,
      required this.fields,
      required this.buildBody,
      required this.parse,
      this.initial = const {},
      this.version,
      this.restore,
      this.reload,
      this.onSuccess,
      this.canSubmit = true,
      this.facts = const [],
      this.extra});
  final V5Api api;
  final bool canSubmit;
  final String title, action, suffix;
  final List<V5Field> fields;
  final Map<String, dynamic> initial;
  final Map<String, dynamic> Function(Map<String, dynamic>) buildBody;
  final Map<String, dynamic> Function(Map<String, dynamic>)? restore;
  final void Function(Map<String, dynamic>) parse;
  final int? version;
  final Future<int?> Function()? reload;
  final void Function(Map<String, dynamic>)? onSuccess;
  final List<Widget> facts;
  final List<Widget> Function(
      Map<String, dynamic>, void Function(String, dynamic), bool)? extra;
  @override
  State<V5Form> createState() => _V5FormState();
}

class _V5FormState extends State<V5Form> {
  final form = GlobalKey<FormState>();
  final controllers = <String, TextEditingController>{};
  final values = <String, dynamic>{};
  String? error, notice;
  bool busy = false,
      conflict = false,
      fresh = false,
      reviewed = false,
      completed = false;
  int? version;
  int ticket = 0;
  Map<String, dynamic>? get pending => widget.api.pending(widget.suffix);
  @override
  void initState() {
    super.initState();
    version = widget.version;
    values.addAll(widget.initial);
    final op = pending;
    if (op != null) {
      values
          .addAll(widget.restore?.call(v5Map(op['body'])) ?? v5Map(op['body']));
    }
    for (final f in widget.fields) {
      if (f.type != 'bool' && f.type != 'slots' && f.choices == null) {
        controllers[f.keyName] = TextEditingController(
            text: f.type == 'datetime'
                ? v5LocalDate(values[f.keyName])
                : '${values[f.keyName] ?? ''}');
      }
    }
  }

  @override
  void dispose() {
    ticket++;
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void change(String key, dynamic value) {
    setState(() {
      values[key] = value;
      controllers[key]?.text = value is List ? value.join(', ') : '$value';
    });
  }

  Future<void> latest() async {
    final t = ++ticket,
        epoch = widget.api.session.epoch,
        p = widget.api.owner();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final v = await widget.reload!();
      widget.api.check(epoch, p);
      if (!mounted || t != ticket) return;
      setState(() {
        version = v;
        fresh = true;
        reviewed = false;
      });
    } on AccountError catch (e) {
      if (mounted && t == ticket) setState(() => error = v5Error(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    final op = pending;
    if (op == null &&
        (!widget.canSubmit ||
            !form.currentState!.validate() ||
            conflict && !reviewed)) {
      return;
    }
    Map<String, dynamic> body;
    try {
      for (final c in controllers.entries) {
        values[c.key] = c.value.text;
      }
      body = op == null ? widget.buildBody(values) : v5Map(op['body']);
    } on AccountError catch (e) {
      setState(() => error = v5Error(e));
      return;
    } catch (_) {
      setState(() => error = '请核对本页必填内容和具体记录。');
      return;
    }
    final epoch = widget.api.session.epoch, party = widget.api.owner();
    if (op == null &&
        !await v5Confirm(context, widget.api, widget.action, [
          for (final f in widget.fields)
            tradeFact(
                f.label,
                f.type == 'bool'
                    ? values[f.keyName] == true
                        ? '已勾选'
                        : '未勾选'
                    : f.type == 'slots'
                        ? (values[f.keyName] as List? ?? [])
                            .map((slot) =>
                                '${v5LocalDate(slot['starts_at'])} 至 ${v5LocalDate(slot['ends_at'])}')
                            .join('\n')
                        : f.choices?[values[f.keyName]] ?? values[f.keyName]),
          ...widget.facts
        ])) {
      return;
    }
    if (epoch != widget.api.session.epoch ||
        party != widget.api.session.partyId) {
      return;
    }
    widget.api.check(epoch, party);
    if (!mounted) return;
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      if (op != null) await widget.reload?.call();
      final result = await widget.api.post(widget.suffix, body, (d) {
        widget.parse(d);
        return d;
      }, version: op?['version'] ?? version);
      widget.api.check(epoch, party);
      if (!mounted || t != ticket) return;
      setState(() {
        completed = true;
        notice = '服务器已记录本次操作，请按实际状态继续。';
      });
      widget.onSuccess?.call(result);
    } on AccountError catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = v5Error(e);
          if (e.status == 412 ||
              [
                'WALLET_RULE_CHANGED',
                'STOCK_OFFER_CHANGED',
                'AUDITION_OFFER_CHANGED',
                'SUPPLEMENT_CHANGED'
              ].contains(e.code)) {
            conflict = true;
            fresh = false;
            reviewed = false;
          }
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final op = pending,
        locked = busy || op != null,
        enabled = !locked && !completed;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!, icon: Icons.error_outline),
      if (notice != null) appNotice(notice!),
      if (op != null) appNotice('本次结果待核对，保留原内容、原版本及同一次操作标识。'),
      Form(
          key: form,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final f in widget.fields)
              Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: f.type == 'bool'
                      ? CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(f.label),
                          value: values[f.keyName] == true,
                          onChanged: enabled
                              ? (v) => change(f.keyName, v == true)
                              : null)
                      : f.type == 'slots'
                          ? v5SlotsField(context,
                              value: values[f.keyName],
                              enabled: enabled,
                              onChanged: (v) => change(f.keyName, v))
                          : f.type == 'datetime'
                              ? v5DateField(context,
                                  label: f.label,
                                  value: values[f.keyName],
                                  controller: controllers[f.keyName],
                                  enabled: enabled,
                                  required: f.required,
                                  onChanged: (v) => change(f.keyName, v))
                              : f.choices != null
                                  ? DropdownButtonFormField<String>(
                                      initialValue: f.choices!.containsKey(values[f.keyName])
                                          ? values[f.keyName] as String
                                          : null,
                                      isExpanded: true,
                                      decoration:
                                          InputDecoration(labelText: f.label),
                                      items: f.choices!.entries
                                          .map((e) => DropdownMenuItem(
                                              value: e.key,
                                              child: Text(e.value,
                                                  overflow:
                                                      TextOverflow.ellipsis)))
                                          .toList(),
                                      onChanged: enabled
                                          ? (v) => change(f.keyName, v)
                                          : null,
                                      validator: (v) => f.required && v == null
                                          ? '请选择${f.label}'
                                          : null)
                                  : TextFormField(
                                      controller: controllers[f.keyName],
                                      enabled: enabled,
                                      minLines: f.type == 'multiline' ? 3 : 1,
                                      maxLines: f.type == 'multiline' ? 8 : 1,
                                      maxLength:
                                          f.type == 'multiline' ? 8000 : 500,
                                      keyboardType: ['money', 'int'].contains(f.type)
                                          ? const TextInputType.numberWithOptions(
                                              decimal: true)
                                          : TextInputType.text,
                                      decoration: InputDecoration(
                                          labelText: f.label,
                                          helperText: f.hint),
                                      validator: (v) => f.required && (v == null || v.trim().isEmpty) ? '请填写${f.label}' : null)),
            ...?widget.extra?.call(values, change, enabled),
          ])),
      if (conflict && widget.reload != null) ...[
        tradeButton('读取最新状态并保留输入', busy ? null : latest, outline: true),
        if (fresh)
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('我已核对最新记录，确认沿用本页输入办理'),
              value: reviewed,
              onChanged:
                  busy ? null : (v) => setState(() => reviewed = v == true)),
      ],
      tradeButton(
          op != null ? '恢复原请求核对' : widget.action,
          busy ||
                  completed ||
                  op == null && (!widget.canSubmit || conflict && !reviewed)
              ? null
              : submit),
    ]);
  }
}

class V5RecoveryPanel extends StatefulWidget {
  const V5RecoveryPanel(
      {super.key,
      required this.api,
      required this.label,
      required this.restore,
      required this.onRestored});
  final V5Api api;
  final String? Function(String) label;
  final Future<Map<String, dynamic>> Function(String) restore;
  final void Function(Map<String, dynamic>) onRestored;
  @override
  State<V5RecoveryPanel> createState() => _V5RecoveryPanelState();
}

class _V5RecoveryPanelState extends State<V5RecoveryPanel> {
  String? error;
  bool busy = false;
  Future<void> restore(String path) async {
    final epoch = widget.api.session.epoch, p = widget.api.owner();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await widget.restore(path);
      widget.api.check(epoch, p);
      if (mounted) widget.onRestored(r);
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: widget.api,
      builder: (context, _) {
        final ops = widget.api.pendingOperations
            .where((p) => widget.label(p['path']) != null)
            .toList();
        return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (error != null) appNotice(error!),
              for (final op in ops)
                tradeSection('原操作结果待核对', [
                  Text(widget.label(op['path'])!),
                  appNotice('保留本次原内容、原版本和操作标识。先读取本人原记录，再恢复同一次请求；不另造新操作。'),
                  if (op['body'] is Map)
                    for (final k in ['title', 'reason', 'purpose'])
                      if (op['body'][k] is String) Text(op['body'][k]),
                  tradeButton(
                      '恢复原${widget.label(op['path'])}请求',
                      busy || widget.api.writes > 0
                          ? null
                          : () => restore(op['path']),
                      outline: true),
                ]),
            ]);
      });
}
