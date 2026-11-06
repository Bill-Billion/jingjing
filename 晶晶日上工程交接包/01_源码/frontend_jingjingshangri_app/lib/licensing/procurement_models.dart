import '../rights/rights_models.dart';

const ipRights = [
  'ADAPT',
  'PRODUCE',
  'COPY',
  'DISTRIBUTE',
  'NETWORK_DISTRIBUTE',
  'COMPILE',
  'PROMOTE',
  'SEQUEL',
  'DERIVATIVES',
  'AI_PROCESS'
];
bool _id(dynamic v) =>
    v is String &&
    RegExp(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$').hasMatch(v);
bool _text(dynamic v, [int max = 8000]) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool _date(dynamic v) =>
    v is String &&
    DateTime.tryParse(v) != null &&
    DateTime.parse(v).toUtc().toIso8601String() == v;
String ipAnniversary(String start, int years) {
  final d = DateTime.parse(start).toUtc(),
      last = DateTime.utc(d.year + years, d.month + 1, 0).day;
  return DateTime.utc(d.year + years, d.month, d.day > last ? last : d.day,
          d.hour, d.minute, d.second, d.millisecond)
      .toIso8601String();
}

bool isIPTerms(dynamic t) {
  if (t is! Map ||
      !['IP_BUYOUT_20261029', 'IP_REVENUE_SHARE_20261029']
          .contains(t['contract_kind']) ||
      !_date(t['valid_from'])) {
    return false;
  }
  final buy = t['contract_kind'] == 'IP_BUYOUT_20261029';
  return t['exclusive'] == true &&
      rightsList(t['rights'], ipRights.contains, max: 10) &&
      t['rights'].length == 10 &&
      t['purposes'] is List &&
      t['purposes'].join(',') == 'PRIVATE,PUBLIC_SHARE,COMMERCIAL,RELEASE' &&
      t['territories'] is List &&
      t['territories'].join(',') == 'WORLD' &&
      t['languages'] is List &&
      t['languages'].join(',') == 'ALL' &&
      t['project_limit'] == null &&
      t['episode_limit'] == null &&
      t['valid_until'] == (buy ? null : ipAnniversary(t['valid_from'], 5)) &&
      t['development_until'] ==
          (buy ? null : ipAnniversary(t['valid_from'], 2));
}

bool isProcurement(dynamic p) {
  if (p is! Map ||
      p['version'] != 'CONTRACT_20261029' ||
      !['BUYOUT', 'REVENUE_SHARE'].contains(p['mode']) ||
      !_id(p['buyer_party_id']) ||
      p['upfront_minor'] != (p['mode'] == 'BUYOUT' ? 5000000 : 0) ||
      p['royalty_bps'] != (p['mode'] == 'BUYOUT' ? 0 : 800) ||
      p['sublicensing_allowed'] != true ||
      !_text(p['attribution_terms'], 2000)) {
    return false;
  }
  final e = p['rights_evidence'];
  if (e is! Map ||
      e['has_coauthors'] is! bool ||
      ![
        'rights_chain_ids',
        'ownership_proof_ids',
        'original_creation_ids',
        'coauthor_consent_ids'
      ].every((k) => rightsList(e[k], _id,
          max: 30,
          min: k == 'coauthor_consent_ids' && e['has_coauthors'] == false
              ? 0
              : 1))) {
    return false;
  }
  if (p['mode'] == 'BUYOUT') return p['settlement_annex'] == null;
  final a = p['settlement_annex'];
  return a is Map &&
      _id(a['asset_id']) &&
      ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'AGREED'].contains(a['cycle']) &&
      _text(a['terms_text']) &&
      a['net_basis'] ==
          'ALL_RELEASE_AND_DERIVATIVE_INCOME_LESS_PLATFORM_TAX_DISTRIBUTION_PRODUCTION';
}

bool procurementMatches(dynamic d) {
  final p = d['procurement'], t = d['terms'];
  if (t['contract_kind'] == null) return p == null;
  return isProcurement(p) &&
      isIPTerms(t) &&
      t['contract_kind'] ==
          (p['mode'] == 'BUYOUT'
              ? 'IP_BUYOUT_20261029'
              : 'IP_REVENUE_SHARE_20261029') &&
      d['price']['currency'] == 'CNY' &&
      d['price']['amount_minor'] == p['upfront_minor'] &&
      (!d.containsKey('payment_due_minor') ||
          d['payment_due_minor'] == p['upfront_minor']);
}

bool _review(dynamic r) =>
    r == null ||
    r is Map &&
        ['APPROVED', 'REJECTED'].contains(r['decision']) &&
        _text(r['reason'], 2000) &&
        _id(r['reviewer_account_id']);
bool isProcurementEvent(dynamic d) =>
    d is Map &&
    ['DEVELOPMENT', 'PUBLICATION', 'WITHDRAWAL_REQUEST'].contains(d['event']) &&
    (d['event'] == 'WITHDRAWAL_REQUEST'
        ? d['project_id'] == null
        : _id(d['project_id'])) &&
    _date(d['occurred_at']) &&
    rightsList(d['evidence_asset_ids'], _id, max: 30) &&
    _text(d['external_reference'], 128) &&
    _text(d['note'], 2000) &&
    d['verification_method'] == 'EXTERNAL_MANUAL_REVIEW' &&
    _review(d['review']);
bool signedMinor(dynamic v) => v is int && v.abs() <= 1000000000000;
int? signedMinorInput(String v) =>
    RegExp(r'^-?(0|[1-9]\d*)$').hasMatch(v) && signedMinor(int.tryParse(v))
        ? int.parse(v)
        : null;
bool isRoyaltyInput(dynamic s) =>
    s is Map &&
    _date(s['period_from']) &&
    _date(s['period_until']) &&
    DateTime.parse(s['period_until'])
        .isAfter(DateTime.parse(s['period_from'])) &&
    [
      'income_minor',
      'platform_minor',
      'tax_minor',
      'distribution_minor',
      'production_minor'
    ].every((k) => signedMinor(s[k])) &&
    rightsList(s['evidence_asset_ids'], _id, max: 30) &&
    _text(s['external_reference'], 128) &&
    _text(s['note'], 2000);
bool isRoyaltyData(dynamic d) {
  if (d is! Map ||
      !_id(d['project_id']) ||
      !isRoyaltyInput(d['statement']) ||
      !rightsList(d['evidence_asset_ids'], _id, max: 30) ||
      (d['evidence_asset_ids'] as List).join(',') !=
          (d['statement']['evidence_asset_ids'] as List).join(',') ||
      !_review(d['review'])) {
    return false;
  }
  final c = d['calculation'];
  return c == null ||
      c is Map &&
          c['currency'] == 'CNY' &&
          c['royalty_bps'] == 800 &&
          ['project_net_minor', 'cumulative_accrued_minor', 'adjustment_minor']
              .every((k) => signedMinor(c[k])) &&
          c['payment_state'] == 'NOT_TRANSFERRED' &&
          c['rounding'] == 'CUMULATIVE_FLOOR_TO_FEN';
}

List<String> procurementAssets(Map<String, dynamic> p) => {
      for (final v in (p['rights_evidence'] as Map).values)
        if (v is List) ...v.cast<String>(),
      if (p['settlement_annex'] != null)
        p['settlement_annex']['asset_id'] as String
    }.toList();
bool beforeLicenseEnd(dynamic end, [DateTime? now]) =>
    end == null ||
    (now ?? DateTime.now()).toUtc().isBefore(DateTime.parse(end));
