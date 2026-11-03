import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'account_session.dart';
import 'account_theme.dart';
import 'rest_usage.dart';

class RestReminder extends StatefulWidget {
  const RestReminder({super.key, required this.child});
  final Widget child;
  @override
  State<RestReminder> createState() => _RestReminderState();
}

class _RestReminderState extends State<RestReminder>
    with WidgetsBindingObserver {
  RestUsageController? controller;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    controller ??= RestUsageController(context.read<AccountSession>())
      ..setVisible(WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      controller?.setVisible(state == AppLifecycleState.resumed);
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<RestUsageController>.value(
          value: controller!,
          child: Consumer<RestUsageController>(
              builder: (_, c, child) => Column(children: [
                    Expanded(child: child!),
                    if (c.data?.due == true ||
                        c.pending != null ||
                        c.nightVisible)
                      Material(
                          color: AccountTheme.canvas,
                          child: SafeArea(
                              top: false,
                              child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (c.nightVisible) ...[
                                          const Text(
                                              '已到你设置的夜间时段，建议适时休息。提醒不强迫退出。'),
                                          TextButton(
                                              onPressed: c.dismissNight,
                                              child: const Text('本日夜间提示已读'))
                                        ],
                                        if (c.data?.due == true)
                                          const Text('已连续使用一段时间，建议休息。'),
                                        if (c.error != null) Text(c.error!),
                                        if (c.data?.due == true ||
                                            c.pending != null)
                                          TextButton(
                                              onPressed: c.busy
                                                  ? null
                                                  : () => c.acknowledge(
                                                      recover:
                                                          c.pending != null),
                                              child: Text(c.pending != null
                                                  ? '恢复同一次提醒确认'
                                                  : '知道了'))
                                      ]))))
                  ]),
              child: widget.child));
}

class RestUsageSummary extends StatelessWidget {
  const RestUsageSummary({super.key});
  @override
  Widget build(BuildContext context) {
    final c = context.watch<RestUsageController?>(), d = c?.data;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 16),
      const Text('使用时长估计', style: TextStyle(fontWeight: FontWeight.bold)),
      if (d != null)
        Text(d.enabled
            ? '今天约 ${d.duration('day_seconds')}；连续约 ${d.duration('reminder_seconds')}'
            : '定时休息已关闭，不报告使用状态。'),
      if (c?.error != null) Text(c!.error!),
      const Text('依据前台心跳估算，并非精确屏幕时长。短于90秒的离开或网络延迟可能计入；后台不补发。提醒不阻止必要业务办理。'),
      TextButton(
          onPressed: c == null || c.busy ? null : c.refresh,
          child: const Text('刷新本人统计')),
    ]);
  }
}
