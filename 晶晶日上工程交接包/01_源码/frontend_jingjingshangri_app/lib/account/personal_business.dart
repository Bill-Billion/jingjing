import '../engagement/community_support.dart';
import '../finance/finance_models.dart';
import '../gigs/gig_models.dart';
import '../licensing/license_models.dart';
import '../production/production_models.dart';
import '../projects/project_models.dart';
import '../stock/stock_models.dart';
import '../supply/supply_models.dart';
import '../trade/trade_models.dart';

const businessCategories = {
  'contracts': '合同与约定',
  'works': '我的作品',
  'income': '我的收入',
};

class BusinessSource {
  const BusinessSource(this.category, this.label, this.domain, this.listRoute);
  final String category, label, domain, listRoute;
}

const businessSources = {
  'CONTRACT_SNAPSHOTS':
      BusinessSource('contracts', '封存合同内容', 'CONTRACT_SNAPSHOTS', '/contract'),
  'TRADE_ORDERS': BusinessSource('contracts', '订单约定', 'TRADE', '/orders'),
  'PARTICIPATION_CONTRACTS': BusinessSource(
      'contracts', '参演约定', 'PROJECTS', '/projects/participation'),
  'INCOME_AGREEMENTS':
      BusinessSource('contracts', '发行收入约定', 'PROJECTS', '/projects/income'),
  'LICENSE_RESERVATIONS': BusinessSource(
      'contracts', '剧本许可预留', 'LICENSE', '/licensing?kind=RESERVATION'),
  'LICENSE_GRANTS': BusinessSource(
      'contracts', '已取得剧本许可', 'LICENSE', '/licensing?kind=GRANT'),
  'COMMERCIAL_OFFERS':
      BusinessSource('contracts', '商单接单约定', 'GIGS', '/gigs/records?kind=OFFER'),
  'MCN_RELATIONS': BusinessSource(
      'contracts', 'MCN合作约定', 'GIGS', '/gigs/records?kind=RELATION'),
  'SUPPLY_WORKS': BusinessSource('works', '提交的剧本与作品版本', 'SUPPLY', '/supply'),
  'PRODUCTION_PROJECTS':
      BusinessSource('works', '定制制作项目', 'PRODUCTION', '/production'),
  'PROJECT_EDITIONS':
      BusinessSource('works', '发行成片版本', 'PROJECTS', '/my-projects'),
  'STOCK_LISTINGS':
      BusinessSource('works', '我销售的现成视频', 'STOCK', '/stock/listings'),
  'STOCK_PURCHASES':
      BusinessSource('works', '我购买的现成视频', 'STOCK_PURCHASE', '/stock/purchases'),
  'FINANCE': BusinessSource('income', '已登记的收入核算', 'FINANCE', '/finance'),
  'COMMISSIONS': BusinessSource(
      'income', '商单佣金来源记录', 'GIGS', '/gigs/records?kind=COMMISSION'),
};

const businessIncomeFields = {
  'accrued_minor': '已入账应计金额',
  'adjustment_minor': '已审核调整',
  'verified_paid_minor': '核验净支付',
  'pending_minor': '账面待付',
  'retained_minor': '商家留存',
  'recovery_due_minor': '账面待冲回或追回',
};

Map<String, dynamic> personalBusinessItem(
    Map<String, dynamic> r, String source) {
  final definition = businessSources[source];
  final target = communityMap(r['target']);
  communityRequire(definition != null &&
      communityId(r['record_id']) &&
      r['source_domain'] == definition.domain &&
      r['key'] == '${r['source_domain']}:${r['record_id']}' &&
      target['domain'] == r['source_domain'] &&
      target['record_id'] == r['record_id'] &&
      r['title'] is String &&
      (r['title'] as String).trim().isNotEmpty &&
      r['title'].length <= 240 &&
      r['current_status'] is String &&
      (r['current_status'] as String).isNotEmpty &&
      r['current_status'].length <= 64 &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      r['created_at'] is String &&
      DateTime.tryParse(r['created_at']) != null &&
      r['notice'] is String &&
      (r['notice'] as String).isNotEmpty &&
      r['notice'].length <= 300);
  if (source == 'FINANCE') {
    final money = communityMap(r['income']);
    communityRequire(money['currency'] == 'CNY' &&
        ['SANDBOX', 'PRODUCTION'].contains(money['environment']) &&
        ['MERCHANT_RETAINED_NOT_TRANSFER', 'PAYABLE_NOT_BANK_BALANCE']
            .contains(money['meaning']) &&
        money['basis'] == 'POSTED_LEDGER_ONLY' &&
        money['bank_arrival_verified'] == false);
    for (final field in businessIncomeFields.keys) {
      final value = money[field];
      communityRequire(value is int &&
          value.abs() <= 9007199254740991 &&
          (['accrued_minor', 'adjustment_minor', 'verified_paid_minor']
                  .contains(field) ||
              value >= 0));
    }
    communityRequire(money['meaning'] == 'MERCHANT_RETAINED_NOT_TRANSFER'
        ? money['pending_minor'] == 0
        : money['retained_minor'] == 0);
  } else {
    communityRequire(r['income'] == null);
  }
  return r;
}

Map<String, Map<String, dynamic>> personalBusinessSections(
    Map<String, dynamic> d, String category, String party,
    {String? source}) {
  final expected = source == null
      ? businessSources.keys
          .where((s) => businessSources[s]!.category == category)
          .toSet()
      : {source};
  final sections = communityRows(d['sections']);
  communityRequire(d['party_id'] == party &&
      d['category'] == category &&
      d['pagination'] == 'PER_SOURCE_CREATED_AT_DESC' &&
      d['partial'] is bool &&
      d['notice'] is String &&
      sections.length == expected.length &&
      sections.map((s) => s['source']).toSet().containsAll(expected) &&
      d['partial'] == sections.any((s) => s['status'] == 'UNAVAILABLE'));
  return {for (final section in sections) section['source']: section};
}

class PersonalBusinessSourcePage {
  PersonalBusinessSourcePage(Map<String, dynamic> d, String source) {
    communityRequire(d['source'] == source &&
        d['label'] is String &&
        ['AVAILABLE', 'UNAVAILABLE'].contains(d['status']));
    available = d['status'] == 'AVAILABLE';
    items = communityItems(d);
    communityRequire(d['next_cursor'] == null || d['next_cursor'] is String);
    cursor = d['next_cursor'];
    communityRequire(items.length <= 50 &&
        (cursor == null || cursor!.isNotEmpty && cursor!.length <= 700));
    if (available) {
      communityRequire(d['error_code'] == null && d['retryable'] == false);
      items = items.map((r) => personalBusinessItem(r, source)).toList();
    } else {
      communityRequire(items.isEmpty &&
          cursor == null &&
          d['error_code'] == 'PERSONAL_CENTER_SOURCE_UNAVAILABLE' &&
          d['retryable'] == true);
    }
  }
  late final bool available;
  late List<Map<String, dynamic>> items;
  late final String? cursor;
}

String personalBusinessRoute(Map<String, dynamic> item,
    {required String source}) {
  final target = communityMap(item['target']);
  final id = communityRequiredId('${target['record_id']}', '原业务');
  if (source == 'PARTICIPATION_CONTRACTS') {
    return '/projects/participation?view=agreement&recordId=$id';
  }
  if (source == 'INCOME_AGREEMENTS') {
    return '/projects/income?view=agreement&recordId=$id';
  }
  return switch (target['domain']) {
    'CONTRACT_SNAPSHOTS' => '/contract?snapshotId=$id',
    'TRADE' => '/trade/record?recordId=$id',
    'PROJECTS' => '/projects/record?recordId=$id',
    'LICENSE' => '/licensing/record?recordId=$id',
    'SUPPLY' => '/supply/record?recordId=$id',
    'PRODUCTION' => '/production/project?projectId=$id',
    'STOCK' => '/stock/listing?listingId=$id',
    'STOCK_PURCHASE' => '/stock/purchase?orderId=$id',
    'FINANCE' => '/finance/record?recordId=$id',
    'GIGS' => '/gigs/record?recordId=$id',
    _ => throw StateError('未识别的原业务入口'),
  };
}

String personalBusinessStatus(Map<String, dynamic> item) {
  final status = item['current_status'] as String;
  if (status == 'SEALED') return '内容已封存，不表示已签署或付款';
  final states = switch (item['source_domain']) {
    'TRADE' => tradeStatuses,
    'PROJECTS' => projectStatuses,
    'LICENSE' => licenseStatuses,
    'SUPPLY' => supplyStatuses,
    'PRODUCTION' => productionStatuses,
    'STOCK' => stockStatuses,
    'STOCK_PURCHASE' => tradeStatuses,
    'FINANCE' => financeStatuses,
    'GIGS' => gigStatuses,
    _ => const <String, String>{},
  };
  return states[status] ?? '$status（以原业务记录为准）';
}

String personalIncomeMoney(String field, int amount) =>
    '${field == 'adjustment_minor' && amount > 0 ? '+' : ''}${financeMoneyText(amount)}';
