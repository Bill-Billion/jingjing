import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../utils/pricing.dart';
import '../../utils/money.dart';

/// V5.0 艺人学院 - 拍摄指南/话术模板/优质案例/常见问题
class TalentAcademyPage extends StatelessWidget {
  const TalentAcademyPage({super.key});

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('艺人学院')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection(
            context,
            icon: Icons.lightbulb_outline,
            title: '拍摄指南',
            articles: [
              '光线：面向自然光或柔光灯，避免逆光和顶光',
              '角度：手机与眼睛平齐，距离面部30-50厘米',
              '背景：简洁干净，避免杂乱和强反光',
              '着装：纯色或简约服装，避免条纹和复杂图案',
              '表情：自然微笑，语速适中，口型清晰',
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            context,
            icon: Icons.chat_bubble_outline,
            title: '话术模板',
            articles: [
              '生日："祝你生日快乐！愿你新的一岁..."',
              '婚礼："祝你们新婚快乐，百年好合..."',
              '年会："祝公司年会圆满成功，再创辉煌..."',
              '毕业："毕业快乐！愿你前程似锦..."',
              '鼓励："加油！你一定可以的，相信自己！"',
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            context,
            icon: Icons.star_outline,
            title: '优质案例',
            articles: [
              '高评分视频共同特点：语速适中、表情自然、背景简洁',
              '好评率>98%的艺人建议：每条视频录制2遍选最佳',
              '交付速度影响评分：建议24小时内接单，48小时内交付',
              '个性化定制：根据用户提供的信息加入专属内容',
            ],
          ),
          const SizedBox(height: 16),
          _buildSection(
            context,
            icon: Icons.help_outline,
            title: '常见问题',
            articles: [
              '如何提高好评率？按时交付+个性化内容+主动沟通',
              '如何获得更多曝光？完善资料+上传样片+快速响应',
              '保证金如何计算？首笔收入冻结${Money.rmbInt(Pricing.artistDeposit)}，动态调增',
              '结算周期多久？订单完成后T+7天到账，金标艺人T+3',
              '流量分配规则：综合评分40%+完成率20%+响应15%+活跃10%+保证金10%+新人5%',
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.gold.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.gold.withValues(alpha: 0.3)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: AppTheme.gold, size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '前100名入驻艺人享免佣金+流量扶持，前3个月AI成本全免',
                    style: TextStyle(color: AppTheme.gold, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(BuildContext context, {required IconData icon, required String title, required List<String> articles}) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(icon, color: AppTheme.gold, size: 20),
                const SizedBox(width: 8),
                Text(title, style: const TextStyle(color: AppTheme.lightGold, fontSize: 15, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          ...articles.map((a) => Padding(
                padding: const EdgeInsets.only(left: 14, right: 14, bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 6),
                      width: 4,
                      height: 4,
                      decoration: const BoxDecoration(color: AppTheme.gold, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(a, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.5))),
                  ],
                ),
              )),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}
