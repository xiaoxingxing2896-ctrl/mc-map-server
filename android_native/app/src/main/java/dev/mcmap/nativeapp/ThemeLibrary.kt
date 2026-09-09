package dev.mcmap.nativeapp

import android.app.Application
import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.net.Uri
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

data class ThemeResources(val images: Map<String, ImageBitmap> = emptyMap(), val font: FontFamily? = null)
val LocalThemeResources = staticCompositionLocalOf { ThemeResources() }
data class ThemeLibraryEntry(val id: String, val name: String, val damaged: Boolean = false)
data class LoadedTheme(val document: ThemeDocument, val resources: ThemeResources)

/** Private storage uses generated IDs only. Import never overwrites another installed theme. */
class ThemeRepository(private val app: Application) {
    private val root = File(app.filesDir, "themes-v1")
    private fun file(id: String): File {
        require(id.matches(Regex("custom-[a-f0-9-]{36}"))) { "主题编号无效" }
        return File(root, "$id.mcatlas-theme")
    }
    fun list(): List<ThemeLibraryEntry> = root.listFiles().orEmpty().filter { it.extension == "mcatlas-theme" }.map { file ->
        val id = file.nameWithoutExtension
        runCatching { ThemeLibraryEntry(id, read(id).pack.name) }.getOrElse { ThemeLibraryEntry(id, "损坏的主题 · ${id.takeLast(8)}", true) }
    }.sortedBy { it.name }
    fun read(id: String): ThemeDocument = file(id).inputStream().use { ThemePackage.decode(ThemePackage.boundedRead(it, ThemePackage.MAX_BYTES)) }
        .let { it.copy(pack = it.pack.copy(id = id)) }
    fun import(uri: Uri): LoadedTheme {
        val bytes = app.contentResolver.openInputStream(uri)?.use { ThemePackage.boundedRead(it, ThemePackage.MAX_BYTES) } ?: error("无法打开文件")
        return load(ThemePackage.decode(bytes))
    }
    fun load(document: ThemeDocument): LoadedTheme {
        var pixels = 0L
        val images = document.assets.filterKeys { it in ThemePackage.imageRoles }.mapValues { (role, data) ->
            require(data.size <= 4 * 1024 * 1024) { "图片不能超过 4 MB" }
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, options)
            val maxSize = if (role in ThemePackage.iconRoles) 256 else 1024
            require(options.outMimeType in listOf("image/png", "image/webp") && options.outWidth in 1..maxSize && options.outHeight in 1..maxSize) { "$role 需要 PNG/WebP，最大 ${maxSize}×$maxSize" }
            pixels += options.outWidth.toLong() * options.outHeight
            require(pixels <= 4 * 1024 * 1024) { "图片解码总量不能超过 16 MB" }
            val bitmap = BitmapFactory.decodeByteArray(data, 0, data.size) ?: error("图片已损坏：$role")
            bitmap.asImageBitmap()
        }
        val font = document.assets["font"]?.let { data ->
            require(data.size in 12..8 * 1024 * 1024) { "字体为空或超过 8 MB" }
            require(data.take(4) == listOf<Byte>(0, 1, 0, 0) || data.copyOfRange(0, 4).toString(Charsets.US_ASCII) == "OTTO") { "字体必须为 TTF 或 OTF" }
            val temp = File.createTempFile("theme-font-", ".bin", app.cacheDir)
            try { temp.writeBytes(data); FontFamily(Typeface.createFromFile(temp)) } finally { temp.delete() }
        }
        return LoadedTheme(document, ThemeResources(images, font))
    }
    fun save(document: ThemeDocument): LoadedTheme {
        root.mkdirs()
        require(list().size < 20) { "最多保存 20 个主题，请先删除旧主题" }
        val bytes = ThemePackage.encode(document)
        require(root.listFiles().orEmpty().sumOf { it.length() } + bytes.size <= 100L * 1024 * 1024) { "主题库已达 100 MB，请先清理" }
        val id = "custom-${UUID.randomUUID()}"
        val checked = load(ThemePackage.decode(bytes).let { it.copy(pack = it.pack.copy(id = id)) })
        val temp = File(root, "$id.pending")
        try {
            temp.outputStream().use { it.write(bytes); it.fd.sync() }
            check(temp.renameTo(file(id))) { "无法保存主题" }
        } finally { temp.delete() }
        return checked
    }
    fun delete(id: String) { check(!file(id).exists() || file(id).delete()) { "删除失败，请稍后重试" } }
}

/** Workshop drafts survive configuration changes and never mutate the active theme. */
class ThemeStudioViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = ThemeRepository(application)
    var draft by mutableStateOf<LoadedTheme?>(null); private set
    var busy by mutableStateOf(false); private set
    var message by mutableStateOf<String?>(null); private set
    var dirty by mutableStateOf(false); private set
    private var exportSnapshot: ByteArray? = null
    fun edit(pack: AtlasThemePack) { if (!busy) { draft = draft?.let { it.copy(document = it.document.copy(pack = pack)) }; dirty = true; message = null } }
    private fun run(action: suspend () -> Unit) {
        if (busy) return
        busy = true; message = null
        viewModelScope.launch {
            try { action() } catch (e: Exception) { message = e.message?.take(180) ?: "主题操作失败" }
            finally { busy = false }
        }
    }
    fun open(pack: AtlasThemePack) = run {
        draft = withContext(Dispatchers.IO) { repository.load(if (pack.id.startsWith("custom-")) repository.read(pack.id) else ThemeDocument(pack)) }
        dirty = false
    }
    fun import(uri: Uri) = run { draft = withContext(Dispatchers.IO) { repository.import(uri) }; dirty = true; message = "已导入预览；保存后才会加入主题库" }
    fun asset(role: String, uri: Uri) = run {
        val current = draft ?: return@run
        require(role in ThemePackage.roles)
        val updated = withContext(Dispatchers.IO) {
            val limit = if (role == "font") 8 * 1024 * 1024 else 4 * 1024 * 1024
            val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { ThemePackage.boundedRead(it, limit) } ?: error("无法读取素材")
            val document = current.document.copy(assets = current.document.assets + (role to bytes), pack = if (role == "font") current.document.pack.copy(style = current.document.pack.style.copy(font = "custom")) else current.document.pack)
            repository.load(document)
        }
        draft = updated; dirty = true
    }
    fun removeAsset(role: String) {
        if (busy) return
        draft = draft?.let { current ->
            current.copy(document = current.document.copy(assets = current.document.assets - role,
                pack = if (role == "font") current.document.pack.copy(style = current.document.pack.style.copy(font = "sans")) else current.document.pack),
                resources = current.resources.copy(images = current.resources.images - role, font = if (role == "font") null else current.resources.font))
        }; dirty = true; message = null
    }
    fun save(appearance: AppearanceViewModel, apply: Boolean) = run {
        val current = draft ?: return@run
        val saved = withContext(Dispatchers.IO) { repository.save(current.document) }
        appearance.refreshLibrary()
        if (apply) appearance.applyLoaded(saved)
        draft = saved; dirty = false; message = if (apply) "已保存副本并应用" else "已保存独立副本"
    }
    fun prepareExport(launch: (String) -> Unit) = run {
        val current = draft ?: return@run
        exportSnapshot = withContext(Dispatchers.IO) { ThemePackage.encode(current.document) }
        launch("MC-Atlas-theme.mcatlas-theme")
    }
    fun export(uri: Uri?) = run {
        val snapshot = exportSnapshot.also { exportSnapshot = null } ?: error("导出已过期，请重新选择导出")
        if (uri == null) return@run
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(snapshot) } ?: error("无法写入文件")
        }
        message = "主题包已导出"
    }
    fun discard() { if (!busy) { draft = null; dirty = false; message = null } }
}
