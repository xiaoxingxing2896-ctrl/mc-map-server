import 'package:flutter_test/flutter_test.dart';
import 'package:mc_server_map/models.dart';

void main() {
  test('marker JSON preserves privacy, world, coordinates and Unicode', () {
    final json = <String, dynamic>{
      'id': 4, 'title': '农场', 'description': '地下入口', 'x': -120, 'z': 0,
      'category': 'farm', 'icon': '🌾', 'created_by': 'alice',
      'is_public': 0, 'world': 'nether',
    };
    expect(McMarker.fromJson(json).toJson(), json);
  });
  test('older markers default to overworld and other category', () {
    final marker = McMarker.fromJson({'id': 1, 'x': 0, 'z': -1});
    expect(marker.world, 'overworld');
    expect(marker.category, 'other');
    expect(marker.description, '');
  });
  test('tile cache key removes world prefix', () {
    final tile = TileIndex.fromJson({'x': -1, 'z': 2, 'url': '/tiles/nether/x-1_z2.png'});
    expect(tile.key, 'x-1_z2.png');
    expect(tile.x, -1);
    expect(tile.z, 2);
  });
  test('server JSON preserves frozen state and timestamps', () {
    final server = ServerEntry(
      id: 'test', host: 'localhost', port: 25566, pinned: true,
      status: ServerStatus.frozen, online: 2, maxPlayers: 20,
      players: ['alice', 'bob'], failCount: 3, latencyMs: 40,
      frozenSince: DateTime.fromMillisecondsSinceEpoch(1000),
      addedAt: DateTime.fromMillisecondsSinceEpoch(500),
    );
    final loaded = ServerEntry.fromJson(server.toJson());
    expect(loaded.toJson(), server.toJson());
    expect(loaded.isFrozen, isTrue);
  });
  test('unknown category uses a readable fallback', () {
    expect(categoryName('unknown'), '其他');
    expect(categoryIcon('unknown'), '📌');
    expect(categoryName('farm'), '农场');
  });
}
