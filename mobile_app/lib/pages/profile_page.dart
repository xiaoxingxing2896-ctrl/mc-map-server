// 我的页：账号详情
// - 未登录：邮箱+密码登录（缓存 7 天免验证登录）
// - 已登录：展示昵称/角色/邮箱，个人信息不可修改（与网页同步）
// - 下方：收藏 / 历史记录 —— 新到旧排序，均最多 50 条
//   长按复制；点击跳转 Wiki 打开（返回回到跳转前界面）；< 返回
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api_client.dart';
import '../models.dart';
import '../stores.dart';
import '../theme.dart';
import 'wiki_page.dart';
import '../main.dart' show HomeShellState, wikiNavKey;

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passCtrl = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    AppState.I.addListener(_onState);
  }

  @override
  void dispose() {
    AppState.I.removeListener(_onState);
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  void _onState() {
    if (mounted) setState(() {});
  }

  Future<void> _login() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      _toast('请输入邮箱和密码');
      return;
    }
    setState(() => _busy = true);
    try {
      final u = await ApiClient.login(email, pass);
      await AuthStore.save(u);
      AppState.I.setUser(u);
      _toast('登录成功，欢迎 ${u.username}');
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    await AuthStore.clear();
    AppState.I.setUser(null);
    _toast('已退出登录');
  }

  void _toast(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: error ? Theme.of(context).colorScheme.error : null));
  }

  @override
  Widget build(BuildContext context) {
    final user = AppState.I.user;
    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: user == null ? _buildLogin() : _buildProfile(user),
    );
  }

  // ---------- 未登录 ----------
  Widget _buildLogin() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 30),
          const Icon(Icons.map, size: 64, color: Color(0xFF3B8526)),
          const SizedBox(height: 12),
          const Text('登录 MC Server Map',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text('登录状态保留 7 天',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withOpacity(0.55))),
          const SizedBox(height: 28),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
                labelText: '邮箱', hintText: 'your@example.com'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _passCtrl,
            obscureText: true,
            decoration: const InputDecoration(labelText: '密码'),
            onSubmitted: (_) => _login(),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _login,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: const Color(0xFF3B8526),
            ),
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('登录', style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }

  // ---------- 已登录 ----------
  Widget _buildProfile(AppUser user) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color muted = dark ? McColors.darkMuted : McColors.lightMuted;
    final roleIcon = user.role == 'owner'
        ? '👑'
        : (user.role == 'admin' ? '🛡️' : '👤');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 账号卡片（不可修改，与网页同步）
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor:
                      Theme.of(context).colorScheme.primary.withOpacity(0.15),
                  child: Text(roleIcon, style: const TextStyle(fontSize: 26)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(user.username,
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(user.role,
                                style: TextStyle(
                                    fontSize: 10,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .primary)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(user.email ?? '',
                          style: TextStyle(fontSize: 12, color: muted)),
                      const SizedBox(height: 2),
                      Text('个人信息与网页同步，不可修改',
                          style: TextStyle(fontSize: 11, color: muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        // 收藏
        Card(
          child: ListTile(
            leading: const Icon(Icons.star, color: Colors.amber),
            title: const Text('收藏'),
            subtitle: Text('${WikiStore.loadFavorites().length} 条 Wiki 收藏',
                style: TextStyle(fontSize: 12, color: muted)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const _RecordListPage(isFavorite: true)));
            },
          ),
        ),
        const SizedBox(height: 8),
        // 历史记录
        Card(
          child: ListTile(
            leading: const Icon(Icons.history),
            title: const Text('历史记录'),
            subtitle: Text('${WikiStore.loadHistory().length} 条 Wiki 浏览记录',
                style: TextStyle(fontSize: 12, color: muted)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const _RecordListPage(isFavorite: false)));
            },
          ),
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: _logout,
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('退出登录'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(46),
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
        ),
      ],
    );
  }
}

// ============ 收藏 / 历史列表页（新到旧，最多 50，长按复制，点击跳 Wiki） ============
class _RecordListPage extends StatefulWidget {
  final bool isFavorite;
  const _RecordListPage({required this.isFavorite});

  @override
  State<_RecordListPage> createState() => _RecordListPageState();
}

class _RecordListPageState extends State<_RecordListPage> {
  late List<WikiRecord> _items;

  @override
  void initState() {
    super.initState();
    _items = widget.isFavorite
        ? WikiStore.loadFavorites()
        : WikiStore.loadHistory();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: '返回',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(widget.isFavorite ? '收藏' : '历史记录'),
      ),
      body: _items.isEmpty
          ? Center(
              child: Text(widget.isFavorite ? '暂无收藏' : '暂无浏览记录',
                  style: const TextStyle(fontSize: 13)))
          : ListView.builder(
              padding: const EdgeInsets.all(10),
              itemCount: _items.length,
              itemBuilder: (context, i) {
                final r = _items[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(
                        widget.isFavorite ? Icons.star : Icons.history,
                        size: 20),
                    title: Text(r.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14)),
                    subtitle: Text(
                      '${r.time.month}-${r.time.day} ${r.time.hour}:${r.time.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    onTap: () => _openWiki(r),
                    onLongPress: () => _copy(r),
                  ),
                );
              },
            ),
    );
  }

  void _copy(WikiRecord item) {
    Clipboard.setData(ClipboardData(text: item.url));
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已复制链接')));
  }

  void _openWiki(WikiRecord item) {
    // 跳转 Wiki 打开；返回时回到跳转前界面
    wikiNavKey.currentState?.loadUrl(item.url);
    HomeShellState.instance?.switchTo(1);
  }
}