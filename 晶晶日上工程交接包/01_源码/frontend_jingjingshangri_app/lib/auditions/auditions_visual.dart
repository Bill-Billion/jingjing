import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import 'auditions_models.dart';

/// Guidance describes the returned stage, never grants an action or advances it.
String auditionNextStep(AuditionRecord record) => switch (record.status) {
  'IN_REVIEW' => '等待独立审核，提交成功不代表方案已公开。',
  'PUBLISHED' => '按本方案的公开设置展示；预约还需用途与安全核查。',
  'SAFETY_REVIEW' => '等待安全核查，请核对用途、时间与场地；目前尚不能付款。',
  'READY_TO_PAY' => '核对完整约定并建立原订单，随后在原订单中办理付款。',
  'AWAITING_PAYMENT' || 'OPEN' => '前往原订单核对支付结果；提交支付请求不代表已付款。',
  'PAYMENT_REVIEW_REQUIRED' => '付款结果仍待核实，请保留原记录，不重复创建付款。',
  'AWAITING_ACCEPTANCE' => '付款已核实，等待艺人在接单截止前接受或拒绝。',
  'ACCEPTED' => '按已确认的方式履约；行程和取样仍需分别记录。',
  'DEPARTED' => '已记录出发，请按本次预约继续办理到场与取样。',
  'ARRIVED' => '已记录到场，取样交付仍须符合本单授权和数量约定。',
  'DELIVERY_REVIEW' => '取样已提交独立审核，尚不能作为已审交付确认。',
  'DELIVERED' => '请读取已审取样并核对本单确认规则；有问题按原单提交争议。',
  'DISPUTED' => '当前已暂停，按本单要求补充证据并等待独立处理。',
  'REFUND_REQUIRED' => '应退金额待渠道核实，不代表款项已经到账。',
  'REFUNDED' || 'PARTIAL_REFUND_SETTLED' => '退款结果已核实，具体金额和剩余约定请查看原订单。',
  'FULFILLED' => '本次试镜履约已完成，不授予出演、发行或重新生成权。',
  'REJECTED' => '请核对审核说明；当前不能按通过状态继续办理。',
  'CANCELLED' || 'EXPIRED' => '本次预约已结束，原订单及处理记录仍保留供核对。',
  _ => '以当前记录为准，刷新可读取最新结果。',
};

Widget auditionGuide(String title, String detail,
        {String label = '办理指引', IconData icon = Icons.route_outlined}) =>
    Container(
        margin: const EdgeInsets.only(bottom: 18),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
            color: AccountTheme.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AccountTheme.border)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 24, color: AccountTheme.accent),
          const SizedBox(width: 12),
          Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(
                color: AccountTheme.accent, fontSize: 12)),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700, height: 1.4)),
            const SizedBox(height: 8),
            Text(detail, style: const TextStyle(
                color: AccountTheme.muted, fontSize: 13, height: 1.6)),
          ])),
        ]));
