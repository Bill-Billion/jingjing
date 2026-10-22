import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'account_session.dart';

/// A foreground reminder based on the person's saved preference. No background
/// notification, device permission or business record is created by this timer.
class RestReminder extends StatefulWidget {
  const RestReminder({super.key, required this.child});
  final Widget child;
  @override
  State<RestReminder> createState() => _RestReminderState();
}

class _RestReminderState extends State<RestReminder>
    with WidgetsBindingObserver {
  Timer? timer;
  AccountSession? session;
  (String?, int, int?, bool)? contextKey;
  String? fetchedAccount;
  bool foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    session = context.watch<AccountSession>();
    final s = session!, account = s.account?['id'] as String?;
    final next = (
      account,
      s.epoch,
      s.restReminderMinutes,
      s.isDomainDenied('/api/v1/privacy/')
    );
    if (contextKey != next) {
      contextKey = next;
      arm();
    }
    if (account == null) {
      fetchedAccount = null;
    } else if (fetchedAccount != account) {
      fetchedAccount = account;
      if(s.restReminderMinutes == null) {
        WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted || session != s || s.account?['id'] != account) return;
        try {
          await s.read('/api/v1/privacy/preferences');
        } catch (_) {}
      });
      }
    }
  }

  void arm() {
    timer?.cancel();
    timer = null;
    final s = session, minutes = s?.restReminderMinutes;
    if (!foreground ||
        s == null ||
        !s.isLoggedIn ||
        minutes == null ||
        minutes == 0 ||
        s.isDomainDenied('/api/v1/privacy/')) {
      return;
    }
    final epoch = s.epoch, account = s.account?['id'];
    timer = Timer(Duration(minutes: minutes), () {
      if (!mounted ||
          !foreground ||
          s.epoch != epoch ||
          s.account?['id'] != account) {
        return;
      }
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
          content: Text('已连续使用 $minutes 分钟，起身休息一下吧。'),
          duration: const Duration(seconds: 6)));
      arm();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    arm();
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
