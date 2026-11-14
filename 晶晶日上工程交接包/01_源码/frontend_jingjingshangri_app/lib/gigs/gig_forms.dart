import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../supply/supply_widgets.dart';
import '../trade/trade_api.dart';
import '../trade/trade_models.dart';
import '../trade/trade_widgets.dart';
import 'gig_api.dart';
import 'gig_models.dart';
import 'gig_widgets.dart';

class GigRequestForm extends StatelessWidget {
  const GigRequestForm({super.key});
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/gigs/requests/new',
      builder: (s) => _GigForm(session: s, kind: 'GIG'));
}

class GigOfferForm extends StatelessWidget {
  const GigOfferForm({super.key, required this.gigId});
  final String gigId;
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/gigs/offers/new?gigId=$gigId',
      builder: (s) => _GigForm(session: s, kind: 'OFFER', gigId: gigId));
}

class GigRelationForm extends StatelessWidget {
  const GigRelationForm({super.key});
  @override
  Widget build(BuildContext c) => GigGate(
      returnRoute: '/gigs/relations/new',
      builder: (s) => _GigForm(session: s, kind: 'RELATION'));
}

class _GigForm extends StatefulWidget {
  const _GigForm({required this.session, required this.kind, this.gigId});
  final AccountSession session;
  final String kind;
  final String? gigId;
  @override
  State<_GigForm> createState() => _GigFormState();
}

class _GigFormState extends State<_GigForm> {
  late final api = GigApi(widget.session), upload = SupplyApi(widget.session);
  final title = TextEditingController(),
      brief = TextEditingController(),
      territory = TextEditingController(),
      artist = TextEditingController(),
      terms = TextEditingController(),
      platform = TextEditingController(),
      mcn = TextEditingController();
  List<Map<String, dynamic>> rules = [], avatars = [], consents = [];
  List<TradeRecord> specs = [];
  List<GigRecord> relations = [];
  List<Map<String, dynamic>> relationArtists = [];
  String? sourceListing;
  bool modern = false;
  final supplyShare = TextEditingController(text: '20');
  Map<String, dynamic>? gig;
  String? ruleId, category, specId, avatarId, consentId, relationChoice, error;
  DateTime? validFrom, validUntil;
  bool? exclusive;
  bool ranking = false, busy = false;
  int ticket = 0;
  final proofs = <String, List<String>>{};
  List<String> evidence = [];
  bool get pending =>
      widget.session.gigsPending.isNotEmpty ||
      upload.pending('/api/v1/supply/assets') != null;
  bool get locked => busy || pending;
  Map<String, dynamic>? get selectedRule =>
      rules.where((r) => r['id'] == ruleId).firstOrNull;
  List<dynamic> get categories => selectedRule?['rule']['categories'] ?? [];
  List<String> get requiredProofs => List<String>.from(categories
          .where((r) => r['code'] == category)
          .firstOrNull?['required_proofs'] ??
      []);
  List<Map<String, dynamic>> get eligibleConsents => gig == null
      ? []
      : consents
          .where((r) => gigConsentEligible(r,
              party: api.owner(),
              avatar: avatarId,
              scope: gigMap(gig!['scope'])))
          .toList();
  bool get mcnActive => (widget.session.party?['capabilities'] as List? ?? [])
      .any((c) => c['code'] == 'MCN' && c['current_status'] == 'ACTIVE');
  bool get canSubmit {
    if (locked) return false;
    if (widget.kind == 'GIG') {
      return gigText(title.text, 200) &&
          gigText(brief.text) &&
          gigText(territory.text, 128) &&
          ruleId != null &&
          category != null &&
          validUntil != null &&
          validUntil!.isAfter(DateTime.now()) &&
          requiredProofs.every((p) => proofs[p]?.length == 1);
    }
    final p = modern ? 2200 : gigParsePercent(platform.text),
        m = modern ? 0 : gigParsePercent(mcn.text);
    if (!gigText(terms.text) ||
        p == null ||
        m == null ||
        m > p ||
        evidence.isEmpty) {
      return false;
    }
    if (widget.kind == 'RELATION') {
      return (!modern ||
              (gigParsePercent(supplyShare.text) != null &&
                  gigParsePercent(supplyShare.text)! >= 1000 &&
                  gigParsePercent(supplyShare.text)! <= 3000)) &&
          mcnActive &&
          relationArtists.any((r) =>
              r['listing_id'] == sourceListing &&
              r['artist_party_id'] == artist.text.trim()) &&
          gigId(artist.text.trim()) &&
          artist.text.trim() != widget.session.partyId &&
          validFrom != null &&
          validUntil != null &&
          validFrom!.isBefore(validUntil!) &&
          validUntil!.isAfter(DateTime.now()) &&
          exclusive != null;
    }
    if (gig == null ||
        specId == null ||
        avatarId == null ||
        consentId == null ||
        relationChoice == null) {
      return false;
    }
    if (relationChoice == 'NONE') return m == 0;
    final r = relations.where((r) => r.id == relationChoice).firstOrNull;
    return r != null &&
        (modern
            ? r.data['v5_terms'] != null
            : r.data['commission']['platform_bps'] == p &&
                r.data['commission']['mcn_bps'] == m);
  }

  @override
  void initState() {
    super.initState();
    for (final c in [
      title,
      brief,
      territory,
      artist,
      terms,
      platform,
      mcn,
      supplyShare
    ]) {
      c.addListener(changed);
    }
    load();
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final c in [
      title,
      brief,
      territory,
      artist,
      terms,
      platform,
      mcn,
      supplyShare
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      busy = true;
      error = null;
      rules = [];
      specs = [];
      avatars = [];
      consents = [];
      relations = [];
      relationArtists = [];
      sourceListing = null;
      artist.clear();
      gig = null;
    });
    try {
      final cat = await api.catalogue();
      if (mounted && t == ticket) {
        modern = cat.contractPolicy == 'CONTRACT_20261029';
      }
      if (widget.kind == 'RELATION' && mcnActive) {
        final candidates = await api.relationOptions();
        if (mounted && t == ticket) relationArtists = candidates;
      }
      if (widget.kind == 'OFFER') {
        if (!gigId(widget.gigId)) throw const AccountError(400, 'INVALID_ID');
        final g = cat.items.where((r) => r['id'] == widget.gigId).firstOrNull;
        if (g == null) throw const AccountError(404, 'GIG_NOT_PUBLISHED');
        if (g['buyer_party_id'] == api.owner()) {
          throw const AccountError(409, 'SELF_DEAL_FORBIDDEN');
        }
        final sp = await TradeApi(widget.session).all('SPEC'),
            av = await api.supplyChoices('AVATAR'),
            co = await api.supplyChoices('CONSENT'),
            re = await api.all('RELATION');
        if (mounted && t == ticket) {
          setState(() {
            gig = g;
            specs = sp
                .where((s) =>
                    s.status == 'PUBLISHED' &&
                    s.data['provider_party_id'] == api.owner() &&
                    s.data['line_kind'] != 'LICENSE' &&
                    (!modern ||
                        s.data['product_profile']?['type'] == 'COMMERCIAL'))
                .toList();
            avatars = av;
            consents = co;
            relations = re
                .where((r) =>
                    r.status == 'ACTIVE' &&
                    r.counterparty == api.owner() &&
                    !DateTime.parse(r.data['valid_from'])
                        .isAfter(DateTime.now()) &&
                    DateTime.parse(r.data['valid_until'])
                        .isAfter(DateTime.now()))
                .toList();
          });
        }
      }
      if (mounted && t == ticket) setState(() => rules = cat.rules);
    } catch (e) {
      if (mounted && t == ticket) setState(() => error = gigError(e));
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> selectTime(bool from) async {
    final now = DateTime.now();
    final current = from ? validFrom : validUntil;
    final day = await showDatePicker(
        context: context,
        initialDate: current ?? now,
        firstDate: DateTime(now.year - 1),
        lastDate: DateTime(now.year + 10));
    if (day == null || !mounted) return;
    final time = await showTimePicker(
        context: context,
        initialTime: current == null
            ? TimeOfDay.now()
            : TimeOfDay.fromDateTime(current));
    if (time == null || !mounted) return;
    setState(() {
      final value =
          DateTime(day.year, day.month, day.day, time.hour, time.minute);
      if (from) {
        validFrom = value;
      } else {
        validUntil = value;
      }
    });
  }

  Widget timeField(String label, bool from) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: OutlinedButton.icon(
          onPressed: locked ? null : () => selectTime(from),
          icon: const Icon(Icons.calendar_month),
          label: Text(
              '$label：${(from ? validFrom : validUntil) == null ? '请选择日期与时间' : tradeDate((from ? validFrom : validUntil)!.toIso8601String())}')));
  Widget select(String label, String? value, List<(String, String)> rows,
          ValueChanged<String?> action) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Semantics(
              container: true,
              explicitChildNodes: true,
              child: DropdownButtonFormField<String>(
                  key: ValueKey('$label:$value'),
                  initialValue: value,
                  decoration: InputDecoration(labelText: label),
                  isExpanded: true,
                  items: rows
                      .map((r) => DropdownMenuItem(
                          value: r.$1,
                          child: Text(r.$2,
                              maxLines: 2, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: locked ? null : action)));
  Map<String, dynamic> body() {
    if (widget.kind == 'GIG') {
      return {
        'title': title.text.trim(),
        'brief': brief.text.trim(),
        'category': category,
        'scope': {
          'purpose': 'COMMERCIAL',
          'territory': territory.text.trim(),
          'valid_until': validUntil!.toUtc().toIso8601String()
        },
        'rule_id': ruleId,
        'proofs': [
          for (final p in requiredProofs)
            {'code': p, 'asset_id': proofs[p]!.single}
        ]
      };
    }
    final commission = {
      'platform_bps': modern ? 2200 : gigParsePercent(platform.text),
      'mcn_bps': modern ? 0 : gigParsePercent(mcn.text)
    };
    if (widget.kind == 'RELATION') {
      return {
        'artist_party_id': artist.text.trim(),
        'source_listing_id': sourceListing,
        'scope': 'COMMERCIAL',
        'valid_from': validFrom!.toUtc().toIso8601String(),
        'valid_until': validUntil!.toUtc().toIso8601String(),
        'exclusive': exclusive,
        'terms': terms.text.trim(),
        'commission': commission,
        if (modern)
          'v5_terms': {
            'version': 'V5',
            'supply_share_bps': gigParsePercent(supplyShare.text)
          },
        'evidence_asset_ids': evidence
      };
    }
    return {
      'gig_id': widget.gigId,
      'spec_id': specId,
      'avatar_id': avatarId,
      'consent_id': consentId,
      'relation_id': relationChoice == 'NONE' ? null : relationChoice,
      'commission': commission,
      'terms': terms.text.trim(),
      'ranking_opt_in': ranking,
      'evidence_asset_ids': evidence
    };
  }

  Future<void> finish(Future<GigRecord> Function() action) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..removeCurrentSnackBar();
      setState(() => busy = false);
      Navigator.pushReplacementNamed(context, '/gigs/record?recordId=${r.id}');
    } catch (e) {
      if (mounted) setState(() => error = gigError(e, writing: true));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (!canSubmit) return;
    final b = body();
    if (await tradeConfirm(
            context, widget.kind == 'RELATION' ? '核对直接合作邀请' : '核对本次提交', [
          if (widget.kind == 'GIG') ...[
            gigParagraph(b['title']),
            gigScopeFacts(gigMap(b['scope']))
          ] else ...[
            gigParagraph(b['terms']),
            gigCommissionFacts(gigMap(b['commission']),
                v5: b['v5_terms'],
                marketplace: modern && widget.kind == 'OFFER'
                    ? {
                        'version': 'CONTRACT_20261029',
                        'platform_bps': 2200,
                        'mcn_supply_bps': relations
                                .where((r) => r.id == relationChoice)
                                .firstOrNull
                                ?.data['v5_terms']?['supply_share_bps'] ??
                            0
                      }
                    : null)
          ],
          supplyNote(widget.kind == 'RELATION'
              ? '只发出直接合作邀请，须对方本人负责人明确接受后生效。'
              : '提交后须独立审核。这一步不付款、不批准授权，也不保证生成工具可用。')
        ]) &&
        mounted) {
      await finish(() => widget.kind == 'GIG'
          ? api.createGig(b)
          : widget.kind == 'OFFER'
              ? api.offer(b)
              : api.relation(b));
    }
  }

  List<Widget> requestFields() => [
        supplyCard('1 需求标题与简述', [
          gigTextField(title, '需求标题', max: 200, enabled: !locked),
          gigTextField(brief, '需求简述', lines: 4, enabled: !locked)
        ]),
        supplyCard('2 生效规则与商业类别', [
          select(
              '生效商单规则',
              ruleId,
              [
                for (final r in rules)
                  (r['id'] as String, '${r['rule']['version']} · ${r['id']}')
              ],
              (v) => setState(() {
                    ruleId = v;
                    category = null;
                    proofs.clear();
                  })),
          if (selectedRule != null) ...[
            select(
                '商业类别',
                category,
                [
                  for (final c in categories.where((c) => c['allowed'] == true))
                    (c['code'] as String, c['code'] as String)
                ],
                (v) => setState(() {
                      category = v;
                      proofs.clear();
                    })),
            ExpansionTile(
                title: const Text('阅读本次规则'),
                children: [gigParagraph(selectedRule!['rule']['terms'])])
          ],
          if (rules.isEmpty && !busy) supplyNote('没有可读取的生效规则，暂不能提交。')
        ]),
        supplyCard('3 用途范围', [
          tradeFact('用途', '商业用途'),
          gigTextField(territory, '适用地区', max: 128, enabled: !locked),
          timeField('需求有效截止', false)
        ]),
        supplyCard('4 按类别上传证明', [
          if (category == null) supplyNote('先选择规则与类别，按实际所需证明上传。'),
          for (final p in requiredProofs) ...[
            gigParagraph('必需证明：$p'),
            SupplyFiles(
                api: upload,
                purpose: 'RIGHTS_EVIDENCE',
                ids: proofs[p] ?? [],
                single: true,
                enabled: !busy && widget.session.gigsPending.isEmpty,
                onChanged: (v) => setState(() => proofs[p] = v))
          ],
          if (category != null && requiredProofs.isEmpty)
            supplyNote('本规则的这个类别没有必需证明项。')
        ])
      ];
  List<Widget> offerFields() => [
        if (gig != null)
          supplyCard('本次商单', [
            gigParagraph(gig!['title']),
            gigScopeFacts(gigMap(gig!['scope'])),
            tradeFact('需求方编号', gig!['buyer_party_id'])
          ]),
        supplyCard('1 服务规格与数字人', [
          select(
              '已发布服务规格',
              specId,
              [
                for (final s in specs)
                  (
                    s.id,
                    '${s.data['title']} · ${tradeMoney(s.data['unit_minor'])}'
                  )
              ],
              (v) => setState(() => specId = v)),
          if (specId != null) ...[
            for (final s in specs.where((s) => s.id == specId)) ...[
              tradeFact('服务价格', tradeMoney(s.data['unit_minor'])),
              gigParagraph(s.data['specification']['terms'])
            ]
          ],
          select(
              '已记录数字人',
              avatarId,
              [
                for (final a in avatars)
                  (
                    a['id'] as String,
                    '${a['data']['display_name']} · ${a['id']}'
                  )
              ],
              (v) => setState(() {
                    avatarId = v;
                    consentId = null;
                  })),
          supplyNote('没有公开人物目录。本栏只读取当前身份的实际数字人；缺少材料请先在有相应授权的网页办理。')
        ]),
        supplyCard('2 本人同意范围', [
          select(
              '覆盖本次商业用途的本人同意',
              consentId,
              [
                for (final c in eligibleConsents)
                  (c['id'] as String, c['id'] as String)
              ],
              (v) => setState(() => consentId = v)),
          if (consentId != null)
            for (final c
                in eligibleConsents.where((c) => c['id'] == consentId)) ...[
              tradeFact(
                  '覆盖特征',
                  (c['data']['consent']['features'] as List)
                      .map((v) => v == 'FACE' ? '脸部' : '声音')
                      .join('、')),
              tradeFact('覆盖地区',
                  (c['data']['consent']['territories'] as List).join('、')),
              tradeFact('有效截止', tradeDate(c['data']['consent']['valid_until'])),
              gigParagraph(c['data']['consent']['terms'])
            ],
          if (avatarId != null && eligibleConsents.isEmpty)
            supplyNote('没有覆盖本次数字人、商业用途、地区与完整期限的已审同意。不能用私人用途同意或已撤回记录替代。',
                error: true)
        ]),
        supplyCard('3 直接合作与佣金', [
          select(
              '直接 MCN 合作',
              relationChoice,
              [
                ('NONE', '不引用 MCN 直接合作'),
                for (final r in relations) (r.id, '${r.owner} · ${r.id}')
              ],
              (v) => setState(() => relationChoice = v)),
          if (relationChoice != null && relationChoice != 'NONE')
            for (final r in relations.where((r) => r.id == relationChoice)) ...[
              gigParagraph(r.data['terms']),
              gigCommissionFacts(gigMap(r.data['commission']),
                  v5: r.data['v5_terms']),
              supplyNote(modern && r.data['v5_terms'] == null
                  ? '本合作是旧协议，双方须重新约定供给收益比例，不能直接用于新版商单。'
                  : '按双方已确认的原合作比例办理。')
            ],
          ...commissionFields()
        ]),
        supplyCard('4 完整约定与公开榜单', [
          gigTextField(terms, '完整接单约定', lines: 5, enabled: !locked),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: ranking,
              onChanged:
                  locked ? null : (v) => setState(() => ranking = v == true),
              title: const Text('我明确选择参与公开榜单'),
              subtitle: const Text('默认不参与。符合计算条件后仅公布主体编号、地区、订单数与分值。'))
        ]),
        evidenceFields('5 证明材料')
      ];
  List<Widget> commissionFields() => modern
      ? [
          if (widget.kind == 'RELATION')
            gigTextField(supplyShare, '机构占供给收益（%，10—30）',
                max: 6, enabled: !locked),
          supplyNote('新版商单平台费用22%；剩余78%为供给收益。机构默认占供给收益20%，须双方明确确认，可约定10%—30%。'),
          if (widget.kind == 'OFFER')
            supplyNote('机构比例读取已接受的新版合作协议；无机构则供给收益归艺人。协议缺失不能创建新商单。')
        ]
      : [
          gigTextField(platform, '平台费用（%）', max: 6, enabled: !locked),
          gigTextField(mcn, 'MCN 分成（%）', max: 6, enabled: !locked),
          supplyNote(
              '请按本次实际约定填写，0–100%，最多两位小数。MCN 分成不超过平台费用；不引用合作时须明确填 0%。没有默认费率。')
        ];
  Widget evidenceFields(String heading) => supplyCard(heading, [
        SupplyFiles(
            api: upload,
            purpose: 'RIGHTS_EVIDENCE',
            ids: evidence,
            enabled: !busy && widget.session.gigsPending.isEmpty,
            onChanged: (v) => setState(() => evidence = v)),
        supplyNote('至少一份当前身份的私有证明。仅用于本合作或约定，提交不会公开材料。')
      ]);
  List<Widget> relationFields() => [
        supplyCard('1 当前 MCN 身份', [
          tradeFact('发起主体', api.owner()),
          if (!mcnActive) supplyNote('当前身份没有有效 MCN 服务授权，不能发送邀请。', error: true),
          supplyNote('MCN 能力须已获有效服务授权；不能在此自行批准。服务授权不代表有权代本人接受合作。')
        ]),
        supplyCard('2 直接合作对象与范围', [
          select('选择公开展示的艺人', sourceListing, [
            for (final r in relationArtists)
              (r['listing_id'] as String, '${r['display_name']} · ${r['city']}')
          ], (v) {
            sourceListing = v;
            artist.text = relationArtists
                    .where((r) => r['listing_id'] == v)
                    .firstOrNull?['artist_party_id'] ??
                '';
          }),
          tradeFact('范围', '商业用途'),
          supplyNote('只列仍获本人授权公开展示的艺人，邀请后仍须本人接受，不替本人授权。')
        ]),
        supplyCard('3 期间与排他', [
          timeField('合作开始', true),
          timeField('合作结束', false),
          select(
              '排他约定',
              exclusive == null
                  ? null
                  : exclusive!
                      ? 'YES'
                      : 'NO',
              [('YES', '排他'), ('NO', '不排他')],
              (v) => setState(() => exclusive = v == 'YES'))
        ]),
        supplyCard('4 条款与佣金', [
          gigTextField(terms, '完整合作条款', lines: 5, enabled: !locked),
          ...commissionFields()
        ]),
        evidenceFields('5 合作证明')
      ];
  @override
  Widget build(BuildContext c) => tradeScaffold(
      c,
      widget.kind == 'GIG'
          ? '发布商业需求'
          : widget.kind == 'OFFER'
              ? '提交接单约定'
              : '发起直接合作',
      [
        gigHeading(widget.kind == 'GIG'
            ? '发布商业需求'
            : widget.kind == 'OFFER'
                ? '提交接单约定'
                : '发起直接合作'),
        if (busy) const LinearProgressIndicator(),
        if (error != null) supplyNote(error!, error: true),
        for (final p in widget.session.gigsPending)
          supplyCard('有操作结果待核实', [
            supplyNote('原内容、版本与请求依据仍保留，恢复前不能改写或离页。', error: true),
            tradeButton('恢复原请求核对',
                busy ? null : () => finish(() => api.retry(p['path'])))
          ]),
        ...widget.kind == 'GIG'
            ? requestFields()
            : widget.kind == 'OFFER'
                ? offerFields()
                : relationFields(),
        tradeButton('重新读取可选资料', locked ? null : load, outline: true),
        supplyNote(widget.kind == 'RELATION'
            ? '只发出邀请；对方本人负责人确认后生效。'
            : '提交须独立审核。所有用途、费用、佣金和公开榜单选择均按本次明确内容办理。'),
        tradeButton(widget.kind == 'RELATION' ? '发送直接合作邀请' : '提交审核',
            canSubmit ? submit : null)
      ],
      locked: locked);
}
