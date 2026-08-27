// 标记页：顶部 ☰ 菜单键控制「类型/标记」栏目
// 类型栏目开启时按黄金分割（38.2% / 61.8%）划分，可收回拉出
// 标记按名称首字母（中文拼音）排序；类型含 全部/收藏/网页端全部分类
// 收藏各账号独立最多 20；卡片点击进入只读详情页，无长按反馈
import 'package:flutter/material.dart';
import 'package:lpinyin/lpinyin.dart';
import '../api_client.dart';
import '../models.dart';
import '../stores.dart';
import 'marker_detail_page.dart';

class MarkersPage extends StatefulWidget {
  const MarkersPage({super.key});
  @override
  State<MarkersPage> createState() => _MarkersPageState();
}

class _MarkersPageState extends State<MarkersPage> {
  bool _showTypes = false; // 类型栏目开/收
  String _typeFilter = 'all'; // all / fav / 类别id
  bool _loading = false;
  List<int> _favs = [];
  String _search = '';
  // 维度与标记列表独立于地图页：切换只影响本页
  String _world = 'overworld';
  List<McMarker> _markers = [];

  @override
  void initState() {
    super.initState();
    _reloadFavs();
    _ensureLoaded();
  }

  @override
  void dispose() {
    super.dispose();
  }

  void _reloadFavs() {
    final u = AppState.I.user;
    _favs = u != null ? MarkerFavorites.load(u.username) : const [];
  }

  Future<void> _ensureLoaded() async {
    if (_loading) return;
    // 先显示本地缓存，避免网络慢/超时时出现"暂无标记"
    if (_markers.isEmpty) {
      final cached = await MarkerCache.load(_world);
      if (cached.isNotEmpty && mounted) setState(() => _markers = cached);
    }
    _loading = true;
    try {
      final token = AppState.I.user?.token;
      _markers = await ApiClient.fetchMarkers(_world, token: token);
      await MarkerCache.save(_world, _markers); // 成功后写缓存
    } catch (_) {
      // 网络失败：保留缓存显示，不置空
    }
    _loading = false;
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu),
          tooltip: '类型栏目',
          onPressed: () => setState(() => _showTypes = !_showTypes),
        ),
        title: Row(
          children: [
            const Text('标记'),
            const SizedBox(width: 8),
            const SizedBox(width: 6),
            // 维度切换（主世界 / 地狱 / 末地）
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _world,
                  isDense: true,
                  icon: const Icon(Icons.arrow_drop_down, size: 16),
                  style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.primary),
                  items: const [
                    DropdownMenuItem(value: 'overworld', child: Text('主世界')),
                    DropdownMenuItem(value: 'nether', child: Text('地狱')),
                    DropdownMenuItem(value: 'end', child: Text('末地')),
                  ],
                  onChanged: (v) {
                    if (v != null && v != _world) {
                      setState(() => _world = v);
                      _ensureLoaded();
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          Expanded(
            child: Row(
              children: [
                // 类型栏目（黄金分割：38.2%）
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  width: _showTypes ? MediaQuery.of(context).size.width * 0.382 : 0,
                  child: _showTypes ? _buildTypeList() : null,
                ),
                // 标记列表（61.8%）
                Expanded(child: _buildMarkerList()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
      child: TextField(
        onChanged: (v) => setState(() => _search = v.trim()),
        decoration: InputDecoration(
          hintText: '搜索标记...',
          prefixIcon: const Icon(Icons.search, size: 20),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
        ),
      ),
    );
  }

  String _worldName(String w) =>
      w == 'overworld' ? '主世界' : (w == 'nether' ? '地狱' : '末地');

  Widget _buildTypeList() {
    final List<(String, String, String)> types = [
      ('all', '全部', '🗂️'),
      ('fav', '收藏', '⭐'),
      for (final c in kCategories) (c.id, c.name, c.icon),
    ];
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
            right: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: ListView.builder(
        itemCount: types.length,
        itemBuilder: (context, i) {
          final (id, name, icon) = types[i];
          final sel = _typeFilter == id;
          return InkWell(
            onTap: () => setState(() => _typeFilter = id),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              color: sel
                  ? Theme.of(context).colorScheme.primary.withOpacity(0.12)
                  : Colors.transparent,
              child: Row(
                children: [
                  Text(icon),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(name,
                        style: TextStyle(
                            fontWeight:
                                sel ? FontWeight.w700 : FontWeight.w500,
                            color: sel
                                ? Theme.of(context).colorScheme.primary
                                : null)),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  List<McMarker> _filtered() {
    final all = List<McMarker>.from(_markers);
    switch (_typeFilter) {
      case 'all':
        break;
      case 'fav':
        all.removeWhere((m) => !_favs.contains(m.id));
        break;
      default:
        all.removeWhere((m) => m.category != _typeFilter);
    }
    // 搜索过滤
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      all.removeWhere((m) => !m.title.toLowerCase().contains(q));
    }
    // 按名称首文字首字母排序（中文按拼音）
    all.sort((a, b) => _sortKey(a.title).compareTo(_sortKey(b.title)));
    return all;
  }

  String _sortKey(String s) {
    if (s.isEmpty) return '';
    final first = s[0];
    final code = first.codeUnitAt(0);
    if (code >= 0x4E00 && code <= 0x9FFF) {
      try {
        final py = PinyinHelper.getFirstWordPinyin(first);
        if (py.isNotEmpty) return py[0].toUpperCase() + s;
      } catch (_) {}
    }
    return s.toUpperCase();
  }

  Widget _buildMarkerList() {
    final list = _filtered();
    if (list.isEmpty) {
      return const Center(child: Text('暂无标记', style: TextStyle(fontSize: 13)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(10),
      itemCount: list.length,
      itemBuilder: (context, i) {
        final m = list[i];
        return _buildCard(m);
      },
    );
  }

  Widget _buildCard(McMarker m) {
    final icon = m.icon.isNotEmpty ? m.icon : categoryIcon(m.category);
    final isFav = _favs.contains(m.id);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => MarkerDetailPage(marker: m),
          ));
        },
        child: Padding(
          padding: const EdgeInsets.all(13),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(icon, style: const TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(
                      '${categoryName(m.category)} · X: ${m.x}, Z: ${m.z}',
                      style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withOpacity(0.55)),
                    ),
                  ],
                ),
              ),
              // 收藏（各账号独立，最多 20）
              GestureDetector(
                onTap: () => _toggleFav(m.id),
                child: Icon(
                  isFav ? Icons.star : Icons.star_border,
                  color: isFav ? Colors.amber : null,
                  size: 22,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _toggleFav(int markerId) async {
    final u = AppState.I.user;
    if (u == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先登录后再收藏标注')));
      return;
    }
    _favs = await MarkerFavorites.toggle(u.username, markerId);
    if (_favs.length >= MarkerFavorites.max) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('收藏已达上限（20 个）')));
    }
    if (mounted) setState(() {});
  }
}