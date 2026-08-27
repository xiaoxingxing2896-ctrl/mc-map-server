// Wiki 页：接入 MC百科（mcmod.cn）WebView，可搜索
// - 登录用户点 📸 → 将当前页面地址记录到收藏（未登录无反应）
// - 浏览历史：记录单次进入 wiki 的最后页面地址（退出/切页时写入，最多 50）
import 'package:flutter/material.dart';
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


  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF7F7F5))
      ..setNavigationDelegate(NavigationDelegate(
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
      ..loadRequest(Uri.parse('https://www.mcmod.cn'));
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
        'https://www.mcmod.cn/s?key=${Uri.encodeQueryComponent(q)}'));
  }

  void _captureFavorite() {
    final user = AppState.I.user;
    if (user == null) return; // 未登录截图不作反应
    final u = _lastUrl;
    if (u == null || u.isEmpty) return;
    WikiStore.addFavorite(u, _lastTitle.isEmpty ? u : _lastTitle);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('已收藏当前页面到「我的」')));
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
          // 截屏收藏：仅登录用户有效
          IconButton(
            icon: Icon(Icons.photo_camera_outlined,
                color: user == null
                    ? Theme.of(context).disabledColor
                    : Theme.of(context).colorScheme.primary),
            tooltip: user == null ? '登录后可用' : '收藏当前页面',
            onPressed: _captureFavorite,
          ),
        ],
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}