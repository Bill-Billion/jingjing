import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../engagement/community_support.dart';
import '../supply/supply_models.dart';
import '../trade/trade_widgets.dart';

const invoiceStates = {
  'REQUESTED': '申请已提交，等待审核',
  'NEEDS_INFO': '需要本人补充材料',
  'APPROVED': '申请已审核，等待录入票据',
  'DOCUMENT_REVIEW': '票据等待独立复核',
  'ISSUED': '已有获准票据',
  'CORRECTION_REQUESTED': '已申请更正，等待核查',
  'REJECTED': '申请未通过',
  'WITHDRAWN': '申请已撤回'
};
const invoiceActions = {
  'SUBMIT': '提交申请',
  'SUPPLEMENT': '补交材料',
  'WITHDRAW': '撤回申请',
  'REQUEST_CORRECTION': '申请更正',
  'REQUEST_INFO': '要求补件',
  'APPROVE': '审核申请',
  'REJECT': '拒绝申请',
  'RECORD_DOCUMENT': '录入待复核票据',
  'VERIFY_DOCUMENT': '独立复核通过',
  'REJECT_DOCUMENT': '票据复核未通过'
};
bool invoiceMinor(Object? v) => v is int && v >= 0 && v <= 900000000000;
Map<String, dynamic> invoiceHeader(Object? raw) {
  final h = communityMap(raw);
  communityRequire(['PERSON', 'ORGANIZATION'].contains(h['kind']) &&
      h['title'] is String &&
      (h['title'] as String).trim().isNotEmpty &&
      (h['kind'] == 'PERSON'
          ? h['tax_id'] == null
          : h['tax_id'] is String && h['tax_id'].isNotEmpty));
  return h;
}

Map<String, dynamic> invoiceEligibility(
    Map<String, dynamic> r, String orderId) {
  communityRequire(r['order_id'] == orderId &&
      communityId(orderId) &&
      r['currency'] == 'CNY' &&
      [null, 'SANDBOX', 'PRODUCTION'].contains(r['environment']));
  for (final k in [
    'received_minor',
    'refunded_minor',
    'pending_refund_minor',
    'occupied_minor',
    'available_minor'
  ]) {
    communityRequire(invoiceMinor(r[k]));
  }
  return r;
}

Map<String, dynamic> invoiceRecord(Map<String, dynamic> r, String party,
    {String? id, String? orderId}) {
  communityRequire(communityId(r['id']) &&
      (id == null || r['id'] == id) &&
      communityId(r['order_id']) &&
      (orderId == null || r['order_id'] == orderId) &&
      r['buyer_party_id'] == party &&
      communityId(r['issuer_party_id']) &&
      ['SANDBOX', 'PRODUCTION'].contains(r['environment']) &&
      r['currency'] == 'CNY' &&
      invoiceStates.containsKey(r['current_status']) &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      invoiceMinor(r['requested_minor']) &&
      r['requested_minor'] > 0 &&
      invoiceMinor(r['occupied_minor']) &&
      invoiceMinor(r['available_for_this_request_minor']) &&
      r['requires_correction'] is bool);
  for (final k in ['issued_document_id', 'pending_document_id']) {
    communityRequire(r[k] == null || communityId(r[k]));
  }
  invoiceHeader(r['header']);
  return r;
}

Map<String, dynamic> invoiceDocument(
    Map<String, dynamic> r, String invoiceId, String orderId) {
  final c = communityMap(r['content']);
  communityRequire(communityId(r['id']) &&
      ['ISSUED', 'SUPERSEDED'].contains(r['current_status']) &&
      communityDigest(c) == r['content_sha256'] &&
      c['invoice_id'] == invoiceId &&
      c['order_id'] == orderId &&
      invoiceMinor(c['amount_minor']) &&
      c['currency'] == 'CNY' &&
      c['simulated'] is bool &&
      ['SANDBOX', 'PRODUCTION'].contains(c['environment']) &&
      c['simulated'] == (c['environment'] == 'SANDBOX') &&
      c['label'] is String &&
      c['reference'] is String &&
      DateTime.tryParse('${c['issued_at']}') != null);
  invoiceHeader(c['header']);
  final issuer = communityMap(c['issuer']);
  communityRequire(communityDigest(issuer) == c['issuer_sha256']);
  if (!c['simulated']) {
    final proof = communityMap(c['asset_proof']);
    communityRequire(proof['content_sha256'] is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(proof['content_sha256']) &&
        proof['byte_size'] is int &&
        proof['byte_size'] > 0);
  }
  return r;
}

List<String> invoiceApplicantActions(Map<String, dynamic> r) => [
      if (r['current_status'] == 'NEEDS_INFO') 'SUPPLEMENT',
      if (['REQUESTED', 'NEEDS_INFO', 'APPROVED', 'DOCUMENT_REVIEW']
              .contains(r['current_status']) &&
          r['issued_document_id'] == null)
        'WITHDRAW',
      if (r['current_status'] == 'ISSUED') 'REQUEST_CORRECTION'
    ];
String invoiceError(Object e) {
  if (e is AccountError) {
    final text = const {
      'INVOICE_AMOUNT_UNAVAILABLE': '可申请金额已有变化，已重新核对额度。请调整金额后再确认。',
      'INVOICE_STATE_CONFLICT': '申请状态已有变化，请读取当前进度后再办理。',
      'INVOICE_ISSUER_NOT_READY': '真实开票方尚未配置完成，目前不能形成获准票据。',
      'INVOICE_SANDBOX_DISABLED': '当前环境未开放模拟凭证。',
      'INVOICE_ISSUER_CHANGED': '开票方资料已有变化，需要重新核查。',
      'INVOICE_DOCUMENT_NOT_FOUND': '这份票据已不可下载，请重新读取获准票据列表。',
      'INVOICE_ATTACHMENT_NOT_FOUND': '这份材料已不可下载，请重新核对处理记录。',
      'CONTENT_RESTRICTED': '材料当前已受限，不能继续下载。',
      'SERVICE_UNAVAILABLE': '开票服务暂时不可用，金额和处理结果尚未确认。',
      'IDEMPOTENCY_CONFLICT': '原请求内容不一致，请保留原申请并联系人工核查。'
    }[e.code];
    if (text != null) return text;
  }
  return communityError(e);
}

String invoiceBusinessRoute(String? orderId) => communityId(orderId)
    ? Uri(path: '/trade/record', queryParameters: {'recordId': orderId!})
        .toString()
    : '/orders';

class InvoicePage extends StatelessWidget {
  const InvoicePage({super.key, this.orderId, this.invoiceId});
  final String? orderId, invoiceId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'invoices',
      route: Uri(path: '/invoices', queryParameters: {
        if (orderId != null) 'orderId': orderId!,
        if (invoiceId != null) 'invoiceId': invoiceId!
      }).toString(),
      title: '发票与票据',
      builder: (s) =>
          _Invoices(session: s, orderId: orderId, invoiceId: invoiceId));
}

class _Invoices extends StatefulWidget {
  const _Invoices({required this.session, this.orderId, this.invoiceId});
  final AccountSession session;
  final String? orderId, invoiceId;
  @override
  State<_Invoices> createState() => _InvoicesState();
}

class _InvoicesState extends State<_Invoices> {
  late final api = CommunityApi(widget.session, 'invoices');
  final title = TextEditingController(),
      tax = TextEditingController(),
      amount = TextEditingController(),
      text = TextEditingController();
  String kind = 'PERSON';
  String? error, notice, filter;
  Map<String, dynamic>? eligibility, record;
  final rows = <Map<String, dynamic>>[],
      events = <Map<String, dynamic>>[],
      documents = <Map<String, dynamic>>[],
      attachments = <Map<String, dynamic>>[];
  final cursors = <String, dynamic>{};
  final pageErrors = <String, String>{};
  final loading = <String>{};
  bool busy = false, uploading = false, leaving = false, headerDirty = false;
  double? progress;
  int generation = 0;
  bool get create => widget.invoiceId == null && widget.orderId != null;
  AccountSession get s => widget.session;
  List<Map<String, dynamic>> get pending => s.pendingForPrefix(api.prefix);
  Map<String, dynamic>? get pendingUpload =>
      s.pending('POST', '/api/v1/supply/assets', actingParty: s.partyId);
  bool get locked =>
      busy ||
      uploading ||
      loading.isNotEmpty ||
      pending.isNotEmpty ||
      pendingUpload != null;
  bool get draft =>
      text.text.isNotEmpty ||
      attachments.isNotEmpty ||
      headerDirty ||
      create &&
          (title.text.isNotEmpty ||
              tax.text.isNotEmpty ||
              amount.text.isNotEmpty);
  @override
  void initState() {
    super.initState();
    for (final c in [title, tax, amount, text]) {
      c.addListener(changed);
    }
    load();
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    generation++;
    for (final c in [title, tax, amount, text]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    if (busy || uploading) return;
    final g = ++generation;
    setState(() {
      busy = true;
      error = null;
      eligibility = null;
      record = null;
      rows.clear();
      events.clear();
      documents.clear();
      cursors.clear();
      pageErrors.clear();
      loading.clear();
    });
    try {
      if (create) {
        final id = communityRequiredId(widget.orderId!, '原订单');
        final d =
            invoiceEligibility(await api.read('orders/$id/eligibility'), id);
        if (!mounted || g != generation) return;
        setState(() => eligibility = d);
      } else if (widget.invoiceId != null) {
        final id = communityRequiredId(widget.invoiceId!, '开票申请');
        final d =
            invoiceRecord(await api.read('requests/$id'), s.partyId!, id: id);
        if (!mounted || g != generation) return;
        setState(() {
          record = d;
          if (!headerDirty) {
            final h = invoiceHeader(d['header']);
            kind = h['kind'];
            title.text = h['title'];
            tax.text = h['tax_id'] ?? '';
          }
        });
        await Future.wait([
          loadPage('history', generation: g),
          loadPage('documents', generation: g)
        ]);
      } else {
        await loadPage('list', generation: g);
      }
    } catch (e) {
      if (mounted && g == generation) setState(() => error = invoiceError(e));
    } finally {
      if (mounted && g == generation) setState(() => busy = false);
    }
  }

  Future<void> loadPage(String section,
      {bool more = false, int? generation}) async {
    if (loading.contains(section) || more && cursors[section] == null) return;
    final g = generation ?? this.generation;
    final cursor = cursors[section];
    setState(() {
      loading.add(section);
      pageErrors.remove(section);
    });
    try {
      final path = section == 'list'
          ? 'requests'
          : 'requests/${widget.invoiceId}/$section';
      final d = await api.read(path, query: {
        'limit': 20,
        if (more) 'cursor': cursor,
        if (section == 'list' && filter != null) 'status': filter
      });
      final next = d['next_cursor'];
      communityRequire(next == null ||
          (section == 'history' ? next is int && next > 0 : communityId(next)));
      communityRequire(!more || next == null || next != cursor);
      final items = communityItems(d).map((r) {
        if (section == 'list') return invoiceRecord(r, s.partyId!);
        if (section == 'documents') {
          return invoiceDocument(r, widget.invoiceId!, record!['order_id']);
        }
        communityRequire(r['object_version'] is int &&
            r['object_version'] > 0 &&
            ['APPLICANT', 'OPERATOR'].contains(r['actor_kind']) &&
            invoiceActions.containsKey(r['action']) &&
            r['text'] is String &&
            invoiceStates.containsKey(r['status']) &&
            invoiceMinor(r['amount_minor']) &&
            r['asset_ids'] is List &&
            (r['asset_ids'] as List).length <= 8 &&
            (r['asset_ids'] as List).every(communityId));
        invoiceHeader(r['header']);
        return r;
      }).toList();
      if (!mounted || g != this.generation) return;
      setState(() {
        final target = section == 'list'
            ? rows
            : section == 'history'
                ? events
                : documents;
        if (!more) target.clear();
        final key = section == 'history' ? 'object_version' : 'id';
        for (final r in items) {
          final i = target.indexWhere((old) => old[key] == r[key]);
          if (i < 0) {
            target.add(r);
          } else {
            target[i] = r;
          }
        }
        cursors[section] = next;
      });
    } catch (e) {
      if (mounted && g == this.generation) {
        setState(() => pageErrors[section] = invoiceError(e));
      }
    } finally {
      if (mounted && g == this.generation) {
        setState(() => loading.remove(section));
      }
    }
  }

  Future<void> upload({bool restore = false}) async {
    if (busy || uploading || attachments.length >= 8) return;
    final epoch = s.epoch, party = s.partyId;
    setState(() {
      uploading = true;
      error = null;
      progress = null;
    });
    try {
      Uint8List bytes;
      String media, name, purpose;
      if (restore) {
        final p = pendingUpload;
        if (p == null) return;
        bytes = p['bytes'];
        final query = communityMap(p['query']);
        media = query['media_type'];
        purpose = query['purpose'];
        name = '恢复的附件';
      } else {
        final picked = await FilePicker.pickFiles(
            withData: true,
            type: FileType.custom,
            allowedExtensions: supplyMedia.keys.toList());
        if (picked == null) return;
        final f = picked.files.single;
        bytes = f.bytes ?? Uint8List(0);
        media = supplyMedia[f.extension?.toLowerCase()] ?? '';
        purpose = 'RIGHTS_EVIDENCE';
        name = f.name;
      }
      if (!mounted || epoch != s.epoch || party == null) return;
      if (bytes.isEmpty ||
          bytes.length > maxSupplyBytes ||
          media.isEmpty ||
          !['REVIEW_EVIDENCE', 'RIGHTS_EVIDENCE'].contains(purpose)) {
        throw const AccountError(400, '附件须为支持的就绪材料，且不超过8MB');
      }
      final d = await s.upload('/api/v1/supply/assets', bytes,
          actingParty: party, query: {'purpose': purpose, 'media_type': media},
          onSendProgress: (sent, total) {
        if (mounted) setState(() => progress = total > 0 ? sent / total : null);
      }, validate: (d) {
        SupplyDto.asset(d, party, purpose: purpose);
        communityRequire(d['current_status'] == 'READY' &&
            d['byte_size'] == bytes.length &&
            d['media_type'] == media &&
            d['content_sha256'] == sha256.convert(bytes).toString());
      });
      if (mounted && epoch == s.epoch) {
        setState(() {
          if (!attachments.any((a) => a['id'] == d['id'])) {
            attachments.add({...d, 'name': name});
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = invoiceError(e));
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error!)));
      }
    } finally {
      if (mounted) setState(() => uploading = false);
    }
  }

  Map<String, dynamic> headerInput() => {
        'kind': kind,
        'title': communityRequired(title.text, '抬头名称', max: 200),
        'tax_id': kind == 'PERSON'
            ? null
            : communityRequired(tax.text, '纳税人识别号', max: 80)
      };
  Future<void> submit({String? action, Map<String, dynamic>? recovery}) async {
    if (busy ||
        uploading ||
        recovery == null && (pending.isNotEmpty || pendingUpload != null)) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final path = recovery != null
          ? (recovery['path'] as String).substring(api.prefix.length)
          : create
              ? 'requests'
              : 'requests/${widget.invoiceId}/actions';
      final body = recovery != null
          ? communityMap(recovery['body'])
          : <String, dynamic>{
              if (create) ...{
                'order_id': widget.orderId,
                'amount_minor': communityMinor(amount.text, '申请金额'),
                'header': headerInput()
              } else
                'action': action,
              'text': communityRequired(text.text, '本次说明', max: 2000),
              if (create || action == 'SUPPLEMENT')
                'asset_ids': attachments.map((a) => a['id']).toList(),
              if (action == 'SUPPLEMENT') 'header': headerInput(),
            };
      if (create &&
          recovery == null &&
          (eligibility == null ||
              body['amount_minor'] > eligibility!['available_minor'])) {
        throw const AccountError(409, 'INVOICE_AMOUNT_UNAVAILABLE');
      }
      if (recovery != null) {
        if (path == 'requests') {
          await api.read('requests', query: {'limit': 20});
          invoiceEligibility(
              await api.read('orders/${body['order_id']}/eligibility'),
              body['order_id']);
        } else {
          invoiceRecord(
              await api.read('requests/${path.split('/')[1]}'), s.partyId!);
        }
      }
      final d = await api.write(path, body,
          version: recovery != null
              ? recovery['version']
              : create
                  ? null
                  : record!['object_version'],
          validate: (r) => invoiceRecord(r, s.partyId!,
              id: path == 'requests' ? null : path.split('/')[1],
              orderId: path == 'requests' ? body['order_id'] : null));
      if (!mounted) return;
      text.clear();
      attachments.clear();
      headerDirty = false;
      if (path == 'requests' || d['id'] != widget.invoiceId) {
        setState(() => leaving = true);
        Navigator.pushReplacementNamed(
            context, '/invoices?invoiceId=${d['id']}');
      } else {
        setState(() {
          busy = false;
          notice = '本次申请操作已保存，票据状态以当前处理进度为准。';
        });
        await load();
      }
    } catch (e) {
      if (e is AccountError &&
          (e.status == 412 ||
              ['INVOICE_AMOUNT_UNAVAILABLE', 'INVOICE_STATE_CONFLICT']
                  .contains(e.code)) &&
          mounted) {
        setState(() => busy = false);
        await load();
      }
      if (mounted) {
        setState(() => error = invoiceError(e));
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error!)));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> action(String action) async {
    if (action != 'SUPPLEMENT') {
      final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: Text('${invoiceActions[action]}？'),
                  content: Text(action == 'WITHDRAW'
                      ? '确认后申请占用额度会释放，历史记录仍保留。'
                      : '将保留原票据并申请人工更正，不表示退款或更正已完成。'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('取消')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('确认'))
                  ]));
      if (yes != true || !mounted) return;
    }
    await submit(action: action);
  }

  Future<void> download(String id, {Map<String, dynamic>? document}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final content =
          document == null ? null : communityMap(document['content']);
      final bytes = await api.bytes(
          'requests/${widget.invoiceId}/${document == null ? 'assets' : 'documents'}/$id/content',
          sha256Value: content?['asset_proof']?['content_sha256']);
      communityRequire(bytes.isNotEmpty && bytes.length <= maxSupplyBytes);
      if (content?['asset_proof'] != null) {
        communityRequire(bytes.length == content!['asset_proof']['byte_size']);
      }
      if (!mounted) return;
      final saved = await FilePicker.saveFile(
          fileName: document == null
              ? '开票材料-$id'
              : content!['simulated']
                  ? '模拟凭证-非真实发票-$id.txt'
                  : '票据-$id.pdf',
          bytes: bytes);
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '文件已交给浏览器，请核对下载记录。'
            : saved == null
                ? '已取消保存。'
                : '文件已保存。');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = invoiceError(e);
          if (document != null) documents.removeWhere((d) => d['id'] == id);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> leave({String? route}) async {
    if (busy || uploading) return;
    if (draft) {
      final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: const Text('离开当前填写？'),
                  content: const Text(
                      '未提交的抬头、说明和附件选择会离开此页。取消可继续填写；结果不确定的原请求仍可回到开票页面核对。'),
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
    if (route != null) {
      Navigator.pushReplacementNamed(context, route);
    } else if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(context, '/my');
    }
  }

  List<Widget> headerFields() => [
        communitySelect(
            '抬头类型',
            kind,
            [('PERSON', '个人'), ('ORGANIZATION', '单位')],
            locked
                ? null
                : (v) => setState(() {
                      kind = v!;
                      headerDirty = true;
                    })),
        TextField(
            controller: title,
            enabled: !locked,
            maxLength: 200,
            onChanged: (_) => headerDirty = true,
            decoration: const InputDecoration(labelText: '抬头名称')),
        if (kind == 'ORGANIZATION')
          TextField(
              controller: tax,
              enabled: !locked,
              maxLength: 80,
              onChanged: (_) => headerDirty = true,
              decoration: const InputDecoration(labelText: '纳税人识别号')),
        const Text('抬头格式通过不表示税务真实性已验证；不收集接收邮箱、电话或银行账户。'),
      ];
  List<Widget> attachmentFields() => [
        const Text('可补充最多8份本人当前身份材料，每份不超过8MB。正式提交后随处理历史保留。'),
        for (final a in attachments)
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a['name']),
              subtitle: const Text('已上传，等待明确提交'),
              trailing: IconButton(
                  tooltip: '从本次提交移除',
                  onPressed: locked
                      ? null
                      : () => setState(() => attachments.remove(a)),
                  icon: const Icon(Icons.close))),
        if (uploading) LinearProgressIndicator(value: progress),
        if (pendingUpload != null)
          tradeButton(
              '恢复原附件上传', busy || uploading ? null : () => upload(restore: true),
              outline: true)
        else
          tradeButton(
              '选择并上传附件', locked || attachments.length >= 8 ? null : upload,
              outline: true),
      ];
  Widget sectionControls(String section) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (loading.contains(section)) const LinearProgressIndicator(),
        if (pageErrors[section] != null)
          Text(pageErrors[section]!,
              style: const TextStyle(color: AccountTheme.danger)),
        if (pageErrors[section] != null)
          tradeButton(
              '重试${section == 'history' ? '处理历史' : section == 'documents' ? '获准票据' : '申请记录'}',
              busy || loading.contains(section)
                  ? null
                  : () => loadPage(section, more: cursors[section] != null),
              outline: true),
        if (cursors[section] != null)
          tradeButton(
              '继续读取${section == 'history' ? '处理历史' : section == 'documents' ? '获准票据' : '申请记录'}',
              busy || loading.contains(section)
                  ? null
                  : () => loadPage(section, more: true),
              outline: true),
      ]);
  @override
  Widget build(BuildContext context) => PopScope(
      canPop: leaving || !draft && !busy && !uploading,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) leave();
      },
      child: tradeScaffold(
          context,
          '发票与票据',
          [
            tradeHeading(
                create
                    ? '按原订单申请'
                    : widget.invoiceId == null
                        ? '我的开票申请'
                        : '申请与票据进度',
                eyebrow: '本人办理 / 当前购买身份'),
            tradeFact('办事身份', s.party?['display_name']),
            const Text('申请获批不等于票据已开具。获准票据需由开票方录入并独立复核，真实开票服务未开放时不会显示完成。'),
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(error!, style: const TextStyle(color: AccountTheme.danger)),
            if (notice != null) Text(notice!),
            for (final op in pending)
              tradeSection('原申请结果尚未确定', [
                const Text('将先核对原订单或申请，再以原编号、原版本和原内容恢复；不能另建重复申请。'),
                tradeButton('核对并恢复原申请',
                    busy || uploading ? null : () => submit(recovery: op),
                    outline: true),
              ]),
            if (create && eligibility != null) ...[
              tradeSection('当前可申请额度', [
                tradeFact(
                    '环境',
                    eligibility!['environment'] == 'SANDBOX'
                        ? '模拟环境，非真实发票'
                        : eligibility!['environment'] == 'PRODUCTION'
                            ? '正式环境'
                            : '尚无可归属现金收款'),
                for (final entry in const {
                  'received_minor': '已核实收款',
                  'refunded_minor': '已退款',
                  'pending_refund_minor': '退款待处理',
                  'occupied_minor': '其他申请占用',
                  'available_minor': '本次可申请'
                }.entries)
                  tradeFact(
                      entry.value, communityMoney(eligibility![entry.key])),
              ]),
              ...headerFields(),
              TextField(
                  controller: amount,
                  enabled: !locked,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration:
                      const InputDecoration(labelText: '申请金额（元 / CNY）')),
              TextField(
                  controller: text,
                  enabled: !locked,
                  maxLength: 2000,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: '申请说明')),
              ...attachmentFields(),
              tradeButton(
                  '确认提交开票申请',
                  locked ||
                          eligibility!['available_minor'] <= 0 ||
                          eligibility!['environment'] == null
                      ? null
                      : submit),
            ],
            if (!create && widget.invoiceId == null) ...[
              const Text('从原订单进入可核对额度并新建申请。这里展示当前购买身份的全部申请。'),
              communitySelect(
                  '申请状态',
                  filter ?? '',
                  [
                    ('', '全部'),
                    ...invoiceStates.entries.map((e) => (e.key, e.value))
                  ],
                  locked
                      ? null
                      : (v) {
                          filter = v == '' ? null : v;
                          load();
                        }),
              for (final r in rows)
                tradeSection(invoiceHeader(r['header'])['title'], [
                  tradeFact('处理进度', invoiceStates[r['current_status']]),
                  tradeFact('申请金额', communityMoney(r['requested_minor'])),
                  if (r['environment'] == 'SANDBOX') const Text('模拟环境，非真实发票'),
                  tradeButton(
                      '查看申请与票据',
                      () => Navigator.pushNamed(
                                  context, '/invoices?invoiceId=${r['id']}')
                              .then((_) {
                            if (mounted) load();
                          }),
                      outline: true),
                ]),
              if (!busy &&
                  !loading.contains('list') &&
                  pageErrors['list'] == null &&
                  rows.isEmpty)
                Text(cursors['list'] == null ? '当前身份暂无开票申请。' : '本页暂无记录，可继续读取。'),
              sectionControls('list'),
            ],
            if (record != null) ...[
              tradeSection(invoiceStates[record!['current_status']]!, [
                tradeFact('抬头', invoiceHeader(record!['header'])['title']),
                if (record!['header']['kind'] == 'ORGANIZATION')
                  tradeFact('纳税人识别号', record!['header']['tax_id']),
                tradeFact('申请金额', communityMoney(record!['requested_minor'])),
                tradeFact('当前占用额度', communityMoney(record!['occupied_minor'])),
                tradeFact(
                    '环境',
                    record!['environment'] == 'SANDBOX'
                        ? '模拟环境，非真实发票'
                        : '正式环境'),
                if (record!['requires_correction'])
                  const Text('订单退款变化，需人工核对更正。'),
                if (record!['current_status'] == 'ISSUED' &&
                    record!['occupied_minor'] == 0)
                  const Text('已作金额归零更正；这不表示退款已完成。'),
              ]),
              tradeSection('获准票据', [
                for (final d in documents) ...[
                  Text(
                      d['current_status'] == 'SUPERSEDED'
                          ? '历史票据，已有更正'
                          : '当前获准票据',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(d['content']['simulated']
                      ? '模拟凭证，非真实发票'
                      : d['content']['label']),
                  tradeFact(
                      '票据金额', communityMoney(d['content']['amount_minor'])),
                  tradeFact('票据编号', d['content']['reference']),
                  tradeFact('开具日期', communityDate(d['content']['issued_at'])),
                  tradeButton(
                      '下载${d['content']['simulated'] ? '模拟凭证' : '获准票据'}',
                      busy ? null : () => download(d['id'], document: d),
                      outline: true),
                ],
                if (documents.isEmpty &&
                    !loading.contains('documents') &&
                    pageErrors['documents'] == null)
                  const Text('尚无可下载的获准票据，待审核文件不会对申请人开放。'),
                sectionControls('documents'),
              ]),
              tradeSection('处理历史与材料', [
                for (final e in events) ...[
                  Text(
                      '${e['actor_kind'] == 'APPLICANT' ? '本人' : '工作人员'} · ${invoiceActions[e['action']]}',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(e['text']),
                  tradeFact('当时抬头', invoiceHeader(e['header'])['title']),
                  tradeFact('时间', communityDate(e['created_at'])),
                  for (final id in e['asset_ids'])
                    tradeButton('下载本次材料 ${communityShort(id)}',
                        busy ? null : () => download(id),
                        outline: true),
                ],
                sectionControls('history'),
                const Text('补件不覆盖原材料，更正不删除历史获准票据。'),
              ]),
              if (invoiceApplicantActions(record!).isNotEmpty) ...[
                if (record!['current_status'] == 'NEEDS_INFO') ...[
                  ...headerFields(),
                  ...attachmentFields()
                ],
                TextField(
                    controller: text,
                    enabled: !locked,
                    maxLength: 2000,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: '本次说明')),
                for (final a in invoiceApplicantActions(record!))
                  tradeButton(
                      invoiceActions[a]!, locked ? null : () => action(a),
                      outline: a == 'WITHDRAW'),
              ],
            ],
            tradeButton('重新读取当前进度', busy || uploading ? null : load,
                outline: true),
            tradeButton(
                '核对原订单与付款',
                busy || uploading
                    ? null
                    : () => leave(
                        route: invoiceBusinessRoute(
                            record?['order_id'] ?? widget.orderId)),
                outline: true),
            if (create || widget.invoiceId != null)
              tradeButton('返回我的开票申请',
                  busy || uploading ? null : () => leave(route: '/invoices'),
                  outline: true),
          ],
          locked: busy || uploading,
          onBack: leave));
}
