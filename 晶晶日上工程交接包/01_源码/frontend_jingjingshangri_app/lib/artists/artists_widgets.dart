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
                s.isOwner &&
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
          : '登录并选择有效负责人身份后办理。机构仅可管理本人已明确委托的事项。'),
      FilledButton(
          onPressed: () => Navigator.pushNamed(context,
              s.isLoggedIn ? '/account' : '/login?returnRoute=%2Fmy-humans'),
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
    Material(
        color: AccountTheme.canvas,
        child: InkWell(
            key: key,
            onTap: onTap,
            child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: const BoxDecoration(
                    border:
                        Border(bottom: BorderSide(color: AccountTheme.border))),
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
                      const Icon(Icons.north_east, size: 18),
                    ]))));
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

/// The full-width archive cover and black identity strip from screens 34/36.
/// A private material is never selected as a portrait without a cover contract.
Widget artistIdentityCover(String name, String subtitle,
        {VoidCallback? onTap, Key? key, String imageLabel = '未提供本人肖像封面'}) =>
    Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Material(
          color: AccountTheme.text,
          child: InkWell(
              key: key,
              onTap: onTap,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AspectRatio(
                        aspectRatio: 350 / 216,
                        child: ColoredBox(
                            color: const Color(0xFFE7E4DA),
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
                                            color: AccountTheme.canvas)),
                                    const SizedBox(height: 8),
                                    Text(subtitle,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            height: 1.6,
                                            color: AccountTheme.canvas)),
                                  ])),
                              if (onTap != null)
                                const Padding(
                                    padding: EdgeInsets.only(left: 12),
                                    child: Icon(Icons.north_east,
                                        size: 18, color: AccountTheme.canvas)),
                            ])),
                  ])),
        ));
