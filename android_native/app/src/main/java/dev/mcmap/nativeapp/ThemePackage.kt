package dev.mcmap.nativeapp

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

data class ThemeDocument(val pack: AtlasThemePack, val assets: Map<String, ByteArray> = emptyMap())

/** Data-only format; never extracts user-controlled paths or executes package content. */
object ThemePackage {
    const val MAX_BYTES = 20 * 1024 * 1024
    val iconRoles = listOf("nav_servers", "nav_wiki", "nav_map", "nav_markers", "nav_profile")
    val imageRoles = listOf("header", "background", "panel", "navigation", "button") + iconRoles
    val roles = imageRoles + "font"
    fun boundedRead(input: InputStream, limit: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size().toLong() + count <= limit) { "文件超过允许大小" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
    private fun keys(json: JSONObject, allowed: Set<String>) {
        require(json.keys().asSequence().all { it in allowed }) { "主题含有不支持的配置" }
    }
    private fun string(json: JSONObject, key: String, max: Int, fallback: String = ""): String {
        if (!json.has(key)) return fallback
        val value = json.get(key)
        require(value is String && value.length <= max && value.none { it.code < 32 }) { "$key 格式不正确" }
        return value
    }
    private fun number(json: JSONObject, key: String, fallback: Double, min: Double, max: Double): Double {
        if (!json.has(key)) return fallback
        val value = json.get(key)
        require(value is Number && value.toDouble().isFinite() && value.toDouble() in min..max) { "$key 超出范围" }
        return value.toDouble()
    }
    private fun hex(json: JSONObject, key: String, fallback: String = ""): String = string(json, key, 6, fallback).also {
        require(it.isEmpty() || it.matches(Regex("[0-9a-fA-F]{6}"))) { "$key 必须为六位颜色值" }
    }.uppercase()

    fun decode(bytes: ByteArray): ThemeDocument {
        require(bytes.size in 22..MAX_BYTES) { "主题包为空或超过 20 MB" }
        // Require a complete, single-disk ZIP directory; reject truncated streams and ZIP64.
        fun u16(i: Int) = (bytes[i].toInt() and 255) or ((bytes[i + 1].toInt() and 255) shl 8)
        val end = (bytes.size - 22 downTo maxOf(0, bytes.size - 65557)).firstOrNull { i ->
            bytes[i] == 0x50.toByte() && bytes[i + 1] == 0x4b.toByte() && bytes[i + 2] == 5.toByte() && bytes[i + 3] == 6.toByte() && i + 22 + u16(i + 20) == bytes.size
        } ?: error("主题 ZIP 不完整")
        require(u16(end + 4) == 0 && u16(end + 6) == 0 && u16(end + 8) == u16(end + 10) && u16(end + 10) in 1..12) { "不支持此 ZIP 格式" }
        val entries = linkedMapOf<String, ByteArray>()
        var total = 0
        ZipInputStream(bytes.inputStream()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                require(!entry.isDirectory && (entry.name == "manifest.json" || entry.name.matches(Regex("assets/[a-z_]+\\.bin")))) { "主题包含非法路径或文件" }
                require(entry.name !in entries && entries.size < 12) { "主题含重复文件或文件过多" }
                val limit = if (entry.name == "manifest.json") 65536 else if (entry.name == "assets/font.bin") 8 * 1024 * 1024 else 4 * 1024 * 1024
                val data = boundedRead(zip, minOf(limit, MAX_BYTES - total))
                total += data.size
                entries[entry.name] = data
                zip.closeEntry() // also checks CRC
            }
        }
        require(entries.size == u16(end + 10)) { "主题 ZIP 目录不一致" }
        val raw = entries.remove("manifest.json") ?: error("缺少 manifest.json")
        val source = raw.toString(Charsets.UTF_8)
        var depth = 0; var quoted = false; var escaped = false
        source.forEach { c ->
            if (escaped) escaped = false
            else if (quoted && c == '\\') escaped = true
            else if (c == '"') quoted = !quoted
            else if (!quoted && (c == '{' || c == '[')) { depth++; require(depth <= 8) { "主题配置嵌套过深" } }
            else if (!quoted && (c == '}' || c == ']')) depth--
        }
        require(!quoted && depth == 0) { "主题配置不完整" }
        val json = JSONObject(source)
        keys(json, setOf("formatVersion", "name", "description", "author", "baseTheme", "accent", "darkByDefault", "style", "assets"))
        require(json.get("formatVersion") == 1) { "不支持的主题版本" }
        val base = string(json, "baseTheme", 20, "grass")
        require(ThemeCatalog.packs.any { it.id == base }) { "不支持的基础主题" }
        val name = string(json, "name", 40).trim()
        require(name.isNotEmpty()) { "请填写主题名称" }
        val styleJson = if (json.has("style")) json.getJSONObject("style") else JSONObject()
        keys(styleJson, setOf("radius", "border", "font", "fontScale", "lightBackground", "darkBackground", "textureOpacity"))
        val font = string(styleJson, "font", 12, "sans")
        require(font in listOf("sans", "serif", "mono", "custom")) { "不支持的字体" }
        val style = ThemeStyle(number(styleJson, "radius", 2.0, 0.0, 24.0).toInt(), number(styleJson, "border", 1.0, 0.0, 3.0).toInt(), font,
            number(styleJson, "fontScale", 1.0, .85, 1.15).toFloat(), hex(styleJson, "lightBackground"), hex(styleJson, "darkBackground"),
            number(styleJson, "textureOpacity", .08, 0.0, .15).toFloat())
        val assetsJson = if (json.has("assets")) json.getJSONObject("assets") else JSONObject()
        keys(assetsJson, roles.toSet())
        val assets = assetsJson.keys().asSequence().associateWith { role ->
            val path = assetsJson.getString(role)
            require(path == "assets/$role.bin") { "主题素材路径不正确" }
            entries.remove(path) ?: error("缺少素材：$role")
        }
        require(entries.isEmpty()) { "主题含未声明的文件" }
        require(iconRoles.count { it in assets } in listOf(0, 5)) { "导航图标需要同时提供五个" }
        require(font != "custom" || "font" in assets) { "缺少自定义字体" }
        val default = ThemeCatalog.find(base)
        val accent = hex(json, "accent", default.accent)
        require(accent.isNotEmpty()) { "强调色不能为空" }
        val dark = if (json.has("darkByDefault")) json.get("darkByDefault").also { require(it is Boolean) { "darkByDefault 必须为布尔值" } } as Boolean else default.darkByDefault
        return ThemeDocument(default.copy(id = "draft", name = name, description = string(json, "description", 180), author = string(json, "author", 60), accent = accent, darkByDefault = dark, style = style), assets)
    }

    fun encode(document: ThemeDocument): ByteArray {
        val p = document.pack; val s = p.style
        val style = JSONObject().put("radius", s.radius).put("border", s.border).put("font", s.font).put("fontScale", s.fontScale.toString().toDouble())
            .put("lightBackground", s.lightBackground).put("darkBackground", s.darkBackground).put("textureOpacity", s.textureOpacity.toString().toDouble())
        val assets = JSONObject()
        document.assets.keys.sorted().forEach { assets.put(it, "assets/$it.bin") }
        val manifest = JSONObject().put("formatVersion", 1).put("name", p.name).put("description", p.description).put("author", p.author)
            .put("baseTheme", p.baseId).put("accent", p.accent).put("darkByDefault", p.darkByDefault).put("style", style).put("assets", assets)
        require(document.assets.values.sumOf { it.size.toLong() } <= MAX_BYTES - 65536) { "素材总量过大" }
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            fun entry(name: String, data: ByteArray) { zip.putNextEntry(ZipEntry(name)); zip.write(data); zip.closeEntry() }
            entry("manifest.json", manifest.toString(2).toByteArray())
            document.assets.toSortedMap().forEach { (role, data) -> entry("assets/$role.bin", data) }
        }
        return output.toByteArray().also { decode(it) }
    }
}
