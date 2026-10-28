import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../trade/trade_widgets.dart';
import 'operation_api.dart';
import 'operation_models.dart';

/// The message tab reads real notifications. A partial page is never presented
/// as an unread total, and opening a card does not implicitly mark it read.
class NotificationPreview extends StatefulWidget {
  const NotificationPreview({super.key, required this.session});
  final AccountSession session;
  @override
  State<NotificationPreview> createState() => _NotificationPreviewState();
}

class _NotificationPreviewState extends State<NotificationPreview> {
  List<OperationNotice> rows = [];
  bool busy = false;
  String? error;
  int ticket = 0;

  bool get eligible =>
      widget.session.isLoggedIn &&
      widget.session.partyId != null &&
      !widget.session.operationsAccessDenied;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(NotificationPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) load();
  }

  Future<void> load() async {
    final current = ++ticket;
    if (!eligible) {
      setState(() {
        rows = [];
        error = null;
        busy = false;
      });
      return;
    }
    setState(() {
      rows = [];
      busy = true;
      error = null;
    });
    try {
      final page = await OperationApi(widget.session).notices();
      if (!mounted || current != ticket) return;
      setState(() => rows = page.items.take(5).toList());
    } on AccountError catch (e) {
      if (mounted && current == ticket) {
        setState(() => error = operationError(e));
      }
    } catch (_) {
      if (mounted && current == ticket) {
        setState(() => error = '通知暂时未能读取，请刷新重试。');
      }
    } finally {
      if (mounted && current == ticket) setState(() => busy = false);
    }
  }

  Future<void> open(String route) async {
    await Navigator.pushNamed(context, route);
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(
              child: Text('最近业务通知',
                  style: TextStyle(
                      fontFamily: AccountTheme.serif,
                      fontSize: 20,
                      fontWeight: FontWeight.w700))),
          if (eligible)
            IconButton(
                tooltip: '刷新通知',
                onPressed: busy ? null : load,
                icon: const Icon(Icons.refresh)),
        ]),
        if (!eligible)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('登录并选择办事身份后，查看此身份的业务通知。')),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(error!,
                  style: const TextStyle(color: AccountTheme.danger))),
        if (eligible && !busy && error == null && rows.isEmpty)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('当前身份暂无业务通知。')),
        for (final row in rows)
          ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                  row.read
                      ? Icons.mark_email_read_outlined
                      : Icons.mark_email_unread_outlined,
                  color: row.read ? AccountTheme.muted : AccountTheme.accent),
              title: Text(operationEvent(row.code)),
              subtitle: Text('${operationDomains[row.domain]} · '
                  '记录 ${row.recordId.substring(0, 8)} · '
                  '${row.read ? '已读' : '未读'}\n${tradeDate(row.createdAt)}'),
              isThreeLine: true,
              trailing: const Icon(Icons.chevron_right),
              onTap: () => open('/operations/notification?eventId=${row.id}')),
        if (eligible)
          TextButton(
              onPressed: () => open('/operations/notifications'),
              child: const Text('查看全部通知与未读筛选')),
        const SizedBox(height: 16),
      ]);

  @override
  void dispose() {
    ticket++;
    rows = [];
    super.dispose();
  }
}
