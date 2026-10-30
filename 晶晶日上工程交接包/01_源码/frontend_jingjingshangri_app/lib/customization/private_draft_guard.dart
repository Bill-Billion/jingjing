import 'dart:convert';
import 'package:flutter/material.dart';
import '../account/account_session.dart';

/// Protects in-memory private input without persisting it to shared storage.
class PrivateDraftGuard extends StatefulWidget {
  const PrivateDraftGuard({
    super.key,
    required this.session,
    required this.controllers,
    required this.value,
    required this.locked,
    required this.child,
  });

  final AccountSession session;
  final List<TextEditingController> controllers;
  final Object? Function() value;
  final bool locked;
  final Widget child;

  @override
  State<PrivateDraftGuard> createState() => PrivateDraftGuardState();
}

class PrivateDraftGuardState extends State<PrivateDraftGuard> {
  final _listening = <TextEditingController>{};
  late String _saved;
  bool _confirming = false;
  String get _snapshot => jsonEncode({
        'fields': [for (final c in widget.controllers) c.text],
        'choices': widget.value(),
      });
  bool get dirty => _saved != _snapshot;

  @override
  void initState() {
    super.initState();
    _saved = _snapshot;
    _listen();
  }

  void _listen() {
    for (final c in widget.controllers) {
      if (_listening.add(c)) c.addListener(_changed);
    }
  }

  @override
  void didUpdateWidget(covariant PrivateDraftGuard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _listen();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void markSaved() {
    if (mounted) setState(() => _saved = _snapshot);
  }

  Future<bool> confirmLeave() async {
    if (_confirming) return false;
    if (widget.locked) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('操作仍在处理或结果尚未确定，请先核对原请求。')));
      return false;
    }
    if (!dirty) return true;
    final identity = (
      widget.session.epoch,
      widget.session.account?['id'],
      widget.session.partyId
    );
    _confirming = true;
    final discard = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
              title: const Text('离开未提交的内容？'),
              content: const Text('本页填写尚未提交，离开后会丢失。可以返回继续填写。'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('继续填写')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('放弃并离开')),
              ],
            ));
    _confirming = false;
    return mounted &&
        discard == true &&
        !widget.locked &&
        identity ==
            (
              widget.session.epoch,
              widget.session.account?['id'],
              widget.session.partyId
            );
  }

  Future<void> back() async {
    if (!await confirmLeave() || !mounted) return;
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else {
      Navigator.pushReplacementNamed(context, '/my');
    }
  }

  @override
  void dispose() {
    for (final c in _listening) {
      c.removeListener(_changed);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !dirty && !widget.locked,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop) back();
        },
        child: widget.child,
      );
}
