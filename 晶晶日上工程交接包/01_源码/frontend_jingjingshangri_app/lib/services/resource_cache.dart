import 'dart:async';

/// 会话级只读资源缓存（Gate0 性能修复零件，对应执行协议 4.3）。
///
/// 解决三个已确认的结构性问题（见 docs/CURRENT_EXECUTION_STATE.md R2/R3）：
/// 1. 数据只存在页面 State、切 Tab dispose 即丢 → 这里在会话内持有最近一次数据；
/// 2. 同一资源被重复请求 → 同 key 的在途请求共享同一个 Future（请求去重）；
/// 3. 每次刷新都清空回骨架 → stale-while-revalidate：有旧值先立即返回，后台静默刷新，
///    刷新成功再通知更新，刷新失败保留旧值（refreshErrorWithData，不把用户踢回错误页）。
///
/// 边界：只做**会话级内存**缓存，不做磁盘持久化；纯 Dart、不依赖 Flutter，便于单测；
/// 运行在主 isolate 事件循环上，靠"无 await 间隙的同步段"保证去重正确，无需锁。
/// 不改变任何接口/商业逻辑，页面是否接入、如何 setState 由测量后的最小修复决定。
class ResourceCache {
  ResourceCache({Duration ttl = const Duration(seconds: 30), DateTime Function()? clock})
      : defaultTtl = ttl,
        _clock = clock ?? DateTime.now;

  /// 超过该时长视为 stale，可在后台刷新（旧值仍可立即展示）。
  final Duration defaultTtl;
  final DateTime Function() _clock;
  final Map<String, _Slot<Object?>> _slots = {};

  /// 后台静默刷新成功（旧值已被新值替换）时回调，页面据此 setState，不回骨架。
  void Function(String key, Object value)? onUpdated;

  /// 后台静默刷新失败时回调；旧值仍保留，页面可轻提示而非整页错误。
  void Function(String key, Object error)? onUpdateError;

  bool _fresh(_Slot<Object?> s, Duration? ttl) =>
      s.data != null &&
      s.at != null &&
      _clock().difference(s.at!) < (ttl ?? defaultTtl);

  /// 读取资源。
  /// - 无数据：执行 [loader] 并等待（页面显示 initialLoading）；
  /// - 有数据且新鲜：直接返回缓存，不发请求；
  /// - 有数据但过期：立即返回旧值，同时后台刷新（SWR）；
  /// - 同 key 已有在途请求：复用其 Future（去重）；
  /// - [force]=true：强制重新请求（下拉刷新），结果覆盖缓存。
  Future<T> fetch<T>(
    String key,
    Future<T> Function() loader, {
    Duration? ttl,
    bool force = false,
  }) {
    final slot = _slots.putIfAbsent(key, _Slot.new);

    // 在途去重：强制刷新时不走复用。
    if (!force && slot.inflight != null) {
      return slot.inflight!.then((v) => v as T);
    }

    final hasData = slot.data != null;
    if (hasData && !force) {
      if (_fresh(slot, ttl)) {
        return Future<T>.value(slot.data as T);
      }
      // stale：先回旧值，后台静默刷新（不阻塞调用方）。
      _refreshInBackground<T>(key, slot, loader);
      return Future<T>.value(slot.data as T);
    }

    return _run<T>(slot, loader);
  }

  /// 同步查看当前缓存（不触发请求），无则 null。
  T? peek<T>(String key) => _slots[key]?.data as T?;

  /// 是否已有可立即展示的数据（无论是否 stale）。
  bool hasData(String key) => _slots[key]?.data != null;

  /// 是否存在在途请求。
  bool isLoading(String key) => _slots[key]?.inflight != null;

  Future<T> _run<T>(_Slot<Object?> slot, Future<T> Function() loader) {
    final Future<T> fut = loader().then((v) {
      slot.data = v;
      slot.at = _clock();
      slot.inflight = null;
      return v;
    }, onError: (e) {
      slot.inflight = null;
      throw e;
    });
    // 去重登记：该链吞掉错误，避免产生未处理异步异常（错误仍由返回的 [fut] 向调用方传播），
    // 并在结束时把在途标记复位。
    slot.inflight = fut.then<Object?>((v) => v).catchError((Object e) {
      slot.inflight = null;
      return null;
    });
    return fut;
  }

  void _refreshInBackground<T>(
    String key,
    _Slot<Object?> slot,
    Future<T> Function() loader,
  ) {
    if (slot.inflight != null) return; // 已在刷新，不重复。
    _run<T>(slot, loader).then((v) {
      onUpdated?.call(key, v as Object);
    }).catchError((Object e) {
      // 旧值未被清除仍保留在 slot.data，仅通知后台刷新失败（refreshErrorWithData）。
      onUpdateError?.call(key, e);
    });
  }

  /// 使单个 key 失效（下次 fetch 会重新请求；不清当前展示数据）。
  void invalidate(String key) => _slots[key]?.at = null;

  /// 移除单个 key 的全部缓存。
  void remove(String key) => _slots.remove(key);

  /// 清空全部会话缓存（如退出登录）。
  void clear() => _slots.clear();
}

class _Slot<T> {
  T? data;
  DateTime? at;
  Future<T?>? inflight;
}
