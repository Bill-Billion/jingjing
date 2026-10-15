import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../contracts/contract_api.dart';

const gigKinds = {
  'GIG': '我的商单',
  'OFFER': '接单约定',
  'RELATION': 'MCN 合作',
  'COMMISSION': '佣金核算',
  'RULE': '商单规则',
  'RANKING': '榜单快照'
};
const gigStatuses = {
  'IN_REVIEW': '独立审核中',
  'EFFECTIVE': '生效中',
  'REJECTED': '未通过',
  'RETIRED': '已停用',
  'INVITED': '等待本人确认',
  'ACTIVE': '合作有效',
  'ENDED': '合作已结束',
  'PUBLISHED': '已发布',
  'SUSPENDED': '已暂停',
  'APPROVED': '已审，等待买方确认',
  'ACCEPTED': '买方已确认约定',
  'CALCULATED': '已核算，待记账'
};
const gigEvents = {'RELATION_ENDED': '直接合作已结束', 'GIG_SUSPENDED': '商单已暂停'};
void gigRequire(bool value) {
  if (!value) {
    throw const AccountError(502, 'INVALID_GIG_RESPONSE', uncertain: true);
  }
}

bool gigId(dynamic v) => v is String && isContractId(v);
bool gigText(dynamic v, [int max = 8000]) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool gigInt(dynamic v, {int min = 0, int max = 900000000000}) =>
    v is int && v >= min && v <= max;
bool gigHash(dynamic v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool gigInstant(dynamic v) =>
    v is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$').hasMatch(v) &&
    DateTime.tryParse(v)?.toUtc().toIso8601String() == v;
Map<String, dynamic> gigMap(dynamic v, {List<String>? keys}) {
  gigRequire(v is Map && v.keys.every((k) => k is String));
  final m = Map<String, dynamic>.from(v as Map);
  if (keys != null) {
    gigRequire(m.length == keys.length && keys.every(m.containsKey));
  }
  return m;
}

List<dynamic> gigList(dynamic v, {int min = 0, int max = 100}) {
  gigRequire(v is List && v.length >= min && v.length <= max);
  return List<dynamic>.from(v as List);
}

List<String> gigIds(dynamic v, {int min = 0, int max = 30}) {
  final a = gigList(v, min: min, max: max);
  gigRequire(a.every(gigId) && a.toSet().length == a.length);
  return a.cast<String>();
}

Object? _canonical(dynamic v) {
  if (v is Map) {
    final keys = v.keys.cast<String>().toList()..sort();
    return {for (final k in keys) k: _canonical(v[k])};
  }
  if (v is List) return v.map(_canonical).toList();
  gigRequire(v == null || v is String || v is bool || v is int);
  return v;
}

String gigDigest(dynamic value) =>
    sha256.convert(utf8.encode(jsonEncode(_canonical(value)))).toString();
Map<String, dynamic> gigScope(dynamic v) {
  final d = gigMap(v, keys: ['purpose', 'territory', 'valid_until']);
  gigRequire(d['purpose'] == 'COMMERCIAL' &&
      gigText(d['territory'], 128) &&
      gigInstant(d['valid_until']));
  return d;
}

Map<String, dynamic> gigCommission(dynamic v) {
  final d = gigMap(v, keys: ['mcn_bps', 'platform_bps']);
  gigRequire(gigInt(d['mcn_bps'], max: 10000) &&
      gigInt(d['platform_bps'], max: 10000) &&
      d['mcn_bps'] <= d['platform_bps']);
  return d;
}

void _relationSnapshot(dynamic v) {
  if (v == null) return;
  final d = gigMap(v, keys: [
    'id',
    'version',
    'sha256',
    'mcn_party_id',
    'terms',
    'valid_from',
    'valid_until'
  ]);
  gigRequire(gigId(d['id']) &&
      gigId(d['mcn_party_id']) &&
      gigInt(d['version'], min: 1, max: 100000) &&
      gigHash(d['sha256']) &&
      gigText(d['terms']) &&
      gigInstant(d['valid_from']) &&
      gigInstant(d['valid_until']) &&
      d['valid_from'].compareTo(d['valid_until']) < 0);
}

void gigCommercial(dynamic v) {
  final d = gigMap(v, keys: [
    'ranking_opt_in',
    'offer_id',
    'offer_sha256',
    'gig_id',
    'scope',
    'category',
    'terms',
    'commission',
    'relation',
    'avatar_id',
    'consent_id',
    'rule_id'
  ]);
  gigRequire(d['ranking_opt_in'] is bool &&
      gigHash(d['offer_sha256']) &&
      gigText(d['category'], 128) &&
      gigText(d['terms']));
  for (final k in [
    'offer_id',
    'gig_id',
    'avatar_id',
    'consent_id',
    'rule_id'
  ]) {
    gigRequire(gigId(d[k]));
  }
  gigScope(d['scope']);
  gigCommission(d['commission']);
  _relationSnapshot(d['relation']);
  gigRequire(d['relation'] != null || d['commission']['mcn_bps'] == 0);
}

void _review(dynamic v) {
  if (v == null) return;
  final d =
      gigMap(v, keys: ['decision', 'reason', 'checks', 'account_id', 'method']);
  gigRequire(['APPROVED', 'REJECTED'].contains(d['decision']) &&
      gigText(d['reason'], 2000) &&
      gigId(d['account_id']) &&
      d['method'] == 'EXTERNAL_MANUAL_REVIEW');
  if (d['checks'] != null) {
    final c = gigMap(d['checks'], keys: [
      'identity_verified',
      'authority_verified',
      'materials_reviewed',
      'content_reviewed',
      'marking_reviewed'
    ]);
    gigRequire(c.values.every((v) => v is bool));
  }
}

void gigRankingRule(dynamic v) {
  final d = gigMap(v, keys: [
    'window_days',
    'order_weight',
    'newcomer_days',
    'minimum_orders',
    'newcomer_bonus',
    'net_minor_weight'
  ]);
  for (final k in d.keys) {
    gigRequire(gigInt(d[k], max: 100000));
  }
  gigRequire(gigInt(d['window_days'], min: 1, max: 366) &&
      gigInt(d['minimum_orders'], min: 1, max: 100000));
}

void gigRule(dynamic v) {
  final d = gigMap(v, keys: ['version', 'categories', 'ranking', 'terms']);
  gigRequire(gigText(d['version'], 128) && gigText(d['terms']));
  final categories = gigList(d['categories'], min: 1);
  final seen = <String>{};
  for (final v in categories) {
    final c = gigMap(v, keys: ['code', 'allowed', 'required_proofs']);
    gigRequire(
        gigText(c['code'], 128) && c['allowed'] is bool && seen.add(c['code']));
    final p = gigList(c['required_proofs']);
    gigRequire(p.every((v) => gigText(v, 128)) && p.toSet().length == p.length);
  }
  gigRankingRule(d['ranking']);
}

void gigFacts(dynamic v) {
  final d = gigMap(v, keys: [
    'received_minor',
    'refunded_minor',
    'net_minor',
    'environment',
    'first_at',
    'journal_ids'
  ]);
  for (final k in ['received_minor', 'refunded_minor', 'net_minor']) {
    gigRequire(gigInt(d[k]));
  }
  gigRequire(d['net_minor'] == d['received_minor'] - d['refunded_minor'] &&
      (d['environment'] == null ||
          ['SANDBOX', 'PRODUCTION'].contains(d['environment'])) &&
      (d['first_at'] == null || gigInt(d['first_at'], max: 9007199254740991)));
  gigIds(d['journal_ids'], max: 100000);
}

void gigAmounts(dynamic v) {
  final d = gigMap(v,
      keys: ['net_minor', 'supplier_minor', 'platform_minor', 'mcn_minor']);
  gigRequire(d.values.every((v) => gigInt(v)) &&
      d['net_minor'] ==
          d['supplier_minor'] + d['platform_minor'] + d['mcn_minor']);
}

class GigRecord {
  GigRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get hash => raw['content_sha256'];
  String? get owner => raw['owner_party_id'];
  String? get counterparty => raw['counterparty_id'];
  String? get parent => raw['parent_id'];
  Map<String, dynamic> get data => raw['data'];
  String get title => kind == 'GIG' ? data['title'] : gigKinds[kind]!;
  static GigRecord parse(dynamic v, {String? party, String? id, String? kind}) {
    final r = gigMap(v, keys: [
      'id',
      'kind',
      'owner_party_id',
      'counterparty_id',
      'parent_id',
      'created_by',
      'current_status',
      'object_version',
      'content_sha256',
      'data'
    ]);
    const statuses = {
      'RULE': ['IN_REVIEW', 'EFFECTIVE', 'REJECTED', 'RETIRED'],
      'RELATION': ['INVITED', 'ACTIVE', 'REJECTED', 'ENDED'],
      'GIG': ['IN_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED'],
      'OFFER': ['IN_REVIEW', 'APPROVED', 'REJECTED', 'ACCEPTED'],
      'COMMISSION': ['CALCULATED'],
      'RANKING': ['PUBLISHED']
    };
    gigRequire(gigId(r['id']) &&
        gigId(r['created_by']) &&
        (id == null || r['id'] == id) &&
        (kind == null || r['kind'] == kind) &&
        statuses[r['kind']]?.contains(r['current_status']) == true &&
        gigInt(r['object_version'], min: 1, max: 100000) &&
        gigHash(r['content_sha256']));
    for (final k in ['owner_party_id', 'counterparty_id', 'parent_id']) {
      gigRequire(r[k] == null || gigId(r[k]));
    }
    final d = gigMap(r['data']);
    r['data'] = d;
    gigRequire(gigDigest(d) == r['content_sha256']);
    if (party != null) {
      gigRequire([
        r['owner_party_id'],
        r['counterparty_id'],
        d['relation']?['mcn_party_id']
      ].contains(party));
    }
    switch (r['kind']) {
      case 'RULE':
        gigRequire(
            d.keys.every((k) => ['rule', 'review', 'retirement'].contains(k)) &&
                d.containsKey('rule') &&
                d.containsKey('review'));
        gigRule(d['rule']);
        _review(d['review']);
        if (d['retirement'] != null) {
          final t = gigMap(d['retirement'], keys: ['reason', 'account_id']);
          gigRequire(gigText(t['reason'], 2000) && gigId(t['account_id']));
        }
      case 'RELATION':
        gigMap(d, keys: [
          'scope',
          'valid_from',
          'valid_until',
          'exclusive',
          'terms',
          'commission',
          'evidence_asset_ids',
          'accepted_by',
          'ended_reason'
        ]);
        gigRequire(gigId(r['owner_party_id']) &&
            gigId(r['counterparty_id']) &&
            d['scope'] == 'COMMERCIAL' &&
            gigInstant(d['valid_from']) &&
            gigInstant(d['valid_until']) &&
            d['valid_from'].compareTo(d['valid_until']) < 0 &&
            d['exclusive'] is bool &&
            gigText(d['terms']) &&
            (d['accepted_by'] == null || gigId(d['accepted_by'])) &&
            (d['ended_reason'] == null || gigText(d['ended_reason'], 2000)));
        gigCommission(d['commission']);
        gigIds(d['evidence_asset_ids'], min: 1);
      case 'GIG':
        gigMap(d, keys: [
          'title',
          'brief',
          'category',
          'scope',
          'rule_id',
          'rule_sha256',
          'proofs',
          'review',
          'suspension'
        ]);
        gigRequire(gigId(r['owner_party_id']) &&
            gigText(d['title'], 200) &&
            gigText(d['brief']) &&
            gigText(d['category'], 128) &&
            gigId(d['rule_id']) &&
            gigHash(d['rule_sha256']));
        gigScope(d['scope']);
        _review(d['review']);
        for (final p in gigList(d['proofs'], max: 30)) {
          final f = gigMap(p, keys: ['code', 'asset_id']);
          gigRequire(gigText(f['code'], 128) && gigId(f['asset_id']));
        }
        if (d['suspension'] != null) {
          final s = gigMap(d['suspension'], keys: ['reason', 'account_id']);
          gigRequire(gigText(s['reason'], 2000) && gigId(s['account_id']));
        }
      case 'OFFER':
        gigMap(d, keys: [
          'ranking_opt_in',
          'spec_id',
          'avatar_id',
          'consent_id',
          'relation',
          'commission',
          'terms',
          'evidence_asset_ids',
          'review',
          'buyer_accepted_by'
        ]);
        gigRequire(gigId(r['owner_party_id']) &&
            gigId(r['counterparty_id']) &&
            gigId(r['parent_id']) &&
            d['ranking_opt_in'] is bool &&
            gigText(d['terms']) &&
            (d['buyer_accepted_by'] == null || gigId(d['buyer_accepted_by'])));
        for (final k in ['spec_id', 'avatar_id', 'consent_id']) {
          gigRequire(gigId(d[k]));
        }
        gigCommission(d['commission']);
        _relationSnapshot(d['relation']);
        _review(d['review']);
        gigIds(d['evidence_asset_ids'], min: 1);
        gigRequire(d['relation'] != null || d['commission']['mcn_bps'] == 0);
      case 'COMMISSION':
        gigMap(d, keys: [
          'order_id',
          'contract_sha256',
          'agreement',
          'relation',
          'facts',
          'amounts',
          'currency',
          'paid_out_minor',
          'meaning'
        ]);
        gigRequire(gigId(d['order_id']) &&
            d['agreement'] is Map &&
            d['agreement']['offer_id'] == r['parent_id'] &&
            gigHash(d['contract_sha256']) &&
            d['currency'] == 'CNY' &&
            d['paid_out_minor'] == 0 &&
            gigText(d['meaning']));
        gigCommercial(d['agreement']);
        _relationSnapshot(d['relation']);
        gigFacts(d['facts']);
        gigAmounts(d['amounts']);
      case 'RANKING':
        // Private ranking records are operator-only; App presents the sanitized endpoint.
        gigRequire(r['owner_party_id'] == null &&
            r['counterparty_id'] == null &&
            gigInstant(d['as_of']) &&
            gigId(d['rule_id']) &&
            gigHash(d['rule_sha256']) &&
            gigText(d['source']) &&
            gigText(d['data_status']));
        gigRankingRule(d['rule']);
        gigList(d['facts'], max: 4096);
        gigMap(d['boards'], keys: ['hot', 'emerging', 'regional']);
    }
    return GigRecord._(r);
  }
}

class GigCatalogue {
  const GigCatalogue(this.items, this.rules);
  final List<Map<String, dynamic>> items, rules;
  static GigCatalogue parse(dynamic value) {
    final d = gigMap(value, keys: ['items', 'rules']);
    final items = gigList(d['items']).map((v) {
      final r = gigMap(v, keys: [
        'id',
        'title',
        'brief',
        'category',
        'scope',
        'buyer_party_id'
      ]);
      gigRequire(gigId(r['id']) &&
          gigId(r['buyer_party_id']) &&
          gigText(r['title'], 200) &&
          gigText(r['brief']) &&
          gigText(r['category'], 128));
      gigScope(r['scope']);
      return r;
    }).toList();
    final rules = gigList(d['rules']).map((v) {
      final r = gigMap(v, keys: ['id', 'rule']);
      gigRequire(gigId(r['id']));
      gigRule(r['rule']);
      return r;
    }).toList();
    gigRequire(items.map((r) => r['id']).toSet().length == items.length &&
        rules.map((r) => r['id']).toSet().length == rules.length);
    return GigCatalogue(items, rules);
  }
}

Map<String, dynamic> gigRanking(dynamic value, {required String id}) {
  final d = gigMap(value, keys: [
    'id',
    'as_of',
    'rule_id',
    'rule',
    'source',
    'data_status',
    'boards'
  ]);
  gigRequire(d['id'] == id &&
      gigId(id) &&
      gigId(d['rule_id']) &&
      gigInstant(d['as_of']) &&
      gigText(d['source']) &&
      ['AVAILABLE', 'INSUFFICIENT_DATA'].contains(d['data_status']));
  gigRankingRule(d['rule']);
  final b = gigMap(d['boards'], keys: ['hot', 'emerging', 'regional']);
  for (final values in b.values) {
    for (final v in gigList(values, max: 100000)) {
      final r = gigMap(v,
          keys: ['party_id', 'territory', 'orders', 'heat', 'emerging']);
      gigRequire(gigId(r['party_id']) &&
          gigText(r['territory']) &&
          gigInt(r['orders']) &&
          gigText(r['heat']) &&
          gigText(r['emerging']));
    }
  }
  return d;
}

int? gigParsePercent(String value) {
  final v = value.trim();
  if (!RegExp(r'^\d{1,3}(\.\d{1,2})?$').hasMatch(v)) return null;
  final a = v.split('.');
  final n = int.parse(a.first) * 100 +
      (a.length == 2 ? int.parse(a[1].padRight(2, '0')) : 0);
  return n <= 10000 ? n : null;
}

String gigPercent(int bps) =>
    '${bps ~/ 100}.${(bps % 100).toString().padLeft(2, '0')}%';
String gigError(Object e, {bool writing = false}) {
  if (e is! AccountError) return '返回内容无法识别，请重新读取。';
  if (e.code == 'INVALID_GIG_RESPONSE') {
    return writing ? '返回内容无法核对，结果未知。原请求已保留，请恢复核对。' : '商单内容或指纹无法核对，请重新读取。';
  }
  if (e.status == 503 || e.uncertain) {
    return writing ? '操作结果未知。原请求与内容已保留，请恢复核对。' : '暂时无法读取，请稍后重新核对。';
  }
  const messages = {
    'MCN_CAPABILITY_REQUIRED': '当前身份尚无有效 MCN 服务授权。合作授权须独立办理，不能自行批准。',
    'COMMERCIAL_CONSENT_REQUIRED': '本人同意未覆盖本次商业用途、地区或完整有效期。',
    'DIRECT_RELATION_REQUIRED': 'MCN 佣金须引用有效直接合作；未引用合作时请明确填写 0%。',
    'RELATION_NOT_APPLICABLE': '合作已失效、版本已变化或佣金与原合作不一致，请重新核对。',
    'COMMERCIAL_ORDER_EXISTS': '这份接单约定已经形成订单，请查看对应订单。',
    'SELF_DEAL_FORBIDDEN': '需求方不能向自己的商单提交接单约定。',
    'GIG_REVIEW_FORBIDDEN': '此操作须具备独立商单审核授权；负责人身份不能替代。',
    'EXCLUSIVE_RELATION_CONFLICT': '此期间与现有排他合作冲突，请重新核对。'
  };
  return messages[e.code] ?? e.message;
}

bool gigConsentEligible(Map<String, dynamic> record,
    {required String party,
    required String? avatar,
    required Map<String, dynamic> scope,
    DateTime? at}) {
  if (avatar == null || record['current_status'] != 'APPROVED') return false;
  final d = record['data']['consent'];
  final now = (at ?? DateTime.now()).toUtc();
  return d['subject_party_id'] == party &&
      d['avatar_id'] == avatar &&
      (d['features'] as List).contains('FACE') &&
      (d['features'] as List).contains('VOICE') &&
      (d['purposes'] as List).contains('COMMERCIAL') &&
      (d['territories'] as List).contains(scope['territory']) &&
      !DateTime.parse(d['valid_from']).isAfter(now) &&
      DateTime.parse(d['valid_until']).isAfter(now) &&
      DateTime.parse(d['valid_until'])
              .compareTo(DateTime.parse(scope['valid_until'])) >=
          0;
}
