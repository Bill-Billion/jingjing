import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_theme.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../trade/trade_widgets.dart';
import '../trade/trade_api.dart';
import '../trade/trade_models.dart';
import '../engagement/community_support.dart';
import '../cocreation/cocreation_cast.dart';

String redemptionKind(Object? kind) =>
    const {
      'PRODUCTION_CREDIT': '制作金',
      'PRODUCTION_FREE': '指定服务免付权益',
      'SERVICE_CREDIT': '共创服务额度',
      'INTERVIEW': '面试权益',
      'EXPOSURE': '曝光权益',
      'POINT_BACK': '晶钻返还',
      'EMPTY': '本次未获实物权益'
    }[kind] ??
    communityText(kind);
String redemptionPercent(Object? value) {
  final v = double.tryParse('$value');
  communityRequire(v != null && v.isFinite && v >= 0 && v <= 1);
  return '${(v! * 100).toStringAsFixed(4)}%';
}

class RedemptionPage extends StatelessWidget {
  const RedemptionPage(
      {super.key,
      this.view = 'catalog',
      this.recordId,
      this.quoteId,
      this.benefitId});
  final String view;
  final String? recordId, quoteId, benefitId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'redemption',
      route:
          '/redemption?view=$view${recordId == null ? '' : '&recordId=$recordId'}',
      title: '晶钻与权益',
      partyRequired: !['catalog', 'pools', 'pool', 'role'].contains(view),
      builder: (s) => _Redemption(
          session: s,
          view: view,
          id: recordId,
          quoteId: quoteId,
          benefitId: benefitId));
}

class _Redemption extends StatefulWidget {
  const _Redemption(
      {required this.session,
      required this.view,
      this.id,
      this.quoteId,
      this.benefitId});
  final AccountSession session;
  final String view;
  final String? id, quoteId, benefitId;
  @override
  State<_Redemption> createState() => _RedemptionState();
}

class _RedemptionState extends CommunityPageState<_Redemption> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'redemption';
  late final quote = field(widget.quoteId ?? ''),
      profile = field(),
      why = field(),
      benefit = field(widget.benefitId ?? '');
  late final cast = CocreationCastInput(field);
  List<Map<String, dynamic>> rows = [], benefits = [];
  List<TradeRecord> quotes = [];
  Map<String, dynamic>? detail, hold;
  bool agreed = false, bindingAgreed = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final arg = ModalRoute.of(context)?.settings.arguments;
    if (hold == null && widget.view == 'checkout' && arg is Map) {
      final v = communityRecord(arg, kind: 'COUPON_HOLD'),
          d = communityMap(v['data']);
      communityRequire(d['grant_id'] == widget.id &&
          d['quote_id'] == widget.quoteId &&
          d['adjusted_quote'] is Map &&
          d['adjusted_quote_sha256'] is String);
      hold = v;
    }
  }

  @override
  void clearPrivate() {
    rows = [];
    benefits = [];
    quotes = [];
    detail = null;
    hold = null;
    agreed = false;
    bindingAgreed = false;
  }

  @override
  void fail(Object e) {
    super.fail(e);
    if (e is AccountError && e.status == 412) {
      agreed = false;
      bindingAgreed = false;
    }
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      checking = true;
      error = null;
    });
    try {
      if (widget.view == 'role') {
        if (mounted && t == ticket) {
          setState(() {
            rows = [];
            detail = null;
          });
        }
        return;
      }
      Map<String, dynamic>? d;
      List<Map<String, dynamic>> r = [];
      if (['grant', 'checkout', 'grants'].contains(widget.view) &&
          session.isOwner) {
        quotes = (await TradeApi(session).all('QUOTE'))
            .where((q) =>
                q.buyer == session.partyId &&
                q.status == 'APPROVED' &&
                q.data['customization'] is Map &&
                q.data['customization_change'] == null &&
                q.data['cocreation'] == null &&
                q.data['discount'] == null)
            .toList();
      }
      if (widget.view == 'catalog' && session.partyId != null) {
        benefits = communityItems(
            await CommunityApi(session, 'cocreation').read('benefits'));
      }

      if (['grant', 'checkout'].contains(widget.view)) {
        d = communityRecord(
            await api
                .read('grants/${communityRequiredId(widget.id ?? '', '本人权益')}'),
            id: widget.id,
            kind: 'GRANT');
        final g = communityMap(d['data']);
        communityRequire(g['template'] is Map &&
            g['cashable'] == false &&
            g['transferable'] == false);
      } else if (widget.view == 'pool') {
        d = await api.read(
            'pools/${communityRequiredId(widget.id ?? '', '活动奖池')}',
            account: true);
        validatePool(d);
      } else if (widget.view == 'draw') {
        d = communityRecord(
            await api
                .read('draws/${communityRequiredId(widget.id ?? '', '开奖记录')}'),
            id: widget.id,
            kind: 'DRAW');
        validateDraw(d);
      } else {
        final suffix = switch (widget.view) {
          'grants' => 'grants',
          'pools' => 'pools',
          'draws' => 'draws',
          _ => 'catalog'
        };
        r = communityItems(await api.read(suffix,
            account: ['catalog', 'pools'].contains(suffix)));
        if (suffix == 'catalog') {
          for (final x in r) {
            validateCatalog(x);
          }
        }
        if (suffix == 'draws') {
          for (final x in r) {
            validateDraw(x);
          }
        }
        if (suffix == 'grants') {
          for (final x in r) {
            communityRecord(x, kind: 'GRANT');
            final data = communityMap(x['data']);
            communityRequire(data['template'] is Map &&
                data['cashable'] == false &&
                data['transferable'] == false &&
                x['effective_status'] is String);
          }
        }
        if (suffix == 'pools') {
          for (final x in r) {
            validatePool(x);
          }
        }
      }
      if (mounted && t == ticket) {
        setState(() {
          rows = r;
          detail = d;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  void validateCatalog(Map<String, dynamic> r) {
    final t = communityMap(r['template']);
    communityRequire(communityId(r['id']) &&
        r['remaining'] is int &&
        r['remaining'] >= 0 &&
        r['template_sha256'] is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(r['template_sha256']) &&
        t['kind'] is String &&
        t['title'] is String &&
        (t['exchange_points'] == null ||
            t['exchange_points'] is int && t['exchange_points'] >= 0));
  }

  void validatePool(Map<String, dynamic> r) {
    communityRequire(communityId(r['id']) &&
        r['object_version'] is int &&
        r['rules_sha256'] is String &&
        RegExp(r'^[a-f0-9]{64}$').hasMatch(r['rules_sha256']) &&
        r['config'] is Map &&
        r['distribution'] is Map);
    final c = communityMap(r['config']);
    communityRequire(c['single_points'] is int &&
        c['single_points'] > 0 &&
        c['ten_points'] is int &&
        c['ten_points'] > 0);
    for (final p in communityRows(communityMap(r['distribution'])['prizes'])) {
      redemptionPercent(p['single_probability']);
      redemptionPercent(p['tenth_probability']);
    }
  }

  void validateDraw(Map<String, dynamic> r) {
    communityRecord(r, kind: 'DRAW');
    final d = communityMap(r['data']);
    communityRequire([1, 10].contains(d['count']) &&
        d['points'] is int &&
        d['points'] >= 0 &&
        d['results'] is List &&
        d['results'].length == d['count']);
    for (final v in communityRows(d['results'])) {
      communityRequire(v['index'] is int &&
          v['index'] >= 0 &&
          v['index'] < d['count'] &&
          (v['grant_id'] == null || communityId(v['grant_id'])) &&
          v['guaranteed_slot'] is bool);
    }
  }

  @override
  void validateResult(Map<String, dynamic> r) {
    communityRecord(r);
    if (r['kind'] == 'DRAW') validateDraw(r);
    if (r['kind'] == 'GRANT') {
      final d = communityMap(r['data']);
      communityRequire(d['template'] is Map &&
          d['cashable'] == false &&
          d['transferable'] == false);
    }
    if (r['kind'] == 'COUPON_HOLD' && r['current_status'] == 'HELD') {
      final d = communityMap(r['data']);
      communityRequire(communityId(d['grant_id']) &&
          communityId(d['quote_id']) &&
          d['adjusted_quote'] is Map &&
          communityDigest(d['adjusted_quote']) == d['adjusted_quote_sha256']);
    }
  }

  @override
  Future<void> reconcilePending() async {
    final p = recoverySuffix!.split('/'), b = communityMap(recovery!['body']);
    if (p.first == 'grants' && p.length > 1) {
      await api.read('grants/${p[1]}');
      if (b['quote_id'] != null) await TradeApi(session).record(b['quote_id']);
    } else if (p.first == 'draws') {
      await api.read('draws');
      await api.read('pools/${b['pool_id']}', account: true);
    } else if (p.first == 'holds') {
      await api.read('grants');
    } else {
      await api.read('grants');
      await api.read('catalog', account: true);
    }
  }

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    if (value['kind'] == 'COUPON_HOLD' && value['current_status'] == 'HELD') {
      communityRecord(value, kind: 'COUPON_HOLD');
      final d = communityMap(value['data']);
      communityRequire(
          d['adjusted_quote'] is Map && d['adjusted_quote_sha256'] is String);
      if (widget.view == 'checkout' && d['grant_id'] == widget.id) {
        setState(() {
          hold = value;
          quote.text = d['quote_id'];
          agreed = false;
        });
        await load();
      } else if (mounted) {
        final selected = await Navigator.pushNamed(context,
            '/redemption?view=checkout&recordId=${d['grant_id']}&quoteId=${d['quote_id']}',
            arguments: value);
        if (mounted && widget.quoteId == d['quote_id'] && selected is Map) {
          Navigator.pop(context, Map<String, dynamic>.from(selected));
        }
      }
    } else if (value['kind'] == 'DRAW') {
      validateDraw(value);
      if (mounted) open('draw', value['id']);
    } else {
      await load();
    }
  }

  Future<void> selectGrant(Map<String, dynamic> r) async {
    final result = await Navigator.pushNamed(context,
        '/redemption?view=checkout&recordId=${r['id']}&quoteId=${Uri.encodeComponent(widget.quoteId!)}');
    if (mounted && result is Map) {
      Navigator.pop(context, Map<String, dynamic>.from(result));
    }
  }

  Widget quoteChoice() => communitySelect(
      '已审核的本人原报价',
      quote.text,
      [
        for (final q in quotes
            .where((q) => widget.quoteId == null || q.id == widget.quoteId))
          (q.id, '${q.title} · ${communityMoney(q.amount)} · 版本${q.version}')
      ],
      enabled && widget.quoteId == null && hold == null
          ? (v) => setState(() => quote.text = v ?? '')
          : null);
  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  void open(String view, [Object? id]) => Navigator.pushNamed(
      context, '/redemption?view=$view${id == null ? '' : '&recordId=$id'}');
  Widget menu() => Container(
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AccountTheme.border))),
        child: Row(children: [
          for (final x in [
            ('catalog', '兑换目录'),
            ('pools', '已审活动'),
            ('grants', '我的券包'),
            ('draws', '开奖记录')
          ])
            Expanded(
              child: TextButton(
                onPressed: widget.view == x.$1 ? null : () => open(x.$1),
                style: TextButton.styleFrom(
                    foregroundColor: AccountTheme.muted,
                    disabledForegroundColor: AccountTheme.text,
                    padding: const EdgeInsets.symmetric(
                        vertical: 14, horizontal: 2)),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(x.$2, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Container(
                      width: 24,
                      height: 3,
                      color: widget.view == x.$1
                          ? AccountTheme.accent
                          : Colors.transparent),
                ]),
              ),
            ),
        ]),
      );
  List<Widget> templateFacts(Map<String, dynamic> t) => [
        communityFact('权益类型', redemptionKind(t['kind'])),
        communityFact('原条款', t['terms']),
        communityFact('领取后有效期', '${t['valid_days']}天'),
        communityFact('开放截止', communityDate(t['available_until'])),
        if (t['production'] is Map) ...[
          communityFact('抵扣额度',
              communityMoney(communityMap(t['production'])['face_minor'])),
          communityFact('最低原金额',
              communityMoney(communityMap(t['production'])['minimum_minor'])),
          appNotice('仅适用已登记的人工定制服务。现货、人工样片、数字人创建和托管不能使用制作金。')
        ],
        if (t['interview'] is Map)
          communityFact('对应面试批次', communityMaybeMap(t['interview'])['batch']),
        if (t['exposure'] is Map) ...[
          communityFact('资源位', communityMap(t['exposure'])['placement']),
          communityFact('曝光天数', communityMap(t['exposure'])['duration_days'])
        ]
      ];
  Future<bool> confirm(String title, String content) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(content), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('返回')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('确认本次操作'))
              ])) ==
      true;
  List<Widget> catalogView() => [
        communityHeading('晶钻权益', '选择已经审核的真实权益，适用范围和有效期先看清。',
            eyebrow: '晶钻 / 兑换与活动'),
        menu(),
        const SizedBox(height: 20),
        TextButton(
            onPressed: () => open('role'), child: const Text('角色摇奖预留 · 暂未开放')),
        if (rows.isEmpty && !checking && error == null) ...[
          tradeBanner('暂无有效兑换目录', '目录审核生效后方可兑换；所需晶钻、库存与有效期以已审目录为准。'),
          communitySection('制作金适用范围', [
            const Text('仅适用已登记的人工定制片与微剧；不适用于现货、人工样片、数字人创建或托管。'),
            appNotice('先核对原报价与抵扣后金额。普通抵扣在首次真实付款确认后核销；全额抵扣在开工时核销，现金实付0元。'),
          ]),
          tradeButton('暂无有效目录', null),
        ],
        communitySelect(
            '本人已取得的共创服务额度',
            benefit.text,
            [
              for (final b in benefits)
                (
                  b['id'] as String,
                  '${communityMaybeMap(b['data'])['description'] ?? '共创服务额度'} · ${communityMoney(communityMaybeMap(b['data'])['credit_minor'])}'
                )
            ],
            enabled ? (v) => setState(() => benefit.text = v ?? '') : null),
        for (final r in rows)
          communitySection(
              communityText(communityMap(r['template'])['title']), [
            ...templateFacts(communityMap(r['template'])),
            communityFact('剩余库存', r['remaining']),
            if (communityMap(r['template'])['exchange_points'] != null) ...[
              communityFact(
                  '所需晶钻', communityMap(r['template'])['exchange_points']),
              tradeButton(
                  '确认兑换这份权益',
                  enabled && r['remaining'] > 0
                      ? () => submit(() async {
                            if (await confirm('核对本次兑换',
                                '将扣用${communityMap(r['template'])['exchange_points']}晶钻，按上方条款发放这一份权益。')) {
                              final out = await act(
                                  'exchanges',
                                  {
                                    'stock_id': r['id'],
                                    'template_sha256': r['template_sha256']
                                  },
                                  reload: false,
                                  validate: (v) =>
                                      communityRecord(v, kind: 'GRANT'));
                              if (out != null && mounted) {
                                open('grant', out['id']);
                              }
                            }
                          })
                      : null)
            ],
            if (communityMap(r['template'])['kind'] == 'SERVICE_CREDIT')
              tradeButton(
                  '领取本人的共创服务额度',
                  enabled &&
                          r['remaining'] > 0 &&
                          benefits.any((b) => b['id'] == benefit.text)
                      ? () => submit(() async {
                            final out = await act(
                                'service-credits',
                                {
                                  'benefit_id': communityRequiredId(
                                      benefit.text, '本人共创服务额度'),
                                  'stock_id': r['id']
                                },
                                reload: false,
                                validate: (v) =>
                                    communityRecord(v, kind: 'GRANT'));
                            if (out != null && mounted) {
                              open('grant', out['id']);
                            }
                          })
                      : null,
                  outline: true)
          ])
      ];
  List<Widget> grantsView() => [
        communityHeading(widget.quoteId == null ? '我的券包' : '选择本次报价可用的制作权益',
            '占用、核销、排期和实际兑现分别记录。'),
        if (widget.quoteId == null) menu(),
        const SizedBox(height: 20),
        if (rows.isEmpty && !checking && error == null)
          appNotice('暂无属于当前身份的权益。'),
        for (final r in rows)
          communitySection(
              communityText(
                  communityMap(communityMap(r['data'])['template'])['title']),
              [
                communityFact(
                    '当前进展',
                    communityState(
                        r['effective_status'] ?? r['current_status'])),
                communityFact('有效期至',
                    communityDate(communityMap(r['data'])['expires_at'])),
                if (widget.quoteId == null)
                  tradeButton('查看条款与办理进展', () => open('grant', r['id']),
                      outline: true)
                else if ([
                  'PRODUCTION_CREDIT',
                  'PRODUCTION_FREE',
                  'SERVICE_CREDIT'
                ].contains(
                    communityMap(communityMap(r['data'])['template'])['kind']))
                  tradeButton(
                      '选择此权益并核对抵扣',
                      enabled && r['effective_status'] == 'AVAILABLE'
                          ? () => selectGrant(r)
                          : null,
                      outline: true),
                if (widget.quoteId != null && r['effective_status'] == 'HELD')
                  appNotice('该权益已被原操作占用。请先恢复原请求并核对原报价，不能重新占用。')
              ])
      ];
  List<Widget> grantView() {
    final r = detail;
    if (r == null) return [];
    final d = communityMap(r['data']),
        t = communityMap(d['template']),
        delivery = communityMaybeMap(d['delivery']);
    return [
      communityHeading(communityText(t['title']), '每次使用都重新核对本人、权限与原约定。'),
      communityFact(
          '当前进展', communityState(r['effective_status'] ?? r['current_status'])),
      communityFact('可用截止', communityDate(d['expires_at'])),
      ...templateFacts(t),
      if (['PRODUCTION_CREDIT', 'PRODUCTION_FREE', 'SERVICE_CREDIT']
          .contains(t['kind']))
        communitySection('用于原报价', [
          quoteChoice(),
          tradeButton(
              '读取服务器抵扣后的报价',
              enabled &&
                      r['effective_status'] == 'AVAILABLE' &&
                      quotes.any((q) => q.id == quote.text)
                  ? () => Navigator.pushNamed(context,
                      '/redemption?view=checkout&recordId=${r['id']}&quoteId=${Uri.encodeComponent(quote.text.trim())}')
                  : null),
          if (r['current_status'] == 'HELD')
            appNotice('这份权益正在占用。请返回原报价核对；已经下单须取消原订单，不能重复释放或另造付款。'),
          if (d['used_order_id'] != null)
            tradeButton(
                '查看实际使用的原订单',
                () => Navigator.pushNamed(
                    context, '/trade/record?recordId=${d['used_order_id']}'),
                outline: true)
        ]),
      if (['INTERVIEW', 'EXPOSURE'].contains(t['kind']) &&
          r['effective_status'] == 'AVAILABLE')
        communitySection('绑定我本人的艺人', [
          if (t['kind'] == 'INTERVIEW')
            cast.chooser(session,
                enabled: enabled, changed: () => setState(() {}))
          else
            appNotice(
                '绑定曝光需要可选择的本人当前榜单资料。服务器尚未提供本人公开资料列表，暂请平台协助核对；已审核排期和兑现结果仍可在此确认与查询。'),
          communityCheck(
              '我已核对本人、授权用途和该权益原条款',
              bindingAgreed,
              enabled
                  ? (v) => setState(() => bindingAgreed = v == true)
                  : null),
          tradeButton(
              '确认绑定本人',
              enabled && bindingAgreed && t['kind'] == 'INTERVIEW'
                  ? () => submit(() async {
                        final c =
                            t['kind'] == 'INTERVIEW' ? cast.value() : null;
                        await act(
                            'grants/${r['id']}/bind',
                            {
                              'person_id':
                                  communityRequiredId(cast.person.text, '本人真人'),
                              'avatar_id': communityRequiredId(
                                  cast.avatar.text, '本人数字人'),
                              'cast': c,
                              'profile_id': t['kind'] == 'EXPOSURE'
                                  ? communityRequiredId(profile.text, '公开榜单资料')
                                  : null
                            },
                            version: r['object_version']);
                        setState(() => bindingAgreed = false);
                      })
                  : null)
        ]),
      if (delivery.isNotEmpty)
        communitySection('已独立审核的排期', [
          communityFact('安排说明', delivery['reference']),
          communityFact('开始', communityDate(delivery['starts_at'])),
          communityFact('结束', communityDate(delivery['ends_at'])),
          if (r['current_status'] == 'SCHEDULED') ...[
            communityCheck('我已核对该排期和资源安排', agreed,
                enabled ? (v) => setState(() => agreed = v == true) : null),
            tradeButton(
                '本人确认该排期',
                enabled && agreed
                    ? () => act(
                        'grants/${r['id']}/confirmation', {'accepted': true},
                        version: r['object_version'])
                    : null),
            tradeButton(
                '不接受本次排期',
                enabled
                    ? () => act(
                        'grants/${r['id']}/confirmation', {'accepted': false},
                        version: r['object_version'])
                    : null,
                outline: true)
          ],
          if (r['current_status'] == 'FULFILLED') ...[
            communityFact('实际完成', communityDate(delivery['completed_at'])),
            communityFact('结果说明', delivery['reason']),
            appNotice('完成面试不等于取得出演权；发行或出演仍依独立约定办理。')
          ]
        ]),
      if (['INTERVIEW', 'EXPOSURE'].contains(t['kind']))
        communitySection('未兑现时申请处理', [
          communityField(why, '具体未兑现情况', lines: 3),
          tradeButton(
              '提交权益处理申请',
              enabled
                  ? () => submit(() async {
                        await act('grants/${r['id']}/remedies',
                            {'reason': communityRequired(why.text, '未兑现情况')},
                            version: r['object_version']);
                      })
                  : null,
              outline: true),
          appNotice('延期或返还晶钻由已发布规则与独立复核决定，申请不代表补偿已经到账。')
        ]),
      communityRecordId(r)
    ];
  }

  List<Widget> checkoutView() {
    final r = detail;
    if (r == null) return [];
    final d = communityMap(r['data']), t = communityMap(d['template']);
    final hd = hold == null ? null : communityMap(hold!['data']),
        adjusted = hd == null ? null : communityMap(hd['adjusted_quote']);
    return [
      communityHeading('核对本次权益抵扣', '金额与新分期以服务器返回的冻结报价为准。'),
      communityFact('所用权益', t['title']),
      quoteChoice(),
      if (hold == null)
        tradeButton(
            '读取并暂时占用这份权益',
            enabled &&
                    r['effective_status'] == 'AVAILABLE' &&
                    quotes.any((q) => q.id == quote.text)
                ? () => submit(() async {
                      final out = await act(
                          'grants/${r['id']}/checkout',
                          {
                            'quote_id':
                                communityRequiredId(quote.text, '已审核原报价')
                          },
                          version: r['object_version'],
                          reload: false, validate: (v) {
                        communityRecord(v, kind: 'COUPON_HOLD');
                        final x = communityMap(v['data']);
                        communityRequire(x['grant_id'] == r['id'] &&
                            x['quote_id'] == quote.text.trim() &&
                            x['adjusted_quote'] is Map &&
                            x['adjusted_quote_sha256'] is String);
                      });
                      if (out != null && mounted) setState(() => hold = out);
                    })
                : null),
      if (adjusted != null) ...[
        communitySection('这次应付金额', [
          communityFact(
              '原金额',
              communityMoney(
                  communityMap(adjusted['discount'])['original_total_minor'])),
          communityFact(
              '本次权益抵扣',
              communityMoney(
                  communityMap(adjusted['discount'])['discount_minor'])),
          communityFact('应付现金', communityMoney(adjusted['total_minor'])),
          communityFact('占用截止', communityDate(hd!['expires_at'])),
          if (communityMap(adjusted['discount'])['coverage'] == 'FULL')
            appNotice('权益全额抵扣，现金实付0元。确认订单后开工核销，不生成0元支付回执。'),
          for (final step in communityRows(adjusted['installments']))
            communityFact(
                communityText(step['key']),
                communityMoney(communityRows(step['allocations']).fold<int>(
                    0, (sum, x) => sum + (x['amount_minor'] as int)))),
          communityCheck('我已核对原价、抵扣、应付现金和本次新分期', agreed,
              enabled ? (v) => setState(() => agreed = v == true) : null),
          tradeButton(
              '采用本次抵扣，返回原报价确认',
              enabled && agreed
                  ? () => Navigator.pop(context, {
                        'hold_id': hold!['id'],
                        'adjusted_quote_sha256': hd['adjusted_quote_sha256'],
                        'adjusted_quote': adjusted,
                        'hold_version': hold!['object_version'],
                        'quote_id': hd['quote_id']
                      })
                  : null),
          tradeButton(
              '放弃本次占用',
              enabled
                  ? () => submit(() async {
                        final out = await act(
                            'holds/${hold!['id']}/release', {},
                            version: hold!['object_version'], reload: false);
                        if (out != null && mounted) {
                          setState(() {
                            hold = null;
                            agreed = false;
                          });
                          await load();
                        }
                      })
                  : null,
              outline: true)
        ])
      ],
      if (hold == null && r['current_status'] == 'HELD')
        appNotice('当前权益已被原操作占用。请先恢复原请求；缺少原请求时联系工作人员核对，不重新计算或伪造抵扣结果。')
    ];
  }

  List<Widget> roleView() => [
        communityHeading('角色机会', '功能预留，当前不接受参与。', eyebrow: '角色机会 / 预留功能'),
        tradeBanner('角色摇奖尚未开放', '开放条件与正式规则发布后再办理。'),
        communityFact('功能状态', '暂未开放'),
        communityFact('开放时间', '待发布'),
        communitySection('参与条件与后续办理', [
          const Text('正式开放前公示规则与兑现办法。开放后仍须核对实名、本人授权与独立演出约定；取得权益不等于取得出演权。'),
        ]),
        communityCheck('取得权益不等于获得出演权', false, null),
        communityCheck('开放后按正式规则办理授权与确认', false, null),
        tradeButton('查看晶钻活动', () => open('pools'), outline: true),
        tradeButton('暂未开放', null),
      ];

  List<Widget> poolsView() => [
        communityHeading('晶钻活动', '先读已审核规则、真实概率和库存条件，再决定是否参加。',
            eyebrow: '本期活动 / 规则与奖品'),
        menu(),
        const SizedBox(height: 20),
        if (rows.isEmpty && !checking && error == null) ...[
          tradeBanner('暂无已审开放活动', '当前不接受抽取，不扣用晶钻。'),
          communitySection('参加方式与实际概率', [
            communityFact('参加方式', '单抽 / 十连'),
            communityFact('本期扣用晶钻', '待已审活动规则公示'),
            communityFact('实际概率与保底', '待公示'),
            appNotice('十连的前九次与第十次保底分支分别核对；十次并非独立同概率。库存不足暂停整次抽取。'),
          ]),
          communityCheck('核对本期条款、实际概率与扣用晶钻', false, null),
          communityCheck('结果未知先查原次记录，沿用原请求核对', false, null),
          tradeButton('查询原次结果', () => open('draws'), outline: true),
          tradeButton('暂无开放活动', null),
        ],
        for (final r in rows)
          communitySection(
              communityText(communityMap(r['config'])['version']), [
            communityFact('单次 / 十连晶钻',
                '${communityMap(r['config'])['single_points']} / ${communityMap(r['config'])['ten_points']}'),
            communityFact('截止时间', communityDate(r['ends_at'])),
            tradeButton('查看概率、条款与奖品', () => open('pool', r['id']),
                outline: true)
          ])
      ];
  List<Widget> poolView() {
    final r = detail;
    if (r == null) return [];
    final c = communityMap(r['config']), dist = communityMap(r['distribution']);
    return [
      communityHeading(communityText(c['version']), '开奖结果由服务器保存，每次请求只扣一次。'),
      communityFact('活动进展', communityState(r['current_status'])),
      communityFact('开始', communityDate(r['starts_at'])),
      communityFact('截止', communityDate(r['ends_at'])),
      communitySection('本次完整条款', [
        SelectableText(communityText(r['terms'])),
        communityFact('单次扣用', '${c['single_points']}晶钻'),
        communityFact('十连扣用', '${c['ten_points']}晶钻'),
        appNotice('十连先按原规则抽取前九次，满足条件时第十次走保底分支；十次并非独立同概率。库存不足暂停整次抽取。')
      ]),
      for (final p in communityRows(dist['prizes']))
        communitySection(redemptionKind(p['kind']), [
          communityFact('单次概率', redemptionPercent(p['single_probability'])),
          communityFact('第十次综合概率', redemptionPercent(p['tenth_probability'])),
          communityFact(
              '进入保底时概率', redemptionPercent(p['forced_tenth_probability'])),
          communityFact('十次期望数量', p['expected_count_per_ten'])
        ]),
      for (final p in communityRows(r['prize_promises']))
        communitySection(
            '奖品原承诺 · ${communityText(communityMap(p['template'])['title'])}',
            templateFacts(communityMap(p['template']))),
      communityCheck('我已核对本次条款、实际概率、扣用晶钻及库存不足处理', agreed,
          enabled ? (v) => setState(() => agreed = v == true) : null),
      for (final count in [1, 10])
        tradeButton(
            count == 1 ? '按本次规则单抽' : '按本次规则十连',
            enabled && agreed && r['current_status'] == 'PUBLISHED'
                ? () => submit(() async {
                      if (await confirm('确认本次${count == 1 ? '单抽' : '十连'}',
                          '将扣用${count == 1 ? c['single_points'] : c['ten_points']}晶钻。提交后先核对同一次结果，不更换编号重复抽取。')) {
                        final out = await act(
                            'draws',
                            {
                              'pool_id': r['id'],
                              'rules_sha256': r['rules_sha256'],
                              'count': count
                            },
                            reload: false,
                            validate: validateDraw);
                        if (out != null && mounted) {
                          setState(() => agreed = false);
                          open('draw', out['id']);
                        }
                      }
                    })
                : null,
            outline: count == 10),
      communityFact(
          '概率展示', '百分比保留四位小数；奖池原规则校验为 ${communityShort(r['rules_sha256'])}')
    ];
  }

  List<Widget> drawsView() => [
        communityHeading('我的开奖记录', '核对同一次抽取和当时奖品承诺。'),
        menu(),
        const SizedBox(height: 20),
        if (rows.isEmpty && !checking && error == null)
          appNotice('暂无属于当前身份的开奖记录。'),
        for (final r in rows)
          communitySection(
              '${communityDate(communityMap(r['data'])['at'])} · ${communityMap(r['data'])['count']}次',
              [
                communityFact('实际扣用', '${communityMap(r['data'])['points']}晶钻'),
                tradeButton('查看这次保存的结果', () => open('draw', r['id']),
                    outline: true)
              ])
      ];
  List<Widget> drawView() {
    final r = detail;
    if (r == null) return [];
    final d = communityMap(r['data']);
    return [
      communityHeading('这一次的抽取结果', '以下内容读取服务器保存的原结果。'),
      communityFact('时间', communityDate(d['at'])),
      communityFact('实际扣用', '${d['points']}晶钻'),
      communityFact('状态', communityState(r['current_status'])),
      for (final p in communityRows(d['results']))
        communitySection(
            '第${(p['index'] as int) + 1}次 · ${redemptionKind(p['kind'])}', [
          communityFact(
              '保底分支', p['guaranteed_slot'] == true ? '本次按保底规则抽取' : '按本次原规则抽取'),
          if (p['point_back'] is int && p['point_back'] > 0)
            communityFact('晶钻返还', p['point_back']),
          if (p['grant_id'] != null)
            tradeButton('查看这一份实际权益', () => open('grant', p['grant_id']),
                outline: true)
        ]),
      communityRecordId(r)
    ];
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '晶钻与权益',
      [
        ...feedback,
        ...switch (widget.view) {
          'grants' => grantsView(),
          'grant' => grantView(),
          'checkout' => checkoutView(),
          'role' => roleView(),
          'pools' => poolsView(),
          'pool' => poolView(),
          'draws' => drawsView(),
          'draw' => drawView(),
          _ => catalogView()
        },
        tradeButton('重新读取当前记录', busy ? null : load, outline: true)
      ],
      locked: recovery != null ||
          widget.view == 'checkout' && hold?['current_status'] == 'HELD');
}
