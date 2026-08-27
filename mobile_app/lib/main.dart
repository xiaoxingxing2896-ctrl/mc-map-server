// MC Server Map 移动端 App 入口
// 底部导航：服务器 | wiki | [地图·凸起] | 标记 | 我的
import 'dart:async';
import 'package:flutter/material.dart';
import 'pages/map_page.dart';
import 'pages/markers_page.dart';
import 'pages/wiki_page.dart';
import 'pages/profile_page.dart';
import 'pages/servers_page.dart';
import 'widgets/bottom_nav.dart';
import 'api_client.dart';
import 'stores.dart';
import 'theme.dart';

// 全局 Wiki 页 key：供「我的」收藏/历史跳转打开
final GlobalKey<WikiPageState> wikiNavKey = GlobalKey<WikiPageState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AuthStore.init(); // 读取登录缓存等本地数据
  // 恢复 7 天免验证登录态（load 内部处理过期自动清除）
  final cached = AuthStore.load();
  AppState.I.setUser(cached);
  if (cached != null) {
    // 后台校验 token：若已失效（如服务端密钥轮换）自动清除
    unawaited(() async {
      final ok = await ApiClient.validateToken(cached.token);
      if (!ok) {
        await AuthStore.clear();
        AppState.I.setUser(null);
      }
    }());
  }
  runApp(const McApp());
}

class McApp extends StatelessWidget {
  const McApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MC Server Map',
      debugShowCheckedModeBanner: false,
      theme: buildMcTheme(Brightness.light),
      darkTheme: buildMcTheme(Brightness.dark),
      themeMode: ThemeMode.system, // 跟随系统自动切换明暗
      home: const HomeShell(),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> {
  static HomeShellState? instance;

  int _index = 2; // 默认进入地图页（居中突出项）
  final GlobalKey<MapPageState> _mapKey = GlobalKey<MapPageState>();

  @override
  void initState() {
    super.initState();
    instance = this;
  }

  @override
  void dispose() {
    if (instance == this) instance = null;
    super.dispose();
  }

  /// 供「我的」收藏/历史跳转切换到 Wiki tab
  void switchTo(int i) => _onTab(i);

  void _onTab(int i) {
    if (i == _index) return;
    // 切出 Wiki → 记录最后浏览页面到历史
    if (_index == 1 && i != 1) {
      wikiNavKey.currentState?.recordExit();
    }
    setState(() => _index = i);
    // 切到地图 → 增量检查瓦片更新（不重置视图位置）
    if (i == 2) {
      _mapKey.currentState?.autoCheck();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // IndexedStack 保活各页状态（地图位置、滚动位置等不因切页丢失）
      body: IndexedStack(
        index: _index,
        children: [
          const ServersPage(),
          WikiPage(key: wikiNavKey),
          MapPage(key: _mapKey),
          const MarkersPage(),
          const ProfilePage(),
        ],
      ),
      bottomNavigationBar: BottomNavBar(
        index: _index,
        onTap: _onTab,
      ),
    );
  }
}