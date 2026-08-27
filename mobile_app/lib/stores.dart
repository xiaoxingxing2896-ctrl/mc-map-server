// 本地存储 + 全局状态
// 登录 7 天缓存 / 标记收藏(每账号20) / wiki 收藏·历史(各50) / 服务器列表(5) / 瓦片缓存
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';
import 'api_client.dart';

// ============ 全局状态（跨页面共享，ChangeNotifier） ============
class AppState extends ChangeNotifier {
  AppState._();
  static final AppState I = AppState._();

  AppUser? user;
  String world = 'overworld';
  List<McMarker> markers = [];
  List<TileIndex> tiles = [];
  bool tilesLoaded = false;

  void setUser(AppUser? u) {
    user = u;
    notifyListeners();
  }

  void setWorld(String w) {
    if (world == w) return;
    world = w;
    markers = [];
    tiles = [];
    tilesLoaded = false;
    notifyListeners();
  }

  void setMarkers(List<McMarker> m) {
    markers = m;
    notifyListeners();
  }

  void setTiles(List<TileIndex> t, {bool loaded = true}) {
    tiles = t;
    tilesLoaded = loaded;
    notifyListeners();
  }
}

// ============ 登录缓存（7 天免验证） ============
class AuthStore {
  AuthStore._();
  static SharedPreferences? _p;
  static const _kToken = 'auth_token';
  static const _kUser = 'auth_user';
  static const _kRole = 'auth_role';
  static const _kEmail = 'auth_email';
  static const _kLoginAt = 'auth_login_at';
  static const Duration maxAge = Duration(days: 7);

  static Future<void> init() async {
    _p = await SharedPreferences.getInstance();
  }

  static SharedPreferences get prefs => _p!;

  static AppUser? load() {
    final p = prefs;
    final token = p.getString(_kToken) ?? '';
    if (token.isEmpty) return null;
    final loginAt = p.getInt(_kLoginAt) ?? 0;
    if (loginAt > 0 &&
        DateTime.now().millisecondsSinceEpoch - loginAt > maxAge.inMilliseconds) {
      clear();
      return null;
    }
    final username = p.getString(_kUser) ?? '';
    if (username.isEmpty) return null;
    return AppUser(
      username: username,
      role: p.getString(_kRole) ?? 'user',
      email: p.getString(_kEmail),
      token: token,
    );
  }

  static Future<void> save(AppUser u) async {
    await prefs.setString(_kToken, u.token);
    await prefs.setString(_kUser, u.username);
    await prefs.setString(_kRole, u.role);
    if (u.email != null) await prefs.setString(_kEmail, u.email!);
    await prefs.setInt(_kLoginAt, DateTime.now().millisecondsSinceEpoch);
  }

  static Future<void> clear() async {
    await prefs.remove(_kToken);
    await prefs.remove(_kUser);
    await prefs.remove(_kRole);
    await prefs.remove(_kEmail);
    await prefs.remove(_kLoginAt);
  }
}

// ============ 标记收藏（各账号独立，最多 20） ============
class MarkerFavorites {
  MarkerFavorites._();
  static const int max = 20;

  static List<int> load(String username) {
    final raw = AuthStore.prefs.getString('fav_markers_$username') ?? '[]';
    try {
      return (jsonDecode(raw) as List).map((e) => e as int).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<int>> toggle(String username, int markerId) async {
    final list = load(username);
    if (list.contains(markerId)) {
      list.remove(markerId);
    } else {
      list.insert(0, markerId);
      if (list.length > max) list.removeRange(max, list.length);
    }
    await AuthStore.prefs.setString('fav_markers_$username', jsonEncode(list));
    return list;
  }
}

// ============ Wiki 收藏 + 浏览历史（各最多 50，新到旧） ============
class WikiStore {
  WikiStore._();
  static const int max = 50;

  static List<WikiRecord> _decode(String raw, bool fav) {
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) {
        final m = e as Map<String, dynamic>;
        return WikiRecord(
          url: (m['url'] ?? '') as String,
          title: (m['title'] ?? '') as String,
          time: DateTime.fromMillisecondsSinceEpoch((m['time'] ?? 0) as int),
          isFavorite: fav,
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }

  static String _encode(List<WikiRecord> list) => jsonEncode(list.map((r) => {
        'url': r.url,
        'title': r.title,
        'time': r.time.millisecondsSinceEpoch,
      }).toList());

  static List<WikiRecord> loadFavorites() =>
      _decode(AuthStore.prefs.getString('wiki_fav') ?? '[]', true);

  static List<WikiRecord> loadHistory() =>
      _decode(AuthStore.prefs.getString('wiki_hist') ?? '[]', false);

  static Future<void> addHistory(String url, String title) async {
    if (url.isEmpty) return;
    var list = loadHistory();
    list.removeWhere((r) => r.url == url);
    list.insert(0, WikiRecord(url: url, title: title, time: DateTime.now(), isFavorite: false));
    if (list.length > max) list.removeRange(max, list.length);
    await AuthStore.prefs.setString('wiki_hist', _encode(list));
  }
}

// ============ 服务器收藏（本地） ============
class ServerFavorites {
  ServerFavorites._();
  static List<String> load() {
    try {
      final list = jsonDecode(AuthStore.prefs.getString('srv_fav') ?? '[]') as List;
      return list.map((e) => e.toString()).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> toggle(String hostPort) async {
    final list = load();
    if (list.contains(hostPort)) {
      list.remove(hostPort);
    } else {
      list.insert(0, hostPort);
    }
    await AuthStore.prefs.setString('srv_fav', jsonEncode(list));
  }

  static bool isFav(String hostPort) => load().contains(hostPort);
}

// ============ 服务器列表（最多 5 个） ============
class ServersStore {
  ServersStore._();
  static const int max = 5;
  static const _kList = 'servers_list';

  static List<ServerEntry> load() {
    final raw = AuthStore.prefs.getString(_kList) ?? '[]';
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => ServerEntry.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> save(List<ServerEntry> list) async {
    await AuthStore.prefs.setString(
        _kList, jsonEncode(list.map((e) => e.toJson()).toList()));
  }
}

// ============ 标记本地缓存（按维度，先显示缓存再后台刷新） ============
class MarkerCache {
  MarkerCache._();

  static Future<List<McMarker>> load(String world) async {
    final raw = AuthStore.prefs.getString('markers_cache_' + world) ?? '';
    if (raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => McMarker.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> save(String world, List<McMarker> list) async {
    try {
      await AuthStore.prefs.setString(
          'markers_cache_' + world, jsonEncode(list.map((e) => e.toJson()).toList()));
    } catch (_) {}
  }
}

// ============ 瓦片本地缓存 + 增量更新 ============
class TileCache {
  TileCache._();
  static Directory? _root;

  static Future<Directory> root() async {
    if (_root != null) return _root!;
    final appDir = await getApplicationSupportDirectory();
    _root = Directory('${appDir.path}${Platform.pathSeparator}tiles');
    if (!await _root!.exists()) await _root!.create(recursive: true);
    return _root!;
  }

  static Future<String> worldDir(String world) async =>
      '${(await root()).path}${Platform.pathSeparator}$world';

  static Future<String> filePath(String world, String key) async =>
      '${await worldDir(world)}${Platform.pathSeparator}$key';

  static Future<bool> has(String world, String key) async =>
      File(await filePath(world, key)).exists();

  static Future<void> save(String world, String key, List<int> bytes) async {
    final dir = Directory(await worldDir(world));
    if (!await dir.exists()) await dir.create(recursive: true);
    await File(await filePath(world, key)).writeAsBytes(bytes, flush: true);
  }

  static Future<List<String>> localKeys(String world) async {
    final dir = Directory(await worldDir(world));
    if (!await dir.exists()) return [];
    return dir
        .listSync()
        .whereType<File>()
        .map((f) => f.uri.pathSegments.last)
        .toList();
  }

  /// 增量检查：远端索引为权威，删除本地已失效的瓦片文件
  /// 下载由地图页按需加载（视野内惰性下载，3 并发），避免全量预下载数百 MB
  static Future<void> cleanupWithIndex(
      String world, List<TileIndex> remote) async {
    final keys = remote.map((t) => t.key).toSet();
    final local = await localKeys(world);
    for (final k in local) {
      if (!keys.contains(k)) {
        try {
          final f = File(await filePath(world, k));
          if (await f.exists()) await f.delete();
        } catch (_) {}
      }
    }
  }
}