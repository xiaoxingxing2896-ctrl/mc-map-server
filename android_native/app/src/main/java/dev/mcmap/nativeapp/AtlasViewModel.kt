package dev.mcmap.nativeapp

import android.app.Application
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class UploadDraft(val name: String, val bytes: ByteArray, val x: Int, val z: Int)
class AtlasViewModel(app: Application): AndroidViewModel(app) {
    val api = Api(app)
    private val store = LocalStore(app)
    var user by mutableStateOf<User?>(null); private set
    var world by mutableStateOf("overworld"); private set
    var tiles by mutableStateOf(emptyList<Tile>()); private set
    var markers by mutableStateOf(emptyList<Marker>()); private set
    var servers by mutableStateOf(emptyList<Server>()); private set
    var favorites by mutableStateOf(emptyList<Int>()); private set
    var records by mutableStateOf(emptyList<WikiRecord>()); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var authBusy by mutableStateOf(false); private set
    var draft by mutableStateOf<UploadDraft?>(null); private set
    var uploadBusy by mutableStateOf(false); private set
    var uploadMessage by mutableStateOf<String?>(null); private set
    var uploadWorld by mutableStateOf("overworld"); private set
    var uploadTiles by mutableStateOf(emptyList<Tile>()); private set
    var uploadIndexReady by mutableStateOf(false); private set
    private var epoch = 0
    private var fileEpoch = 0
    private var uploadEpoch = 0
    private var loadJob: Job? = null
    private var pollJob: Job? = null
    private var foreground = false
    private var initialized = false
    init { viewModelScope.launch {
        user = store.user(); servers = store.servers(); loadFavorites()
        initialized = true; refresh(); if (foreground) { startPolling(); validateSession() }
    } }
    fun changeWorld(value: String) { if (value != world && value in worlds) { world = value; tiles = emptyList(); markers = emptyList(); refresh() } }
    fun refresh() {
        loadJob?.cancel(); val seq = ++epoch; val target = world; val account = user
        loading = true; error = null
        loadJob = viewModelScope.launch {
            // Public tile index is safe to cache. Private marker responses never go to disk.
            if (tiles.isEmpty()) runCatching {
                val a = JSONArray(store.read("tiles_$target")); tiles = List(a.length()) { a.getJSONObject(it).let { j -> Tile(j.getInt("x"), j.getInt("z"), j.getString("url"), j.optString("version")) } }
            }
            supervisorScope {
                val t = async { api.tiles(target) }; val m = async { api.markers(target, account?.token) }
                try {
                    val result = t.await()
                    if (seq == epoch) {
                        tiles = result
                        store.write("tiles_$target", JSONArray(result.map { JSONObject().put("x", it.x).put("z", it.z).put("url", it.url).put("version", it.version) }).toString())
                    }
                } catch (e: Exception) { if (e is CancellationException) throw e; if (seq == epoch) error = "地图更新失败，可查看已缓存瓦片；请重试" }
                try { val result = m.await(); if (seq == epoch) markers = result }
                catch (e: Exception) { if (e is CancellationException) throw e; if (seq == epoch) { markers = emptyList(); error = e.message ?: "标记加载失败" } }
            }
            if (seq == epoch) loading = false
        }
    }
    fun login(email: String, password: String) { if (authBusy) return; authBusy = true; error = null
        viewModelScope.launch {
            try { val result = api.login(email, password); store.saveUser(result); user = result; markers = emptyList(); loadFavorites(); refresh() }
            catch (e: Exception) { if (e is CancellationException) throw e; error = e.message ?: "登录失败" }
            finally { authBusy = false }
        }
    }
    fun logout() {
        fileEpoch++; uploadEpoch++
        user = null; epoch++; loadJob?.cancel(); markers = emptyList(); favorites = emptyList(); records = emptyList(); draft = null; uploadIndexReady = false
        viewModelScope.launch { store.saveUser(null); refresh() }
    }
    private suspend fun loadFavorites() {
        val account = user?.username ?: return
        val result = runCatching { val a = JSONArray(store.read("favorites_$account")); List(a.length()) { a.getInt(it) } }.getOrDefault(emptyList())
        if (user?.username == account) favorites = result
    }
    fun favorite(marker: Marker) { val account = user?.username ?: run { error = "请先登录后收藏"; return }
        favorites = if (marker.id in favorites) favorites - marker.id else (listOf(marker.id) + favorites).take(20)
        val result = favorites; viewModelScope.launch { store.write("favorites_$account", JSONArray(result).toString()) }
    }
    fun record(url: String, title: String, favorite: Boolean = false) {
        val account = user?.username ?: if (favorite) return else "guest"
        if (!url.startsWith("https://")) return
        viewModelScope.launch { store.addRecord("${if (favorite) "wiki_fav" else "wiki_hist"}_$account", WikiRecord(url, title)) }
    }
    fun loadRecords(favorite: Boolean) { val account = user?.username ?: "guest"; records = emptyList()
        viewModelScope.launch { val result = store.records("${if (favorite) "wiki_fav" else "wiki_hist"}_$account"); if ((user?.username ?: "guest") == account) records = result }
    }
    fun foreground(active: Boolean) {
        foreground = active
        if (!active) { pollJob?.cancel(); pollJob = null; return }
        if (!initialized) return
        if (user?.valid() == false) logout()
        validateSession()
        startPolling()
    }
    private fun validateSession() {
        val account = user ?: return
        viewModelScope.launch {
            try {
                val me = JSONObject(api.request("/api/me", account.token))
                if (user?.token == account.token) {
                    val current = account.copy(role = me.getString("role"), username = me.getString("username"))
                    if (current != account) { user = current; store.saveUser(current); markers = emptyList(); loadFavorites(); refresh() }
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (e is ApiException && e.status in listOf(401, 403) && user?.token == account.token) logout()
                // A network outage must not discard a valid locally cached session.
            }
        }
    }
    private fun startPolling() { if (pollJob?.isActive == true) return
        pollJob = viewModelScope.launch { while (isActive) {
            supervisorScope { servers.map { old -> launch {
                val result = try { MinecraftPing.ping(old, api.resolveServer(old.address)) } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    old.copy(failures = old.failures + 1, failedSince = old.failedSince.takeIf { it > 0 } ?: System.currentTimeMillis())
                }
                servers = servers.map { if (it.id == old.id && it.address == old.address) result.copy(pinned = it.pinned, favorite = it.favorite) else it }
            } }.joinAll() }
            delay(60000)
        } }
    }
    fun saveServer(address: String, id: String? = null) {
        try {
            val ep = Endpoint.parse(address)
            require(servers.none { it.id != id && Endpoint.parse(it.address) == ep }) { "服务器已存在" }
            require(id != null || servers.size < 5) { "最多添加 5 个服务器" }
            servers = if (id == null) servers + Server(UUID.randomUUID().toString(), address.trim()) else servers.map { if (it.id == id) Server(it.id, address.trim(), it.pinned, it.favorite) else it }
            persistServers(); if (foreground) { pollJob?.cancel(); pollJob = null; startPolling() }
        } catch (e: Exception) { error = e.message }
    }
    fun changeServer(id: String, action: String) {
        servers = when (action) {
            "delete" -> servers.filterNot { it.id == id }
            "pin" -> servers.map { if (it.id == id) it.copy(pinned = !it.pinned) else it }
            "favorite" -> servers.map { if (it.id == id) it.copy(favorite = !it.favorite) else it }
            else -> servers
        }; persistServers()
    }
    fun moveServer(id: String, direction: Int) {
        val ordered = servers.sortedByDescending { it.pinned }.toMutableList(); val at = ordered.indexOfFirst { it.id == id }; val to = at + direction
        if (at >= 0 && to in ordered.indices && ordered[at].pinned && ordered[to].pinned) { java.util.Collections.swap(ordered, at, to); servers = ordered; persistServers() }
    }
    private fun persistServers() { val snapshot = servers; viewModelScope.launch { store.saveServers(snapshot) } }
    fun prepareUpload(target: String = uploadWorld) {
        if (uploadBusy) return
        val seq = ++uploadEpoch
        uploadWorld = target; uploadIndexReady = false; uploadTiles = emptyList(); uploadMessage = null
        val account = user ?: return
        viewModelScope.launch {
            try {
                val me = JSONObject(api.request("/api/me", account.token))
                require(me.optString("role") in listOf("admin", "owner")) { "当前账号没有管理员权限" }
                val result = api.tiles(target)
                if (seq == uploadEpoch && user?.token == account.token && target == uploadWorld) { uploadTiles = result; uploadIndexReady = true }
            } catch (e: Exception) { if (e is CancellationException) throw e; if (seq == uploadEpoch) uploadMessage = e.message ?: "无法检查上传权限" }
        }
    }
    fun selectUpload(uri: Uri) {
        if (uploadBusy) return
        val seq = ++fileEpoch
        draft = null; uploadMessage = null
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val resolver = getApplication<Application>().contentResolver
                    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: error("无法读取文件名")
                    val coords = parseTileName(name) ?: error("文件名应为 x0_z0.png 或 3_16_x0_z0.png")
                    val bytes = resolver.openInputStream(uri)?.use { readTileBytes(it) } ?: error("无法读取文件")
                    require(bytes.size <= 8 * 1024 * 1024) { "瓦片不能超过 8 MB" }
                    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                    require(options.outWidth == 1024 && options.outHeight == 1024 && options.outMimeType == "image/png") { "请选择 1024×1024 PNG 图片" }
                    UploadDraft(name, bytes, coords.first, coords.second)
                }; if (seq == fileEpoch) draft = result
            } catch (e: Exception) { if (e is CancellationException) throw e; if (seq == fileEpoch) uploadMessage = e.message }
        }
    }
    fun upload(replace: Boolean) {
        val account = user ?: return; val selection = draft ?: return
        if (!account.admin || uploadBusy || !uploadIndexReady) return
        val target = uploadWorld; val existing = uploadTiles.find { it.x == selection.x && it.z == selection.z }
        uploadBusy = true; uploadMessage = null
        viewModelScope.launch {
            try {
                api.upload(target, selection.name, replace, existing?.version, selection.bytes, account.token)
                if (user?.token == account.token) { draft = null; uploadMessage = "上传成功，地图已更新"; if (target == world) refresh() }
            } catch (e: Exception) { if (e is CancellationException) throw e; uploadMessage = e.message ?: "上传失败，可重试"; uploadIndexReady = false }
            finally { uploadBusy = false }
        }
    }
}
