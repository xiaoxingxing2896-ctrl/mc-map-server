// 地图页：仅地图 + 标点
// - 首次进入 / 手动刷新 → 居中 (0,0)；其他操作（切页/切世界后回来）不重置视图
// - 左上角：刷新 + 世界切换；右上角：半透明登录状态；右下角：坐标（点击地图更新，长按复制）
// - 瓦片：自绘定位 + 本地缓存 + 每次查看增量检查更新下载（并发 3，性能优化）
// - 登录用户长按标点 → 屏幕中央大悬浮卡片（仅查看，✕ 关闭）
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api_client.dart';
import '../models.dart';
import '../stores.dart';
import '../theme.dart';

class MapPage extends StatefulWidget {
  const MapPage({super.key});
  @override
  State<MapPage> createState() => MapPageState();
}

class MapPageState extends State<MapPage> with WidgetsBindingObserver {
  // 视图状态（切页不重置）
  double _cx = 0, _cz = 0;
  double _scale = 1.0; // 2^zoom，范围 [0.125, 8]
  static const double _minScale = 0.125, _maxScale = 8.0;

  String _coordText = 'X: 0, Z: 0';
  bool _loading = true;
  String? _error;

  // 手势起始状态
  double _gestureScale = 1.0;
  double _gestureCx = 0, _gestureCz = 0;
  Offset _gestureFocal = Offset.zero;

  // 内存瓦片缓存（LRU 简化：超限清空）
  final Map<String, Uint8List> _mem = {};
  static const int _memLimit = 240;
  final Map<String, bool> _pending = {}; // 正在加载
  static const int _maxConcurrent = 3;
  int _inflight = 0;
  final List<String> _queue = [];

  Size _viewSize = Size.zero;

  // 长按标点查看卡片
  McMarker? _viewingMarker;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load(resetView: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // 前后台切换：回到前台时检查瓦片更新（不重置视图）
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkUpdate();
    }
  }

  /// 切回地图页时由 HomeShell 调用：增量检查更新，不重置视图
  void autoCheck() => _checkUpdate();

  /// 手动刷新：重置视图到 (0,0)
  void refresh() => _load(resetView: true);

  Future<void> _load({required bool resetView}) async {
    final world = AppState.I.world;
    setState(() {
      _loading = true;
      _error = null;
      if (resetView) {
        _cx = 0;
        _cz = 0;
        _scale = 1.0;
      }
    });
    try {
      final tiles = await ApiClient.fetchTiles(_tileWorld(world));
      AppState.I.setTiles(tiles);
      // 增量检查：删除本地已失效瓦片；缺失瓦片由视野内按需下载（不阻塞）
      unawaited(TileCache.cleanupWithIndex(world, tiles));
      // 标记
      final token = AppState.I.user?.token;
      final markers = await ApiClient.fetchMarkers(world, token: token);
      AppState.I.setMarkers(markers);
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
    // 预取视野瓦片到内存
    _prefetchVisible();
  }

  /// 检查瓦片更新（不重置视图）：重拉索引 + 增量下载
  Future<void> _checkUpdate() async {
    final world = AppState.I.world;
    try {
      final tiles = await ApiClient.fetchTiles(_tileWorld(world));
      AppState.I.setTiles(tiles);
      unawaited(TileCache.cleanupWithIndex(world, tiles));
      if (mounted) setState(() {});
    } catch (_) {}
  }

  // ---------- 手势 ----------
  void _onScaleStart(ScaleStartDetails d) {
    _gestureScale = _scale;
    _gestureCx = _cx;
    _gestureCz = _cz;
    _gestureFocal = d.focalPoint;
  }

  void _onScaleUpdate(ScaleUpdateDetails d) {
    final w = _viewSize.width, h = _viewSize.height;
    if (w <= 0 || h <= 0) return;
    final newScale = (_gestureScale * d.scale).clamp(_minScale, _maxScale);
    // 以起始 focal 处世界点为锚，保持该点不动
    final fx = (_gestureFocal.dx - w / 2) / _gestureScale + _gestureCx;
    final fz = (_gestureFocal.dy - h / 2) / _gestureScale + _gestureCz;
    setState(() {
      _scale = newScale;
      _cx = fx - (d.focalPoint.dx - w / 2) / newScale;
      _cz = fz - (d.focalPoint.dy - h / 2) / newScale;
    });
  }

  Offset _worldToScreen(double x, double z) {
    final w = _viewSize.width, h = _viewSize.height;
    return Offset((x - _cx) * _scale + w / 2, (z - _cz) * _scale + h / 2);
  }

  (double, double) _screenToWorld(Offset p) {
    final w = _viewSize.width, h = _viewSize.height;
    return ((p.dx - w / 2) / _scale + _cx, (p.dy - h / 2) / _scale + _cz);
  }

  void _onTapUp(TapUpDetails d) {
    final (wx, wz) = _screenToWorld(d.localPosition);
    setState(() => _coordText = 'X: ${wx.round()}, Z: ${wz.round()}');
  }

  void _onLongPress(LongPressStartDetails d) {
    final (wx, wz) = _screenToWorld(d.localPosition);
    // 命中标点？
    final hit = _hitMarker(d.localPosition);
    if (hit != null) {
      if (AppState.I.user == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('请先登录后再查看标注')));
        return;
      }
      setState(() => _viewingMarker = hit);
      return;
    }
    // 长按空白 → 复制坐标
    Clipboard.setData(ClipboardData(text: '${wx.round()}, ${wz.round()}'));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('已复制坐标 X: ${wx.round()}, Z: ${wz.round()}')));
  }

  McMarker? _hitMarker(Offset p) {
    for (final m in AppState.I.markers) {
      final s = _worldToScreen(m.x.toDouble(), m.z.toDouble());
      if ((s - p).distance < 26) return m;
    }
    return null;
  }

  // ---------- 瓦片加载 ----------
  void _prefetchVisible() {
    final visible = _visibleTiles();
    for (final t in visible) {
      _ensureTile(AppState.I.world, t.key);
    }
  }

  List<TileIndex> _visibleTiles() {
    final w = _viewSize.width, h = _viewSize.height;
    if (w <= 0) return const [];
    final x0 = _cx - w / 2 / _scale;
    final z0 = _cz - h / 2 / _scale;
    final x1 = _cx + w / 2 / _scale;
    final z1 = _cz + h / 2 / _scale;
    final list = <TileIndex>[];
    for (final t in AppState.I.tiles) {
      if (t.x + 1024 < x0 || t.x > x1) continue;
      if (t.z + 1024 < z0 || t.z > z1) continue;
      list.add(t);
    }
    return list;
  }

  void _ensureTile(String world, String key) {
    if (_mem.containsKey(key) || _pending[key] == true) return;
    _pending[key] = true;
    _queue.add(key);
    _pump();
  }

  void _pump() {
    while (_inflight < _maxConcurrent && _queue.isNotEmpty) {
      final key = _queue.removeAt(0);
      _inflight++;
      _loadTile(AppState.I.world, key).whenComplete(() {
        _inflight--;
        _pump();
      });
    }
  }

  Future<void> _loadTile(String world, String key) async {
    try {
      // 磁盘缓存
      final hasCache = await TileCache.has(world, key);
      if (hasCache) {
        final f = await _readFileBytes(world, key);
        if (f != null) {
          if (mounted) setState(() {
            _mem[key] = f;
            if (_mem.length > _memLimit) _mem.clear();
          });
          return;
        }
      }
      // 网络下载（索引里的 url）
      TileIndex? t;
      for (final e in AppState.I.tiles) {
        if (e.key == key) { t = e; break; }
      }
      if (t == null) return;
      final bytes = await ApiClient.fetchTileBytes(t.url);
      await TileCache.save(world, key, bytes);
      if (mounted) setState(() {
        _mem[key] = Uint8List.fromList(bytes);
        if (_mem.length > _memLimit) _mem.clear();
      });
    } catch (_) {
      // 失败静默，下次重试
    } finally {
      _pending[key] = false;
    }
  }

  Future<Uint8List?> _readFileBytes(String world, String key) async {
    try {
      final path = await TileCache.filePath(world, key);
      final f = await File(path).readAsBytes();
      return f;
    } catch (_) {
      return null;
    }
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color bg = dark ? McColors.darkBg : McColors.lightBg;
    final user = AppState.I.user;

    return LayoutBuilder(builder: (context, constraints) {
      _viewSize = constraints.biggest;
      return Container(
        color: bg,
        child: Stack(
          children: [
            // 地图画布
            Positioned.fill(
              child: GestureDetector(
                onScaleStart: _onScaleStart,
                onScaleUpdate: _onScaleUpdate,
                onTapUp: _onTapUp,
                onLongPressStart: _onLongPress,
                child: ClipRect(
                  child: Stack(
                    children: [
                      for (final t in _visibleTiles())
                        _buildTile(t),
                      if (AppState.I.markers.isNotEmpty)
                        for (final m in AppState.I.markers) _buildMarker(m),
                      // 世界原点十字
                      _buildOrigin(),
                    ],
                  ),
                ),
              ),
            ),
            if (_loading)
              const Center(child: CircularProgressIndicator(strokeWidth: 3)),
            if (_error != null)
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: refresh,
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('重试'),
                    ),
                  ],
                ),
              ),
            // 左上角：刷新 + 世界切换
            Positioned(
              left: 10,
              top: MediaQuery.of(context).padding.top + 10,
              child: Row(
                children: [
                  _roundButton(Icons.refresh, '刷新（回到 0,0）', refresh),
                  const SizedBox(width: 8),
                  _roundButton(Icons.public, '世界：${_worldName(AppState.I.world)}${AppState.I.world == 'end' ? '（主世界底图）' : ''}，点击切换',
                      _cycleWorld),
                ],
              ),
            ),
            // 右上角：登录状态（半透明）
            Positioned(
              right: 10,
              top: MediaQuery.of(context).padding.top + 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.35),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  user == null ? '未登录' : '👤 ${user.username}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ),
            ),
            // 右下角：坐标
            Positioned(
              right: 10,
              bottom: 10,
              child: GestureDetector(
                onLongPress: () {
                  Clipboard.setData(ClipboardData(text: _coordText));
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('已复制 $_coordText')));
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.35),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _coordText,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ),
            ),
            // 长按标点大卡片（屏幕中央）
            if (_viewingMarker != null) _buildViewCard(),
          ],
        ),
      );
    });
  }

  Widget _roundButton(IconData icon, String tooltip, VoidCallback onTap) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black.withOpacity(0.35),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(9),
            child: Icon(icon, color: Colors.white, size: 19),
          ),
        ),
      ),
    );
  }

  void _cycleWorld() {
    const order = ['overworld', 'nether', 'end'];
    final cur = AppState.I.world;
    final next = order[(order.indexOf(cur) + 1) % order.length];
    AppState.I.setWorld(next);
    _load(resetView: true);
  }

  // 末地不显示独立地图，瓦片复用主世界（标点仍按当前维度加载）
  String _tileWorld(String w) => w == 'end' ? 'overworld' : w;

  String _worldName(String w) =>
      w == 'overworld' ? '主世界' : (w == 'nether' ? '地狱' : '末地');

  Widget _buildTile(TileIndex t) {
    // 惰性加载：build 时发现缺失瓦片即入队（异步，不阻塞渲染）
    if (!_mem.containsKey(t.key)) {
      _ensureTile(AppState.I.world, t.key);
    }
    final s = _worldToScreen(t.x.toDouble(), t.z.toDouble());
    final size = 1024 * _scale;
    final bytes = _mem[t.key];
    return Positioned(
      left: s.dx,
      top: s.dy,
      width: size,
      height: size,
      child: bytes != null
          ? Image.memory(bytes, fit: BoxFit.fill, gaplessPlayback: true)
          : Container(color: Colors.black12),
    );
  }

  Widget _buildMarker(McMarker m) {
    final s = _worldToScreen(m.x.toDouble(), m.z.toDouble());
    final icon = m.icon.isNotEmpty ? m.icon : categoryIcon(m.category);
    return Positioned(
      left: s.dx - 16,
      top: s.dy - 16,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Theme.of(context).colorScheme.primary,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Text(icon, style: const TextStyle(fontSize: 15)),
      ),
    );
  }

  Widget _buildOrigin() {
    final s = _worldToScreen(0, 0);
    if (s.dx < -20 || s.dx > _viewSize.width + 20 || s.dy < -20 || s.dy > _viewSize.height + 20) {
      return const SizedBox.shrink();
    }
    return Positioned(
      left: s.dx - 1,
      top: s.dy - 1,
      child: Container(
        width: 2,
        height: 2,
        color: Colors.redAccent,
      ),
    );
  }

  Widget _buildViewCard() {
    final m = _viewingMarker!;
    return Positioned.fill(
      child: GestureDetector(
        onTap: () => setState(() => _viewingMarker = null),
        child: Container(
          color: Colors.black.withOpacity(0.35),
          alignment: Alignment.center,
          child: Material(
            elevation: 12,
            borderRadius: BorderRadius.circular(18),
            color: Theme.of(context).colorScheme.surface,
            child: Container(
              width: math.min(_viewSize.width - 40, 340),
              constraints: const BoxConstraints(maxHeight: 420),
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${m.icon.isNotEmpty ? m.icon : categoryIcon(m.category)} ${m.title}',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _viewingMarker = null),
                        child: const Padding(
                          padding: EdgeInsets.all(4),
                          child: Icon(Icons.close, size: 20),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text('坐标  X: ${m.x}, Z: ${m.z}',
                      style: const TextStyle(
                          fontFamily: 'monospace', fontSize: 13)),
                  const SizedBox(height: 8),
                  Text('类别  ${categoryName(m.category)}',
                      style: const TextStyle(fontSize: 13)),
                  if (m.description.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('描述  ${m.description}',
                        style: const TextStyle(
                            fontSize: 13, height: 1.5)),
                  ],
                  const SizedBox(height: 10),
                  Text('创建者  ${m.createdBy}',
                      style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.onSurface
                              .withOpacity(0.55))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}