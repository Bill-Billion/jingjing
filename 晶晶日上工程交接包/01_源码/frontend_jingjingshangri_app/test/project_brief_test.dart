// A8/A4（第44轮）：定制剧项目书纯生成器 ProjectBrief 的契约护栏。
// 锁定三条铁律：①定制剧（消费）与圆梦（自有 IP 席位）严格分版、合规措辞不串；
// ②费用金额只来自 Pricing（接口值优先、常量兜底），项目书内不写死任何金额；
// ③源字段缺失一律“待补充/以合同为准”，绝不臆造。
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjingshangri_app/utils/pricing.dart';
import 'package:jingjingshangri_app/utils/project_brief.dart';

void main() {
  group('定制剧订单版（isProject=false）', () {
    test('空源也能生成：6 节、名称兜底、费用全部取自 Pricing 常量', () {
      final b = ProjectBrief.build(const {}, isProject: false);
      expect(b.isProject, isFalse);
      expect(b.title, '《定制剧项目》定制剧项目书');
      expect(b.subtitle, contains('普通定制档'));
      expect(b.sections.length, 6);

      final fee = b.sections[3].bullets.join('\n');
      expect(fee, contains('¥${Pricing.intentDeposit.toInt()}'));
      expect(fee, contains('¥4,901')); // Pricing.productionFee=4901，千分位
      expect(fee, contains('¥5,000')); // Pricing.standardTotal=5000
      expect(fee, contains('¥${Pricing.extraRevisionFee.toInt()}'));
      // 与 Pricing 现算结果逐字一致，证明金额走 SSOT 而非字面硬编码
      expect(fee,
          contains('意向金：¥${Pricing.intentDeposit.toInt()}（担保托管'));
    });

    test('真实字段被结构化采用，不丢联系人/类型/单号', () {
      final b = ProjectBrief.build(const {
        'scriptTitle': '逆风翻盘的夏天',
        'genre': '都市励志',
        'orderNo': 'JJSR20260904001',
        'contactName': '林晚晴',
      }, isProject: false);
      final overview = b.sections[0].bullets.join('\n');
      expect(b.title, '《逆风翻盘的夏天》定制剧项目书');
      expect(b.subtitle, contains('JJSR20260904001'));
      expect(overview, contains('逆风翻盘的夏天'));
      expect(overview, contains('都市励志'));
      expect(overview, contains('林晚晴'));
    });

    test('源里带接口金额时优先采用（接口值优先、常量兜底链路）', () {
      final b = ProjectBrief.build(const {'intentDeposit': 199},
          isProject: false);
      final fee = b.sections[3].bullets.join('\n');
      expect(fee, contains('¥199')); // 采用接口值
      expect(Pricing.intentDepositOf(const {'intentDeposit': 199}), 199);
    });

    test('合规节明确“不是投资/众筹/理财”，且不混入圆梦席位/分红措辞', () {
      final b = ProjectBrief.build(const {}, isProject: false);
      final compliance = b.sections[5].bullets.join('\n');
      expect(compliance, contains('不是投资、众筹或理财'));
      final full = b.toFullText();
      expect(full, isNot(contains('分红')));
      expect(full, isNot(contains('角色席位认领')));
      expect(full, contains('七步标准化流程'));
    });
  });

  group('圆梦项目版（isProject=true）', () {
    test('席位/角色字段结构化渲染，4 节、标题为圆梦项目书', () {
      final b = ProjectBrief.build(const {
        'title': '黄帝史诗·天下合',
        'type': '古装逆袭',
        'genre': '古装',
        'protagonist': '少年轩辕',
        'intro': '炎黄合盟的成长史诗',
        'roles': 5,
        'seatsTotal': 100,
        'seatsClaimed': 20,
        'days': 15,
      }, isProject: true);
      expect(b.isProject, isTrue);
      expect(b.title, '《黄帝史诗·天下合》圆梦项目书');
      expect(b.subtitle, contains('自有 IP 角色席位认领'));
      expect(b.sections.length, 4);
      final role = b.sections[1].bullets.join('\n');
      expect(role, contains('5 个'));
      expect(role, contains('100 席'));
      expect(role, contains('20 席'));
      expect(role, contains('15 天'));
    });

    test('圆梦合规节含“不是投资/众筹/分红/理财”且只列三大自有 IP', () {
      final b = ProjectBrief.build(const {'title': '少年龙武'},
          isProject: true);
      final compliance = b.sections[3].bullets.join('\n');
      expect(compliance, contains('不是投资、众筹、分红或理财'));
      expect(compliance, contains('黄帝史诗·天下合'));
      expect(compliance, contains('少年龙武'));
      expect(compliance, contains('边境暗影'));
      // 圆梦版不得混入普通定制的七步流程/意向金口径
      final full = b.toFullText();
      expect(full, isNot(contains('七步标准化流程')));
      expect(full, isNot(contains('意向金')));
    });

    test('源字段缺失统一落“待补充”，不崩、不臆造', () {
      final b = ProjectBrief.build(const {}, isProject: true);
      expect(b.title, '《自有 IP 项目》圆梦项目书');
      final intro = b.sections[0].bullets.join('\n');
      final role = b.sections[1].bullets.join('\n');
      expect(intro, contains('待补充'));
      expect(role, contains('待补充'));
    });
  });

  group('toFullText 全文', () {
    test('以标题开头、含副标题/生成方/全部章节标题，结尾为合同备注', () {
      final b = ProjectBrief.build(const {'scriptTitle': '测试剧'},
          isProject: false);
      final t = b.toFullText();
      expect(t.startsWith(b.title), isTrue);
      expect(t, contains(b.subtitle));
      expect(t, contains('生成方：晶晶日上'));
      for (final sec in b.sections) {
        expect(t, contains(sec.title));
      }
      expect(t.trim().endsWith('正式条款以电子合同为准。'), isTrue);
    });
  });
}
