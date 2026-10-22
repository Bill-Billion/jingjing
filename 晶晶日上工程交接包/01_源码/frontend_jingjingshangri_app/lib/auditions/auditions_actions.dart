import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../artists/artists_api.dart';
import '../stock/v5_support.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'auditions_api.dart';
import 'auditions_models.dart';

class AuditionActionPage extends StatefulWidget {
  const AuditionActionPage(
      {super.key,
      required this.session,
      required this.id,
      required this.action});
  final AccountSession session;
  final String id, action;
  @override
  State<AuditionActionPage> createState() => _AuditionActionPageState();
}

class _AuditionActionPageState extends State<AuditionActionPage> {
  late final api = AuditionsApi(widget.session);
  AuditionRecord? record;
  String? error;
  bool busy = false;
  final consents = <String, String>{},
      versions = <String, String>{'NEW': '首次私人造型版本'};
  static const titles = {
    'decision': '接受或拒绝本次邀约',
    'travel': '记录真实出发与到场',
    'delivery': '提交本次试镜取样',
    'cancel': '取消、争议或安全离场',
    'reschedule': '按原订单申请改期',
    'reschedule-response': '回复本次改期',
    'contact': '本次联系卡另行同意',
    'support': '请平台客服加入',
    'supplements': '已付款试镜的独立补差',
    'baseplate': '本人另给私人归档同意'
  };
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<int?> load({bool propagateError = false}) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!titles.containsKey(widget.action)) {
        throw const AccountError(400, 'INVALID_ACTION');
      }
      final r = await api.record(widget.id);
      if (r.kind != 'BOOKING') throw const AccountError(400, 'INVALID_ACTION');
      if (widget.action == 'baseplate' &&
          widget.session.party?['kind'] != 'PERSON') {
        throw const AccountError(403, 'ARTIST_PERSONAL_CONFIRMATION_REQUIRED');
      }
      if (['delivery', 'baseplate'].contains(widget.action) &&
          widget.session.party?['kind'] == 'PERSON') {
        final artists = ArtistsApi(widget.session),
            person = await artists.person(r.data['offer']['person_id']);
        consents.clear();
        if (person.person.owner == widget.session.partyId) {
          for (final c in (await artists.allRecords(
                  person.person.id, 'CONSENT'))
              .where((c) =>
                  c.status == 'APPROVED' &&
                  c.avatarId == r.data['offer']['avatar_id'] &&
                  (c.data['purposes'] as List).contains(
                      widget.action == 'baseplate'
                          ? 'PRIVATE_ARCHIVE'
                          : 'AUDITION_SAMPLES') &&
                  c.data['grantee_party_id'] ==
                      (widget.action == 'baseplate'
                          ? person.person.owner
                          : r.raw['owner_party_id']) &&
                  DateTime.parse(c.data['valid_from'])
                      .isBefore(DateTime.now()) &&
                  DateTime.parse(c.data['valid_until'])
                      .isAfter(DateTime.now()))) {
            consents[c.id] = c.data['terms'];
          }
          if (widget.action == 'baseplate') {
            for (final v in (await artists.allRecords(person.person.id, 'LOOK'))
                .where((v) => v.avatarId == r.data['offer']['avatar_id'])) {
              versions[v.id] = v.data['display_name'];
            }
          }
        }
      } else if (widget.action == 'delivery') {
        consents.clear();
        if (r.data['delivery'] != null) {
          consents[r.data['delivery']['consent_id']] = '本单本人已提供的取样同意（提交时重新核对）';
        }
        String? cursor;
        final seen = <String>{};
        do {
          final page = await api.records('BOOKING', cursor: cursor);
          for (final old in page.items.where((b) =>
              b.raw['owner_party_id'] == r.raw['owner_party_id'] &&
              b.data['offer']['person_id'] == r.data['offer']['person_id'] &&
              b.data['offer']['avatar_id'] == r.data['offer']['avatar_id'] &&
              b.data['delivery'] != null)) {
            consents[old.data['delivery']['consent_id']] =
                '本人原已提供的同一接收方取样授权（提交时重核）';
          }
          cursor = page.cursor;
          if (cursor != null) v5Require(seen.add(cursor));
        } while (cursor != null);
      }
      if (mounted) setState(() => record = r);
      return r.version;
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
      if (propagateError) rethrow;
      return null;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Map<String, dynamic> body(Map<String, dynamic> v, AuditionRecord r) {
    final a = widget.action;
    if (a == 'decision') {
      return {'decision': v['decision'], 'reason': v['reason']};
    }
    if (a == 'travel') {
      if (v['actual'] != true) {
        throw const AccountError(400, 'INVALID_TRAVEL_ACTION');
      }
      return {
        'action': v['action'],
        'evidence_asset_ids': v5InputIds(v['evidence_asset_ids'] ?? '')
      };
    }
    if (a == 'delivery') {
      final photos = v5InputIds(v['photos'] ?? ''),
          videos = v5InputIds(v['videos'] ?? '');
      if (photos.length != r.data['rules']['photo_count'] ||
          videos.length != r.data['rules']['video_count'] ||
          <dynamic>{...photos, ...videos}.length !=
              photos.length + videos.length) {
        throw const AccountError(400, 'AUDITION_DELIVERY_COUNT_MISMATCH');
      }
      if (!consents.containsKey(v['consent_id'])) {
        throw const AccountError(400, 'AUDITION_SAMPLE_CONSENT_REQUIRED');
      }
      return {
        'delivery': {
          'photos': photos,
          'videos': videos,
          'consent_id': v['consent_id']
        }
      };
    }
    if (a == 'cancel') {
      return {
        'reason': v['reason'],
        'safety': v['safety'] == true,
        'evidence_asset_ids': v5InputIds(v['evidence_asset_ids'] ?? '')
      };
    }
    if (a == 'reschedule') {
      return {
        'reason': v['reason'],
        'appointment': {
          'mode': r.data['appointment']['mode'],
          'city': v['city'],
          'venue': v['venue'],
          'address': v['address'],
          'purpose': v['purpose'],
          'starts_at': v5InputDate(v['starts_at']),
          'ends_at': v5InputDate(v['ends_at'])
        }
      };
    }
    if (a == 'reschedule-response') return {'decision': v['decision']};
    if (a == 'contact') {
      if (v['consent'] == true &&
          !RegExp(r'^1[3-9]\d{9}$').hasMatch('${v['phone']}')) {
        throw const AccountError(400, 'AUDITION_CONTACT_CONSENT_REQUIRED');
      }
      return {
        'name': v['name'],
        'phone': v['consent'] == true ? v['phone'] : null,
        'consent': v['consent'] == true
      };
    }
    if (a == 'support') return {'action': 'REQUEST'};
    if (a == 'supplements') {
      return {
        'title': v['title'],
        'terms': v['terms'],
        'amount_minor': v5InputMoney(v['amount']),
        'expires_at': v5InputDate(v['expires_at'])
      };
    }
    if (a == 'baseplate') {
      if (!consents.containsKey(v['consent_id'])) {
        throw const AccountError(400, 'AUDITION_SAMPLE_CONSENT_REQUIRED');
      }
      return {
        'consent_id': v['consent_id'],
        'previous_version_id':
            v['previous_version_id'] == 'NEW' ? null : v['previous_version_id'],
        'display_name': v['display_name']
      };
    }
    throw const AccountError(400, 'INVALID_ACTION');
  }

  List<V5Field> fields(AuditionRecord r) => switch (widget.action) {
        'decision' => const [
            V5Field('decision', '本次接单选择',
                choices: {'ACCEPT': '明确接受本次预约', 'DECLINE': '明确拒绝，按原单申请退款'}),
            V5Field('reason', '本次接拒说明', type: 'multiline')
          ],
        'travel' => [
            V5Field('action', '真实行程节点', choices: {
              if (r.status == 'ACCEPTED') 'DEPART': '现在记录实际出发',
              'ARRIVE': '现在记录实际到场'
            }),
            const V5Field('actual', '我确认这是真实发生的本次行程节点', type: 'bool')
          ],
        'delivery' => [
            V5Field('consent_id', '本人与本次买方的取样授权', choices: consents)
          ],
        'cancel' => const [
            V5Field('reason', '具体问题与双方情况', type: 'multiline'),
            V5Field('safety', '本次涉及安全离场或安全问题', type: 'bool', required: false)
          ],
        'reschedule' => const [
            V5Field('city', '新城市'),
            V5Field('venue', '新正规场地'),
            V5Field('address', '新地址'),
            V5Field('starts_at', '新开始时间', type: 'datetime'),
            V5Field('ends_at', '新结束时间', type: 'datetime'),
            V5Field('purpose', '新行程实际用途', type: 'multiline'),
            V5Field('reason', '改期原因', type: 'multiline')
          ],
        'reschedule-response' => const [
            V5Field('decision', '另一方本次答复',
                choices: {'ACCEPT': '同意交给独立安全复核', 'DECLINE': '拒绝本次改期，保留原行程'})
          ],
        'contact' => const [
            V5Field('name', '本人愿意提供的联系人姓名'),
            V5Field('phone', '本次联系电话（撤回可留空）', required: false),
            V5Field('consent', '我同意在本单开放此联系卡；取消勾选表示撤回',
                type: 'bool', required: false)
          ],
        'support' => const [
            V5Field('confirmed', '我请求有权平台客服按本单资料加入处理', type: 'bool')
          ],
        'supplements' => const [
            V5Field('title', '具体补差事项'),
            V5Field('terms', '付款前明确的追加条件', type: 'multiline'),
            V5Field('amount', '本次独立补差金额（元，含相关费用）', type: 'money'),
            V5Field('expires_at', '补差约定截止（不得晚于本次试镜）', type: 'datetime')
          ],
        'baseplate' => [
            const V5Field('display_name', '本人私人造型名称'),
            V5Field('consent_id', '另给本人的私人归档同意', choices: consents),
            V5Field('previous_version_id', '本人的原造型版本', choices: versions)
          ],
        _ => const [],
      };
  bool allowed(AuditionRecord r) {
    final a = widget.action, buyer = r.buyer(api.owner()), d = r.data;
    return switch (a) {
      'decision' => !buyer && r.status == 'AWAITING_ACCEPTANCE',
      'travel' => !buyer &&
          ['ACCEPTED', 'DEPARTED'].contains(r.status) &&
          d['dispute'] == null &&
          d['reschedule'] == null,
      'delivery' => !buyer &&
          consents.isNotEmpty &&
          d['fulfilled_at'] == null &&
          d['dispute'] == null &&
          d['reschedule'] == null &&
          (r.status == 'ARRIVED' ||
              r.status == 'DELIVERED' ||
              d['appointment']['mode'] == 'ONLINE_MATERIALS' &&
                  r.status == 'ACCEPTED'),
      'reschedule' => r.status == 'ACCEPTED' &&
          d['departed_at'] == null &&
          d['reschedule'] == null,
      'reschedule-response' => d['reschedule'] != null &&
          d['reschedule']['proposed_by'] != api.owner() &&
          d['reschedule']['other_confirmed'] != true,
      'contact' => r.conversation == 'OPEN',
      'supplements' => !buyer &&
          r.status == 'ACCEPTED' &&
          d['paid_at'] != null &&
          d['departed_at'] == null &&
          d['reschedule'] == null,
      'baseplate' => !buyer &&
          widget.session.party?['kind'] == 'PERSON' &&
          consents.isNotEmpty &&
          d['delivery'] != null &&
          d['baseplate_id'] == null,
      'cancel' => ![
            'CANCELLED',
            'REJECTED',
            'REFUND_REQUIRED',
            'REFUNDED',
            'PARTIAL_REFUND_SETTLED'
          ].contains(r.status) &&
          (d['order_id'] == null || d['paid_at'] != null),
      'support' => true,
      _ => false
    };
  }

  @override
  Widget build(BuildContext context) {
    final r = record, a = widget.action;
    return V5Frame(api: api, title: titles[a] ?? '本单办理', children: [
      tradeHeading(titles[a] ?? '本单办理', eyebrow: '原订单内 / 每次选择单独确认'),
      V5RecoveryPanel(
          api: api,
          label: api.recoveryLabel,
          restore: api.restoreOperation,
          onRestored: (r) => Navigator.pushReplacementNamed(
              context, '/auditions/booking?bookingId=${widget.id}')),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (r != null) ...[
        tradeSection(r.title, [
          tradeFact('当前真实状态', auditionStates[r.status]),
          tradeFact('原约定一口价', v5Money(r.data['offer']['unit_minor'])),
          tradeFact('本次时间',
              '${tradeDate(r.data['appointment']['starts_at'])} 至 ${tradeDate(r.data['appointment']['ends_at'])}')
        ]),
        if (a == 'delivery') ...[
          tradeBanner('按本单真实规则取样',
              '${r.data['rules']['photo_count']} 张照片、${r.data['rules']['video_count']} 段视频；明确收讫后 ${r.data['rules']['acceptance_hours']} 小时。'),
          if (consents.isEmpty)
            appNotice('尚无本人可选择的本次取样授权。受托机构不能读取本人私有同意；首次受托交付需要平台补齐安全授权选择。')
        ],
        if (!widget.session.isOwner &&
            ['travel', 'cancel', 'delivery'].contains(a))
          appNotice('当前为获授权机构成员。私人材料仍由负责人上传；本页不扩大原文件接口权限。'),
        if (a == 'cancel')
          appNotice(
              '出发前按原单申请退款；出发、到场或已交取样后进入争议，暂停计时，由独立客服核定。申请不等于退款到账，安全离场不自动处罚。'),
        if (a == 'reschedule') appNotice('须由另一方明确确认，再由独立人员安全复核。完成两步前不改写原行程。'),
        if (a == 'baseplate')
          appNotice('仅艺人本人另给私人归档同意后保存。此次试镜不授予买方出演、发行或重新生成权。'),
        if (!allowed(r))
          appNotice('当前记录不满足本项办理条件。保留本页输入，按最新原记录核对；不通过更改技术编号绕过。'),
        V5Form(
            key: ValueKey('${r.id}:$a'),
            api: api,
            title: titles[a]!,
            action: titles[a]!,
            suffix: '/bookings/${r.id}/$a',
            version: r.version,
            canSubmit:
                allowed(r) && (a != 'delivery' || widget.session.isOwner),
            initial: a == 'reschedule' ? v5Map(r.data['appointment']) : {},
            fields: fields(r),
            restore: (b) => a == 'delivery'
                ? {
                    ...v5Map(b['delivery']),
                    'photos': (b['delivery']['photos'] as List).join(', '),
                    'videos': (b['delivery']['videos'] as List).join(', ')
                  }
                : a == 'supplements'
                    ? {
                        ...b,
                        'amount':
                            '${(b['amount_minor'] as int) ~/ 100}.${((b['amount_minor'] as int) % 100).toString().padLeft(2, '0')}'
                      }
                    : a == 'baseplate'
                        ? {
                            ...b,
                            'previous_version_id':
                                b['previous_version_id'] ?? 'NEW'
                          }
                        : {
                            ...b,
                            'evidence_asset_ids':
                                ((b['evidence_asset_ids'] ?? []) as List)
                                    .join(', ')
                          },
            buildBody: (v) {
              if (a == 'support' && v['confirmed'] != true) {
                throw const AccountError(400, 'INVALID_ACTION');
              }
              return body(v, r);
            },
            parse: (d) {
              AuditionRecord(d,
                  kind: a == 'supplements' ? 'SUPPLEMENT' : 'BOOKING',
                  id: a == 'supplements' ? null : r.id,
                  parentId: a == 'supplements' ? r.id : null);
            },
            reload: () => load(propagateError: true),
            onSuccess: (_) => Navigator.pushReplacementNamed(
                context, '/auditions/booking?bookingId=${r.id}'),
            extra: (v, set, enabled) => [
                  if (['travel', 'cancel'].contains(a))
                    tradeSection('本次私有证据', [
                      SupplyFiles(
                          api: SupplyApi(widget.session),
                          purpose: 'REVIEW_EVIDENCE',
                          ids: v5InputIds(v['evidence_asset_ids'] ?? ''),
                          enabled: enabled && widget.session.isOwner,
                          onChanged: (ids) =>
                              set('evidence_asset_ids', ids.join(', ')))
                    ]),
                  if (a == 'delivery') ...[
                    tradeSection(
                        '本次照片 · 按约 ${r.data['rules']['photo_count']} 张', [
                      SupplyFiles(
                          api: SupplyApi(widget.session),
                          purpose: 'AVATAR_MATERIAL',
                          ids: v5InputIds(v['photos'] ?? ''),
                          enabled: enabled && widget.session.isOwner,
                          onChanged: (ids) => set('photos', ids.join(', ')))
                    ]),
                    tradeSection(
                        '本次视频 · 按约 ${r.data['rules']['video_count']} 段', [
                      SupplyFiles(
                          api: SupplyApi(widget.session),
                          purpose: 'WORK_CONTENT',
                          ids: v5InputIds(v['videos'] ?? ''),
                          enabled: enabled && widget.session.isOwner,
                          onChanged: (ids) => set('videos', ids.join(', ')))
                    ]),
                  ],
                ]),
      ]
    ]);
  }
}
