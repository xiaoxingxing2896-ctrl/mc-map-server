import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mc_server_map/models.dart';
import 'package:mc_server_map/stores.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AuthStore.init();
    AppState.I.setUser(null);
    AppState.I.setWorld('overworld');
    AppState.I.setMarkers([]);
    AppState.I.setTiles([], loaded: false);
  });
  test('authentication saves, restores and clears credentials', () async {
    expect(AuthStore.load(), isNull);
    await AuthStore.save(const AppUser(username: 'alice', role: 'user', token: 'test-token', email: 'alice@example.com'));
    expect(AuthStore.load()!.username, 'alice');
    expect(AuthStore.load()!.email, 'alice@example.com');
    await AuthStore.clear();
    expect(AuthStore.load(), isNull);
    expect(AuthStore.prefs.getString('auth_email'), isNull);
  });
  test('expired login cache is not restored', () async {
    await AuthStore.save(const AppUser(username: 'alice', role: 'user', token: 'test-token'));
    await AuthStore.prefs.setInt('auth_login_at', DateTime.now().subtract(const Duration(days: 8)).millisecondsSinceEpoch);
    expect(AuthStore.load(), isNull);
  });
  test('marker favorites are bounded, ordered and account-specific', () async {
    for (var id = 1; id <= 21; id++) {
      await MarkerFavorites.toggle('alice', id);
    }
    expect(MarkerFavorites.load('alice'), List.generate(20, (i) => 21 - i));
    expect(MarkerFavorites.load('bob'), isEmpty);
    await MarkerFavorites.toggle('alice', 21);
    expect(MarkerFavorites.load('alice'), isNot(contains(21)));
  });
  test('malformed favorites and cache JSON safely return empty lists', () async {
    for (final key in ['fav_markers_alice', 'wiki_hist', 'wiki_fav', 'srv_fav', 'servers_list', 'markers_cache_end', 'tiles_idx_end']) {
      await AuthStore.prefs.setString(key, '{');
    }
    expect(MarkerFavorites.load('alice'), isEmpty);
    expect(WikiStore.loadHistory(), isEmpty);
    expect(WikiStore.loadFavorites(), isEmpty);
    expect(ServerFavorites.load(), isEmpty);
    expect(ServersStore.load(), isEmpty);
    expect(await MarkerCache.load('end'), isEmpty);
    expect(await TileIndexCache.load('end'), isEmpty);
  });
  test('wiki history deduplicates, keeps newest first and caps at 50', () async {
    await WikiStore.addHistory('', 'ignored');
    for (var i = 0; i < 51; i++) {
      await WikiStore.addHistory('https://example.com/$i', 'page $i');
    }
    await WikiStore.addHistory('https://example.com/10', 'updated');
    final history = WikiStore.loadHistory();
    expect(history.length, 50);
    expect(history.first.title, 'updated');
    expect(history.where((r) => r.url.endsWith('/10')).length, 1);
    expect(history.every((r) => !r.isFavorite), isTrue);
  });
  test('tile and marker indexes stay separated by world', () async {
    const marker = McMarker(id: 1, title: 'nether', x: 0, z: -1, world: 'nether');
    await MarkerCache.save('nether', [marker]);
    expect((await MarkerCache.load('nether')).single.toJson(), marker.toJson());
    expect(await MarkerCache.load('overworld'), isEmpty);
    await TileIndexCache.save('end', [const TileIndex(x: 1, z: 2, url: '/tiles/end/x1_z2.png')]);
    expect((await TileIndexCache.load('end')).single.key, 'x1_z2.png');
    expect(await TileIndexCache.load('nether'), isEmpty);
  });
  test('changing world clears map data and notifies once', () {
    AppState.I.setMarkers([const McMarker(id: 1, title: 'old', x: 0, z: 0)]);
    AppState.I.setTiles([const TileIndex(x: 0, z: 0, url: '/tiles/a.png')]);
    var notifications = 0;
    void listener() => notifications++;
    AppState.I.addListener(listener);
    addTearDown(() => AppState.I.removeListener(listener));
    AppState.I.setWorld('nether');
    expect(AppState.I.markers, isEmpty);
    expect(AppState.I.tiles, isEmpty);
    expect(AppState.I.tilesLoaded, isFalse);
    AppState.I.setWorld('nether');
    expect(notifications, 1);
  });
  test('server favorites toggle and server entries persist', () async {
    await ServerFavorites.toggle('localhost:25565');
    expect(ServerFavorites.isFav('localhost:25565'), isTrue);
    await ServerFavorites.toggle('localhost:25565');
    expect(ServerFavorites.load(), isEmpty);
    final server = ServerEntry(id: '1', host: 'localhost', addedAt: DateTime.fromMillisecondsSinceEpoch(1000));
    await ServersStore.save([server]);
    expect(ServersStore.load().single.toJson(), server.toJson());
    expect(jsonDecode(AuthStore.prefs.getString('servers_list')!), isA<List>());
  });
}
