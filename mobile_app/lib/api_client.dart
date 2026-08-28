// Cloudflare Workers API 客户端（与网页端共用后端）
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiClient {
  // 部署域名：如与网页端不同请修改
  static const String base = 'https://mmap.worldeternal.xyz';

  static const _timeout = Duration(seconds: 12);
  // 全局复用连接（keep-alive），大幅减少设备上反复 TLS 握手的时间
  static final http.Client _client = http.Client();

  static void dispose() => _client.close();

  static Future<List<TileIndex>> fetchTiles(String world) async {
    final uri = Uri.parse('$base/api/tiles')
        .replace(queryParameters: world == 'overworld' ? null : {'world': world});
    final r = await _client.get(uri).timeout(_timeout);
    if (r.statusCode != 200) throw Exception('瓦片索引加载失败(${r.statusCode})');
    final list = jsonDecode(utf8.decode(r.bodyBytes)) as List;
    return list.map((e) => TileIndex.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<McMarker>> fetchMarkers(String world, {String? token}) async {
    final uri = Uri.parse('$base/api/markers')
        .replace(queryParameters: world == 'overworld' ? null : {'world': world});
    final r = await _client.get(uri, headers: {
      if (token != null) 'Authorization': 'Bearer $token',
    }).timeout(_timeout);
    if (r.statusCode != 200) throw Exception('标记加载失败(${r.statusCode})');
    final list = jsonDecode(utf8.decode(r.bodyBytes)) as List;
    return list.map((e) => McMarker.fromJson(e as Map<String, dynamic>)).toList();
  }

  // 登录：邮箱+密码（与网页端一致，无验证码）
  static Future<AppUser> login(String email, String password) async {
    final r = await http
        .post(
          Uri.parse('$base/api/auth/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'email': email, 'password': password}),
        )
        .timeout(_timeout);
    final d = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    if (r.statusCode != 200) throw Exception(d['error'] ?? '登录失败(${r.statusCode})');
    return AppUser(
      username: (d['username'] ?? '') as String,
      role: (d['role'] ?? 'user') as String,
      email: email,
      token: (d['token'] ?? '') as String,
    );
  }

  // 校验 token：返回状态码；网络错误返回 null（表示不确定，调用方不应清除登录态）
  static Future<int?> validateTokenStatus(String token) async {
    try {
      final r = await _client.get(
        Uri.parse('$base/api/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(_timeout);
      return r.statusCode;
    } catch (_) {
      return null;
    }
  }

  // 下载瓦片图片字节
  static Future<List<int>> fetchTileBytes(String urlPath) async {
    final r = await _client.get(Uri.parse('$base$urlPath')).timeout(const Duration(seconds: 20));
    if (r.statusCode != 200) throw Exception('瓦片下载失败(${r.statusCode})');
    return r.bodyBytes;
  }
}