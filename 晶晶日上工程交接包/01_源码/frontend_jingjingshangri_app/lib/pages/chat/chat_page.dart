import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/state_views.dart';

class ChatPage extends StatefulWidget {
  final Map<String, dynamic> human;
  const ChatPage({super.key, required this.human});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  int? _conversationId;
  bool _sending = false;
  bool _loading = true;
  bool _initError = false;

  @override
  void initState() {
    super.initState();
    _initConversation();
  }

  Future<void> _initConversation() async {
    setState(() {
      _loading = true;
      _initError = false;
    });
    try {
      final humanId = widget.human['id'] ?? widget.human['humanId'];
      final id = humanId is int ? humanId : int.parse(humanId.toString());
      final result = await ApiService().createConversation(id);
      // 线上返回 conversationId；演示回退返回 id，做兼容避免 demo 下会话 id 为空、历史不加载且发送被静默拦截
      final rawCid = result['conversationId'] ?? result['id'];
      final cid = rawCid is int ? rawCid : int.tryParse(rawCid.toString());
      if (cid == null) throw const FormatException('会话创建失败');
      _conversationId = cid;
      await _loadMessages();
    } catch (_) {
      // 初始化失败落页内可重试错误态（不再只靠转瞬即逝的 SnackBar，避免输入被永久拦截的死页）
      if (mounted) setState(() => _initError = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMessages() async {
    if (_conversationId == null) return;
    try {
      final data = await ApiService().getMessages(_conversationId!);
      if (mounted) {
        setState(() {
          _messages = (data['list'] as List? ?? []).cast<Map<String, dynamic>>();
        });
        _scrollToBottom();
      }
      // 历史消息为附加拉取：失败保留当前已加载消息、不阻断会话（A5 有意静默降级）
    } catch (_) {}
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _conversationId == null || _sending) return;
    setState(() => _sending = true);
    try {
      await ApiService().sendMessage(_conversationId!, text);
      _input.clear();
      await _loadMessages();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.human['name'] ?? '艺人';
    return LiquidScaffold(
      appBar: AppBar(
        title: Text(name, style: const TextStyle(color: AppTheme.goldLight, fontSize: 18)),
        backgroundColor: Colors.transparent,
        iconTheme: const IconThemeData(color: AppTheme.goldMain),
        elevation: 0,
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: AppTheme.card.withValues(alpha: 0.5),
            child: const Text(
              '为保障您的权益，请通过平台下单完成交易',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ),
          Expanded(
            child: _loading
                ? const LoadingView()
                : _initError
                    ? ErrorView(
                        message: '会话加载失败，请检查网络后重试',
                        onRetry: _initConversation,
                      )
                    : _messages.isEmpty
                        ? const EmptyView(
                            icon: Icons.forum_rounded,
                            title: '还没有聊天记录',
                            subtitle: '发送一条消息，和艺人打个招呼吧',
                          )
                        : ListView.builder(
                            controller: _scroll,
                            padding: const EdgeInsets.all(16),
                            itemCount: _messages.length,
                            itemBuilder: (ctx, i) => _bubble(_messages[i]),
                          ),
          ),
          Container(
            padding: EdgeInsets.only(
              left: 12, right: 12, top: 8,
              bottom: MediaQuery.of(context).padding.bottom + 8,
            ),
            color: AppTheme.surfaceDark,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                    maxLines: 4,
                    minLines: 1,
                    decoration: const InputDecoration(
                      hintText: '输入消息...',
                      hintStyle: TextStyle(color: AppTheme.textHint, fontSize: 14),
                      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                PressScale(
                  onTap: _sending ? null : _send,
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      gradient: AppTheme.brandGradient,
                      shape: BoxShape.circle,
                      boxShadow: AppTheme.ctaGlow,
                    ),
                    child: _sending
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: AppTheme.onGold, strokeWidth: 2))
                        : const Icon(Icons.send, color: AppTheme.onGold, size: 18),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> msg) {
    final isSystem = msg['isSystem'] == true;
    if (isSystem) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: AppTheme.card, borderRadius: BorderRadius.circular(12)),
            child: Text(msg['content'] ?? '', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
          ),
        ),
      );
    }

    final myId = ApiService().userId;
    final senderId = msg['senderId'];
    final isMine = myId != null && senderId != null &&
        (senderId is int ? senderId : int.tryParse(senderId.toString())) == myId;
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          gradient: isMine ? AppTheme.brandGradient : null,
          color: isMine ? null : AppTheme.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isMine ? const Radius.circular(16) : Radius.zero,
            bottomRight: isMine ? Radius.zero : const Radius.circular(16),
          ),
        ),
        child: Text(
          msg['content'] ?? '',
          style: TextStyle(
            color: isMine ? AppTheme.onGold : AppTheme.textPrimary,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}
