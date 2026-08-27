// 数据模型
library;

class AppUser {
  final String username;
  final String role;
  final String? email;
  final String token;
  const AppUser({required this.username, required this.role, this.email, required this.token});
}

// 地图标记（与网页端 /api/markers 字段一致）
class McMarker {
  final int id;
  final String title;
  final String description;
  final int x;
  final int z;
  final String category;
  final String icon;
  final String createdBy;
  final int isPublic;
  final String world;
  const McMarker({
    required this.id,
    required this.title,
    this.description = '',
    required this.x,
    required this.z,
    this.category = 'other',
    this.icon = '',
    this.createdBy = '',
    this.isPublic = 1,
    this.world = 'overworld',
  });

  factory McMarker.fromJson(Map<String, dynamic> j) => McMarker(
        id: (j['id'] ?? 0) as int,
        title: (j['title'] ?? '') as String,
        description: (j['description'] ?? '') as String,
        x: (j['x'] ?? 0) as int,
        z: (j['z'] ?? 0) as int,
        category: (j['category'] ?? 'other') as String,
        icon: (j['icon'] ?? '') as String,
        createdBy: (j['created_by'] ?? '') as String,
        isPublic: (j['is_public'] ?? 1) as int,
        world: (j['world'] ?? 'overworld') as String,
      );
}

// 瓦片索引（/api/tiles 返回 {x, z, url}）
class TileIndex {
  final int x;
  final int z;
  final String url; // 形如 /tiles/x0_z0.png 或 /tiles/nether/x1_z2.png
  const TileIndex({required this.x, required this.z, required this.url});

  String get key {
    // 取 url 最后一个路径段作为缓存文件名
    final seg = url.split('/').last;
    return seg;
  }

  factory TileIndex.fromJson(Map<String, dynamic> j) => TileIndex(
        x: (j['x'] ?? 0) as int,
        z: (j['z'] ?? 0) as int,
        url: (j['url'] ?? '') as String,
      );
}

// 服务器监控条目
enum ServerStatus { pending, ok, frozen }

class ServerEntry {
  final String id; // 本地 uuid
  String host;
  int port;
  bool pinned; // 置顶
  ServerStatus status;
  int online;
  int maxPlayers;
  List<String> players;
  int latencyMs;
  int failCount; // 连续失败次数
  DateTime? frozenSince;
  final DateTime addedAt;
  ServerEntry({
    required this.id,
    required this.host,
    this.port = 25565,
    this.pinned = false,
    this.status = ServerStatus.pending,
    this.online = 0,
    this.maxPlayers = 0,
    this.players = const [],
    this.latencyMs = 0,
    this.failCount = 0,
    this.frozenSince,
    required this.addedAt,
  });

  bool get isFrozen => status == ServerStatus.frozen;

  factory ServerEntry.fromJson(Map<String, dynamic> j) => ServerEntry(
        id: (j['id'] ?? '') as String,
        host: (j['host'] ?? '') as String,
        port: (j['port'] ?? 25565) as int,
        pinned: (j['pinned'] ?? false) as bool,
        status: ServerStatus.values[(j['status'] ?? 0) as int],
        online: (j['online'] ?? 0) as int,
        maxPlayers: (j['maxPlayers'] ?? 0) as int,
        players: ((j['players'] ?? const []) as List)
            .map((e) => e.toString())
            .toList(),
        latencyMs: (j['latencyMs'] ?? 0) as int,
        failCount: (j['failCount'] ?? 0) as int,
        frozenSince: j['frozenSince'] != null
            ? DateTime.fromMillisecondsSinceEpoch(j['frozenSince'] as int)
            : null,
        addedAt: DateTime.fromMillisecondsSinceEpoch(
            (j['addedAt'] ?? 0) as int),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'host': host,
        'port': port,
        'pinned': pinned,
        'status': status.index,
        'online': online,
        'maxPlayers': maxPlayers,
        'players': players,
        'latencyMs': latencyMs,
        'failCount': failCount,
        'frozenSince': frozenSince?.millisecondsSinceEpoch,
        'addedAt': addedAt.millisecondsSinceEpoch,
      };
}

// Wiki 收藏/历史记录
class WikiRecord {
  final String url;
  final String title;
  final DateTime time;
  final bool isFavorite; // true=收藏 false=历史
  const WikiRecord({
    required this.url,
    required this.title,
    required this.time,
    required this.isFavorite,
  });
}

// 类型定义（与网页端 categories 一致）
class MarkerCategory {
  final String id;
  final String name;
  final String icon;
  const MarkerCategory(this.id, this.name, this.icon);
}

const List<MarkerCategory> kCategories = [
  MarkerCategory('spawn', '出生点', '🏠'),
  MarkerCategory('building', '建筑', '🏰'),
  MarkerCategory('farm', '农场', '🌾'),
  MarkerCategory('mine', '矿洞', '⛏️'),
  MarkerCategory('landmark', '地标', '🗿'),
  MarkerCategory('shop', '商店', '🏪'),
  MarkerCategory('other', '其他', '📌'),
];

String categoryName(String id) {
  for (final c in kCategories) {
    if (c.id == id) return c.name;
  }
  return '其他';
}

String categoryIcon(String id) {
  for (final c in kCategories) {
    if (c.id == id) return c.icon;
  }
  return '📌';
}