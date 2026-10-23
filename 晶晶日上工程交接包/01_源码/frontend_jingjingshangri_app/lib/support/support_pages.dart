import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../engagement/community_support.dart' show communityId;
import '../trade/trade_widgets.dart';

String invoiceBusinessRoute(String? orderId) => communityId(orderId)
    ? Uri(path: '/trade/record', queryParameters: {'recordId': orderId!})
        .toString()
    : '/orders';

/// No invoice API is available. The order remains the authoritative place to
/// check payments; no invoice title, email or tax number is collected here.
class InvoicePage extends StatelessWidget {
  const InvoicePage({super.key, this.orderId});
  final String? orderId;
  @override
  Widget build(BuildContext context) => tradeScaffold(context, '发票与票据', [
        tradeHeading('发票与票据', eyebrow: '按订单查看费用凭据'),
        tradeBanner('开票服务尚未开放', '当前无法提交开票申请或查询历史发票。请在原订单核对实际付款和已有业务凭据。'),
        tradeSection('开票申请', [
          const Text('发票抬头、接收邮箱、开票方与可开金额，需在开票服务接通后按订单核对。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 16),
          const OutlinedButton(onPressed: null, child: Text('个人抬头 · 暂未开放')),
          const SizedBox(height: 8),
          const OutlinedButton(onPressed: null, child: Text('企业抬头 · 暂未开放')),
        ]),
        tradeSection('历史票据', [
          const Text('历史票据暂时无法读取；这不代表你没有票据。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 16),
          const OutlinedButton(onPressed: null, child: Text('查看已有票据 · 暂未开放')),
        ]),
        tradeButton('核对原订单与付款',
            () => Navigator.pushNamed(context, invoiceBusinessRoute(orderId)),
            outline: true),
        const FilledButton(onPressed: null, child: Text('提交开票申请 · 暂未开放')),
      ]);
}

class SavedHistoryPage extends StatefulWidget {
  const SavedHistoryPage({super.key});
  @override
  State<SavedHistoryPage> createState() => _SavedHistoryPageState();
}

class _SavedHistoryPageState extends State<SavedHistoryPage> {
  bool history = false;
  @override
  Widget build(BuildContext context) => tradeScaffold(context, '收藏与足迹', [
        tradeHeading('留住喜欢的', eyebrow: '留给下次相遇'),
        Row(children: [
          for (final option in [(false, '我的收藏'), (true, '浏览足迹')])
            Expanded(
                child: Semantics(
                    selected: history == option.$1,
                    child: TextButton(
                        onPressed: () => setState(() => history = option.$1),
                        style: TextButton.styleFrom(
                            foregroundColor: history == option.$1
                                ? AccountTheme.text
                                : AccountTheme.muted,
                            shape: const RoundedRectangleBorder()),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Text(option.$2),
                          const SizedBox(height: 8),
                          Container(
                              width: 28,
                              height: 2,
                              color: history == option.$1
                                  ? AccountTheme.vermilion
                                  : Colors.transparent),
                        ]))))
        ]),
        const SizedBox(height: 24),
        tradeBanner(history ? '浏览足迹服务尚未开放' : '收藏服务尚未开放',
            '当前无法读取或管理这些记录；这里不会将示例艺人、视频或通告当作你的记录。'),
        tradeSection('内容类型', [
          for (final label in ['全部', '艺人', '视频', '通告']) ...[
            OutlinedButton(onPressed: null, child: Text(label)),
            const SizedBox(height: 8),
          ],
        ]),
        tradeSection('足迹只为你保留', [
          const Text('收藏、足迹查询和清理功能需等待正式服务开放。再次查看作品时，其价格、公开状态和可用权益以当前目录为准。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
        ]),
        const OutlinedButton(onPressed: null, child: Text('清理浏览记录 · 暂未开放')),
        const SizedBox(height: 12),
        const FilledButton(onPressed: null, child: Text('管理收藏 · 暂未开放')),
        const SizedBox(height: 12),
        tradeButton('浏览当前公开内容', () => Navigator.pushNamed(context, '/square'),
            outline: true),
      ]);
}

const helpTopics = <({
  String title,
  String summary,
  String answer,
  String route,
  String action
})>[
  (
    title: '付款后还没显示成功',
    summary: '先查询原付款记录，再按原业务核对',
    answer: '回到原订单查看付款状态。结果尚未确定时先重新读取原记录，沿用原请求核对，避免重复付款；页面提示已核实收款后再继续后续步骤。',
    route: '/orders',
    action: '查看订单与付款'
  ),
  (
    title: '投稿后如何继续沟通',
    summary: '按原投稿记录查看处理进度',
    answer: '投稿是单向意向，不等于订单或合作承诺。对方感兴趣后按平台服务流程继续；陌生主体之间不提供自由私聊或私人联系方式。',
    route: '/notices/records?kind=SUBMISSION',
    action: '查看我的投稿'
  ),
  (
    title: '视频下载保存在哪里',
    summary: '回到原已购视频确认交付与下载',
    answer: '查看已购视频和原交付记录。网页下载请核对浏览器下载记录，设备端请核对所选保存位置；正式下载需满足该订单约定的交付与付款条件。',
    route: '/stock/purchases',
    action: '查看已购视频'
  ),
  (
    title: '认证付费后是否立即通过',
    summary: '审核费用与审核结果分别核对',
    answer: '支付认证审核费用不代表审核通过。请在原认证申请核对补件要求和审核结果；补件沿用同一申请，不重复支付审核费。',
    route: '/artists/records?kind=HALO',
    action: '查看认证申请'
  ),
  (
    title: '试镜是否授予演出权利',
    summary: '试镜服务与演出授权分别办理',
    answer: '试镜订单仅约定试镜材料与服务，不授予演出、数字人生产或商业代言权利。后续使用需按相应业务另行取得有效授权。',
    route: '/auditions/bookings',
    action: '查看试镜记录'
  ),
  (
    title: '制作预览后如何继续付款',
    summary: '按原订单里程碑核对，不重复下单',
    answer:
        '现行定制制作先付30%首款，确认正式水印预览后再补60%，最终验收后付10%并按约定下载。历史订单以该订单已确认的原约定为准。独立人工样片采用各50%的独立流程。',
    route: '/production',
    action: '查看制作任务'
  ),
  (
    title: '个人信息有误或受到侵害',
    summary: '使用本人申请渠道，核对答复与实际处理',
    answer:
        '个人信息查询、更正、删除或投诉可在隐私与个人信息中提出本人申请。请选择本次具体资料范围并说明情况；提交申请不表示更正、删除、退款或内容限制已完成。',
    route: '/privacy?view=complaint',
    action: '提出个人信息投诉与保护申请'
  ),
];

class HelpFeedbackPage extends StatefulWidget {
  const HelpFeedbackPage({super.key});
  @override
  State<HelpFeedbackPage> createState() => _HelpFeedbackPageState();
}

class _HelpFeedbackPageState extends State<HelpFeedbackPage> {
  final query = TextEditingController();
  @override
  void dispose() {
    query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyword = query.text.trim().toLowerCase();
    final topics = helpTopics.where((t) =>
        '${t.title} ${t.summary} ${t.answer}'.toLowerCase().contains(keyword));
    return tradeScaffold(context, '帮助与反馈', [
      tradeHeading('我们来帮你', eyebrow: '平台帮助 / 有事在这里说'),
      TextField(
          controller: query,
          maxLength: 80,
          decoration: const InputDecoration(
              labelText: '查找帮助', hintText: '付款、下载、投稿、认证或试镜'),
          onChanged: (_) => setState(() {})),
      const SizedBox(height: 24),
      if (topics.isEmpty)
        const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Text('没有找到相关帮助。可清空条件，查看现行流程说明。')),
      for (final topic in topics)
        DecoratedBox(
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(bottom: 16),
                title: Text(topic.title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700)),
                subtitle: Text(topic.summary,
                    style: const TextStyle(
                        color: AccountTheme.muted, height: 1.6)),
                children: [
                  Text(topic.answer, style: const TextStyle(height: 1.7)),
                  const SizedBox(height: 16),
                  tradeButton(topic.action,
                      () => Navigator.pushNamed(context, topic.route),
                      outline: true),
                ])),
      const SizedBox(height: 24),
      tradeSection('反馈提交', [
        for (final category in ['功能问题', '订单问题', '内容举报', '其他建议']) ...[
          OutlinedButton(onPressed: null, child: Text('$category · 暂未开放')),
          const SizedBox(height: 8),
        ],
        const Text('反馈提交与记录查询服务尚未开放，当前不收集问题描述、截图、联系方式或其他材料。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
      ]),
      tradeSection('需要业务协助时', [
        const Text('请先查看对应订单、投稿或制作记录中的处理进度和已开放的服务入口。不同业务的沟通、售后和材料核对保留在原业务中。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 16),
        tradeButton('查看我的业务', () => Navigator.pushNamed(context, '/my'),
            outline: true),
        tradeButton('个人信息投诉与保护',
            () => Navigator.pushNamed(context, '/privacy?view=complaint'),
            outline: true),
      ]),
      const OutlinedButton(onPressed: null, child: Text('查看反馈记录 · 暂未开放')),
      const SizedBox(height: 12),
      const FilledButton(onPressed: null, child: Text('提交反馈 · 暂未开放')),
    ]);
  }
}
