import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import 'supply_widgets.dart';

/// Status explanations are presentation only. The server still decides actions.
String supplyNextStep(String status, {required bool work}) => switch (status) {
  'DRAFT' => '完善本版稿件与权利证明后提交审核。保存草稿不代表已审或已公开。',
  'PENDING_REVIEW' => '作者申请已受理，等待独立审核。资格通过前不能提交新作品。',
  'AWAITING_REVIEW' => '等待权属与内容审核；私有稿件不会因为提交而公开。',
  'CHANGES_REQUESTED' || 'REJECTED' => '先阅读审核意见，补正材料并保存新修订。原记录与原结论保留。',
  'REVIEWS_COMPLETE' => '本版审核已完成。上架、许可和交易仍需对应业务单独办理。',
  'APPROVED' => work
      ? '核对本版审核事实与有效用途；本状态不替代后续许可或成交。'
      : '当前作者申请已通过，可继续整理作品与权利证明；作品仍须单独审核。',
  'WITHDRAWN' => '本版已撤回，原稿件和操作记录保留供核对，不再按有效版本办理。',
  _ => '请核对本次读取的记录与审核意见，再按页面开放的操作办理。',
};

Widget supplyJourney({required bool work}) => supplyCard('本次办理', [
  Wrap(spacing: 8, runSpacing: 8, children: [
    Chip(label: Text(work ? '1 作品资料' : '1 作者资料')),
    const Chip(label: Text('2 权利与证明')),
    const Chip(label: Text('3 保存与审核')),
  ]),
  const SizedBox(height: 10),
  Text(work ? '先保存完整版本，再提交独立审核。稿件始终按私有权限读取。'
      : '使用当前身份提交作者资料，资格以独立审核结果为准。',
      style: const TextStyle(color: AccountTheme.muted, fontSize: 14, height: 1.6)),
]);
