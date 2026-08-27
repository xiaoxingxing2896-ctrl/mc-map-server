// Wiki 页：接入 Minecraft Wiki（zh.minecraft.wiki）WebView，可搜索
// - 登录用户点 📸 → 将当前页面地址记录到收藏（未登录无反应）
// - 浏览历史：记录单次进入 wiki 的最后页面地址（退出/切页时写入，最多 50）
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../stores.dart';

class WikiPage extends StatefulWidget {
  const WikiPage({super.key});
  @override
  State<WikiPage> createState() => WikiPageState();
}

class WikiPageState extends State<WikiPage> {
  final TextEditingController _searchCtrl = TextEditingController();
  late final WebViewController _controller;
  String? _lastUrl;
  String _lastTitle = '';
  int _progress = 0; // webview 加载进度 0-100
  bool _refreshing = false; // 下拉刷新状态


  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF7F7F5))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) {
          _progress = p;
          if (p >= 100) {
            _refreshing = false;
            _progress = 0;
          }
          if (mounted) setState(() {});
        },
        onPageStarted: (url) {
          // 离开上一页：把最后停留地址记入历史
          if (_lastUrl != null && _lastUrl != url) {
            _commitHistory();
          }
        },
        onPageFinished: (url) async {
          _lastUrl = url;
          try {
            final t = await _controller.getTitle();
            if (t != null && t.isNotEmpty) _lastTitle = t;
          } catch (_) {}
          if (mounted) setState(() {});
        },
      ))
      ..loadRequest(Uri.parse('https://zh.minecraft.wiki/'));
  }

  @override
  void dispose() {
    _commitHistory(); // 退出 wiki 时记录最后页面
    _searchCtrl.dispose();
    super.dispose();
  }

  /// 切走页面时由 HomeShell 调用
  void recordExit() => _commitHistory();

  void _commitHistory() {
    final u = _lastUrl;
    if (u == null || u.isEmpty || u.startsWith('about:')) return;
    WikiStore.addHistory(u, _lastTitle.isEmpty ? u : _lastTitle);
  }

  /// 从「我的」收藏/历史跳转打开指定网址
  void loadUrl(String url) {
    _controller.loadRequest(Uri.parse(url));
  }
  void _search() {
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) return;
    _controller.loadRequest(Uri.parse(
        'https://zh.minecraft.wiki/index.php?search=${Uri.encodeQueryComponent(q)}'));
  }



  @override
  Widget build(BuildContext context) {
    final user = AppState.I.user;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Container(
          height: 38,
          margin: const EdgeInsets.only(right: 8),
          child: TextField(
            controller: _searchCtrl,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(
              hintText: '搜索 MC百科…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: IconButton(
                icon: const Icon(Icons.arrow_forward, size: 18),
                onPressed: _search,
              ),
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
            onPressed: () {
              _refreshing = true;
              setState(() {});
              _controller.reload();
            },
          ),
        ],
      ),
      body: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) async {
          if (didPop) return;
          // 二级页面返回：WebView 有历史则后退；无历史则正常退出
          try {
            if (await _controller.canGoBack()) {
              _controller.goBack();
            } else {
              SystemNavigator.pop();
            }
          } catch (_) {
            SystemNavigator.pop();
          }
        },
        child: Stack(
          children: [
            WebViewWidget(controller: _controller),
            // 加载进度条
            if (_progress > 0 && _progress < 100)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  value: _progress / 100,
                  minHeight: 2,
                ),
              ),

          ],
        ),
      ),
    );
  }
}