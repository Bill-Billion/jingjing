import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../account/account_api.dart';
import '../account/account_session.dart';
import 'contract_api.dart';

const enableSandboxSigning = bool.fromEnvironment('JX_ESIGN_SIMULATION');

bool designatedSandboxSigner(
    Map<String, dynamic> snapshot, AccountSession session) {
  final commitments = snapshot['commitments'];
  final fixture = commitments is Map ? commitments['sandbox_signing'] : null;
  return fixture is Map &&
      fixture['signer_party_id'] == session.partyId &&
      fixture['signer_account_id'] == session.account?['id'];
}

class SandboxSigningPanel extends StatefulWidget {
  const SandboxSigningPanel({super.key, required this.snapshot});
  final Map<String, dynamic> snapshot;

  @override
  State<SandboxSigningPanel> createState() => _SandboxSigningPanelState();
}

class _SandboxSigningPanelState extends State<SandboxSigningPanel> {
  static const labels = {
    'PENDING': '已受理，等待模拟回执',
    'OUTCOME_UNKNOWN': '结果待核对',
    'SIMULATED_SUCCESS': '模拟签署成功',
    'SIMULATED_FAILURE': '模拟签署失败',
  };

  Map<String, dynamic>? _record;
  String? _failure;
  bool _busy = false;
  bool _confirmed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _run('read');
    });
  }

  Future<void> _run(String action) async {
    if (_busy || (action == 'start' && (!_confirmed || _record == null))) {
      return;
    }
    final session = context.read<AccountSession>();
    final party = session.partyId;
    final epoch = session.epoch;
    final id = widget.snapshot['id'];
    final hash = widget.snapshot['content_sha256'];
    if (id is! String ||
        !isContractId(id) ||
        party == null ||
        !designatedSandboxSigner(widget.snapshot, session)) {
      return;
    }

    setState(() {
      _busy = true;
      _failure = null;
    });
    final path = '/api/v1/testing/esign/$id';
    bool current() =>
        mounted && session.epoch == epoch && session.partyId == party;
    try {
      final result = action == 'read'
          ? await session.read(path, actingParty: party)
          : await session.write(
              'POST', action == 'reconcile' ? '$path/reconcile' : path,
              actingParty: party,
              body: action == 'start' ? {'snapshot_sha256': hash} : {});
      if (!current()) return;
      final receipt = result['receipt'];
      final state = receipt is Map ? receipt['current_status'] : null;
      final terminal =
          state == 'SIMULATED_SUCCESS' || state == 'SIMULATED_FAILURE';
      if (result.length != 4 ||
          result['snapshot_id'] != id ||
          result['snapshot_sha256'] != hash ||
          result['simulation'] != true ||
          !result.containsKey('receipt') ||
          (receipt == null && action != 'read') ||
          (receipt != null &&
              (receipt is! Map ||
                  receipt.length != 4 ||
                  receipt['id'] is! String ||
                  !isContractId(receipt['id'] as String) ||
                  !labels.containsKey(state) ||
                  receipt['object_version'] is! int ||
                  (receipt['object_version'] as int) < 1 ||
                  receipt['receipt_ref'] !=
                      (terminal ? 'sim-esign:${receipt['id']}' : null)))) {
        throw const AccountError(502, 'INVALID_CONTRACT_RESPONSE');
      }
      setState(() => _record = result);
    } on AccountError catch (error) {
      if (!current()) return;
      setState(() {
        _record = null;
        _failure = error.code == 'PROVIDER_OUTCOME_UNKNOWN'
            ? '模拟回执结果未知，请读取原记录再核对。'
            : '暂时无法核对模拟签署，请重新读取。';
      });
    } finally {
      if (current()) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final receipt = _record?['receipt'] as Map?;
    final state = receipt?['current_status'];
    final pending = state == 'PENDING' || state == 'OUTCOME_UNKNOWN';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('电子签隔离演练', style: Theme.of(context).textTheme.titleMedium),
          const Text('仅记录模拟回执，原封存合同保持未签署。'),
          if (_failure != null) Text(_failure!),
          if (receipt != null) Text(labels[state]!),
          if (receipt?['receipt_ref'] != null) Text(receipt!['receipt_ref']),
          if (_record != null && receipt == null) ...[
            CheckboxListTile(
              title: const Text('确认在隔离环境演练当前合同'),
              value: _confirmed,
              onChanged: _busy
                  ? null
                  : (value) => setState(() => _confirmed = value == true),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            OutlinedButton(
              onPressed: _busy || !_confirmed ? null : () => _run('start'),
              child: const Text('提交模拟签署'),
            ),
          ],
          if (pending)
            OutlinedButton(
              onPressed: _busy ? null : () => _run('reconcile'),
              child: const Text('核对原模拟签署结果'),
            ),
          TextButton(
            onPressed: _busy ? null : () => _run('read'),
            child: const Text('读取模拟签署记录'),
          ),
        ]),
      ),
    );
  }
}
