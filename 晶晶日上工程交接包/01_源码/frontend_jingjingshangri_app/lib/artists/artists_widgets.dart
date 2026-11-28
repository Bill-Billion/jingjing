import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../account/read_failure_widgets.dart';
import '../trade/trade_widgets.dart';
import 'artists_models.dart';

class ArtistsGate extends StatelessWidget {
  const ArtistsGate(
      {super.key,
      required this.builder,
      this.accountOnly = false,
      this.showExpired = false,
      this.returnRoute = '/my-humans'});
  final Widget Function(AccountSession) builder;
  final bool accountOnly, showExpired;
  final String returnRoute;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AccountSession>();
    final valid = s.isLoggedIn &&
        !s.artistsAccessDenied &&
        (accountOnly ||
            s.partyId != null &&
                (s.isOwner || s.party?['kind'] == 'ORGANIZATION') &&
                s.selected?['membership']?['current_status'] == 'ACTIVE' &&
                !['SUSPENDED', 'CLOSED'].contains(s.party?['current_status']));
    if (valid) {
      return KeyedSubtree(
          key: ValueKey('artists:${s.epoch}:${s.account?['id']}:${s.partyId}'),
          child: builder(s));
    }
    if (showExpired && readSessionExpired(s)) {
      return ReadSessionExpiredPage(returnRoute: returnRoute, label: '公开艺人目录');
    }
    if (s.artistsAccessDenied) {
      return ReadAccessDeniedPage(
          reason: '当前账号暂时无法读取这页，私有内容已清空。请核对账号、当前身份和有效委托。',
          onRetry: () async {
            try {
              await s.retryArtistsAccess();
            } catch (_) {}
          });
    }
    return tradeScaffold(context, '艺人与数字人', [
      tradeHeading(s.artistsAccessDenied ? '先核对查看权限' : '从你的本人档案开始',
          eyebrow: '艺人档案 / 本人所有'),
      appNotice(s.artistsAccessDenied
          ? '当前账号无法查看这份资料，私有内容已清空。请核对账号、当前身份和有效委托。'
          : '登录并选择有效本人或机构成员身份后办理。机构员工仅可管理本人委托且分配给自己的事项。'),
      FilledButton(
          onPressed: () => Navigator.pushNamed(
              context,
              s.isLoggedIn
                  ? '/account'
                  : Uri(
                          path: '/login',
                          queryParameters: {'returnRoute': returnRoute})
                      .toString()),
          child: const Text('前往账号与身份')),
      if (s.artistsAccessDenied)
        OutlinedButton(
            onPressed: () async {
              try {
                await s.retryArtistsAccess();
              } catch (_) {}
            },
            child: const Text('重新核对艺人访问权限')),
    ]);
  }
}

Widget artistRow(String title, String description, VoidCallback? onTap,
        {String? status, Key? key}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
        color: AccountTheme.surface,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            key: key,
            onTap: onTap,
            child: Container(
                padding: const EdgeInsets.all(18),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(title,
                                style: const TextStyle(
                                    fontSize: 19,
                                    fontFamily: AccountTheme.serif,
                                    fontWeight: FontWeight.w700)),
                            const SizedBox(height: 7),
                            Text(description,
                                style: const TextStyle(
                                    fontSize: 12,
                                    height: 1.6,
                                    color: AccountTheme.muted)),
                            if (status != null)
                              Padding(
                                  padding: const EdgeInsets.only(top: 5),
                                  child: Text(status,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: AccountTheme.accent)))
                          ])),
                      const SizedBox(width: 12),
                      const Icon(Icons.north_east, size: 18, color: AccountTheme.accent),
                    ])))));
String artistFormRoute(String mode,
        {String? personId, String? avatarId, String? recordId}) =>
    Uri(path: '/artists/form', queryParameters: {
      'mode': mode,
      if (personId != null) 'personId': personId,
      if (avatarId != null) 'avatarId': avatarId,
      if (recordId != null) 'recordId': recordId
    }).toString();
String artistPersonRoute(String id) => '/artists/person?personId=$id';
String artistRecordRoute(String person, String id) =>
    '/artists/record?personId=$person&recordId=$id';
String artistPendingRoute(Map<String, dynamic> pending) {
  final pieces = (pending['path'] as String).split('/');
  if (pieces.last == 'people') return artistFormRoute('PERSON');
  final person = pieces.length > 5 ? pieces[5] : null;
  const modes = {
    'avatars': 'AVATAR',
    'identity': 'IDENTITY',
    'consents': 'CONSENT',
    'delegations': 'DELEGATION',
    'variants': 'VARIANT',
    'halos': 'HALO',
    'listings': 'LISTING',
    'services': 'SERVICE',
    'withdrawals': 'WITHDRAW',
    'supplements': 'SUPPLEMENT',
    'appeals': 'APPEAL',
    'cancel': 'CANCEL',
    'reminder': 'REMINDER',
    'sync': 'SYNC'
  };
  final mode = modes[pieces.last] ?? 'PERSON';
  return artistFormRoute(mode,
      personId: person,
      recordId: pieces.contains('records') ||
              pieces.contains('services') && pieces.length > 7
          ? pieces[7]
          : null);
}

Widget artistPendingNotice(BuildContext context, AccountSession s) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final pending in s.artistsPending) ...[
        appNotice((pending['path'] as String).endsWith('/assets')
            ? '有一份私有文件的存储结果待核对，请返回原资料页恢复同一文件。'
            : '上次艺人操作结果待核对，原内容和请求编号已保留。'),
        if (!(pending['path'] as String).endsWith('/assets'))
          OutlinedButton(
              onPressed: () =>
                  Navigator.pushNamed(context, artistPendingRoute(pending)),
              child: const Text('返回原操作并核对结果')),
      ],
    ]);
String artistNames(dynamic values, Map<String, String> names) =>
    artistStrings(values).map((v) => names[v] ?? v).join('、');

Widget artistEditorScaffold(String title, List<Widget> children,
        {required VoidCallback onBack, required Widget footer}) =>
    AccountTheme(
        child: Scaffold(
      appBar:
          AppBar(title: Text(title), leading: BackButton(onPressed: onBack)),
      body: SafeArea(
          child: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: ListView(
                      padding: const EdgeInsets.fromLTRB(18, 20, 18, 24),
                      children: children)))),
      bottomNavigationBar: DecoratedBox(
          decoration: const BoxDecoration(
              color: AccountTheme.canvas,
              border: Border(top: BorderSide(color: AccountTheme.border))),
          child: SafeArea(
              top: false,
              child: Center(
                  heightFactor: 1,
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: Padding(
                          padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
                          child: SizedBox(
                              width: double.infinity, child: footer)))))),
    ));

/// V5 identity card; an absent verified portrait stays an honest placeholder.
/// A private material is never selected as a portrait without a cover contract.
Widget artistIdentityCover(String name, String subtitle,
        {VoidCallback? onTap, Key? key, String imageLabel = '未提供本人肖像封面'}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Material(
          color: AccountTheme.surface,
          borderRadius: BorderRadius.circular(24),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
              key: key,
              onTap: onTap,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AspectRatio(
                        aspectRatio: 350 / 216,
                        child: ColoredBox(
                            color: AccountTheme.selectedSurface,
                            child: Center(
                                child: Padding(
                                    padding: const EdgeInsets.all(20),
                                    child: Text(imageLabel,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            height: 1.6,
                                            color: AccountTheme.muted)))))),
                    Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(name,
                                        style: const TextStyle(
                                            fontFamily: AccountTheme.serif,
                                            fontSize: 24,
                                            height: 1.25,
                                            fontWeight: FontWeight.w700,
                                            color: AccountTheme.text)),
                                    const SizedBox(height: 8),
                                    Text(subtitle,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            height: 1.6,
                                            color: AccountTheme.text)),
                                  ])),
                              if (onTap != null)
                                const Padding(
                                    padding: EdgeInsets.only(left: 12),
                                    child: Icon(Icons.north_east,
                                        size: 18, color: AccountTheme.text)),
                            ])),
                  ])),
        ));

/// Use only the record status read from the server; this does not grant access.
Widget artistNextStep(ArtistRecord record) {
  final message = switch (record.status) {
    'PENDING' || 'UNKNOWN' => '请核对原核验记录，结果未确定前不要重复提交或按已通过办理。',
    'SUBMITTED' => '等待独立审核；可查看本版材料与审核记录，提交不代表已公开或已授权。',
    'NEEDS_MATERIAL' || 'REJECTED' => '先阅读审核原因，再按原记录补充或修改材料；不要重复建立相同申请。',
    'REQUESTED' => '查看本次服务报价与付款记录，申请受理不代表服务交付。',
    'REFUND_REQUIRED' => '请跟进原订单的退款结果，待退款不代表资金已经到账。',
    'WITHDRAWN' || 'CANCELLED' => '原记录保留供核对，不能继续把该记录当作有效授权使用。',
    _ => '按下方当前记录、用途和期限办理；实名、本人同意、委托和公开展示各自独立核验。',
  };
  return tradeSection('接下来', [
    Text(message, style: const TextStyle(fontSize: 14, height: 1.6)),
  ]);
}
