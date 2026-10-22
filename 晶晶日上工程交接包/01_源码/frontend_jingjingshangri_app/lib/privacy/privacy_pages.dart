import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../trade/trade_widgets.dart';
import '../engagement/community_support.dart';

const privacyTypes = {
  'QUERY': '查询本人资料',
  'COPY': '复制本人资料',
  'CORRECT': '更正资料',
  'DELETE': '删除资料',
  'CLOSE_ACCOUNT': '注销账号',
  'COMPLAINT': '投诉与保护申请'
};
const privacyScopes = {
  'PROFILE': '账号展示信息',
  'ARTIST_MATERIALS': '人物原始素材',
  'PRIVATE_STORY': '私人故事',
  'CONTRACTS': '合同',
  'TRANSACTIONS': '交易记录',
  'DIGITAL_MODELS': '数字人模型',
  'CONTENT': '作品内容',
  'ALL': '全部相关资料'
};
const privacyActions = {
  'PROFILE_CORRECTION': '更正账号展示名',
  'FILE_ERASURE': '删除指定原始素材当前对象',
  'ACCOUNT_CLOSURE': '注销账号访问',
  'RESTRICT_CONTENT': '限制具体内容',
  'RELEASE_CONTENT': '解除一项内容限制'
};

class PrivacyPage extends StatelessWidget {
  const PrivacyPage({super.key, this.view = 'requests', this.recordId});
  final String view;
  final String? recordId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'privacy',
      route:
          '/privacy?view=$view${recordId == null ? '' : '&recordId=$recordId'}',
      title: '隐私与个人信息',
      partyRequired: false,
      builder: (s) => _Privacy(session: s, view: view, id: recordId));
}

class _Privacy extends StatefulWidget {
  const _Privacy({required this.session, required this.view, this.id});
  final AccountSession session;
  final String view;
  final String? id;
  @override
  State<_Privacy> createState() => _PrivacyState();
}

class _PrivacyState extends CommunityPageState<_Privacy> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'privacy';
  late final details = field(), why = field(), minutes = field();
  String type = 'QUERY', copyCategory = 'PROFILE';
  final scopes = <String>{};
  bool personalization = false,
      marketing = false,
      loadedPreferences = false,
      agreed = false;
  int preferenceVersion = 0;
  String? cursor, nextCursor, dataCursor, nextDataCursor;
  List<Map<String, dynamic>> rows = [],
      history = [],
      executions = [],
      models = [],
      creations = [],
      actions = [],
      copyRows = [];
  Map<String, dynamic>? request, copy;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void clearPrivate() {
    rows = [];
    history = [];
    executions = [];
    models = [];
    creations = [];
    actions = [];
    copyRows = [];
    request = null;
    copy = null;
    scopes.clear();
    personalization = false;
    marketing = false;
    agreed = false;
  }

  @override
  void fail(Object e) {
    super.fail(e);
    if (e is AccountError && e.status == 412) agreed = false;
  }

  Map<String, dynamic> validateRequest(Map<String, dynamic> r, {String? id}) {
    communityRequire(communityId(r['id']) &&
        (id == null || r['id'] == id) &&
        r['account_id'] == session.account?['id'] &&
        r['object_version'] is int &&
        r['object_version'] > 0 &&
        r['current_status'] is String &&
        r['request'] is Map &&
        r['events'] is List);
    final q = communityMap(r['request']);
    communityRequire(privacyTypes.containsKey(q['type']) &&
        q['scopes'] is List &&
        q['scopes'].every((v) => privacyScopes.containsKey(v)) &&
        q['details'] is String);
    return r;
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    setState(() {
      checking = true;
      error = null;
    });
    try {
      Map<String, dynamic>? r;
      List<Map<String, dynamic>> list = [],
          h = [],
          ex = [],
          m = [],
          c = [],
          a = [];
      String? next;
      if (widget.view == 'preferences') {
        final p = await api.read('preferences');
        communityRequire(p['object_version'] is int &&
            p['object_version'] >= 0 &&
            p['personalization'] is bool &&
            p['marketing'] is bool &&
            p['rest_reminder_minutes'] is int &&
            p['rest_reminder_minutes'] >= 0 &&
            p['rest_reminder_minutes'] <= 240);
        preferenceVersion = p['object_version'];
        if (!loadedPreferences) {
          personalization = p['personalization'];
          marketing = p['marketing'];
          minutes.text = '${p['rest_reminder_minutes']}';
          loadedPreferences = true;
        }
      } else if (widget.view == 'request') {
        r = validateRequest(
            await api.read(
                'requests/${communityRequiredId(widget.id ?? '', '本人申请')}'),
            id: widget.id);
        final base = 'requests/${r['id']}';
        h = communityRows((await api.read('$base/history'))['responses']);
        ex = await allRows('$base/executions');
        final q = communityMap(r['request']);
        final allowed = [
          'PROFILE',
          'ARTIST_MATERIALS',
          'PRIVATE_STORY',
          'TRANSACTIONS',
          'CONTENT'
        ]
            .where((c) =>
                (q['scopes'] as List).contains('ALL') ||
                (q['scopes'] as List).contains(c))
            .toList();
        if (allowed.isNotEmpty && !allowed.contains(copyCategory)) {
          copyCategory = allowed.first;
        }
        if (['DELETE', 'CLOSE_ACCOUNT'].contains(q['type']) &&
            (q['scopes'] as List).any((v) =>
                ['ALL', 'ARTIST_MATERIALS', 'DIGITAL_MODELS'].contains(v))) {
          m = await allRows('$base/model-assets');
          c = await allRows('$base/model-creations');
          a = await allRows('$base/actions');
        }
      } else if (widget.view != 'new') {
        final p = await api.read('requests',
            query: {'limit': 20, if (cursor != null) 'cursor': cursor});
        list = communityItems(p).map((v) => validateRequest(v)).toList();
        next = p['next_cursor'];
        communityRequire(next == null || communityId(next) && next != cursor);
      }
      if (mounted && t == ticket) {
        setState(() {
          request = r;
          rows = list;
          history = h;
          executions = ex;
          models = m;
          creations = c;
          actions = a;
          nextCursor = next;
        });
      }
    } catch (e) {
      if (mounted && t == ticket) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  @override
  void validateResult(Map<String, dynamic> r) {
    if (r.containsKey('personalization')) {
      communityRequire(r['object_version'] is int &&
          r['object_version'] >= 0 &&
          r['personalization'] is bool &&
          r['marketing'] is bool &&
          r['rest_reminder_minutes'] is int);
    } else if (r['request'] is Map) {
      validateRequest(r);
    } else {
      communityRequire(communityId(r['request_id']) &&
          r['object_version'] is int &&
          r['object_version'] > 0 &&
          (r['action_id'] == null || communityId(r['action_id'])));
    }
  }

  @override
  Future<void> reconcilePending() async {
    final p = recoverySuffix!.split('/');
    if (p.first == 'preferences') {
      await api.read('preferences');
    } else if (p.first == 'requests' && p.length > 1) {
      await api.read('requests/${p[1]}');
      if (p.contains('executions')) {
        await api.read('requests/${p[1]}/executions', query: {'limit': 20});
      }
    } else {
      await api.read('requests', query: {'limit': 20});
    }
  }

  Future<List<Map<String, dynamic>>> allRows(String suffix) async {
    final rows = <Map<String, dynamic>>[], seen = <String>{};
    String? cursor;
    do {
      final p = await api.read(suffix,
          query: {'limit': 50, if (cursor != null) 'cursor': cursor});
      rows.addAll(communityItems(p));
      cursor = p['next_cursor'];
      communityRequire(
          cursor == null || communityId(cursor) && seen.add(cursor));
    } while (cursor != null);
    return rows;
  }

  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  Future<bool> confirm(String title, String body) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(body), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('返回')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('本人明确确认'))
              ])) ==
      true;
  void open(String view, [Object? id]) => Navigator.pushNamed(
      context, '/privacy?view=$view${id == null ? '' : '&recordId=$id'}');
  Widget menu() => Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton(
            onPressed: () => open('requests'), child: const Text('我的申请')),
        OutlinedButton(onPressed: () => open('new'), child: const Text('提出申请')),
        OutlinedButton(
            onPressed: () => open('preferences'), child: const Text('隐私偏好'))
      ]);
  List<Widget> listView() => [
        communityHeading('隐私与个人信息', '申请、审核答复与实际处理进展分别查询。'),
        menu(),
        const SizedBox(height: 20),
        appNotice('此处按登录本人办理，不由机构或他人代办。资料留存、资金义务和具体清理范围由已审核依据分别处理。'),
        if (rows.isEmpty && !checking) const Text('暂无属于你的个人信息申请。'),
        for (final r in rows)
          communitySection(
              privacyTypes[communityMap(r['request'])['type']] ?? '本人申请', [
            communityFact('当前进展', communityState(r['current_status'])),
            communityFact('答复目标日期', r['response_due_on']),
            communityFact(
                '日期依据',
                r['deadline_basis'] == 'REVIEWED_CALENDAR'
                    ? '已审核工作日历'
                    : '普通工作日估算，需人工核对'),
            tradeButton('查看答复和实际处理', () => open('request', r['id']),
                outline: true)
          ]),
        if (nextCursor != null)
          tradeButton(
              '读取下一页申请',
              enabled
                  ? () {
                      setState(() => cursor = nextCursor);
                      load();
                    }
                  : null,
              outline: true)
      ];
  List<Widget> newView() => [
        communityHeading('提出本人申请', '说明你希望处理的具体资料和事情。'),
        menu(),
        const SizedBox(height: 20),
        communitySelect(
            '希望办理的事项',
            type,
            [for (final x in privacyTypes.entries) (x.key, x.value)],
            enabled ? (v) => setState(() => type = v!) : null),
        communitySection('本次资料范围', [
          for (final x in privacyScopes.entries)
            communityCheck(
                x.value,
                scopes.contains(x.key),
                enabled
                    ? (v) => setState(() =>
                        v == true ? scopes.add(x.key) : scopes.remove(x.key))
                    : null)
        ]),
        communityField(details, '具体说明', lines: 5),
        appNotice('提交申请只表示平台收到你的诉求。删除、注销、投诉限制、返款等实际结果会分别记录，不会因此自动完成。'),
        tradeButton(
            '提交本次申请',
            enabled
                ? () => submit(() async {
                      if (scopes.isEmpty) {
                        throw const AccountError(400, '请至少选择一项资料范围');
                      }
                      final out = await act(
                          'requests',
                          {
                            'type': type,
                            'scopes': scopes.toList(),
                            'details': communityRequired(details.text, '具体说明')
                          },
                          reload: false,
                          validate: (r) => validateRequest(r));
                      if (out != null && mounted) open('request', out['id']);
                    })
                : null)
      ];
  List<Widget> preferenceView() => [
        communityHeading('由你选择的隐私偏好', '个性化与营销初始关闭，选择会保存为本人账号偏好。'),
        menu(),
        const SizedBox(height: 20),
        communityCheck(
            '允许个性化设置',
            personalization,
            enabled
                ? (v) => setState(() => personalization = v == true)
                : null),
        communityCheck('允许营销消息', marketing,
            enabled ? (v) => setState(() => marketing = v == true) : null),
        communityField(minutes, '休息提醒间隔（分钟）', keyboard: TextInputType.number),
        const Text('0为关闭；开启时15—240分钟。'),
        tradeButton(
            '保存本次偏好',
            enabled
                ? () => submit(() async {
                      final n = int.tryParse(minutes.text);
                      if (n == null || n != 0 && (n < 15 || n > 240)) {
                        throw const AccountError(400, '请选择0，或15—240分钟的提醒间隔');
                      }
                      await act(
                          'preferences',
                          {
                            'personalization': personalization,
                            'marketing': marketing,
                            'rest_reminder_minutes': n
                          },
                          version: preferenceVersion,
                          method: 'PATCH',
                          account: true,
                          validate: (r) => communityRequire(
                              r['object_version'] is int &&
                                  r['personalization'] == personalization &&
                                  r['marketing'] == marketing &&
                                  r['rest_reminder_minutes'] == n));
                    })
                : null),
        appNotice('保存偏好不等于已经启用画像推荐或系统营销推送。业务办理结果通知仍会按实际规则送达。')
      ];
  List<Widget> responseFacts(Map<String, dynamic> result) => [
        SelectableText(communityText(result['response']),
            style: const TextStyle(height: 1.6)),
        communityFact(
            '本次答复',
            const {
                  'INFORMATION_PROVIDED': '已提供本次资料',
                  'CORRECTION_RECORDED': '更正诉求已记录',
                  'DELETION_REQUESTED': '删除请求已记录',
                  'RETENTION_EXPLAINED': '已说明分类留存',
                  'ACCOUNT_CLOSURE_REQUESTED': '注销请求已记录',
                  'COMPLAINT_RESPONSE': '投诉答复'
                }[result['outcome']] ??
                result['outcome']),
        for (final h in communityRows(result['retentions']))
          communitySection(
              '${privacyScopes[h['scope']] ?? h['scope']} · 暂留说明', [
            communityFact('对象范围', h['object_ref']),
            communityFact('具体依据', h['basis']),
            communityFact('复查日期', h['review_on'])
          ]),
        for (final x in (result['remaining_actions'] as List? ?? []))
          communityFact('仍待处理', x),
        for (final asset in (result['evidence_asset_ids'] as List? ?? []))
          tradeButton(
              '领取这份审核答复附件',
              enabled
                  ? () => savePrivate(
                      'requests/${request!['id']}/evidence/$asset/content',
                      'privacy-response-$asset.bin',
                      account: true)
                  : null,
              outline: true)
      ];
  List<Widget> requestView() {
    final r = request;
    if (r == null) return [];
    final q = communityMap(r['request']),
        result = communityMaybeMap(r['result']);
    return [
      communityHeading(
          privacyTypes[q['type']] ?? '本人申请', '明确这一份申请涉及的资料、答复和剩余事项。'),
      menu(),
      const SizedBox(height: 20),
      communityFact('进展', communityState(r['current_status'])),
      communityFact('申请范围',
          (q['scopes'] as List).map((s) => privacyScopes[s] ?? s).join('、')),
      communityFact('原申请说明', q['details']),
      communityFact('答复目标日期', r['response_due_on']),
      if (r['deadline_basis'] != 'REVIEWED_CALENDAR')
        appNotice('该日期按普通工作日估算，仍需人工核对工作日历，不作为已确认的法定期限。'),
      if (result.isNotEmpty) communitySection('当前审核答复', responseFacts(result)),
      for (final h in history)
        ExpansionTile(
            title: Text('历史正式答复 · 版本${h['object_version']}'),
            children: responseFacts(communityMap(h['result']))),
      communitySection('提出异议或补充情况', [
        communityField(why, '需要重新处理的原因', lines: 3),
        tradeButton(
            '提交本次异议',
            enabled
                ? () => submit(() async {
                      await act('requests/${r['id']}/reopen',
                          {'reason': communityRequired(why.text, '异议原因')},
                          version: r['object_version']);
                    })
                : null,
            outline: true)
      ]),
      if (['QUERY', 'COPY'].contains(q['type'])) ...copySection(q),
      communitySection('具体处理方案与执行结果', [
        if (executions.isEmpty)
          const Text('尚无已登记的具体执行方案。可补充申请说明，由工作人员核对适用依据和下一步。'),
        for (final x in executions)
          communitySection(
              privacyActions[x['action']] ?? communityText(x['action']), [
            communityFact('执行进展', communityState(x['current_status'])),
            communityFact('处理对象', communityShort(x['target_id'])),
            if (x['job_status'] != null)
              communityFact('后台任务', communityState(x['job_status'])),
            if (x['result'] != null)
              ...executionResult(communityMap(x['result'])),
            if (x['current_status'] == 'APPROVED' &&
                x['action'] == 'ACCOUNT_CLOSURE')
              tradeButton(
                  '本人确认注销访问',
                  enabled
                      ? () => submit(() async {
                            if (await confirm('确认注销当前账号访问',
                                '注销会撤销本人的登录与成员访问。历史合同、钱账和依法保留资料不等于已经删除；请保留本申请编号 ${r['id']}。')) {
                              final out = await act(
                                  'requests/${r['id']}/executions/${x['id']}/execute',
                                  {'confirmed': true},
                                  version: x['object_version'],
                                  account: true,
                                  reload: false);
                              if (out != null) {
                                await session.logout();
                                if (mounted) {
                                  Navigator.pushNamedAndRemoveUntil(
                                      context, '/account', (_) => false);
                                }
                              }
                            }
                          })
                      : null,
                  outline: true),
            if (x['current_status'] == 'APPROVED' &&
                x['action'] != 'ACCOUNT_CLOSURE')
              appNotice('请先核对完整方案内容和具体资料，再由本人确认。当前返回未提供完整变更内容，暂不开放盲目执行。'),
            communityRecordId(x)
          ]),
        appNotice('每项动作分别记录。整体完成状态尚未核实，不能把单一模型或当前文件删除显示成全部资料已清理。')
      ]),
      if (models.isNotEmpty || creations.isNotEmpty || actions.isNotEmpty)
        ...modelSection(r),
      for (final e in communityRows(r['events']))
        communityFact(communityDate(e['created_at']), e['message']),
      communityRecordId(r)
    ];
  }

  List<Widget> executionResult(Map<String, dynamic> d) => [
        communityFact(
            '实际效果',
            const {
                  'ACCOUNT_DISPLAY_NAME_UPDATED': '展示名已更新，历史记录不改',
                  'ACCOUNT_ACCESS_CLOSED': '账号访问已关闭',
                  'FILE_ACCESS_REMOVED': '当前文件访问已停止',
                  'CONTENT_RESTRICTED': '指定内容已受限制',
                  'ONE_RESTRICTION_RELEASED': '已解除指定一项限制'
                }[d['effect']] ??
                d['effect']),
        if (d['current_object_erasure'] != null)
          communityFact('当前对象清理', communityState(d['current_object_erasure'])),
        if (d['versions_and_backups'] != null)
          communityFact(
              '历史版本与备份',
              d['versions_and_backups'] == 'REVIEW_REQUIRED'
                  ? '仍待分类核对'
                  : d['versions_and_backups']),
        if (d['data_erasure'] != null)
          communityFact('全部资料清理', communityState(d['data_erasure'])),
        if (d['support_reference'] != null)
          communityFact('客服查询依据', d['support_reference'])
      ];
  List<Widget> modelSection(Map<String, dynamic> r) => [
        communitySection('本次可核对的制作模型与在途任务', [
          appNotice('此列表只覆盖已登记的制作模型和创建任务，空列表不代表本人没有其他资料或供应商副本。'),
          for (final x in models)
            communitySection('本人模型 ${communityShort(x['asset_id'])}', [
              communityFact('模型进展', communityState(x['asset_status'])),
              communityFact('所用授权', communityState(x['consent_status'])),
              communityField(why, '撤回授权的明确原因', lines: 2),
              tradeButton(
                  '撤回这份本人授权',
                  enabled && x['consent_status'] != 'WITHDRAWN'
                      ? () => submit(() async {
                            if (await confirm(
                                '核对撤回影响', '撤回这份授权会影响使用同一授权的其他业务，清理结果还需分别核对。')) {
                              await act(
                                  'requests/${r['id']}/consent-withdrawals',
                                  {
                                    'consent_id': x['consent_id'],
                                    'consent_version': x['consent_version'],
                                    'reason': communityRequired(
                                        why.text, '撤回原因',
                                        max: 1000)
                                  },
                                  version: r['object_version']);
                            }
                          })
                      : null,
                  outline: true),
              tradeButton(
                  '登记删除这个模型',
                  enabled &&
                          x['consent_status'] == 'WITHDRAWN' &&
                          x['asset_status'] != 'DELETED'
                      ? () => submit(() async {
                            if (await confirm(
                                '核对本次删除', '仅针对这一个模型登记删除任务，须等实际服务返回才能显示已删除。')) {
                              await act(
                                  'requests/${r['id']}/model-deletions',
                                  {
                                    'asset_id': x['asset_id'],
                                    'asset_version': x['asset_version']
                                  },
                                  version: r['object_version']);
                            }
                          })
                      : null,
                  outline: true)
            ]),
          for (final x in creations)
            communitySection('本人创建任务', [
              communityFact(
                  '任务进展', communityState(x['current_status'] ?? x['status'])),
              communityFact('后台进展', communityState(x['job_status'])),
              if (x['consent_id'] != null)
                communityFact('所用授权', communityState(x['consent_status']))
            ]),
          for (final x in actions)
            communityFact(
                x['action_kind'] == 'MODEL_DELETION' ? '指定模型删除' : '指定授权撤回',
                communityState(x['status']))
        ])
      ];
  List<Widget> copySection(Map<String, dynamic> q) => [
        communitySection('读取本次可直接提供的本人资料', [
          communitySelect(
              '资料类别',
              copyCategory,
              [
                for (final c in [
                  'PROFILE',
                  'ARTIST_MATERIALS',
                  'PRIVATE_STORY',
                  'TRANSACTIONS',
                  'CONTENT'
                ])
                  if ((q['scopes'] as List).contains('ALL') ||
                      (q['scopes'] as List).contains(c))
                    (c, privacyScopes[c]!)
              ],
              enabled
                  ? (v) => setState(() {
                        copyCategory = v!;
                        copy = null;
                        copyRows = [];
                        dataCursor = null;
                        nextDataCursor = null;
                      })
                  : null),
          tradeButton('读取这一类本人资料', enabled ? loadCopy : null, outline: true),
          if (copy != null) ...[
            communityFact(
                '本次提供范围',
                const {
                      'ACCOUNT_PROFILE_ONLY': '仅本人账号展示信息',
                      'OWN_MATERIAL_METADATA_ONLY': '仅本人原始素材目录',
                      'OWN_CONTENT_METADATA_ONLY': '仅本人作品文件元信息',
                      'OWN_CURRENT_STORY_TEXT_ONLY': '仅本人当前私人故事正文',
                      'OWN_BUYER_ORDER_INDEX_ONLY': '仅本人买家订单索引'
                    }[copy!['coverage']] ??
                    copy!['coverage']),
            for (final x in copyRows) ...copyFacts(x),
            tradeButton('保存本页本人资料副本', enabled ? saveCopy : null, outline: true),
            if (nextDataCursor != null)
              tradeButton(
                  '读取下一页资料',
                  enabled
                      ? () {
                          dataCursor = nextDataCursor;
                          loadCopy();
                        }
                      : null,
                  outline: true)
          ],
          appNotice('完整合同、多方资料和历史版本另由审核后的答复附件提供，本次目录不能标成全部资料导出。')
        ])
      ];
  List<Widget> copyFacts(Map<String, dynamic> x) => [
        if (x['display_name'] != null)
          communityFact('本人展示名', x['display_name']),
        if (x['category_title'] != null)
          communitySection(communityText(x['category_title']), [
            communityFact('进展', communityState(x['current_status'])),
            for (final a in communityMaybeMap(x['answers']).entries)
              communityFact(a.key, a.value)
          ]),
        if (x['media_type'] != null)
          communityFact('本人文件',
              '${x['media_type']} · ${x['byte_size']}字节 · ${communityState(x['current_status'])}'),
        if (x['kind'] == 'ORDER')
          communityFact('本人原订单 ${communityShort(x['id'])}',
              communityState(x['current_status']))
      ];
  Future<void> loadCopy() async {
    setState(() {
      checking = true;
      error = null;
    });
    try {
      final d = await api.read('requests/${request!['id']}/data', query: {
        'category': copyCategory,
        'limit': 20,
        if (dataCursor != null) 'cursor': dataCursor
      });
      communityRequire(
          d['category'] == copyCategory && d['coverage'] is String);
      final r = communityItems(d), next = d['next_cursor'];
      communityRequire(next == null || communityId(next) && next != dataCursor);
      if (mounted) {
        setState(() {
          copy = d;
          copyRows = r;
          nextDataCursor = next;
        });
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  Future<void> saveCopy() async {
    final d = copy;
    if (d == null) return;
    try {
      final saved = await FilePicker.saveFile(
          fileName: 'my-privacy-copy-$copyCategory.json',
          bytes: Uint8List.fromList(
              utf8.encode(const JsonEncoder.withIndent('  ').convert(d))));
      if (mounted) {
        setState(() => notice = kIsWeb
            ? '资料已交给浏览器，请核对下载记录。'
            : saved == null
                ? '已取消保存，资料未存入设备。'
                : '资料已保存，请在设备中核对。');
      }
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '隐私与个人信息',
      [
        ...feedback,
        ...switch (widget.view) {
          'new' => newView(),
          'preferences' => preferenceView(),
          'request' => requestView(),
          _ => listView()
        },
        tradeButton('重新读取当前记录', busy ? null : load, outline: true)
      ],
      locked: recovery != null);
}
