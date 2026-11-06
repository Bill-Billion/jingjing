import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/app_visual.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../engagement/community_support.dart';
import '../trade/trade_widgets.dart';
import 'invite_models.dart';
import 'invite_pending.dart';

/// Keeps credentials out of routes, generic business results and feedback.
class CocreationInvitePanel extends StatefulWidget {
  const CocreationInvitePanel(
      {super.key, required this.session, this.room, this.version});
  final AccountSession session;
  final String? room;
  final int? version;
  bool get host => room != null;
  @override
  State<CocreationInvitePanel> createState() => _CocreationInvitePanelState();
}

class _CocreationInvitePanelState extends State<CocreationInvitePanel> {
  late final int epoch;
  final input = TextEditingController();
  CommunityApi get api => CommunityApi(widget.session, 'cocreation');
  bool busy = false, recoveryBlocked = false;
  String? secret, selected, joinedRoom, error, notice;
  List<Map<String, dynamic>> links = [];
  List<ArtistPerson> people = [];
  InvitePending? recovery;
  bool get recoveryHere =>
      recovery != null &&
      (widget.host
          ? recovery!.kind != 'claim' && recovery!.room == widget.room
          : recovery!.kind == 'claim');
  bool get personal =>
      widget.session.isLoggedIn &&
      widget.session.party?['kind'] == 'PERSON' &&
      widget.session.isOwner;

  @override
  void initState() {
    super.initState();
    epoch = widget.session.epoch;
    widget.session.addListener(changed);
    load();
  }

  @override
  void dispose() {
    widget.session.removeListener(changed);
    secret = null;
    input.dispose();
    super.dispose();
  }

  void changed() {
    if (widget.session.epoch == epoch) return;
    secret = null;
    input.clear();
    links = [];
    people = [];
    final old = recovery;
    recovery = null;
    if (old != null) unawaited(old.clear().catchError((_) {}));
    joinedRoom = null;
    if (mounted) setState(() {});
  }

  bool get current => mounted && widget.session.epoch == epoch;
  String linkStatus(Map<String, dynamic> link) {
    if (link['current_status'] == 'CLAIMED') return '已领取';
    if (link['current_status'] == 'REVOKED') return '已撤销';
    final expires = DateTime.tryParse(link['expires_at'] as String);
    return expires != null && !expires.isAfter(DateTime.now()) ? '已到期' : '待领取';
  }

  String message(Object e) {
    if (e is AccountError) {
      if (e.code == 'COCREATION_INVITE_LINK_UNAVAILABLE') {
        return '邀请已失效、到期、撤销或被领取，请联系发起人重新邀请。';
      }
      if (e.code == 'COCREATION_INVITE_LINK_LIMIT') return '本房间已达到邀请数量上限。';
      if (e.code == 'COCREATION_ENROLLMENT_CLOSED') return '房间已停止招募，不能继续邀请或领取。';
      if (e.status == 412) return '记录已变化，请刷新房间或邀请状态并重新确认。';
      if ([401, 403, 404].contains(e.status)) return '当前身份无权访问，请重新核对账号与办理身份。';
      if ([
        'ARTIST_IDENTITY_REQUIRED',
        'ARTIST_AGE_REQUIRED',
        'MINOR_OPERATION_RESTRICTED'
      ].contains(e.code)) {
        return '请使用本人当前有效的成年人实名档案。';
      }
      if (e.uncertain) return '结果尚未确认，请保持当前身份并恢复同一次请求。';
    }
    return '本次操作未完成，请核对状态后重试。';
  }

  Future<void> findRecovery() async {
    final op = await InvitePending.read();
    if (!current) return;
    if (op != null &&
        (op.account != widget.session.account?['id'] ||
            op.party != widget.session.partyId)) {
      await op.clear();
      if (current) recovery = null;
      return;
    }
    recovery = op;
  }

  Future<void> load() async {
    if (busy || !current) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await findRecovery();
      recoveryBlocked = false;
      if (!current) return;
      if (widget.host) {
        final value = await api.read('rooms/${widget.room}/invite-links');
        final rows = communityItems(value);
        communityRequire(rows.length <= 100);
        final result =
            rows.map((r) => cocreationInviteLink(r, widget.room!)).toList();
        if (current) links = result;
      } else if (personal) {
        final out = <ArtistPerson>[], seen = <String>{};
        String? cursor;
        do {
          final page = await ArtistsApi(widget.session).people(cursor: cursor);
          out.addAll(page.items);
          cursor = page.cursor;
          communityRequire(cursor == null || seen.add(cursor));
        } while (cursor != null);
        if (current) {
          people = out
              .where(
                  (p) => p.owner == widget.session.partyId && p.adultVerified)
              .toList();
        }
      }
    } catch (e) {
      if (current) {
        if (e is StateError) recoveryBlocked = true;
        error =
            recoveryBlocked ? '无法核对本机原请求，请联系平台处理；为避免重复暂不能新建邀请。' : message(e);
        if (e is AccountError && [401, 403, 404].contains(e.status)) {
          secret = null;
          input.clear();
          links = [];
          people = [];
        }
      }
    } finally {
      if (current) setState(() => busy = false);
    }
  }

  Future<void> operate(String path, Map<String, dynamic> body,
      {int? version, InvitePending? original}) async {
    if (busy || recoveryBlocked || !current) return;
    final account = widget.session.account?['id'],
        party = widget.session.partyId;
    if (!communityId(account) || !communityId(party)) return;
    final kind = path.startsWith('rooms/')
        ? 'create'
        : path.endsWith('/revoke')
            ? 'revoke'
            : 'claim';
    final token = body['token'] as String?;
    final op = original ??
        InvitePending(
            kind: kind,
            account: account,
            party: party!,
            key: InvitePending.newKey(),
            path: path,
            room: kind == 'claim' ? null : widget.room,
            version: version,
            person: kind == 'claim' ? body['person_id'] as String? : null,
            digest: token == null ? null : InvitePending.hashToken(token));
    if (InvitePending.parse(op.toJson()) == null ||
        op.account != account ||
        op.party != party) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
      notice = null;
      if (kind != 'claim' && original == null) secret = null;
      recovery = op;
    });
    var stored = false;
    try {
      await op.save();
      stored = true;
      if (!current) {
        try {
          await op.clear();
        } catch (_) {}
        return;
      }
      final result = await api.write(path, body,
          version: op.version, operationKey: op.key, validate: (v) {
        if (kind == 'create') {
          cocreationInviteLink(v, op.room!, created: true);
        } else if (kind == 'revoke') {
          final checked =
              cocreationInviteLink(v, op.room!, expectedId: path.split('/')[1]);
          communityRequire(checked['current_status'] == 'REVOKED');
        } else {
          cocreationInviteClaim(v, op.person!);
        }
      });
      if (!current) {
        try {
          await op.clear();
        } catch (_) {}
        return;
      }
      await op.clear();
      if (!current) return;
      if (kind == 'create') {
        secret = result['token'];
        notice = '邀请已生成，请只转给指定的人；误发可在领取前撤销。';
      } else if (kind == 'revoke') {
        secret = null;
        notice = '邀请已撤销。';
      } else {
        input.clear();
        joinedRoom = result['room_id'];
        notice = '已领取邀请。请本人进入房间填写参加资料并单独确认授权；领取不代表已参加。';
      }
      recovery = null;
    } catch (e) {
      if (!current) {
        try {
          await op.clear();
        } catch (_) {}
        return;
      }
      if (!stored || e is AccountError && !e.uncertain) {
        try {
          await op.clear();
          recovery = null;
        } catch (_) {
          // A failed local deletion must not permit a new key after dispatch.
          recovery = op;
        }
      }
      if (e is AccountError && [401, 403, 404].contains(e.status)) {
        secret = null;
        input.clear();
        people = [];
        links = [];
      }
      error = !stored
          ? '无法保存本次恢复记录，尚未发送请求；请稍后重试。'
          : e is AccountError
              ? message(e)
              : '本地恢复记录暂时无法更新，请保持原身份重试同一次请求。';
    } finally {
      if (current) {
        setState(() => busy = false);
        if (widget.host && recovery == null) await load();
      }
    }
  }

  void retry() {
    final op = recovery;
    if (op == null || !recoveryHere) return;
    if (op.kind == 'claim') {
      final token = parseCocreationInvite(input.text);
      if (token == null ||
          InvitePending.hashToken(token) != op.digest ||
          selected != op.person ||
          !people.any((p) => p.id == op.person && p.adultVerified)) {
        setState(() => error = '请重新粘贴原邀请并选择原本人档案，再恢复同一次领取。');
        return;
      }
      operate(op.path, {'token': token, 'person_id': op.person}, original: op);
    } else {
      operate(op.path, {}, version: op.version, original: op);
    }
  }

  @override
  Widget build(BuildContext context) =>
      communitySection(widget.host ? '邀请家人或朋友' : '领取家人或朋友的邀请', [
        const Text('邀请不绑定手机号，持有者满足条件即可领取一次；请只转给指定的人。领取不等于本人参加或授权。'),
        if (error != null) appNotice(error!),
        if (notice != null) appNotice(notice!),
        if (recovery != null) ...[
          appNotice('上次操作结果尚未确认，请在原账号和身份下恢复同一次请求。重新打开后领取需再次粘贴原邀请并选择本人。'),
          if (recoveryHere)
            tradeButton('恢复同一次请求', busy || recoveryBlocked ? null : retry,
                outline: true)
          else
            tradeButton(
                '返回原邀请处理',
                busy
                    ? null
                    : () => Navigator.pushNamed(
                        context,
                        recovery!.kind == 'claim'
                            ? '/cocreation?view=claim'
                            : '/cocreation?view=room&recordId=${recovery!.room}'),
                outline: true),
        ],
        if (widget.host) ...[
          const Text('邀请最多保留24小时，且不会晚于房间截止时间；未领取前可撤销。'),
          tradeButton(
              '生成一次邀请',
              busy ||
                      recoveryBlocked ||
                      recovery != null ||
                      widget.version == null
                  ? null
                  : () => operate('rooms/${widget.room}/invite-links', {},
                      version: widget.version)),
          if (secret != null) ...[
            const Text('请勿把邀请放入反馈、截图或公开位置。'),
            tradeButton(
                '复制邀请凭证',
                busy
                    ? null
                    : () async {
                        await Clipboard.setData(ClipboardData(text: secret!));
                        if (current) {
                          setState(() => notice =
                              '已复制邀请凭证，请只发送给指定的人。对方可在App或网页的收到邀请入口粘贴。');
                        }
                      },
                outline: true),
          ],
          for (final link in links) ...[
            communityFact('邀请状态',
                '${linkStatus(link)} · 截止 ${communityDate(link['expires_at'])}'),
            if (link['current_status'] == 'ACTIVE')
              tradeButton(
                  '撤销未领邀请',
                  busy || recoveryBlocked || recovery != null
                      ? null
                      : () => operate('invite-links/${link['id']}/revoke', {},
                          version: link['object_version']),
                  outline: true),
          ],
          tradeButton('刷新邀请状态', busy ? null : load, outline: true),
        ] else ...[
          const Text('请先选择本人个人身份，再选择本人有效的成年人实名档案。没有档案时请先创建并完成实名核验。'),
          tradeButton('创建本人档案', () => Navigator.pushNamed(context, '/artists'),
              outline: true),
          TextField(
              controller: input,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              decoration: const InputDecoration(
                  labelText: '邀请链接或凭证', hintText: '粘贴发起人发送的邀请'),
              enabled: !busy),
          communitySelect(
              '本人档案',
              selected ?? '',
              [for (final p in people) (p.id, p.name)],
              !busy && personal ? (v) => setState(() => selected = v) : null),
          tradeButton('刷新本人档案', busy || !personal ? null : load, outline: true),
          tradeButton(
              '确认领取邀请',
              busy ||
                      recoveryBlocked ||
                      recovery != null ||
                      !personal ||
                      selected == null
                  ? null
                  : () {
                      final token = parseCocreationInvite(input.text),
                          person = selected;
                      if (token == null ||
                          person == null ||
                          !people
                              .any((p) => p.id == person && p.adultVerified)) {
                        setState(() => error = '请粘贴有效邀请并选择本人有效的成年人档案。');
                        return;
                      }
                      operate('invite-links/claim',
                          {'token': token, 'person_id': person});
                    }),
          if (joinedRoom != null)
            tradeButton(
                '进入同一房间并填写我的参加资料',
                () => Navigator.pushNamed(
                    context, '/cocreation?view=room&recordId=$joinedRoom'),
                outline: true),
        ]
      ]);
}
