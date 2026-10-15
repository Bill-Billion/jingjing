import '../account/account_api.dart';
import '../contracts/contract_api.dart';
import '../gigs/gig_models.dart' show gigCommercial;

const tradeKinds = {
  'ORDER': '订单',
  'QUOTE': '报价',
  'LEGACY': '旧记录',
  'PAYMENT': '付款',
  'REFUND': '退款',
  'SPEC': '服务规格'
};

/// Labels apply only to transaction snapshots. Arbitrary business-defined
/// fields still display verbatim, and values are never rewritten.
const tradeContractLabels = {
  'format_version': '内容格式版本',
  'id': '编号',
  'contract_version_id': '合同版本编号',
  'party_ids': '合同主体编号',
  'created_at': '保存时间',
  'rule_contents': '采用规则内容',
  'commitments': '保存的原约定',
  'object_version': '记录版本',
  'current_status': '保存状态',
  'signing_method': '签署方式',
  'content_sha256': '保存内容指纹',
  'quote_id': '原报价编号',
  'quote_sha256': '原报价指纹',
  'quote': '成交报价',
  'lines': '报价明细',
  'title': '服务名称',
  'provider_party_id': '服务提供方编号',
  'line_kind': '服务类别',
  'unit_minor': '单价（人民币分）',
  'currency': '币种',
  'specification': '服务规格',
  'version': '约定版本',
  'service_tier': '服务档位',
  'sample_seconds': '样片时长（秒）',
  'final_seconds': '成片时长（秒）',
  'revision_limit': '修改次数',
  'deliverables': '交付内容',
  'terms': '完整条款',
  'review': '独立审核',
  'decision': '审核结论',
  'reason': '审核理由',
  'account_id': '审核账号编号',
  'line_id': '明细编号',
  'spec_id': '服务规格编号',
  'spec_version': '规格记录版本',
  'quantity': '数量',
  'total_minor': '总金额（人民币分）',
  'installments': '付款节点',
  'key': '节点编号',
  'trigger': '付款条件',
  'allocations': '分项金额',
  'amount_minor': '金额（人民币分）',
  'apple_product_id': 'Apple 商品编号',
  'channel': '付款渠道',
  'transaction_model': '交易模式',
  'rule_id': '采用规则编号',
  'rule_key': '规则名称',
  'expires_at': '有效截止时间',
  'payment_window_minutes': '付款窗口（分钟）',
  'license_reservation_id': '关联许可预留编号',
  'order_id': '订单编号',
  'commercial': '原商业约定',
  'ranking_opt_in': '明确选择公开入榜',
  'offer_id': '接单约定编号',
  'offer_sha256': '接单约定指纹',
  'gig_id': '商业需求编号',
  'scope': '用途范围',
  'purpose': '用途',
  'territory': '地区',
  'valid_until': '有效截止',
  'valid_from': '开始时间',
  'category': '商业类别',
  'commission': '佣金约定',
  'mcn_bps': 'MCN 分成（万分比）',
  'platform_bps': '平台费用（万分比）',
  'relation': '直接合作原约定',
  'mcn_party_id': 'MCN 主体编号',
  'sha256': '保存指纹',
  'avatar_id': '数字人编号',
  'consent_id': '本人同意编号',
};
const tradeStatuses = {
  'IN_REVIEW': '独立审核中',
  'PUBLISHED': '已发布',
  'APPROVED': '审核已通过',
  'REJECTED': '审核未通过',
  'ACCEPTED': '已确认形成订单',
  'OPEN': '待付款',
  'PARTIALLY_PAID': '已收到部分款',
  'PAID': '约定款项已收齐',
  'PARTIALLY_REFUNDED': '已核实部分退款',
  'REFUNDED': '已核实全部退款',
  'PAYMENT_REVIEW_REQUIRED': '收款异常待人工核对',
  'CANCELLED': '已取消',
  'CREATED': '付款记录已建立',
  'SUBMITTING': '正在提交或核实',
  'PENDING': '等待渠道结果',
  'UNKNOWN': '结果待核实',
  'CLOSED': '付款已关闭',
  'SUCCEEDED': '服务器已核实成功',
  'REVIEW_REQUIRED': '异常待人工核对',
  'REQUESTED': '退款申请待审核',
  'AWAITING_APPLE_REQUEST': '等待用户向 Apple 申请退款',
  'FAILED': '退款未成功',
  'NEEDS_REVIEW': '历史材料待审核',
  'VERIFIED_REFERENCE_ONLY': '历史材料已核对',
};
const tradeTriggers = {
  'ORDER_ACCEPTED': '确认订单后付款',
  'SAMPLE_ACCEPTED': '样片验收后付款',
  'FINAL_ACCEPTED': '成片验收后付款'
};
const _statuses = {
  'SPEC': ['IN_REVIEW', 'PUBLISHED', 'REJECTED'],
  'QUOTE': ['IN_REVIEW', 'APPROVED', 'REJECTED', 'ACCEPTED'],
  'ORDER': [
    'OPEN',
    'PARTIALLY_PAID',
    'PAID',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'PAYMENT_REVIEW_REQUIRED',
    'CANCELLED'
  ],
  'PAYMENT': [
    'CREATED',
    'SUBMITTING',
    'PENDING',
    'UNKNOWN',
    'CLOSED',
    'SUCCEEDED',
    'REFUNDED',
    'REVIEW_REQUIRED'
  ],
  'REFUND': [
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'SUBMITTING',
    'PENDING',
    'UNKNOWN',
    'AWAITING_APPLE_REQUEST',
    'SUCCEEDED',
    'FAILED'
  ],
  'LEGACY': ['NEEDS_REVIEW', 'VERIFIED_REFERENCE_ONLY', 'REJECTED'],
};
void tradeRequire(bool ok) {
  if (!ok) {
    throw const AccountError(502, 'INVALID_TRADE_RESPONSE', uncertain: true);
  }
}

bool tradeMinor(dynamic v, {bool zero = false}) =>
    v is int && v >= (zero ? 0 : 1) && v <= 900000000000;
bool _text(dynamic v, [int max = 8000]) =>
    v is String && v.isNotEmpty && v.length <= max;
Map<String, dynamic> tradeMap(dynamic v) {
  tradeRequire(v is Map);
  return Map<String, dynamic>.from(v as Map);
}

List<Map<String, dynamic>> tradeRows(dynamic v, {int max = 30}) {
  tradeRequire(v is List && v.isNotEmpty && v.length <= max);
  return (v as List).map(tradeMap).toList();
}

void _allocations(dynamic v) {
  final rows = tradeRows(v);
  tradeRequire(rows.map((v) => v['line_id']).toSet().length == rows.length);
  for (final a in rows) {
    tradeRequire(_text(a['line_id'], 128) && tradeMinor(a['amount_minor']));
  }
}

void _spec(dynamic value) {
  final d = tradeMap(value);
  tradeRequire(_text(d['version'], 128) &&
      _text(d['service_tier'], 100) &&
      _text(d['terms']));
  for (final k in ['sample_seconds', 'final_seconds', 'revision_limit']) {
    tradeRequire(d[k] is int && d[k] >= 0 && d[k] <= 100000);
  }
  tradeRequire(d['deliverables'] is List &&
      d['deliverables'].isNotEmpty &&
      d['deliverables'].length <= 30 &&
      d['deliverables'].every((v) => _text(v, 500)));
}

void _quote(Map<String, dynamic> d) {
  if (d['commercial'] != null) {
    try {
      gigCommercial(d['commercial']);
    } on AccountError {
      tradeRequire(false);
    }
    tradeRequire(d['transaction_model'] == 'DIRECT_SUPPLIER');
  }
  tradeRequire(d['currency'] == 'CNY' &&
      tradeMinor(d['total_minor']) &&
      ['ALIPAY', 'APPLE'].contains(d['channel']) &&
      ['DIRECT_SUPPLIER', 'PLATFORM_PRINCIPAL']
          .contains(d['transaction_model']) &&
      isContractId('${d['rule_id']}') &&
      DateTime.tryParse('${d['expires_at']}') != null);
  final lines = tradeRows(d['lines']);
  var total = 0;
  for (final l in lines) {
    tradeRequire(_text(l['title'], 200) &&
        _text(l['line_id'], 128) &&
        isContractId('${l['spec_id']}') &&
        isContractId('${l['provider_party_id']}') &&
        ['LICENSE', 'PRODUCTION', 'OTHER'].contains(l['line_kind']) &&
        l['quantity'] is int &&
        l['quantity'] >= 1 &&
        l['quantity'] <= 10000 &&
        tradeMinor(l['unit_minor']) &&
        tradeMinor(l['total_minor']) &&
        l['total_minor'] == l['unit_minor'] * l['quantity'] &&
        l['currency'] == 'CNY');
    _spec(l['specification']);
    total += l['total_minor'] as int;
  }
  tradeRequire(total == d['total_minor'] &&
      lines.map((l) => l['line_id']).toSet().length == lines.length);
  final installments = tradeRows(d['installments'], max: 20);
  final allocated = <String, int>{};
  for (final i in installments) {
    tradeRequire(
        _text(i['key'], 128) && tradeTriggers.containsKey(i['trigger']));
    _allocations(i['allocations']);
    for (final a in tradeRows(i['allocations'])) {
      allocated.update(a['line_id'], (v) => v + (a['amount_minor'] as int),
          ifAbsent: () => a['amount_minor'] as int);
    }
  }
  tradeRequire(
      installments.map((i) => i['key']).toSet().length == installments.length &&
          allocated.length == lines.length &&
          lines.every((l) => allocated[l['line_id']] == l['total_minor']));
}

void _contract(dynamic value, String party) {
  final c = tradeMap(value);
  tradeRequire(c['format_version'] == 'contract-content-v1' &&
      isContractId('${c['id']}') &&
      c['object_version'] == 1 &&
      c['current_status'] == 'SEALED' &&
      c['signing_method'] == 'NOT_SIGNED' &&
      c['content_sha256'] is String &&
      RegExp(r'^[a-f0-9]{64}$').hasMatch(c['content_sha256']) &&
      c['party_ids'] is List &&
      c['party_ids'].contains(party) &&
      DateTime.tryParse('${c['created_at']}') != null &&
      c['commitments'] is Map &&
      c['commitments'].isNotEmpty);
  for (final r in tradeRows(c['rule_contents'], max: 100)) {
    ContractApi.validateRule(r);
  }
}

class TradeRecord {
  TradeRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get hash => raw['content_sha256'];
  String? get buyer => raw['buyer_party_id'];
  String get merchant => raw['merchant_party_id'];
  String? get orderId => raw['order_id'];
  Map<String, dynamic> get data => raw['data'];
  Map<String, dynamic> get quote =>
      kind == 'ORDER' ? tradeMap(data['quote']) : data;
  List<Map<String, dynamic>> get lines => tradeRows(quote['lines']);
  String get title => ['QUOTE', 'ORDER'].contains(kind)
      ? lines.map((l) => l['title']).join('、')
      : kind == 'PAYMENT'
          ? data['title']
          : kind == 'LEGACY'
              ? '历史单 ${data['source_order_id']}'
              : tradeKinds[kind]!;
  int get amount => ['QUOTE', 'ORDER'].contains(kind)
      ? quote['total_minor']
      : kind == 'LEGACY'
          ? tradeRows(data['original_lines'])
              .fold(0, (a, l) => a + (l['amount_minor'] as int))
          : data['amount_minor'] ?? data['unit_minor'];
  bool isBuyer(String party) => buyer == party;
  bool get refundable =>
      kind == 'PAYMENT' &&
      status == 'SUCCEEDED' &&
      data['proof'] is Map &&
      data['proof']['status'] == 'SUCCEEDED' &&
      _text(data['transaction_id'], 128);
  static TradeRecord parse(dynamic value, String party,
      {String? id, String? kind}) {
    final r = tradeMap(value);
    tradeRequire(r.length == 11 &&
        [
          'id',
          'kind',
          'buyer_party_id',
          'merchant_party_id',
          'parent_id',
          'order_id',
          'created_by',
          'current_status',
          'object_version',
          'content_sha256',
          'data'
        ].every(r.containsKey));
    tradeRequire(isContractId('${r['id']}') &&
        (id == null || r['id'] == id) &&
        (kind == null || r['kind'] == kind) &&
        _statuses[r['kind']]?.contains(r['current_status']) == true &&
        r['object_version'] is int &&
        r['object_version'] >= 1 &&
        r['object_version'] <= 100000 &&
        isContractId('${r['merchant_party_id']}') &&
        (r['buyer_party_id'] == party || r['merchant_party_id'] == party) &&
        r['content_sha256'] is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(r['content_sha256']));
    for (final k in ['buyer_party_id', 'parent_id', 'order_id', 'created_by']) {
      tradeRequire(r[k] == null || isContractId('${r[k]}'));
    }
    final d = tradeMap(r['data']);
    r['data'] = d;
    switch (r['kind']) {
      case 'QUOTE':
        _quote(d);
      case 'ORDER':
        _quote(tradeMap(d['quote']));
        _contract(d['contract'], party);
        final f = tradeMap(d['financial']);
        for (final k in ['received_minor', 'refunded_minor', 'net_minor']) {
          tradeRequire(tradeMinor(f[k], zero: true));
        }
        tradeRequire(
            f['net_minor'] == f['received_minor'] - f['refunded_minor']);
      case 'PAYMENT':
      case 'REFUND':
        tradeRequire(['ALIPAY', 'APPLE'].contains(d['provider']) &&
            ['SANDBOX', 'PRODUCTION'].contains(d['environment']) &&
            d['currency'] == 'CNY' &&
            tradeMinor(d['amount_minor']));
        _allocations(d['allocations']);
        tradeRequire(tradeRows(d['allocations'])
                .fold<int>(0, (a, l) => a + (l['amount_minor'] as int)) ==
            d['amount_minor']);
        if (r['kind'] == 'PAYMENT') {
          tradeRequire(
              _text(d['title'], 200) && _text(d['installment_key'], 128));
        } else {
          tradeRequire(
              isContractId('${d['payment_id']}') && _text(d['reason'], 2000));
        }
      case 'LEGACY':
        tradeRequire(d['currency'] == 'CNY' &&
            d['payment_verified'] == false &&
            _text(d['original_terms']) &&
            _text(d['source_system'], 128) &&
            _text(d['source_order_id'], 128));
        for (final l in tradeRows(d['original_lines'])) {
          tradeRequire(_text(l['line_id'], 128) &&
              tradeMinor(l['amount_minor'], zero: true) &&
              ['REPORTED_PAID', 'REPORTED_UNPAID', 'UNKNOWN']
                  .contains(l['reported_status']));
        }
      case 'SPEC':
        _spec(d['specification']);
        tradeRequire(tradeMinor(d['unit_minor']) && d['currency'] == 'CNY');
    }
    return TradeRecord._(r);
  }
}

String tradeMoney(int minor) {
  final yuan = (minor ~/ 100)
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  return '¥$yuan.${(minor % 100).toString().padLeft(2, '0')}';
}

int? tradeParseYuan(String text) {
  if (!RegExp(r'^\d{1,10}(\.\d{1,2})?$').hasMatch(text.trim())) return null;
  final parts = text.trim().split('.');
  final n = int.parse(parts.first) * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
  return tradeMinor(n) ? n : null;
}

Map<String, int> tradeRefundRemaining(
    TradeRecord payment, List<TradeRecord> refunds) {
  final values = {
    for (final a in tradeRows(payment.data['allocations']))
      a['line_id'] as String: a['amount_minor'] as int
  };
  for (final r in refunds.where((r) =>
      r.kind == 'REFUND' &&
      r.data['payment_id'] == payment.id &&
      !['REJECTED', 'FAILED'].contains(r.status))) {
    for (final a in tradeRows(r.data['allocations'])) {
      values.update(a['line_id'], (v) => v - (a['amount_minor'] as int),
          ifAbsent: () => 0);
    }
  }
  return {for (final e in values.entries) e.key: e.value < 0 ? 0 : e.value};
}

String tradeError(Object e, {bool writing = false}) {
  if (e is! AccountError) return '返回内容无法识别，请重新读取。';
  if (e.code == 'INVALID_TRADE_RESPONSE') {
    return writing ? '返回内容无法核对，操作结果未知。请恢复原请求核对。' : '交易记录格式无法识别，请重新读取。';
  }
  if (e.code == 'LICENSE_PAYMENT_NOT_READY') {
    return '许可约定的生效付款金额尚未核实。付款仍须满足签署、身份及权属核验，不能代替许可办理。';
  }
  if (e.status == 503 || e.uncertain) {
    return writing
        ? '服务暂不可用或连接中断，操作结果未知。原请求已保留，请恢复核对，不要另建付款或退款。'
        : '暂时无法读取服务器结果，请稍后重新核对。';
  }
  return e.message;
}
