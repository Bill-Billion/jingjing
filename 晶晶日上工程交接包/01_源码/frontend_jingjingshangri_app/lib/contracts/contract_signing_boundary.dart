import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../trade/trade_widgets.dart';

/// The snapshot API only returns NOT_SIGNED. This panel must not synthesize a
/// signer, signature request, or legal consent from service-readiness checks.
class ContractSigningBoundary extends StatefulWidget {
  const ContractSigningBoundary({super.key});
  @override
  State<ContractSigningBoundary> createState() => _ContractSigningBoundaryState();
}

class _ContractSigningBoundaryState extends State<ContractSigningBoundary> {
  bool read = false;
  @override
  Widget build(BuildContext context) => tradeSection('签署与许可条件', [
        const Chip(label: Text('内容快照 · 未签署')),
        const SizedBox(height: 12),
        const Text('先核对各方、范围、金额节点与分配约定，再回原参演或订单记录办理相关方确认。内容确认、本人签署和许可生效分别核验。',
            style: TextStyle(height: 1.6)),
        CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: read,
            onChanged: (value) => setState(() => read = value == true),
            title: const Text('我已阅读当前合同内容'),
            subtitle: const Text('仅为本页阅读标记，不是签署、代表权声明或服务端确认。')),
        const Text('当前页面没有可核验的指定签署人及电子签发起能力，因此不显示“签署”按钮。服务条件可用也不等于本人有权签署。',
            style: TextStyle(color: AccountTheme.muted, fontSize: 13, height: 1.6)),
        const SizedBox(height: 12),
        OutlinedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/projects/participation'),
            icon: const Icon(Icons.assignment_outlined),
            label: const Text('查看本人参演条款与确认')),
        OutlinedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/support'),
            icon: const Icon(Icons.support_agent_outlined),
            label: const Text('向平台核对签署与受控材料')),
      ]);
}
