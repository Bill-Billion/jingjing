import 'contract_api.dart' show isContractId;

/// Validates an already frozen allocation, without choosing or recalculating rates.
bool marketplaceAllocationValid(dynamic value) {
  if (value is! Map) {
    return false;
  }
  const keys = {
    'model',
    'product_type',
    'fee_base',
    'platform_party_id',
    'platform_bps',
    'supplier_party_id',
    'mcn_party_id',
    'mcn_supply_bps',
    'referrer_party_id',
    'referral_bps',
    'rounding',
  };
  if (value.length != keys.length || !value.keys.every(keys.contains)) {
    return false;
  }
  if (value['model'] != 'V5_TWO_LAYER' ||
      value['fee_base'] != 'NET_PAID' ||
      !['STOCK_VIDEO', 'COMMERCIAL', 'AUDITION']
          .contains(value['product_type']) ||
      !['HALF_UP_PLATFORM_REMAINDER', 'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN']
          .contains(value['rounding'])) {
    return false;
  }
  bool id(dynamic v) => v is String && isContractId(v);
  bool rate(dynamic v) => v is int && v >= 0 && v <= 10000;
  if (!id(value['platform_party_id']) ||
      !id(value['supplier_party_id']) ||
      !rate(value['platform_bps']) ||
      !rate(value['mcn_supply_bps']) ||
      !rate(value['referral_bps']) ||
      value['referral_bps'] > value['platform_bps']) {
    return false;
  }
  if (value['mcn_party_id'] == null) {
    if (value['mcn_supply_bps'] != 0) {
      return false;
    }
  } else if (!id(value['mcn_party_id']) ||
      value['mcn_supply_bps'] < 1000 ||
      value['mcn_supply_bps'] > 3000) {
    return false;
  }
  if (value['referrer_party_id'] == null) {
    if (value['referral_bps'] != 0) {
      return false;
    }
  } else if (!id(value['referrer_party_id'])) {
    return false;
  }
  final parties = [
    value['platform_party_id'],
    value['supplier_party_id'],
    value['mcn_party_id'],
    value['referrer_party_id']
  ].where((v) => v != null).toList();
  return parties.toSet().length == parties.length;
}
