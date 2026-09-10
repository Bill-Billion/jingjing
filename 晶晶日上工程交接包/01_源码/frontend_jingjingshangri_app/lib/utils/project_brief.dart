import 'pricing.dart';
import 'money.dart';

/// 定制剧项目书章节。
class BriefSection {
  final String title;
  final List<String> bullets;
  const BriefSection(this.title, this.bullets);
}

/// 定制剧项目书：由订单（普通档 7 步）或圆梦项目（自有 IP 席位）字段
/// **结构化生成**，供本地预览与复制；PDF 导出留接口、不引重依赖。
///
/// 规则：
/// - 只取源 map 真实字段，缺失一律「待补充 / 以正式电子合同为准」，绝不臆造；
/// - 固定金额只来自 [Pricing]，不在此写死任何字面金额；
/// - 定制剧（消费）与圆梦（自有 IP 席位认领，非投资/众筹/分红）严格分版。
class ProjectBrief {
  final String title;
  final String subtitle;
  final bool isProject;
  final List<BriefSection> sections;

  const ProjectBrief({
    required this.title,
    required this.subtitle,
    required this.isProject,
    required this.sections,
  });

  static String _s(dynamic v, [String fallback = '待补充']) {
    final t = v?.toString().trim() ?? '';
    return t.isEmpty ? fallback : t;
  }

  /// [source] 为订单 map（kind=sample）或圆梦项目 map（kind=project）。
  factory ProjectBrief.build(Map<String, dynamic> source,
      {required bool isProject}) {
    if (isProject) return _buildProject(source);
    return _buildOrder(source);
  }

  // ── 普通定制剧订单版 ──
  static ProjectBrief _buildOrder(Map<String, dynamic> o) {
    final name = _s(o['scriptTitle'] ?? o['title'], '定制剧项目');
    final genre = _s(o['genre'], '选定后补充');
    final orderNo = _s(o['orderNo'], '下单后生成');
    final contact = _s(o['contactName'], '以订单留档为准');
    final intent = Pricing.intentDepositOf(o);
    final production = Pricing.productionFeeOf(o);
    final total = Pricing.totalOf(o);
    final extra = Pricing.extraRevisionFee;

    return ProjectBrief(
      isProject: false,
      title: '《$name》定制剧项目书',
      subtitle: '订单编号 $orderNo · 普通定制档',
      sections: [
        BriefSection('一、项目概述', [
          '剧目名称：《$name》',
          '剧集类型：$genre（古装 / 甜宠 / 悬疑等，以选剧库定稿为准）',
          '定制联系人：$contact',
          '项目定位：用户为自己的人生故事定制一部 AI 宣发片，做自己人生的主角。',
        ]),
        const BriefSection('二、制作内容与交付', [
          '交付内容：选剧库匹配 + 2-3 部对标剧本 + 剧本初稿 + 制作前电子合同 + AI 宣发片 + 本项目书 + 上线协助。',
          '制作周期：剧本定稿并担保制作款后 3-5 个工作日交付 AI 宣发片。',
          '交付方式：成片在 App「我的视频」内交付，支持在线查看与下载。',
        ]),
        const BriefSection('三、七步标准化流程', [
          '1. 支付意向金锁档（第三方担保托管，可退 / 可抵）；',
          '2. 在选剧库选择剧集类型；',
          '3. 编剧推荐 2-3 部对标剧本，选定 1 部；',
          '4. 商务改本（含 2 轮免费修改）；',
          '5. 确认定稿，签署制作前电子合同；',
          '6. 支付制作款到担保，AI 制作宣发片（3-5 个工作日）；',
          '7. 交付验收（7 天内 1 次免费修改），验收后担保清分。',
        ]),
        BriefSection('四、费用与担保托管', [
          '意向金：${Money.rmbInt(intent)}（担保托管，未继续制作可退，继续则抵作款）；',
          '制作款：${Money.rmbInt(production)}（剧本定稿、签署电子合同后担保）；',
          '普通档合计：${Money.rmbInt(total)} 起，上不封顶；',
          '超出 2 轮免费改本后，改本费 ${Money.rmbInt(extra)} / 轮；',
          '全部款项由第三方担保托管，验收通过后才清分给制作方。',
        ]),
        const BriefSection('五、修改与验收', [
          '剧本阶段含 2 轮免费修改；',
          '成片交付后 7 天内可申请 1 次免费修改；',
          '验收通过后担保资金清分，订单状态变为「已完成」。',
        ]),
        const BriefSection('六、合规说明', [
          '本服务为定制内容消费，不是投资、众筹或理财，不承诺任何货币回报；',
          '内容须符合法律法规与平台规范，违法违规内容不予制作；',
          '正式权利义务以签署的制作前电子合同为准，本项目书为过程说明文件。',
        ]),
      ],
    );
  }

  // ── 圆梦项目（自有 IP 席位认领）版 ──
  static ProjectBrief _buildProject(Map<String, dynamic> p) {
    final name = _s(p['title'], '自有 IP 项目');
    final type = _s(p['type']);
    final genre = _s(p['genre']);
    final intro = _s(p['intro'], '项目简介待补充');
    final protagonist = _s(p['protagonist']);
    final roles = p['roles'];
    final seatsTotal = p['seatsTotal'] ?? p['total'];
    final seatsClaimed = p['seatsClaimed'] ?? p['claimed'];
    final days = p['days'];

    return ProjectBrief(
      isProject: true,
      title: '《$name》圆梦项目书',
      subtitle: '$type · 自有 IP 角色席位认领',
      sections: [
        BriefSection('一、项目介绍', [
          '剧目名称：《$name》',
          '作品类型：$type；题材：$genre',
          '主角设定：$protagonist',
          '故事简介：$intro',
        ]),
        BriefSection('二、角色与席位', [
          '开放角色数：${roles == null ? '待补充' : '$roles 个'}',
          '席位总数：${seatsTotal == null ? '待补充' : '$seatsTotal 席'}',
          '已认领席位：${seatsClaimed == null ? '待补充' : '$seatsClaimed 席'}',
          '剩余招募：${days == null ? '以项目页为准' : '$days 天'}',
          '用户可认领空缺角色 / 席位，与主创团队共同让故事上映。',
        ]),
        const BriefSection('三、参与方式', [
          '在角色档位中选择心仪席位，支付对应席位费用并完成担保；',
          '按排期参与 AI 形象采集与拍摄 / 制作环节；',
          '成片在 App 内交付，可在「我的视频」查看与分享。',
        ]),
        const BriefSection('四、合规说明（圆梦分版）', [
          '圆梦席位是自有 IP 的角色参与资格，属于内容消费，不是投资、众筹、分红或理财；',
          '不承诺货币回报，席位费用对应明确的制作与参演服务；',
          '平台仅展示自有 IP（黄帝史诗·天下合 / 少年龙武 / 边境暗影），不承接违规题材。',
        ]),
      ],
    );
  }

  /// 纯文本全文（供一键复制 / 未来 PDF 排版复用）。
  String toFullText() {
    final b = StringBuffer();
    b.writeln(title);
    b.writeln(subtitle);
    b.writeln('生成方：晶晶日上 · 做自己人生的主角');
    b.writeln('');
    for (final sec in sections) {
      b.writeln(sec.title);
      for (final line in sec.bullets) {
        b.writeln('  $line');
      }
      b.writeln('');
    }
    b.writeln('备注：本项目书由系统依据订单 / 项目信息自动生成，正式条款以电子合同为准。');
    return b.toString();
  }
}
