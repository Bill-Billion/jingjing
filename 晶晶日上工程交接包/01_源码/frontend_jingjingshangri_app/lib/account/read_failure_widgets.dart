import 'package:flutter/material.dart';
import '../pages/login/login_page.dart';
import '../trade/trade_widgets.dart';
import 'account_session.dart';
import 'account_theme.dart';

bool readSessionExpired(AccountSession session) =>
    !session.isLoggedIn && session.authNotice == '登录已失效，请重新验证手机号。';

Widget _stateHeading(String eyebrow, String title) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 20),
      Text(eyebrow,
          style: const TextStyle(
              color: AccountTheme.vermilion, fontSize: 14, height: 1.5)),
      const SizedBox(height: 24),
      Semantics(
          header: true,
          child: Text(title,
              style: const TextStyle(
                  fontFamily: AccountTheme.serif,
                  fontWeight: FontWeight.w900,
                  fontSize: 36,
                  height: 1.3))),
      const SizedBox(height: 24),
    ]);

Widget _statePanel(String title, String body, {bool dark = false}) => Container(
    color: dark ? AccountTheme.text : const Color(0xFFE7E4DA),
    padding: const EdgeInsets.all(16),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title,
          style: TextStyle(
              color: dark ? AccountTheme.canvas : AccountTheme.text,
              fontWeight: FontWeight.w700,
              fontSize: 16,
              height: 1.5)),
      const SizedBox(height: 12),
      Text(body,
          style: TextStyle(
              color: dark ? AccountTheme.canvas : AccountTheme.text,
              fontSize: 14,
              height: 1.5)),
    ]));

class ReadAccessDeniedPage extends StatelessWidget {
  const ReadAccessDeniedPage(
      {super.key, required this.reason, required this.onRetry});
  final String reason;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => tradeScaffold(
      context,
      '内容权限',
      [
        _stateHeading('内容权限', '当前无法\n读取这页'),
        _statePanel('当前无法读取', reason, dark: true),
        const SizedBox(height: 24),
        const Text('请核对当前账号、办事身份和有效权限。重新核对不会自动继续原操作。',
            style: TextStyle(
                fontSize: 14, height: 1.6, color: AccountTheme.muted)),
      ],
      footer: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            flex: 4,
            child: OutlinedButton(
                key: const ValueKey('read-denied-back'),
                onPressed: () => Navigator.canPop(context)
                    ? Navigator.pop(context)
                    : Navigator.pushReplacementNamed(context, '/my'),
                child: const Text('返回上一页', textAlign: TextAlign.center))),
        const SizedBox(width: 10),
        Expanded(
            flex: 6,
            child: FilledButton(
                key: const ValueKey('read-denied-retry'),
                onPressed: onRetry,
                child: const Text('重新核对权限', textAlign: TextAlign.center))),
      ]));
}

class ReadLoadingContent extends StatelessWidget {
  const ReadLoadingContent({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _stateHeading(label, '正在读取进度'),
        _statePanel('正在加载', '请稍候，正在读取本页可查看的最新信息。'),
        const SizedBox(height: 24),
        const Text('获取本页信息',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        const LinearProgressIndicator(
            color: AccountTheme.vermilion,
            backgroundColor: Color(0xFFE7E4DA),
            minHeight: 4),
        const SizedBox(height: 12),
        const Text('加载中…',
            style: TextStyle(fontSize: 14, color: AccountTheme.muted)),
        for (final text in ['本页内容', '可查看记录', '当前条件'])
          Container(
              padding: const EdgeInsets.symmetric(vertical: 24),
              decoration: const BoxDecoration(
                  border:
                      Border(bottom: BorderSide(color: AccountTheme.border))),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(text, style: const TextStyle(fontSize: 16)),
                      const SizedBox(height: 8),
                      const Text('正在读取',
                          style: TextStyle(
                              fontSize: 14, color: AccountTheme.muted)),
                    ])),
                const Text('—'),
              ])),
      ]);
}

class ReadSessionExpiredPage extends StatelessWidget {
  const ReadSessionExpiredPage(
      {super.key,
      required this.returnRoute,
      required this.label,
      this.embedded = false});
  final String returnRoute, label;
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final content =
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _stateHeading('账号验证', '回来，\n继续这个故事'),
      _statePanel('登录状态已过期', '完成登录后，继续查看$label。私有内容已清空，不会自动继续原操作。'),
      const SizedBox(height: 24),
      Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AccountTheme.border))),
          child: Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  const Text('返回位置',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(label,
                      style: const TextStyle(
                          fontSize: 14, color: AccountTheme.muted)),
                ])),
            const SizedBox(width: 12),
            const Text('已保留'),
          ])),
    ]);
    final actions =
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
          flex: 4,
          child: OutlinedButton(
              key: const ValueKey('read-expired-browse'),
              onPressed: () => Navigator.canPop(context)
                  ? Navigator.pop(context)
                  : Navigator.pushReplacementNamed(context, '/home'),
              child: const Text('返回浏览', textAlign: TextAlign.center))),
      const SizedBox(width: 10),
      Expanded(
          flex: 6,
          child: FilledButton(
              key: const ValueKey('read-expired-login'),
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => LoginPage(returnRoute: returnRoute))),
              child: const Text('重新登录', textAlign: TextAlign.center))),
    ]);
    return embedded
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [content, const SizedBox(height: 24), actions])
        : tradeScaffold(context, '登录过期', [content], footer: actions);
  }
}

class ReadFailureContent extends StatelessWidget {
  const ReadFailureContent({super.key, required this.reason});
  final String reason;

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 20),
        const Text('本页读取未完成',
            style: TextStyle(
                color: AccountTheme.vermilion, fontSize: 14, height: 1.5)),
        const SizedBox(height: 24),
        Semantics(
            header: true,
            child: const Text('这页还没\n加载出来',
                style: TextStyle(
                    fontFamily: AccountTheme.serif,
                    fontWeight: FontWeight.w900,
                    fontSize: 36,
                    height: 1.3))),
        const SizedBox(height: 24),
        Container(
            color: const Color(0xFFE7E4DA),
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('暂时无法读取',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          height: 1.5)),
                  const SizedBox(height: 12),
                  Text(reason,
                      style: const TextStyle(fontSize: 14, height: 1.5)),
                ])),
        const SizedBox(height: 24),
        const Text('重新加载仅重新读取当前页面，保留本页筛选，不会再次提交业务或付款。',
            style: TextStyle(
                color: AccountTheme.muted, fontSize: 14, height: 1.6)),
        const SizedBox(height: 24),
      ]);
}

class ReadFailureActions extends StatelessWidget {
  const ReadFailureActions(
      {super.key, required this.onBack, required this.onRetry});
  final VoidCallback onBack, onRetry;

  @override
  Widget build(BuildContext context) =>
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            flex: 4,
            child: OutlinedButton(
                key: const ValueKey('read-failure-back'),
                onPressed: onBack,
                child: const Text('返回', textAlign: TextAlign.center))),
        const SizedBox(width: 10),
        Expanded(
            flex: 6,
            child: FilledButton(
                key: const ValueKey('read-failure-retry'),
                onPressed: onRetry,
                child: const Text('重新加载', textAlign: TextAlign.center))),
      ]);
}
