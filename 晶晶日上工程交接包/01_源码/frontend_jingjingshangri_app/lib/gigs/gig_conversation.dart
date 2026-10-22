import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../stock/v5_support.dart';
import '../stock/v5_media.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import '../trade/trade_widgets.dart';
import 'gig_conversation_api.dart';
import 'gig_conversation_models.dart';

class GigConversationPage extends StatelessWidget {
  const GigConversationPage({super.key, required this.orderId});
  final String orderId;
  @override
  Widget build(BuildContext context) => !v5Id(orderId)
      ? tradeScaffold(context, '商业订单专属会话', [
          tradeHeading('先选择原商业订单', eyebrow: '订单范围 / 明确参与关系'),
          appNotice('请从有权参与的原商业订单进入本单会话。'),
          tradeButton('查看我的商单',
              () => Navigator.pushNamed(context, '/gigs/records?kind=OFFER'))
        ])
      : V5Gate(
          domain: 'gigs',
          route: '/gigs/conversation?orderId=$orderId',
          builder: (session) =>
              _Conversation(session: session, orderId: orderId));
}

class _Conversation extends StatefulWidget {
  const _Conversation({required this.session, required this.orderId});
  final AccountSession session;
  final String orderId;
  @override
  State<_Conversation> createState() => _ConversationState();
}

class _ConversationState extends State<_Conversation>
    with WidgetsBindingObserver {
  late final api = GigConversationApi(widget.session, widget.orderId);
  CommercialConversation? conversation;
  final rows = <CommercialMessage>[];
  final uploadedIds = <String>{};
  Map<String, dynamic>? contacts;
  String? cursor, error;
  bool busy = false;
  int ticket = 0, mediaGeneration = 0, messageForm = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) load();
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      if (mounted) {
        setState(() {
          contacts = null;
          mediaGeneration++;
        });
      }
    }
  }

  @override
  void dispose() {
    ticket++;
    WidgetsBinding.instance.removeObserver(this);
    rows.clear();
    uploadedIds.clear();
    conversation = null;
    contacts = null;
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (more && cursor == null) return;
    final currentTicket = ++ticket;
    setState(() {
      busy = true;
      error = null;
      contacts = null;
      mediaGeneration++;
      if (!more) {
        rows.clear();
        cursor = null;
      }
    });
    try {
      final page = await api.messages(cursor: more ? cursor : null);
      if (!mounted || currentTicket != ticket) return;
      v5Require(conversation == null || conversation!.id == page.id);
      if (more) {
        v5Require(!page.messages.any((m) => rows.any((old) => old.id == m.id)));
      }
      setState(() {
        conversation = page;
        rows.addAll(page.messages);
        cursor = page.cursor;
      });
    } on AccountError catch (e) {
      if (mounted && currentTicket == ticket) {
        setState(() => error = v5Error(e));
      }
    } finally {
      if (mounted && currentTicket == ticket) setState(() => busy = false);
    }
  }

  Future<int?> latest() async {
    final page = await api.messages();
    if (mounted) {
      setState(() {
        conversation = page;
        rows.clear();
        rows.addAll(page.messages);
        cursor = page.cursor;
        contacts = null;
        mediaGeneration++;
      });
    }
    return page.version;
  }

  void snapshot(CommercialConversation current) {
    if (!mounted) return;
    setState(() {
      if (conversation?.version != current.version || !current.writable) {
        contacts = null;
      }
      conversation = current;
    });
  }

  void hidden(CommercialMessage current) {
    if (!mounted) return;
    setState(() {
      final index = rows.indexWhere((m) => m.id == current.id);
      if (index >= 0) rows[index] = current;
      mediaGeneration++;
      contacts = null;
      error = '本条消息已被独立客服隐藏，原附件与内容已清空。';
    });
  }

  Future<void> readContacts() async {
    setState(() {
      busy = true;
      contacts = null;
      error = null;
    });
    try {
      final current = await api.messages();
      snapshot(current);
      if (!current.writable) {
        throw AccountError(409, 'COMMERCIAL_CONVERSATION_${current.status}');
      }
      final result = await api.contacts();
      if (mounted) setState(() => contacts = result);
    } on AccountError catch (e) {
      if (mounted) {
        setState(() {
          contacts = null;
          error = v5Error(e);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void go(String path) => Navigator.pushNamed(context, path);
  List<Widget> message(CommercialMessage m, CommercialConversation c) => [
        tradeSection(
            m.hidden
                ? '本条内容已隐藏'
                : m.kind == 'ORDER_CARD'
                    ? '原商业订单卡'
                    : m.raw['owner_party_id'] == widget.session.partyId
                        ? '本方发出的消息'
                        : '本单参与方消息',
            [
              if (m.hidden)
                appNotice('独立客服已隐藏本条内容，不再提供原文字或附件。')
              else if (m.kind == 'TEXT')
                Text(m.data['body'])
              else if (m.kind == 'ORDER_CARD')
                tradeButton('查看本单商业订单',
                    () => go('/trade/record?recordId=${widget.orderId}'),
                    outline: true)
              else
                V5Media(
                    key: ValueKey(
                        '${m.id}:$mediaGeneration:${m.data['asset']['sha256']}'),
                    api: api,
                    type: m.data['asset']['media_type'].startsWith('image/')
                        ? 'image'
                        : m.data['asset']['media_type'] == 'video/mp4'
                            ? 'video'
                            : 'file',
                    label: '按本单权限读取此附件',
                    fileName: 'commercial-${m.id}.${const {
                          'image/jpeg': 'jpg',
                          'image/png': 'png',
                          'video/mp4': 'mp4',
                          'application/pdf': 'pdf',
                          'text/plain': 'txt',
                          'audio/wav': 'wav',
                          'audio/mpeg': 'mp3'
                        }[m.data['asset']['media_type']] ?? 'bin'}',
                    allowSave: true,
                    load: () => api.material(m,
                        onChanged: hidden, onSnapshot: snapshot)),
              tradeFact('发送时间', tradeDate(m.data['at'])),
              if (c.raw['read_until'] == m.id) appNotice('本人已读进度到此；不代表其他参与方已读。')
            ])
      ];
  @override
  Widget build(BuildContext context) {
    final c = conversation;
    return V5Frame(api: api, title: '商业订单专属会话', children: [
      tradeHeading('只谈这一笔合作', eyebrow: '原商业订单 / 明确参与人 / 独立客服'),
      appNotice('会话随原商业订单的核实收款和有效参与关系开放，不提供站外付款或自由私聊。'),
      V5RecoveryPanel(
          api: api,
          label: api.recoveryLabel,
          restore: api.restoreOperation,
          onRestored: (_) async {
            await latest();
            if (mounted) setState(() => messageForm++);
          }),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!, icon: Icons.error_outline),
      if (c != null) ...[
        tradeSection(commercialConversationStates[c.status]!, [
          tradeFact(
              '客服申请', c.raw['support_requested'] == true ? '已请求加入' : '尚未请求'),
          tradeFact('客服实际参与',
              c.raw['support_joined'] == true ? '独立客服已明确加入' : '当前未加入'),
          appNotice(c.writable
              ? '当前可写入本单内容，联系卡须另行明确同意。'
              : '已暂停继续写入和联系卡读取；保留本单历史。独立客服在网页办理冻结、恢复、归档或隐藏。')
        ]),
        for (final m in rows) ...message(m, c),
        if (rows.isEmpty && !busy) appNotice('本单当前没有可读取的消息。'),
        if (cursor != null)
          tradeButton('继续读取后续本单消息', busy ? null : () => load(more: true),
              outline: true),
        if (rows.isNotEmpty)
          V5Form(
              key: ValueKey('read:${rows.last.id}'),
              api: api,
              title: '只记本人阅读',
              action: '将本页最后一条标记为本人已读',
              suffix: '${api.conversation}/read',
              fields: const [],
              buildBody: (_) => {'message_id': rows.last.id},
              parse: (d) {
                api.validate(d, c, 'read');
                v5Require(d['read_until'] == rows.last.id);
              },
              reload: latest,
              onSuccess: (_) => latest()),
        _messageForm(c),
        _contactForm(c),
        if (c.writable)
          tradeButton('明确读取当前获准联系卡', busy ? null : readContacts, outline: true),
        if (contacts != null && c.writable)
          tradeSection('本单获准联系卡', [
            for (final entry in v5Map(contacts!['contacts']).entries) ...[
              tradeFact(
                  entry.key == widget.session.partyId ? '本方联系人' : '本单参与方联系人',
                  entry.value['name']),
              tradeFact('已明确开放联系电话', entry.value['phone'])
            ],
            if (v5Map(contacts!['contacts']).isEmpty) appNotice('当前无人开放本单联系卡。')
          ]),
        V5Form(
            key: ValueKey('support:${c.id}'),
            api: api,
            title: '请求独立客服',
            action: '请求平台客服加入本单',
            suffix: '${api.conversation}/control',
            version: c.version,
            canSubmit: c.raw['support_requested'] != true,
            fields: const [V5Field('reason', '需要客服协助的本单问题', type: 'multiline')],
            buildBody: (v) =>
                {'action': 'REQUEST_SUPPORT', 'reason': v['reason']},
            parse: (d) => api.validate(d, c, 'control'),
            reload: latest,
            onSuccess: (_) => latest()),
      ],
      tradeButton('按实际权限重新读取本单', busy ? null : () => load(), outline: true),
      tradeButton(
          '返回原商业订单', () => go('/trade/record?recordId=${widget.orderId}'),
          outline: true),
    ]);
  }

  Widget _messageForm(CommercialConversation c) {
    final assets = {
      for (final m in rows.where((m) =>
          !m.hidden &&
          m.kind == 'MEDIA' &&
          m.raw['owner_party_id'] == widget.session.partyId))
        m.data['asset']['id'] as String: '本方原附件 · ${tradeDate(m.data['at'])}',
      for (final id in uploadedIds) id: '本次负责人实际上传的附件'
    };
    final pending = api.pending('${api.conversation}/messages');
    if (pending?['body']?['kind'] == 'MEDIA') {
      assets.putIfAbsent(pending!['body']['asset_id'], () => '原请求附件引用（同键核对）');
    }
    return V5Form(
        key: ValueKey('message:${c.id}:$messageForm'),
        api: api,
        title: '本单消息',
        action: '发送本单商业消息',
        suffix: '${api.conversation}/messages',
        canSubmit: c.writable,
        fields: [
          const V5Field('kind', '本次消息类型', choices: {
            'TEXT': '本单文字',
            'ORDER_CARD': '原订单卡',
            'MEDIA': '本单私有附件'
          }),
          const V5Field('body', '仅本单业务文字（附件或订单卡可留空）',
              type: 'multiline', required: false),
          V5Field('asset_id', '引用本方原已发送附件（无可留空）',
              required: false, choices: assets)
        ],
        buildBody: (v) {
          if (v['kind'] == 'TEXT' && '${v['body'] ?? ''}'.trim().isEmpty) {
            throw const AccountError(400, 'INVALID_MESSAGE');
          }
          if (v['kind'] == 'MEDIA' && !assets.containsKey(v['asset_id'])) {
            throw const AccountError(400, 'PRIVATE_MATERIAL_NOT_READY');
          }
          return {
            'kind': v['kind'],
            'body': v['kind'] == 'TEXT' ? v['body'] : null,
            'asset_id': v['kind'] == 'MEDIA' ? v['asset_id'] : null
          };
        },
        parse: (d) => api.validate(d, c, 'messages'),
        reload: latest,
        onSuccess: (_) async {
          await latest();
          if (mounted) {
            setState(() {
              messageForm++;
              uploadedIds.clear();
            });
          }
        },
        extra: (v, set, enabled) => [
              if (widget.session.isOwner)
                tradeSection('本次负责人私有附件', [
                  appNotice('只在选择“本单私有附件”时发送本栏引用；上传本身不会自动发消息。'),
                  SupplyFiles(
                      api: SupplyApi(widget.session),
                      purpose: 'WORK_CONTENT',
                      ids: uploadedIds.contains(v['asset_id'])
                          ? [v['asset_id']]
                          : [],
                      single: true,
                      enabled: enabled && c.writable,
                      onChanged: (ids) {
                        setState(() => uploadedIds.addAll(ids));
                        set('asset_id', ids.firstOrNull);
                      })
                ])
              else
                appNotice('获授权成员可发送本单文字、订单卡与本方原已发送附件。新增私人文件请由负责人上传。')
            ]);
  }

  Widget _contactForm(CommercialConversation c) => V5Form(
      key: ValueKey('contact:${c.id}'),
      api: api,
      title: '本单联系卡单独同意',
      action: '确认本单联系卡选择',
      suffix: '${api.conversation}/contact',
      version: c.version,
      canSubmit: c.writable,
      fields: const [
        V5Field('choice', '本次联系卡选择',
            choices: {'GRANT': '明确开放本单联系卡', 'REVOKE': '明确撤回本单联系卡'}),
        V5Field('name', '本次实际联系人姓名'),
        V5Field('phone', '本次联系电话（撤回可留空）', required: false)
      ],
      restore: (b) =>
          {...b, 'choice': b['consent'] == true ? 'GRANT' : 'REVOKE'},
      buildBody: (v) {
        final grant = v['choice'] == 'GRANT';
        if (grant && !RegExp(r'^1[3-9]\d{9}$').hasMatch('${v['phone']}')) {
          throw const AccountError(400, 'CONTACT_CONSENT_REQUIRED');
        }
        return {
          'name': v['name'],
          'phone': grant ? v['phone'] : null,
          'consent': grant
        };
      },
      parse: (d) => api.validate(d, c, 'contact'),
      reload: latest,
      onSuccess: (_) => latest());
}
