const personalSourceDomains = {
  'CONTRACT_SNAPSHOTS': 'CONTRACT_SNAPSHOTS',
  'TRADE_ORDERS': 'TRADE',
  'PARTICIPATION_CONTRACTS': 'PROJECTS',
  'INCOME_AGREEMENTS': 'PROJECTS',
  'LICENSE_RESERVATIONS': 'LICENSE',
  'LICENSE_GRANTS': 'LICENSE',
  'COMMERCIAL_OFFERS': 'GIGS',
  'MCN_RELATIONS': 'GIGS',
  'SUPPLY_WORKS': 'SUPPLY',
  'PRODUCTION_PROJECTS': 'PRODUCTION',
  'PROJECT_EDITIONS': 'PROJECTS',
  'STOCK_LISTINGS': 'STOCK',
  'STOCK_PURCHASES': 'STOCK_PURCHASE',
  'FINANCE': 'FINANCE',
  'COMMISSIONS': 'GIGS',
};
const personalCategorySources = {
  'contracts': [
    'CONTRACT_SNAPSHOTS',
    'TRADE_ORDERS',
    'PARTICIPATION_CONTRACTS',
    'INCOME_AGREEMENTS',
    'LICENSE_RESERVATIONS',
    'LICENSE_GRANTS',
    'COMMERCIAL_OFFERS',
    'MCN_RELATIONS'
  ],
  'works': [
    'SUPPLY_WORKS',
    'PRODUCTION_PROJECTS',
    'PROJECT_EDITIONS',
    'STOCK_LISTINGS',
    'STOCK_PURCHASES'
  ],
  'income': ['FINANCE', 'COMMISSIONS'],
};
const businessFixtureId = 'd1000000-0000-4000-8000-000000000001';

Map<String, dynamic> incomeFixture(
        {bool merchant = false, String environment = 'SANDBOX'}) =>
    {
      'accrued_minor': 12000,
      'adjustment_minor': -101,
      'verified_paid_minor': 2000,
      'pending_minor': merchant ? 0 : 9899,
      'retained_minor': merchant ? 9899 : 0,
      'recovery_due_minor': 0,
      'currency': 'CNY',
      'environment': environment,
      'meaning': merchant
          ? 'MERCHANT_RETAINED_NOT_TRANSFER'
          : 'PAYABLE_NOT_BANK_BALANCE',
      'basis': 'POSTED_LEDGER_ONLY',
      'bank_arrival_verified': false,
    };
Map<String, dynamic> businessRow(String source,
        {String id = businessFixtureId,
        String title = '真实原业务记录',
        String status = 'IN_REVIEW',
        Map<String, dynamic>? income}) =>
    {
      'key': '${personalSourceDomains[source]}:$id',
      'source_domain': personalSourceDomains[source],
      'record_id': id,
      'title': title,
      'current_status': status,
      'object_version': 2,
      'created_at': '2026-10-30T01:00:00.000Z',
      'target': {'domain': personalSourceDomains[source], 'record_id': id},
      'income': income,
      'notice': source == 'COMMISSIONS' ? '佣金仅供来源核对，不重复计入结算。' : '以原记录与当时约定为准。',
    };
Map<String, dynamic> businessSection(String source,
        {List<Map<String, dynamic>> items = const [],
        String? cursor,
        bool failed = false}) =>
    {
      'source': source,
      'label': '来源分类',
      'status': failed ? 'UNAVAILABLE' : 'AVAILABLE',
      'items': failed ? [] : items,
      'next_cursor': failed ? null : cursor,
      'error_code': failed ? 'PERSONAL_CENTER_SOURCE_UNAVAILABLE' : null,
      'retryable': failed,
    };
Map<String, dynamic> businessResponse(String category, String party,
    {String? source, Map<String, Map<String, dynamic>> sections = const {}}) {
  final values =
      (source == null ? personalCategorySources[category]! : [source])
          .map((s) => sections[s] ?? businessSection(s))
          .toList();
  return {
    'party_id': party,
    'category': category,
    'pagination': 'PER_SOURCE_CREATED_AT_DESC',
    'sections': values,
    'partial': values.any((s) => s['status'] == 'UNAVAILABLE'),
    'notice': '按原来源核对，不合并收入。'
  };
}
