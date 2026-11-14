import 'package:flutter/material.dart';
import '../account/account_session.dart';
import 'community_support.dart';

class RankingExplanation extends StatefulWidget {
  const RankingExplanation(
      {super.key, required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<RankingExplanation> createState() => _RankingExplanationState();
}

class _RankingExplanationState extends State<RankingExplanation> {
  Map<String, dynamic>? data;
  String? error;
  bool busy = false;
  int generation = 0, epoch = 0;
  @override
  void initState() {
    super.initState();
    epoch = widget.session.epoch;
    widget.session.addListener(changed);
  }

  void changed() {
    if (epoch != widget.session.epoch ||
        !widget.session.isLoggedIn ||
        widget.session.isDomainDenied('/api/v1/engagement/')) {
      epoch = widget.session.epoch;
      if (mounted) {
        setState(() {
          generation++;
          data = null;
          error = null;
          busy = false;
        });
      }
    }
  }

  @override
  void didUpdateWidget(covariant RankingExplanation old) {
    super.didUpdateWidget(old);
    if (old.id != widget.id) {
      generation++;
      data = null;
      error = null;
      busy = false;
    }
  }

  @override
  void dispose() {
    generation++;
    widget.session.removeListener(changed);
    super.dispose();
  }

  Future<void> load() async {
    if (busy) return;
    final g = generation;
    setState(() {
      busy = true;
      data = null;
      error = null;
    });
    try {
      final d = await CommunityApi(widget.session, 'engagement')
          .read('rankings/${widget.id}/explanation', account: true);
      communityRequire(d['snapshot_id'] == widget.id &&
          d['personalized'] == false &&
          d['paid_advertising'] == false &&
          ((d['formula_scope'] == 'RECORDED_VERSION' &&
                  d['calculation_version'] == 'ENGAGEMENT_SCORING_V1') ||
              (d['formula_scope'] == 'CURRENT_FORMULA_REFERENCE_ONLY' &&
                  d['calculation_version'] == 'LEGACY_UNVERSIONED')));
      communityRequire(
          communityMap(d['formulas']).values.every((v) => v is String));
      if (mounted && g == generation) setState(() => data = d);
    } catch (e) {
      if (mounted && g == generation) setState(() => error = communityError(e));
    } finally {
      if (mounted && g == generation) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      ExpansionTile(title: const Text('本期榜单依据与说明'), children: [
        OutlinedButton(
            onPressed: busy ? null : load, child: const Text('读取本期实际规则与公式说明')),
        if (error != null) Text(error!),
        if (data != null) ...[
          Text('本期规则：${data!['rule_version']}'),
          Text(data!['formula_scope'] == 'RECORDED_VERSION'
              ? '本期记录了计算版本，下方说明对应已记录版本。'
              : '历史榜未记录计算版本。下方仅为当前公式参考，不能证明旧榜当时使用了这些公式。'),
          for (final e in communityMap(data!['formulas']).entries)
            ListTile(
                title: Text(const {
                      'sales': '成交榜',
                      'reviews': '评价榜',
                      'repeat': '复购榜',
                      'popularity': '人气榜',
                      'levels': '等级榜',
                      'newcomers': '新人榜',
                      'composite': '综合榜'
                    }[e.key] ??
                    '计算说明'),
                subtitle: Text(e.value as String))
        ],
        const Text('关闭个性化推荐仍可普通搜索；退出公开榜单需另行修改本人的参榜选择。历史名次保留原快照，显示时重新核对当前公开授权。'),
        TextButton(
            onPressed: () =>
                Navigator.pushNamed(context, '/privacy?view=preferences'),
            child: const Text('调整个性化推荐')),
        TextButton(
            onPressed: () =>
                Navigator.pushNamed(context, '/engagement?view=growth'),
            child: const Text('本人参榜选择')),
      ]);
}
