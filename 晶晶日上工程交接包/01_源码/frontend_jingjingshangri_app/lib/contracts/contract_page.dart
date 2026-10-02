import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../supply/supply_widgets.dart';
import 'contract_api.dart';
import 'contract_reader.dart';
import 'contract_text.dart';

class ContractPage extends StatefulWidget {
  const ContractPage({super.key, this.snapshotId});
  final String? snapshotId;
  @override
  State<ContractPage> createState() => _ContractPageState();
}

class _ContractPageState extends State<ContractPage> {
  late final TextEditingController _number =
      TextEditingController(text: widget.snapshotId);
  ContractReader? _reader;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = context.read<AccountSession>();
    if (_reader?.session != session) {
      _reader?.dispose();
      _reader = ContractReader(session);
      if (widget.snapshotId?.isNotEmpty == true &&
          session.isLoggedIn &&
          session.partyId != null) {
        _reader!.open(widget.snapshotId!);
      }
    }
  }

  @override
  void didUpdateWidget(ContractPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.snapshotId != widget.snapshotId) {
      _number.text = widget.snapshotId ?? '';
      _reader!.clear();
      if (widget.snapshotId?.isNotEmpty == true) {
        _reader!.open(widget.snapshotId!);
      }
    }
  }

  @override
  void dispose() {
    _reader?.dispose();
    _number.dispose();
    super.dispose();
  }

  Widget _card(String title, List<Widget> children, {IconData? icon}) => Card(
          child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            if (icon != null) ...[
              Icon(icon, color: AccountTheme.accent, size: 22),
              const SizedBox(width: 10)
            ],
            Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w700)))
          ]),
          const SizedBox(height: 16),
          ...children,
        ]),
      ));
  Widget _fact(String label, dynamic value) => supplyFact(label, value);
  Widget _notice(String message, {bool error = false}) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Text(message,
          style: TextStyle(
              color: error ? AccountTheme.danger : AccountTheme.muted,
              height: 1.6)));
  Widget _text(dynamic data) => ContractText(value: data);

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    return AccountTheme(
        child: AnimatedBuilder(
            animation: _reader!,
            builder: (context, _) {
              final reader = _reader!;
              final snapshot = reader.snapshot;
              return Scaffold(
                appBar: AppBar(
                    title: const Text('合同与原约定'),
                    leading: BackButton(onPressed: () {
                      if (Navigator.canPop(context)) {
                        Navigator.pop(context);
                      } else {
                        Navigator.pushReplacementNamed(context, '/account');
                      }
                    })),
                body: SafeArea(
                    child: Center(
                        child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 760),
                            child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                                const Text('阅读保存的合同',
                                    style: TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                _notice('按合同编号读取当时保存的内容。能否查看，由当前账号和办事身份的授权决定。'),
                                if (!session.isLoggedIn ||
                                    session.partyId == null) ...[
                                  _card(
                                      '先确认办事身份',
                                      [
                                        _notice(session.isLoggedIn
                                            ? '请先选择代表谁查看这份合同。'
                                            : session.authNotice ??
                                                '请先登录，再选择办事身份。'),
                                        FilledButton(
                                            onPressed: () =>
                                                Navigator.pushNamed(
                                                    context, '/account'),
                                            child: Text(session.isLoggedIn
                                                ? '前往选择身份'
                                                : '前往登录')),
                                      ],
                                      icon: Icons.person_outline),
                                ] else ...[
                                  _card('指定合同', [
                                    _fact(
                                        '当前办事身份',
                                        session.party?['display_name'] ??
                                            session.partyId),
                                    appField(
                                        '合同编号',
                                        TextField(
                                            key: const Key('contract-number'),
                                            controller: _number,
                                            autocorrect: false,
                                            enableSuggestions: false,
                                            decoration: const InputDecoration(
                                                hintText: '粘贴完整合同编号'),
                                            onChanged: (_) => reader.clear(),
                                            onSubmitted: (_) =>
                                                reader.open(_number.text))),
                                    const SizedBox(height: 12),
                                    FilledButton.icon(
                                        key: const Key('read-contract'),
                                        onPressed: reader.loading ||
                                                reader.retrySeconds > 0
                                            ? null
                                            : () => reader.open(_number.text),
                                        icon: const Icon(
                                            Icons.description_outlined),
                                        label: Text(
                                            reader.loading ? '正在读取…' : '读取合同')),
                                  ]),
                                  if (reader.loading)
                                    const Padding(
                                        padding: EdgeInsets.all(20),
                                        child: Center(
                                            child:
                                                CircularProgressIndicator())),
                                  if (reader.retrySeconds > 0)
                                    _notice(
                                        '服务器要求稍候，${reader.retrySeconds} 秒后可重新读取。'),
                                  if (reader.error != null)
                                    _notice(reader.error!, error: true),
                                  if (snapshot != null) ...[
                                    const ManuscriptHero(
                                        title: '合同内容已保存',
                                        subtitle:
                                            '保存时尚未签署，留存原约定。\n实际签署与付款须另行核验。'),
                                    const SizedBox(height: 16),
                                    _card(
                                        '合同信息',
                                        [
                                          _fact('合同编号', snapshot['id']),
                                          Align(
                                              alignment: Alignment.centerLeft,
                                              child: TextButton.icon(
                                                  onPressed: () => Clipboard
                                                      .setData(ClipboardData(
                                                          text: snapshot['id']
                                                              as String)),
                                                  icon: const Icon(
                                                      Icons.copy_outlined,
                                                      size: 18),
                                                  label: const Text('复制合同编号'))),
                                          _fact('合同版本编号',
                                              snapshot['contract_version_id']),
                                          _fact('保存时间', snapshot['created_at']),
                                          _fact(
                                              '参与方编号',
                                              (snapshot['party_ids'] as List)
                                                  .join('\n')),
                                          _fact('内容校验值',
                                              snapshot['content_sha256']),
                                        ],
                                        icon: Icons.description_outlined),
                                    _card('当时保存的承诺',
                                        [_text(snapshot['commitments'])],
                                        icon: Icons.fact_check_outlined),
                                    _card(
                                        '这份合同采用的规则',
                                        [
                                          _notice(
                                              '只展示合同中保存的历史版本。打开规则时会重新核对查看权限。'),
                                          ...(snapshot['rule_contents'] as List)
                                              .map((item) {
                                            final captured =
                                                Map<String, dynamic>.from(
                                                    item as Map);
                                            return Padding(
                                                padding: const EdgeInsets.only(
                                                    bottom: 12),
                                                child: OutlinedButton(
                                                    onPressed: () => reader
                                                        .readRule(item as Map<
                                                            String, dynamic>),
                                                    child: Padding(
                                                        padding:
                                                            const EdgeInsets
                                                                .symmetric(
                                                                vertical: 12),
                                                        child: Row(children: [
                                                          const Icon(
                                                              Icons
                                                                  .menu_book_outlined,
                                                              size: 20),
                                                          const SizedBox(
                                                              width: 10),
                                                          Expanded(
                                                              child: Text(
                                                                  '${captured['rule_key']}\n版本 ${captured['version']}')),
                                                          const Icon(Icons
                                                              .chevron_right)
                                                        ]))));
                                          }),
                                          if (reader.ruleLoading)
                                            const LinearProgressIndicator(),
                                          if (reader.ruleError != null)
                                            _notice(reader.ruleError!,
                                                error: true),
                                          if (reader.rule != null) ...[
                                            const Divider(height: 28),
                                            _fact('规则名称',
                                                reader.rule!['rule_key']),
                                            _fact('规则版本',
                                                reader.rule!['version']),
                                            _fact('规则编号', reader.rule!['id']),
                                            _text(reader.rule!['terms']),
                                            const SizedBox(height: 16),
                                            _fact('内容校验值',
                                                reader.rule!['content_sha256']),
                                          ],
                                        ],
                                        icon: Icons.history),
                                    _card(
                                        '相关服务是否可用',
                                        [
                                          _notice(
                                              '这里仅检查服务条件。结果不代表获得付款、签署或使用许可。'),
                                          appField(
                                              '要检查的服务',
                                              DropdownButtonFormField<String>(
                                                  isExpanded: true,
                                                  itemHeight: null,
                                                  initialValue: reader.action,
                                                  decoration:
                                                      const InputDecoration(),
                                                  items: contractActions.entries
                                                      .map((e) =>
                                                          DropdownMenuItem(
                                                              value: e.key,
                                                              child: Text(
                                                                  e.value)))
                                                      .toList(),
                                                  onChanged: (value) {
                                                    if (value != null) {
                                                      reader
                                                          .changeAction(value);
                                                    }
                                                  })),
                                          const SizedBox(height: 12),
                                          OutlinedButton.icon(
                                              onPressed: reader.readinessLoading
                                                  ? null
                                                  : reader.checkService,
                                              icon: const Icon(Icons.refresh),
                                              label: Text(
                                                  reader.readinessLoading
                                                      ? '正在检查…'
                                                      : '检查服务条件')),
                                          if (reader.readinessError != null)
                                            _notice(reader.readinessError!,
                                                error: true),
                                          if (reader.readiness != null) ...[
                                            const SizedBox(height: 16),
                                            _fact(
                                                '检查环境',
                                                reader.readiness![
                                                            'environment'] ==
                                                        'SANDBOX'
                                                    ? '测试环境'
                                                    : '正式环境'),
                                            _fact(
                                                '服务状态',
                                                reader.readiness![
                                                            'current_status'] ==
                                                        'SERVICE_READY'
                                                    ? '服务条件已具备'
                                                    : '暂未启用'),
                                            _notice(reader.readiness![
                                                        'current_status'] ==
                                                    'SERVICE_READY'
                                                ? '本次检查确认服务条件已具备，后续办理仍需相应授权并再次核验。'
                                                : readinessReasons[
                                                    reader.readiness![
                                                        'reason_code']]!),
                                          ],
                                        ],
                                        icon: Icons.info_outline),
                                  ],
                                ],
                              ],
                            )))),
              );
            }));
  }
}
