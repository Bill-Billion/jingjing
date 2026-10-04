import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../contracts/contract_api.dart';

const projectKinds = [
  'PROJECT',
  'ROLE',
  'CANDIDATE',
  'PLAN',
  'EDITION',
  'CHANNEL',
  'RELEASE',
  'EXTERNAL_EVENT'
];
const projectStatuses = {
  'PREPARING': '筹备中',
  'STARTED': '已开工',
  'CANCELLED': '已取消',
  'OPEN': '开放报名',
  'INVITED': '待回应邀请',
  'APPLIED': '已报名，待筛选',
  'DECLINED': '已谢绝邀请',
  'SELECTED': '已获选，待本人确认',
  'CONFIRMED': '本人已确认入组',
  'WITHDRAWN': '已退出',
  'IN_REVIEW': '独立审核中',
  'APPROVED': '审核通过',
  'CHANGES_REQUESTED': '需补件',
  'REJECTED': '未通过',
  'INTERNAL_PENDING': '内部审核中',
  'READY_TO_SUBMIT': '内部通过，待外部提交',
  'EXTERNAL_SUBMITTED': '外部提交已核实',
  'EXTERNAL_CHANGES_REQUESTED': '外部要求补件',
  'EXTERNAL_REJECTED': '外部拒绝已核实',
  'EXTERNAL_PUBLISHED': '外部发行已核实',
  'EXTERNAL_WITHDRAWN': '外部撤下已核实'
};
const projectLayers = {
  'FACE_VOICE': '脸声',
  'ORIGINAL': '原作',
  'SCRIPT': '剧本',
  'MUSIC': '音乐',
  'ADAPTATION': '改编',
  'FINAL': '成片'
};
const projectOutcomes = {
  'SUBMITTED': '已提交',
  'CHANGES_REQUESTED': '需补件',
  'REJECTED': '已拒绝',
  'PUBLISHED': '已发行',
  'WITHDRAWN': '已撤下'
};
void projectRequire(bool v) {
  if (!v) {
    throw const AccountError(502, 'INVALID_PROJECT_RESPONSE', uncertain: true);
  }
}

bool projectIsId(dynamic v) => v is String && isContractId(v);
bool projectText(dynamic v, [int max = 8000]) =>
    v is String && v.trim().isNotEmpty && v.length <= max;
bool projectHash(dynamic v) =>
    v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool projectInt(dynamic v, {int min = 0, int max = 900000000000}) =>
    v is int && v >= min && v <= max;
bool projectInstant(dynamic v) =>
    v is String &&
    RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$').hasMatch(v) &&
    DateTime.tryParse(v)?.toUtc().toIso8601String() == v;
Map<String, dynamic> projectMap(dynamic v, {List<String>? keys}) {
  projectRequire(v is Map && v.keys.every((k) => k is String));
  final d = Map<String, dynamic>.from(v as Map);
  if (keys != null) {
    projectRequire(d.length == keys.length && keys.every(d.containsKey));
  }
  return d;
}

List<dynamic> projectList(dynamic v, {int min = 0, int max = 100}) {
  projectRequire(v is List && v.length >= min && v.length <= max);
  return List.from(v as List);
}

List<String> projectIds(dynamic v, {int min = 0, int max = 50}) {
  final a = projectList(v, min: min, max: max);
  projectRequire(a.every(projectIsId) && a.toSet().length == a.length);
  return a.cast<String>();
}

Object? _canonical(dynamic v) {
  if (v is Map) {
    final keys = v.keys.cast<String>().toList()..sort();
    return {for (final k in keys) k: _canonical(v[k])};
  }
  if (v is List) return v.map(_canonical).toList();
  projectRequire(v == null || v is String || v is bool || v is int);
  return v;
}

String projectDigest(dynamic v) =>
    sha256.convert(utf8.encode(jsonEncode(_canonical(v)))).toString();
Map<String, dynamic> projectScope(dynamic v) {
  final d =
      projectMap(v, keys: ['purpose', 'territory', 'language', 'valid_until']);
  projectRequire(['PUBLIC_SHARE', 'RELEASE'].contains(d['purpose']) &&
      d['territory'] is String &&
      RegExp(r'^[A-Z]{2}$').hasMatch(d['territory']) &&
      d['language'] is String &&
      RegExp(r'^[a-z]{2}$').hasMatch(d['language']) &&
      projectInstant(d['valid_until']));
  return d;
}

void projectRole(dynamic v, {bool catalogue = false}) {
  final d = projectMap(v, keys: [
    if (catalogue) 'id',
    if (catalogue) 'object_version',
    'title',
    'capacity',
    'pricing',
    'amount_minor',
    'terms'
  ]);
  projectRequire(projectText(d['title']) &&
      projectText(d['terms']) &&
      projectInt(d['capacity'], min: 1, max: 100) &&
      ['FIXED', 'QUOTE'].contains(d['pricing']) &&
      (d['pricing'] == 'FIXED'
          ? projectInt(d['amount_minor'])
          : d['amount_minor'] == null));
  if (catalogue) {
    projectRequire(
        projectIsId(d['id']) && projectInt(d['object_version'], min: 1));
  }
}

List<Map<String, dynamic>> projectConfirmers(dynamic v) {
  final rows = projectList(v, min: 1, max: 50).map((x) {
    final d =
        projectMap(x, keys: ['party_id', 'responsibility', 'after_party_ids']);
    projectRequire(
        projectIsId(d['party_id']) && projectText(d['responsibility']));
    projectIds(d['after_party_ids']);
    return d;
  }).toList();
  final ids = rows.map((x) => x['party_id']).toSet();
  projectRequire(ids.length == rows.length &&
      rows.every((x) => (x['after_party_ids'] as List).every(ids.contains)));
  return rows;
}

void _review(dynamic v, String kind) {
  if (v == null) return;
  final d = projectMap(v, keys: [
    'decision',
    'reason',
    'verification',
    'reviewer_account_id',
    'method'
  ]);
  projectRequire(
      ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].contains(d['decision']) &&
          projectText(d['reason'], 4000) &&
          projectIsId(d['reviewer_account_id']) &&
          d['method'] == 'MANUAL_EVIDENCE_REVIEW');
  const fields = {
    'PLAN': [
      'identity_verified',
      'signatures_verified',
      'rights_verified',
      'production_verified'
    ],
    'EDITION': [
      'rights_verified',
      'content_verified',
      'credits_verified',
      'materials_verified'
    ],
    'CHANNEL': ['channel_verified', 'requirements_verified'],
    'RELEASE': ['rights_verified', 'materials_verified', 'channel_verified'],
    'EXTERNAL_EVENT': [
      'source_verified',
      'reference_verified',
      'outcome_verified'
    ]
  };
  final c = projectMap(d['verification']);
  projectRequire(
      c.keys.every(fields[kind]!.contains) && c.values.every((v) => v is bool));
  if (d['decision'] == 'APPROVED') {
    projectRequire(fields[kind]!.every((k) => c[k] == true));
  }
}

class ProjectRecord {
  ProjectRecord._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'];
  String get kind => raw['kind'];
  String get owner => raw['owner_party_id'];
  String? get projectId => raw['project_id'];
  String get status => raw['current_status'];
  int get version => raw['object_version'];
  String get hash => raw['content_sha256'];
  Map<String, dynamic> get data => raw['data'];
  factory ProjectRecord.parse(dynamic value,
      {String? id, String? kind, String? projectId}) {
    final r = projectMap(value, keys: [
      'id',
      'kind',
      'project_id',
      'owner_party_id',
      'created_by',
      'current_status',
      'object_version',
      'content_sha256',
      'data'
    ]);
    final k = r['kind'];
    projectRequire(projectKinds.contains(k) &&
        projectIdValid(r['id']) &&
        projectIdValid(r['owner_party_id']) &&
        projectIdValid(r['created_by']) &&
        projectInt(r['object_version'], min: 1) &&
        projectHash(r['content_sha256']) &&
        (id == null || r['id'] == id) &&
        (kind == null || k == kind) &&
        (projectId == null || r['project_id'] == projectId));
    projectRequire(['PROJECT', 'CHANNEL'].contains(k)
        ? r['project_id'] == null
        : projectIdValid(r['project_id']));
    const states = {
      'PROJECT': ['PREPARING', 'STARTED', 'CANCELLED'],
      'ROLE': ['OPEN'],
      'CANDIDATE': [
        'INVITED',
        'APPLIED',
        'DECLINED',
        'SELECTED',
        'CONFIRMED',
        'REJECTED',
        'WITHDRAWN'
      ],
      'PLAN': ['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
      'EDITION': ['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
      'CHANNEL': ['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
      'RELEASE': [
        'INTERNAL_PENDING',
        'READY_TO_SUBMIT',
        'CHANGES_REQUESTED',
        'REJECTED',
        'EXTERNAL_SUBMITTED',
        'EXTERNAL_CHANGES_REQUESTED',
        'EXTERNAL_REJECTED',
        'EXTERNAL_PUBLISHED',
        'EXTERNAL_WITHDRAWN'
      ],
      'EXTERNAL_EVENT': [
        'IN_REVIEW',
        'APPROVED',
        'CHANGES_REQUESTED',
        'REJECTED'
      ]
    };
    projectRequire(states[k]!.contains(r['current_status']));
    final d = projectMap(r['data']);
    projectRequire(projectDigest(d) == r['content_sha256']);
    switch (k) {
      case 'PROJECT':
        projectMap(d, keys: [
          'title',
          'scope',
          'current_plan_id',
          'current_edition_id',
          'cancel_reason'
        ]);
        projectRequire(projectText(d['title']) &&
            [d['current_plan_id'], d['current_edition_id']]
                .every((v) => v == null || projectIdValid(v)) &&
            (d['cancel_reason'] == null || projectText(d['cancel_reason'])));
        projectScope(d['scope']);
      case 'ROLE':
        projectRole(d);
      case 'CANDIDATE':
        projectMap(d, keys: [
          'role_id',
          'avatar_id',
          'consent_id',
          'amount_minor',
          'note',
          'terms',
          'final_confirmed_by'
        ]);
        projectRequire(projectIdValid(d['role_id']) &&
            [d['avatar_id'], d['consent_id'], d['final_confirmed_by']]
                .every((v) => v == null || projectIdValid(v)) &&
            (d['amount_minor'] == null || projectInt(d['amount_minor'])) &&
            (d['note'] == null || projectText(d['note'])) &&
            projectText(d['terms']));
      case 'PLAN':
        projectMap(d, keys: [
          'production_project_id',
          'rights',
          'confirmers',
          'funding',
          'terms',
          'roster_sha256',
          'review'
        ]);
        projectRequire(projectIdValid(d['production_project_id']) &&
            projectHash(d['roster_sha256']) &&
            projectText(d['terms']));
        projectConfirmers(d['confirmers']);
        final rights = projectList(d['rights'], min: 6, max: 6);
        final layers = <String>{};
        for (final v in rights) {
          final x = projectMap(v, keys: [
            'layer',
            'holder_party_id',
            'evidence_asset_id',
            'purpose',
            'territory',
            'valid_until',
            'terms'
          ]);
          projectRequire(projectLayers.containsKey(x['layer']) &&
              layers.add(x['layer']) &&
              projectIdValid(x['holder_party_id']) &&
              projectIdValid(x['evidence_asset_id']) &&
              ['PUBLIC_SHARE', 'RELEASE'].contains(x['purpose']) &&
              projectText(x['territory'], 2) &&
              projectInstant(x['valid_until']) &&
              projectText(x['terms']));
        }
        for (final v in projectList(d['funding'])) {
          final f =
              projectMap(v, keys: ['candidate_id', 'order_id', 'line_id']);
          projectRequire(projectIdValid(f['candidate_id']) &&
              projectIdValid(f['order_id']) &&
              projectText(f['line_id'], 128));
        }
        _review(d['review'], k);
      case 'EDITION':
        projectMap(d, keys: [
          'plan_id',
          'final_version_id',
          'final_content_sha256',
          'material_asset_ids',
          'confirmers',
          'note',
          'review'
        ]);
        projectRequire(projectIdValid(d['plan_id']) &&
            projectIdValid(d['final_version_id']) &&
            projectHash(d['final_content_sha256']) &&
            projectText(d['note']));
        projectIds(d['material_asset_ids'], min: 1, max: 30);
        projectConfirmers(d['confirmers']);
        _review(d['review'], k);
      case 'CHANNEL':
        projectMap(d, keys: [
          'name',
          'channel_reference',
          'submission_requirements',
          'evidence_asset_id',
          'review'
        ]);
        projectRequire(projectText(d['name']) &&
            projectText(d['channel_reference']) &&
            projectText(d['submission_requirements']) &&
            projectIdValid(d['evidence_asset_id']));
        _review(d['review'], k);
      case 'RELEASE':
        projectMap(d, keys: [
          'edition_id',
          'channel_id',
          'prior_release_id',
          'material_asset_ids',
          'note',
          'review',
          'last_external_event_id'
        ]);
        projectRequire(projectIdValid(d['edition_id']) &&
            projectIdValid(d['channel_id']) &&
            [d['prior_release_id'], d['last_external_event_id']]
                .every((v) => v == null || projectIdValid(v)) &&
            projectText(d['note']));
        projectIds(d['material_asset_ids'], min: 1, max: 30);
        _review(d['review'], k);
      case 'EXTERNAL_EVENT':
        projectMap(d, keys: [
          'release_id',
          'outcome',
          'external_reference',
          'occurred_at',
          'evidence_asset_id',
          'note',
          'review',
          'provenance'
        ]);
        projectRequire(projectIdValid(d['release_id']) &&
            projectOutcomes.containsKey(d['outcome']) &&
            projectText(d['external_reference']) &&
            projectInstant(d['occurred_at']) &&
            projectIdValid(d['evidence_asset_id']) &&
            projectText(d['note']) &&
            d['provenance'] == 'EXTERNAL_MANUAL_EVIDENCE');
        _review(d['review'], k);
    }
    return ProjectRecord._({...r, 'data': d});
  }
  static bool projectIdValid(dynamic v) => projectIsId(v);
}

class ProjectCatalogue {
  ProjectCatalogue(this.items);
  final List<Map<String, dynamic>> items;
  factory ProjectCatalogue.parse(dynamic value) {
    final d = projectMap(value, keys: ['items']);
    final rows = projectList(d['items']).map((v) {
      final x = projectMap(v,
          keys: ['id', 'kind', 'title', 'scope', 'channel_reference', 'roles']);
      projectRequire(projectIsId(x['id']) &&
          ['PROJECT', 'CHANNEL'].contains(x['kind']) &&
          projectText(x['title']));
      final roles = projectList(x['roles']);
      for (final r in roles) {
        projectRole(r, catalogue: true);
      }
      if (x['kind'] == 'PROJECT') {
        projectScope(x['scope']);
        projectRequire(x['channel_reference'] == null);
      } else {
        projectRequire(x['scope'] == null &&
            projectText(x['channel_reference']) &&
            roles.isEmpty);
      }
      return x;
    }).toList();
    projectRequire(rows.map((v) => v['id']).toSet().length == rows.length);
    return ProjectCatalogue(rows);
  }
}

List<Map<String, dynamic>> projectConfirmationRows(dynamic value) {
  final d = projectMap(value, keys: ['items']);
  final a = projectList(d['items'], max: 50).map((v) {
    final x = projectMap(v, keys: [
      'party_id',
      'account_id',
      'content_sha256',
      'decision',
      'reason'
    ]);
    projectRequire(projectIsId(x['party_id']) &&
        projectIsId(x['account_id']) &&
        projectHash(x['content_sha256']) &&
        ['APPROVED', 'REJECTED'].contains(x['decision']) &&
        projectText(x['reason']));
    return x;
  }).toList();
  projectRequire(a.map((v) => v['party_id']).toSet().length == a.length);
  return a;
}

bool projectCanConfirm(ProjectRecord r, ProjectRecord p, String party,
    List<Map<String, dynamic>> confirmations) {
  if (!['PLAN', 'EDITION'].contains(r.kind) ||
      r.status != 'APPROVED' ||
      p.status == 'CANCELLED' ||
      p.data[r.kind == 'PLAN' ? 'current_plan_id' : 'current_edition_id'] !=
          r.id) {
    return false;
  }
  final signers = projectConfirmers(r.data['confirmers']);
  final own = signers.where((s) => s['party_id'] == party).firstOrNull;
  return own != null &&
      !confirmations.any((c) => c['party_id'] == party) &&
      (own['after_party_ids'] as List).every((id) => confirmations.any((c) =>
          c['party_id'] == id &&
          c['decision'] == 'APPROVED' &&
          c['content_sha256'] == r.hash));
}

String projectError(AccountError e, {bool writing = false}) {
  if (e.status == 412) return '内容已更新，请重新阅读并再次确认。原决定不会自动重放。';
  if (e.uncertain && writing) return '本次操作结果待核实。原请求内容、版本和编号已保留，请恢复原请求核对。';
  if ([401, 403, 404].contains(e.status)) return '请重新登录，或切换有权限的负责人身份。私有内容已清空。';
  const reasons = {
    'PRODUCTION_NOT_READY': '原制作已暂停、撤回或不再满足制作条件，需要按有效流程复核恢复。',
    'PRODUCTION_ORDER_BLOCKED': '原制作订单已取消、退款或财务状态阻止后续使用。',
    'PRODUCTION_PAYMENT_REQUIRED': '原制作付款节点尚未核实。',
    'PRODUCTION_LICENSE_NOT_READY': '原制作剧本许可当前未满足使用条件。',
    'PRODUCTION_CONSENT_NOT_AVAILABLE': '原制作本人同意已失效、到期或撤回。',
    'PRODUCTION_SCRIPT_NOT_APPROVED': '原制作剧本尚未完成权属与内容审核。',
    'PRODUCTION_PARTY_NOT_ACTIVE': '原制作参与主体当前不可用。',
    'PROJECT_PARTY_NOT_ACTIVE': '项目参与主体当前不可用。',
    'PRODUCTION_PROJECT_MISMATCH': '关联制作项目的买方与本项目发起方不一致。',
    'FUNDING_ALREADY_ASSIGNED': '这笔已付角色明细已用于另一角色，不可重复占用。',
    'PROJECT_EVIDENCE_REQUIRED': '私有材料未就绪或不属于本项目发起方。',
    'ROLE_NOT_OPEN': '角色当前未开放，请重新查看招募目录。',
    'ROLE_PRICE_MISMATCH': '本次金额与角色固定价不一致。',
    'INVITATION_NOT_PENDING': '这份邀请已不在待回应状态，请查看本人记录。',
    'FINAL_VERSION_CHANGED': '最终成片内容已变化，需要重新核对准确版本。',
    'CHANNEL_NOT_APPROVED': '渠道尚未通过独立核验。',
    'RELEASE_PREDECESSOR_REQUIRED': '请关联同渠道上一申请，不能跳过历史记录。',
    'RELEASE_PREDECESSOR_USED': '上一申请已关联新的申请，请查看最新记录。',
    'EXTERNAL_EVENT_IN_FUTURE': '发生时间不可在未来，请填写实际时间。',
    'ROLE_CAPACITY_REACHED': '角色名额已满，请重新查看。',
    'ALREADY_APPLIED': '已报名该角色，请查看本人参与记录。',
    'CAST_CONSENT_NOT_AVAILABLE': '本人同意未覆盖项目用途、地区或完整期间。',
    'CAST_INCOMPLETE': '角色尚未全部完成本人入组确认。',
    'PROJECT_PLAN_REQUIRED': '当前方案尚未建立。',
    'PROJECT_PLAN_NOT_APPROVED': '当前方案尚未通过独立审核。',
    'PROJECT_CONFIRMATIONS_REQUIRED': '当前版本尚未完成各方确认。',
    'CONFIRMATION_PREDECESSOR_REQUIRED': '请等待前置方完成本版本确认。',
    'CAST_CHANGED_RECONFIRM_REQUIRED': '阵容已变化，需要新方案重新确认。',
    'PROJECT_VERSION_SUPERSEDED': '该版本已被替换，请查看当前版本。',
    'CAST_FUNDING_REQUIRED': '角色费用尚未关联真实已付明细。',
    'CAST_FUNDING_NOT_VERIFIED': '角色费用付款条件尚未满足。',
    'SOURCE_RELEASE_CONSENT_REQUIRED': '原制作脸声尚缺有效公开授权与本人确认。',
    'DISTRIBUTION_LICENSE_REQUIRED': '剧本许可尚未覆盖本项目发行范围。',
    'FINAL_DELIVERY_NOT_ACCEPTED_PAID': '最终成片尚未完成验收或付款。',
    'PROJECT_NOT_USABLE': '项目已取消、到期或当前权利不可用。',
    'PROJECT_RIGHTS_EXPIRED': '当前权利已到期。',
    'EXTERNAL_TRANSITION_INVALID': '外部结果不符合当前渠道进度，请核对真实事实。',
    'RELEASE_ALREADY_PENDING': '同渠道已有待办或已发行申请。',
    'INVALID_RELEASE_PREDECESSOR': '上一申请不满足同项目、同渠道重提条件。',
    'SERVICE_UNAVAILABLE': '服务暂不可用，请稍后重新读取。',
    'CONTEXT_CHANGED': '办事身份已变化，请重新读取。'
  };
  return reasons[e.code] ??
      (e.status == 409 ? '当前条件不满足，请重新读取记录并核对授权、付款和版本。' : '暂时无法读取或完成，请稍后重试。');
}

int? projectParseYuan(String text) {
  if (!RegExp(r'^\d{1,10}(\.\d{1,2})?$').hasMatch(text.trim())) return null;
  final parts = text.trim().split('.');
  final n = int.parse(parts.first) * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
  return projectInt(n) ? n : null;
}
