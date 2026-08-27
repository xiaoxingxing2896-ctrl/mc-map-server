// Cloudflare Workers API 客户端（与网页端共用后端）
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiClient {
  // 部署域名：如与网页端不同请修改
  static const String base = 'https://worldeternal.xyz';

  static const _timeout = Duration(seconds: 10);

  static Future<List<TileIndex>> fetchTiles(String world) async {
    final uri = Uri.parse('$base/api/tiles')
        .replace(queryParameters: world == 'overworld' ? null : {'world': world});
    final r = await http.get(uri).timeout(_timeout);
    if (r.statusCode != 200) throw Exception('瓦片索引加载失败(${r.statusCode})');
    final list = jsonDecode(utf8.decode(r.bodyBytes)) as List;
    return list.map((e) => TileIndex.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<McMarker>> fetchMarkers(String world, {String? token}) async {
    final uri = Uri.parse('$base/api/markers')
        .replace(queryParameters: world == 'overworld' ? null : {'world': world});
    final r = await http.get(uri, headers: {
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

  // 校验 token 是否仍有效
  static Future<bool> validateToken(String token) async {
    try {
      final r = await http.get(
        Uri.parse('$base/api/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(_timeout);
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // 下载瓦片图片字节
  static Future<List<int>> fetchTileBytes(String urlPath) async {
    final r = await http.get(Uri.parse('$base$urlPath')).timeout(const Duration(seconds: 20));
    if (r.statusCode != 200) throw Exception('瓦片下载失败(${r.statusCode})');
    return r.bodyBytes;
  }
}