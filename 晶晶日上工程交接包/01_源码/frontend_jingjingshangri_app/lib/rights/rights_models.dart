const copyrightModes = {
  'BUYER_OWNERSHIP': '客户取得成片版权',
  'PRODUCER_OWNERSHIP_LICENSE': '制作方保留版权，客户按约定使用'
};
const copyrightPurposes = {
  'PRIVATE': '私人使用',
  'PUBLIC_SHARE': '公开分享',
  'COMMERCIAL': '约定商业使用',
  'RELEASE': '约定发行'
};
const commercialUses = {
  'BRAND_PROMOTION': '品牌宣传',
  'COMMERCIAL_ADVERTISING': '商业广告',
  'CORPORATE_DISPLAY': '企业展示'
};
const stockExclusions = [
  'COMMERCIAL_ADVERTISING',
  'ADAPTATION',
  'DISTRIBUTION',
  'VOICE_SEPARATELY',
  'AI_REGENERATION',
  'SOURCE_OR_MODEL_FILES',
  'NEW_AVATAR_CONTENT',
  'EXCLUSIVE_BUYOUT'
];
bool _text(dynamic v, [int max = 8000]) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool _id(dynamic v) =>
    v is String &&
    RegExp(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$').hasMatch(v);
bool rightsList(dynamic v, bool Function(dynamic) test,
        {int min = 1, int max = 100}) =>
    v is List &&
    v.length >= min &&
    v.length <= max &&
    v.every(test) &&
    v.toSet().length == v.length;
bool isCopyrightTerms(dynamic v) {
  if (v is! Map ||
      v.length != 7 ||
      v['version'] != 'CONTRACT_20261029' ||
      v['personality_rights_retained'] != true ||
      v['underlying_assets_excluded'] != true ||
      v['third_party_licenses_retained'] != true) {
    return false;
  }
  if (v['mode'] == 'BUYER_OWNERSHIP') {
    return v['buyout_price_included'] == true && v['license'] == null;
  }
  final l = v['license'];
  if (v['mode'] != 'PRODUCER_OWNERSHIP_LICENSE' ||
      v['buyout_price_included'] != false ||
      l is! Map ||
      l.length != 8) {
    return false;
  }
  return ['PERSONAL_NONCOMMERCIAL', 'AGREED_SCOPE'].contains(l['scope']) &&
      rightsList(l['territories'],
          (x) => x is String && RegExp(r'^(WORLD|[A-Z]{2})$').hasMatch(x)) &&
      rightsList(
          l['purposes'],
          (x) =>
              copyrightPurposes.containsKey(x) &&
              (l['scope'] != 'PERSONAL_NONCOMMERCIAL' ||
                  ['PRIVATE', 'PUBLIC_SHARE'].contains(x)),
          max: 4) &&
      l['perpetual'] == true &&
      l['exclusive'] == false &&
      l['transferable'] == false &&
      l['sublicensable'] == false &&
      _text(l['terms_text']);
}

bool isCopyrightSnapshot(dynamic v) {
  if (v is! Map ||
      v.length != 10 ||
      v['version'] != 'CONTRACT_20261029' ||
      !_text(v['line_id'], 128) ||
      !['CONTRACT_20261029_09', 'CONTRACT_20261029_13_ARTICLE_5']
          .contains(v['source_ref']) ||
      !['buyer_party_id', 'producer_party_id', 'copyright_owner_party_id']
          .every((k) => _id(v[k])) ||
      !(v['licensee_party_id'] == null || _id(v['licensee_party_id'])) ||
      !(v['personality_rights_owner_party_id'] == null ||
          _id(v['personality_rights_owner_party_id'])) ||
      v['personality_rights_basis'] != 'INDIVIDUAL_CONSENTS_NOT_TRANSFERRED' ||
      !isCopyrightTerms(v['terms'])) {
    return false;
  }
  return v['terms']['mode'] == 'BUYER_OWNERSHIP'
      ? v['copyright_owner_party_id'] == v['buyer_party_id'] &&
          v['licensee_party_id'] == null
      : v['copyright_owner_party_id'] == v['producer_party_id'] &&
          _id(v['licensee_party_id']);
}

bool isStockTerms(dynamic v, {bool snapshot = false}) {
  if (v is! Map ||
      v['exclusive'] != false ||
      v['acceptance_hours'] is! int ||
      v['acceptance_hours'] < 1 ||
      v['acceptance_hours'] > 720 ||
      !_text(v['aftercare_terms']) ||
      v.containsKey('acceptance_policy') &&
          (v['acceptance_policy'] != 'CONTRACT_20261029' ||
              v['acceptance_hours'] != 48)) {
    return false;
  }
  final commercial = v['scope'] == 'COMMERCIAL_LIMITED';
  final expectedKeys = {
    'scope',
    'exclusive',
    'territory',
    'duration',
    'personal_social_sharing',
    'acceptance_hours',
    'aftercare_terms',
    if (v.containsKey('acceptance_policy')) 'acceptance_policy',
    if (commercial) ...['commercial_uses', 'valid_from', 'valid_until'],
    if (snapshot) ...['limited_to_buyer', 'excluded']
  };
  if (v.keys.toSet().difference(expectedKeys).isNotEmpty ||
      v.length != expectedKeys.length) {
    return false;
  }
  if (commercial) {
    final from = v['valid_from'] is String
            ? DateTime.tryParse(v['valid_from'])
            : null,
        until = v['valid_until'] is String
            ? DateTime.tryParse(v['valid_until'])
            : null;
    if (!_text(v['territory'], 100) ||
        v['duration'] != 'FIXED_TERM' ||
        v['personal_social_sharing'] != false ||
        !rightsList(v['commercial_uses'], commercialUses.containsKey, max: 3) ||
        from == null ||
        until == null ||
        !until.isAfter(from)) {
      return false;
    }
  } else if (v['scope'] != 'PERSONAL_NONCOMMERCIAL' ||
      v['territory'] != 'WORLDWIDE' ||
      v['duration'] != 'PERPETUAL' ||
      v['personal_social_sharing'] != true) return false;
  if (snapshot) {
    final excluded = stockExclusions
        .where((x) =>
            x != 'COMMERCIAL_ADVERTISING' ||
            !commercial ||
            !(v['commercial_uses'] as List).contains(x))
        .toSet();
    if (v['limited_to_buyer'] != true ||
        v['excluded'] is! List ||
        v['excluded'].length != excluded.length ||
        !(v['excluded'] as List).toSet().containsAll(excluded)) {
      return false;
    }
  }
  return true;
}

const rightsErrors = {
  'COPYRIGHT_CHOICE_REQUIRED': '新报价必须明确成片版权归属及使用范围。',
  'COPYRIGHT_CHANGE_REQUIRES_NEW_AGREEMENT': '原订单版权不能随补价修改，请先形成新的明确约定。',
  'CUSTOMIZATION_COPYRIGHT_USE_NOT_ALLOWED': '原个人许可不包含本次商业或发行用途，请另行约定授权。',
  'MANUAL_SAMPLE_COPYRIGHT_CONFIRMATION_REQUIRED': '需要本人确认与当前规格一致的样片版权和使用约定。',
  'STOCK_COMMERCIAL_NOT_ENABLED': '商用新售尚未开放；原购买按原许可保留。',
  'STOCK_COMMERCIAL_BUYER_REQUIRED': '商用机构购买须由已核准品牌客户的成年实名负责人办理。',
  'STOCK_COMMERCIAL_CONSENT_REQUIRED': '每位出镜人须本人确认覆盖用途、地域和期间的商用授权。',
  'STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE': '本份商用许可尚未开始、已到期或已失效，不能下载正式文件。',
  'IP_WITHDRAWAL_NOT_ELIGIBLE': '当前不满足撤回条件，不能视为版权已收回。'
};
