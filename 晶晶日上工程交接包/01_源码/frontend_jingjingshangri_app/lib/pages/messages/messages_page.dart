import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/user_provider.dart';
import '../../utils/auth_guard.dart';
import '../../utils/motion.dart';
import '../../utils/perf_trace.dart';
import '../../widgets/human_avatar.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../chat/chat_page.dart';

/// 消息 Tab：平台内会话列表（getConversations，断网走演示兜底）。
class MessagesPage extends StatefulWidget {
  const MessagesPage({super.key});

  @override
  State<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends State<MessagesPage> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      PerfTrace.stamp('messages postFrame->load');
      _load();
    });
  }

  Future<void> _load() async {
    PerfTrace.stamp('messages load start');
    final logged = context.read<UserProvider>().isLoggedIn;
    if (!logged) {
      setState(() {
        _loading = false;
        _list = [];
      });
      return;
    }
    // Gate0 F-R3：已有会话时后台刷新不回骨架（SWR），仅首屏无数据显示骨架
    final bool initial = _list.isEmpty;
    setState(() {
      _loading = initial;
      _error = null;
    });
    try {
      final data = await _api.getConversations();
      final rows = (data['list'] as List? ?? data['data'] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (!mounted) return;
      setState(() {
        _list = rows;
        _loading = false;
      });
      // Gate0：内容首帧绘制后打点，与 tab tap / request_* 拼出完整等待时间线
      WidgetsBinding.instance.addPostFrameCallback((_) =>
          PerfTrace.stamp('messages meaningful frame', meta: 'n=${rows.length}'));
    } catch (e) {
      PerfTrace.stamp('messages load error', meta: '$e');
      if (!mounted) return;
      // Gate0 F-R3：已有旧数据时刷新失败保留旧值（refreshErrorWithData），不把用户踢回整页错误
      setState(() {
        if (_list.isEmpty) _error = '$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final logged = context.watch<UserProvider>().isLoggedIn;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('消息'),
        automaticallyImplyLeading: false,
      ),
      body: !logged
          ? EmptyView(
              icon: Icons.forum,
              title: '登录后查看消息',
              subtitle: '与艺人、平台的沟通记录都会在这里',
              actionText: '去登录',
              onAction: () => AuthGuard.ensureLogin(context,
                  reason: '登录后查看消息', onLoggedIn: _load),
            )
          : _loading
              ? _buildSkeleton()
              : _error != null
                  ? ErrorView(message: '消息加载失败', onRetry: _load)
                  : _list.isEmpty
                      ? RefreshIndicator(
                          color: AppTheme.gold,
                          onRefresh: _load,
                          child: ListView(children: const [
                            SizedBox(height: 120),
                            EmptyView(
                              icon: Icons.mark_chat_unread_outlined,
                              title: '还没有消息',
                              subtitle: '在艺人广场或剧场里发起一次对话吧',
                            ),
                          ]),
                        )
                      : RefreshIndicator(
                          color: AppTheme.gold,
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 10),
                            itemCount: _list.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (_, i) => StaggerItem(index: i, child: _buildRow(_list[i])),
                          ),
                        ),
    );
  }

  Widget _buildSkeleton() {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      itemCount: 7,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.all(12),
        decoration: AppTheme.glassDecoration(radius: 16),
        child: Row(
          children: [
            const Skeleton(width: 48, height: 48, radius: BorderRadius.all(Radius.circular(24))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Skeleton(width: 120, height: 13, radius: BorderRadius.all(Radius.circular(6))),
                  SizedBox(height: 8),
                  Skeleton(width: 200, height: 11, radius: BorderRadius.all(Radius.circular(6))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRow(Map<String, dynamic> c) {
    final name = (c['targetName'] ?? c['name'] ?? c['title'] ?? '会话').toString();
    final last = (c['lastMessage'] ?? c['lastContent'] ?? c['content'] ?? '').toString();
    final time = (c['updatedAt'] ?? c['lastTime'] ?? c['createdAt'] ?? '').toString();
    final unread = c['unread'] is num ? (c['unread'] as num).toInt() : 0;
    final human = <String, dynamic>{
      'id': c['humanId'] ?? c['targetId'] ?? c['id'],
      'name': name,
      'avatar': c['avatar'],
      'localAvatar': c['localAvatar'],
      'conversationId': c['conversationId'] ?? c['id'],
    };
    return PressScale(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Navigator.push(context, Motion.fadeSlideRoute(ChatPage(human: human))),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: AppTheme.glassDecoration(radius: 16),
        child: Row(
          children: [
            HumanAvatar(
              localAsset: human['localAvatar'] as String?,
              remotePath: human['avatar'] as String?,
              width: 48, height: 48, radius: BorderRadius.circular(24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(name,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: AppTheme.textPrimary,
                                fontSize: 15,
                                fontWeight: FontWeight.w800)),
                      ),
                      Text(_shortTime(time),
                          style: const TextStyle(
                              color: AppTheme.textHint, fontSize: 11)),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      Expanded(
                        child: Text(last.isEmpty ? '开始你们的对话' : last,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: AppTheme.textSecondary, fontSize: 12.5)),
                      ),
                      if (unread > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            gradient: AppTheme.brandGradient,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(unread > 99 ? '99+' : '$unread',
                              style: const TextStyle(
                                  color: AppTheme.onGold,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _shortTime(String raw) {
    if (raw.isEmpty) return '';
    final dt = DateTime.tryParse(raw);
    if (dt == null) return raw.length > 10 ? raw.substring(5, 10) : raw;
    final local = dt.toLocal();
    final now = DateTime.now();
    if (now.year == local.year &&
        now.month == local.month &&
        now.day == local.day) {
      return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    }
    return '${local.month}/${local.day}';
  }
}
