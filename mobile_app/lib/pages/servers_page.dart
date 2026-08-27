// 服务器页：监控在线人数 / 在线玩家 / 延迟（MC Server List Ping，与苦力怕娘同途径）
// - 每 1 分钟由系统自动刷新一次（用户无法手动刷新）
// - 卡片化：成功=绿色泛光恒常；新添加未获取到=红色泛光闪烁；连续失败3次=冻结样式+失败持续时间；恢复成功解除
// - 右上角 + 添加服务器（域名，最多 5 个）；📌 置顶（多个置顶可拖动排序）
// - 长按卡片：上浮 + 其余界面模糊 → 菜单（收藏·修改域名·删除）；单击：下沉反馈无功能
import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import '../mc_ping.dart';
import '../models.dart';
import '../stores.dart';
import '../theme.dart';

class ServersPage extends StatefulWidget {
  const ServersPage({super.key});
  @override
  State<ServersPage> createState() => _ServersPageState();
}

class _ServersPageState extends State<ServersPage> with WidgetsBindingObserver {
  List<ServerEntry> _list = [];
  Timer? _timer;
  bool _pinging = false;
  ServerEntry? _longPressed; // 长按中的卡片
  String? _pressedId; // 单击下沉中的卡片
  int _seq = 0; // 红闪动画
  Timer? _blinkTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _list = ServersStore.load();
    _pingAll();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _pingAll());
    // 红闪动画：仅当存在 pending(新添加未获取) 卡片时驱动
    _blinkTimer = Timer.periodic(const Duration(milliseconds: 600), (_) {
      if (_list.any((e) => e.status == ServerStatus.pending) && mounted) {
        setState(() => _seq++);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _blinkTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(minutes: 1), (_) => _pingAll());
      if (_blinkTimer == null) {
        _blinkTimer = Timer.periodic(const Duration(milliseconds: 600), (_) {
          if (_list.any((e) => e.status == ServerStatus.pending) && mounted) {
            setState(() => _seq++);
          }
        });
      }
      _pingAll();
    } else if (state == AppLifecycleState.paused) {
      _timer?.cancel();
      _timer = null; // 后台暂停轮询，降低性能负担
      _blinkTimer?.cancel();
      _blinkTimer = null;
    }
  }

  void _markFail(ServerEntry e) {
    e.failCount++;
    if (e.failCount >= 3) {
      if (!e.isFrozen) e.frozenSince = DateTime.now();
      e.status = ServerStatus.frozen;
    } else if (e.status != ServerStatus.frozen) {
      if (e.status != ServerStatus.ok) e.status = ServerStatus.pending;
    }
  }

  Future<void> _pingAll() async {
    if (_pinging || _list.isEmpty) return;
    _pinging = true;
    await Future.wait(_list.map((e) => _pingOne(e)));
    _pinging = false;
    await ServersStore.save(_list);
    if (mounted) setState(() {});
  }

  Future<void> _pingOne(ServerEntry e) async {
    var host = e.host;
    var port = e.port;
    // 总是先查 SRV 记录（_minecraft._tcp.<host>）：
    // 查到 → 用 SRV 真实地址；查不到 → 用配置端口（0 时兜底 25565）
    try {
      final srv = await lookupMcSrv(e.host);
      if (srv != null) {
        host = srv.$1;
        port = srv.$2;
      } else if (port == 0) {
        port = 25565; // 无 SRV 且未指定端口：按默认端口尝试
      }
    } catch (_) {
      if (port == 0) port = 25565;
    }
    try {
      final r = await pingServer(host, port);
      e.online = r.online;
      e.maxPlayers = r.max;
      e.players = r.players;
      e.latencyMs = r.latencyMs;
      e.failCount = 0;
      e.frozenSince = null;
      e.status = ServerStatus.ok;
    } catch (_) {
      _markFail(e);
    }
  }

  // ---------- 添加 ----------
  Future<void> _addServer() async {
    if (_list.length >= ServersStore.max) {
      _toast('最多添加 ${ServersStore.max} 个服务器');
      return;
    }
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('添加服务器'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(
            hintText: '例：mc.example.com（有 SRV 自动解析；或写 域名:端口）',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('添加')),
        ],
      ),
    );
    if (ok != true) return;
    final raw = ctrl.text.trim();
    if (raw.isEmpty) return;
    var host = raw;
    var port = 0; // 未指定端口：不假设 25565，ping 时靠 SRV 解析
    if (raw.contains(':')) {
      final parts = raw.split(':');
      host = parts[0].trim();
      port = int.tryParse(parts[1].trim()) ?? 0;
    }
    if (host.isEmpty) return;
    // 去重
    if (_list.any((e) => e.host == host && e.port == port)) {
      _toast('该服务器已存在');
      return;
    }
    setState(() {
      _list.add(ServerEntry(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        host: host,
        port: port,
        addedAt: DateTime.now(),
      ));
    });
    await ServersStore.save(_list);
    _pingAll();
  }

  // ---------- 修改域名 ----------
  Future<void> _editServer(ServerEntry e) async {
    final ctrl = TextEditingController(text: e.port > 0 ? e.host + ':' + e.port.toString() : e.host);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改域名'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '例：mc.example.com:25565',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('保存')),
        ],
      ),
    );
    if (ok != true) return;
    final raw = ctrl.text.trim();
    if (raw.isEmpty) return;
    var host = raw;
    var port = 0; // 未指定端口：不假设 25565，ping 时靠 SRV 解析
    if (raw.contains(':')) {
      final parts = raw.split(':');
      host = parts[0].trim();
      port = int.tryParse(parts[1].trim()) ?? 0;
    }
    if (host.isEmpty) return;
    setState(() {
      e.host = host;
      e.port = port;
      e.failCount = 0;
      e.frozenSince = null;
      e.status = ServerStatus.pending;
    });
    await ServersStore.save(_list);
    _pingAll();
  }

  Future<void> _deleteServer(ServerEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除服务器'),
        content: Text('确定删除 ${e.host}:${e.port} 吗？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _list.remove(e));
    await ServersStore.save(_list);
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('服务器'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: '添加服务器（最多 5 个）',
            onPressed: _addServer,
          ),
        ],
      ),
      body: Stack(
        children: [
          // 列表（长按菜单时被模糊）
          _list.isEmpty ? _buildEmpty() : _buildList(),
          if (_longPressed != null) _buildLongPressOverlay(),
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.dns_outlined,
              size: 56, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.25)),
          const SizedBox(height: 10),
          const Text('还没有监控的服务器', style: TextStyle(fontSize: 13)),
          const SizedBox(height: 4),
          Text('点右上角 + 添加（最多 5 个）',
              style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5))),
        ],
      ),
    );
  }

  Widget _buildList() {
    final pinned = _list.where((e) => e.pinned).toList();
    final normal = _list.where((e) => !e.pinned).toList();
    final ordered = [...pinned, ...normal];
    return ReorderableListView.builder(
      padding: const EdgeInsets.all(12),
      buildDefaultDragHandles: false,
      itemCount: ordered.length,
      onReorder: (oldIndex, newIndex) {
        setState(() {
          if (newIndex > oldIndex) newIndex--;
          final item = ordered.removeAt(oldIndex);
          ordered.insert(newIndex, item);
          // 重新分区：置顶在前
          final newPinned = ordered.where((e) => e.pinned).toList();
          final newNormal = ordered.where((e) => !e.pinned).toList();
          _list = [...newPinned, ...newNormal];
        });
        ServersStore.save(_list);
      },
      itemBuilder: (context, i) {
        final e = ordered[i];
        return _buildCard(e, i);
      },
    );
  }

  Widget _buildCard(ServerEntry e, int index, {bool overlay = false}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color? border = e.status == ServerStatus.ok
        ? (dark ? McColors.darkGreenBright : McColors.lightGreen)
        : (e.status == ServerStatus.frozen
            ? Theme.of(context).dividerColor
            : (dark ? McColors.darkDanger : McColors.lightDanger));

    // 浮层卡片恒上浮；底层列表不因长按放大（仅单击下沉），避免重复浮现
    final scale = overlay
        ? 1.03
        : (_pressedId == e.id ? 0.96 : 1.0);

    return Padding(
      key: ValueKey(e.id),
      padding: const EdgeInsets.only(bottom: 12),
      child: AnimatedScale(
        scale: scale,
        duration: const Duration(milliseconds: 120),
        child: GestureDetector(
          onTapDown: (_) => setState(() => _pressedId = e.id), // 下沉反馈
          onTapUp: (_) => setState(() => _pressedId = null),
          onTapCancel: () => setState(() => _pressedId = null),
          onLongPress: () => setState(() => _longPressed = e),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                  color: border ?? Colors.transparent, width: 1.6),
              boxShadow: _glow(e),
            ),
            child: _buildCardBody(e, index),
          ),
        ),
      ),
    );
  }

  List<BoxShadow> _glow(ServerEntry e) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    switch (e.status) {
      case ServerStatus.ok:
        final g = dark ? McColors.darkGreenBright : McColors.lightGreen;
        return [
          BoxShadow(
            color: g.withOpacity(0.45),
            blurRadius: 14,
            spreadRadius: 1,
          ),
        ];
      case ServerStatus.pending:
        final r = dark ? McColors.darkDanger : McColors.lightDanger;
        // 红泛光闪烁：_seq 奇偶交替
        final on = (_seq ~/ 1) % 2 == 0;
        return [
          BoxShadow(
            color: r.withOpacity(on ? 0.5 : 0.15),
            blurRadius: 12,
            spreadRadius: 1,
          ),
        ];
      case ServerStatus.frozen:
        return [
          BoxShadow(
            color: Colors.black.withOpacity(dark ? 0.3 : 0.06),
            blurRadius: 6,
          ),
        ];
    }
  }

  Widget _buildCardBody(ServerEntry e, int index) {
    final muted = Theme.of(context).colorScheme.onSurface.withOpacity(0.55);
    final String statusText;
    final Color statusColor;
    switch (e.status) {
      case ServerStatus.ok:
        statusText = '在线';
        statusColor = const Color(0xFF3B8526);
        break;
      case ServerStatus.pending:
        statusText = '获取中…';
        statusColor = Theme.of(context).colorScheme.error;
        break;
      case ServerStatus.frozen:
        statusText = '获取失败';
        statusColor = muted;
        break;
    }
    final frozenText = e.isFrozen && e.frozenSince != null
        ? ' · 已持续 ${_durationText(DateTime.now().difference(e.frozenSince!))}'
        : '';

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                e.status == ServerStatus.ok
                    ? Icons.check_circle
                    : (e.status == ServerStatus.frozen
                        ? Icons.block
                        : Icons.sync),
                size: 18,
                color: statusColor,
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(e.port > 0 ? e.host + ':' + e.port.toString() : e.host,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              // 置顶开关（仅系统排序用，不影响状态）
              GestureDetector(
                onTap: () {
                  setState(() => e.pinned = !e.pinned);
                  ServersStore.save(_list);
                },
                child: Icon(
                  e.pinned ? Icons.push_pin : Icons.push_pin_outlined,
                  size: 19,
                  color: e.pinned ? Colors.orange : muted,
                ),
              ),
              // 置顶卡片拖动把手
              if (e.pinned)
                ReorderableDragStartListener(
                  index: index,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(Icons.drag_indicator, size: 20),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          // 在线人数
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${e.online}',
                  style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      color: e.status == ServerStatus.ok
                          ? (Theme.of(context).brightness == Brightness.dark
                              ? McColors.darkGreenBright
                              : McColors.lightGreen)
                          : Theme.of(context).colorScheme.onSurface)),
              Text(' / ${e.maxPlayers} 人',
                  style: TextStyle(fontSize: 13, color: muted)),
              const Spacer(),
              Text('${e.latencyMs} ms',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: e.latencyMs > 0 && e.latencyMs < 120
                          ? const Color(0xFF3B8526)
                          : (e.latencyMs >= 120 ? Colors.orange : muted))),
            ],
          ),
          const SizedBox(height: 8),
          // 玩家列表
          Text(
            e.players.isEmpty
                ? (e.status == ServerStatus.ok ? '暂无玩家在线' : statusText + frozenText)
                : '在线玩家：${e.players.take(8).join('、')}'
                    '${e.players.length > 8 ? ' 等 ${e.players.length} 人' : ''}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12.5, color: muted, height: 1.5),
          ),
          const SizedBox(height: 4),
          Text(statusText + frozenText,
              style: TextStyle(fontSize: 11, color: statusColor)),
        ],
      ),
    );
  }

  String _durationText(Duration d) {
    if (d.inHours > 0) return '${d.inHours} 小时 ${d.inMinutes % 60} 分';
    if (d.inMinutes > 0) return '${d.inMinutes} 分钟';
    return '${d.inSeconds} 秒';
  }

  // ---------- 长按浮层 ----------
  Widget _buildLongPressOverlay() {
    final e = _longPressed!;
    return Positioned.fill(
      child: GestureDetector(
        onTap: () => setState(() => _longPressed = null),
        child: Stack(
          children: [
            // 模糊其余界面（底部导航栏在 Scaffold 层，不受影响）
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                child: Container(
                  color: Colors.black.withOpacity(0.4),
                ),
              ),
            ),
            // 长按卡片上浮预览：紧凑尺寸，避免过大遮挡
            Center(
              child: FractionallySizedBox(
                widthFactor: 0.72,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(context).size.height * 0.5,
                  ),
                  child: IgnorePointer(
                    child: _buildCard(e, 0, overlay: true),
                  ),
                ),
              ),
            ),
            // 功能菜单（底部弹出，iOS 风格）
            Positioned(
              left: 12,
              right: 12,
              bottom: 20,
              child: Material(
                color: Colors.transparent,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        children: [
                          _menuItem(
                              Icons.star_outline, '收藏',
                              () => _fav(e)),
                          _divider(),
                          _menuItem(Icons.edit_outlined, '修改域名',
                              () => _edit(e)),
                          _divider(),
                          _menuItem(Icons.delete_outline, '删除',
                              () => _del(e),
                              danger: true),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: TextButton(
                        onPressed: () => setState(() => _longPressed = null),
                        child: const Text('取消'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _divider() =>
      Divider(height: 1, thickness: 0.5, color: Theme.of(context).dividerColor);

  Widget _menuItem(
      IconData icon, String label, VoidCallback onTap,
      {bool danger = false}) {
    final color = danger
        ? Theme.of(context).colorScheme.error
        : Theme.of(context).colorScheme.onSurface;
    return ListTile(
      leading: Icon(icon, color: danger ? color : null, size: 21),
      title: Text(label,
          style: TextStyle(
              fontSize: 14,
              color: color,
              fontWeight: FontWeight.w500)),
      onTap: () {
        setState(() => _longPressed = null);
        onTap();
      },
    );
  }

  void _fav(ServerEntry e) {
    ServerFavorites.toggle('${e.host}:${e.port}');
    _toast(ServerFavorites.isFav('${e.host}:${e.port}')
        ? '已收藏服务器'
        : '已取消收藏');
  }

  void _edit(ServerEntry e) => _editServer(e);
  void _del(ServerEntry e) => _deleteServer(e);
}