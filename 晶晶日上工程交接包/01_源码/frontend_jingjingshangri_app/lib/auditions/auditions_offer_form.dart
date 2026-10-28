import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../stock/v5_support.dart';
import '../trade/trade_widgets.dart';
import 'auditions_api.dart';
import 'auditions_models.dart';

class AuditionOfferForm extends StatefulWidget {
  const AuditionOfferForm({super.key, required this.session});
  final AccountSession session;
  @override
  State<AuditionOfferForm> createState() => _AuditionOfferFormState();
}

class _AuditionOfferFormState extends State<AuditionOfferForm> {
  late final api = AuditionsApi(widget.session),
      artists = ArtistsApi(widget.session);
  final people = <ArtistPerson>[],
      rules = <String, String>{},
      contexts = <String, Map<String, dynamic>>{},
      contextNames = <String, String>{};
  GlobalKey<V5FormState> formKey = GlobalKey<V5FormState>();
  final personSelector = GlobalKey<FormFieldState<String>>();
  ArtistDetail? detail;
  String? personId, error;
  bool busy = false, permitted = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  String contextKey(dynamic avatar, dynamic consent) => '$avatar:$consent';
  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!widget.session.isOwner) {
        throw const AccountError(403, 'AUDITION_OFFER_OWNER_CONTEXT_REQUIRED');
      }
      people.clear();
      rules.clear();
      String? cursor;
      final seen = <String>{};
      do {
        final r = await artists.people(cursor: cursor);
        people.addAll(r.items);
        cursor = r.cursor;
        if (cursor != null) v5Require(seen.add(cursor));
      } while (cursor != null);
      // An old offer is not evidence that its rule is eligible for a new one.
      // Keep only the original pending request's rule for idempotent recovery.
      final op = api.pending('/offers');
      if (op != null) {
        personId = op['body']['offer']['person_id'];
        rules.putIfAbsent(op['body']['offer']['rule_id'], () => '原请求规则（待核对）');
        await person(personId!);
      }
      if (mounted) setState(() {});
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> person(String id) async {
    final d = await artists.person(id), actions = await artists.actions(d);
    contexts.clear();
    contextNames.clear();
    final pendingOffer = api.pending('/offers')?['body']?['offer'];
    if (pendingOffer is Map && pendingOffer['person_id'] == id) {
      final o = v5Map(pendingOffer),
          key = contextKey(o['avatar_id'], o['public_consent_id']);
      contexts[key] = {
        'avatar_id': o['avatar_id'],
        'public_consent_id': o['public_consent_id']
      };
      contextNames[key] =
          '${d.avatars.where((a) => a.id == o['avatar_id']).map((a) => a.name).firstOrNull ?? '原数字人'} · 原请求授权（待核对）';
    }
    if (d.person.owner == api.owner()) {
      for (final c in (await artists.allRecords(id, 'CONSENT')).where((c) =>
          c.status == 'APPROVED' &&
          (c.data['purposes'] as List).contains('PUBLIC_DISPLAY') &&
          DateTime.parse(c.data['valid_from']).isBefore(DateTime.now()) &&
          DateTime.parse(c.data['valid_until']).isAfter(DateTime.now()))) {
        final key = contextKey(c.avatarId, c.id);
        contexts[key] = {'avatar_id': c.avatarId, 'public_consent_id': c.id};
        contextNames[key] =
            '${d.avatars.where((a) => a.id == c.avatarId).map((a) => a.name).firstOrNull ?? '原数字人'} · ${c.data['terms']}';
      }
    }
    detail = d;
    permitted = actions.contains('MANAGE_AUDITIONS');
  }

  Future<void> choose(String id) async {
    if (id == personId) return;
    final discard = await (formKey.currentState?.confirmDiscardChanges() ??
        Future.value(true));
    if (!mounted) return;
    if (!discard) {
      personSelector.currentState?.didChange(personId);
      return;
    }
    setState(() {
      busy = true;
      error = null;
      personId = id;
      detail = null;
      formKey = GlobalKey<V5FormState>();
    });
    try {
      await person(id);
      if (mounted) setState(() {});
    } on AccountError catch (e) {
      if (mounted) setState(() => error = v5Error(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = detail;
    return V5Frame(api: api, title: '本人试镜方案', children: [
      tradeHeading('约见之前，先约定清楚', eyebrow: '本人或明确受托 / L2 / 独立审核'),
      V5RecoveryPanel(
          api: api,
          label: api.recoveryLabel,
          restore: api.restoreOperation,
          onRestored: (r) => Navigator.pushReplacementNamed(
              context,
              r['kind'] == 'OFFER'
                  ? '/auditions/offer?offerId=${r['id']}'
                  : '/auditions/bookings')),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (!busy && (error != null || people.isEmpty)) ...[
        if (error == null) appNotice('当前身份暂无可办理的真人档案。先完善本人资料，或切换到获准经营该人物的身份。'),
        tradeButton('重新读取本人资格', load, outline: true),
        tradeButton('查看人物与授权', () => Navigator.pushNamed(context, '/artists'),
            outline: true),
      ],
      DropdownButtonFormField<String>(
          key: personSelector,
          initialValue: personId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: '选择具体真人'),
          items: people
              .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
              .toList(),
          onChanged: busy || api.pending('/offers') != null
              ? null
              : (v) => choose(v!)),
      if (d != null) ...[
        tradeFact('当前真实光环', 'L${d.halo}'),
        if (!permitted || d.halo < 2) appNotice('本方案需要有效 L2、成年资格和本人的明确试镜经营授权。'),
        if (rules.isEmpty)
          appNotice(
              '当前试镜经营规则待开放。可以先填写本页方案；离开前会提醒未提交内容。平台开放本人可用规则后再提交，旧试镜规则不能用于新方案。'),
        if (contexts.isEmpty)
          appNotice('尚无本人可读或已明确提供的公开展示授权上下文，请先办理本人同意；机构不读取私人同意原件。'),
        V5Form(
            key: formKey,
            api: api,
            title: '本人的完整试镜约定',
            action: '提交本版试镜方案独立审核',
            suffix: '/offers',
            // A pending offer may be recovered, but its rule must never be
            // reused for a new request after a definitive rejection.
            canSubmit: false,
            fields: [
              const V5Field('title', '方案名称'),
              V5Field('context', '具体数字人与已审公开同意', choices: contextNames),
              V5Field('rule_id', '本次有效试镜规则（待开放）', choices: rules),
              const V5Field('city', '所在城市'),
              const V5Field('service_area', '明确服务范围'),
              const V5Field('mode', '试镜形式',
                  choices: {'OFFLINE': '线下正规场地', 'ONLINE_MATERIALS': '线上材料'}),
              const V5Field('price', '一口价（元，含交通）', type: 'money'),
              const V5Field('slots', '可预约时段', type: 'slots'),
              const V5Field('terms', '具体服务与费用约定', type: 'multiline'),
              const V5Field('public_booking', '允许公开预约',
                  type: 'bool', required: false),
              const V5Field('public_price', '公开本方案价格',
                  type: 'bool', required: false),
              const V5Field('transport', '我确认已把适用交通条件计入一口价，付款前明确全部条件',
                  type: 'bool')
            ],
            restore: (b) {
              final o = v5Map(b['offer']);
              return {
                ...o,
                'context': contextKey(o['avatar_id'], o['public_consent_id']),
                'price':
                    '${(o['unit_minor'] as int) ~/ 100}.${((o['unit_minor'] as int) % 100).toString().padLeft(2, '0')}',
                'transport': true
              };
            },
            buildBody: (v) {
              if (v['transport'] != true ||
                  !contexts.containsKey(v['context'])) {
                throw const AccountError(400, 'INVALID_AUDITION_OFFER');
              }
              final c = contexts[v['context']]!;
              return {
                'offer': {
                  'person_id': d.person.id,
                  'avatar_id': c['avatar_id'],
                  'public_consent_id': c['public_consent_id'],
                  'rule_id': v['rule_id'],
                  'title': v['title'],
                  'city': v['city'],
                  'service_area': v['service_area'],
                  'mode': v['mode'],
                  'public_booking': v['public_booking'] == true,
                  'public_price': v['public_price'] == true,
                  'unit_minor': v5InputMoney(v['price']),
                  'slots': v5InputSlots(v['slots']),
                  'terms': v['terms']
                }
              };
            },
            parse: (r) {
              AuditionRecord(r, kind: 'OFFER');
            },
            onSuccess: (r) => Navigator.pushReplacementNamed(
                context, '/auditions/offer?offerId=${r['id']}')),
      ],
    ]);
  }
}
