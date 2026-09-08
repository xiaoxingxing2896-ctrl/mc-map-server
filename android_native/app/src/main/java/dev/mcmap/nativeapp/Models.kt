package dev.mcmap.nativeapp

import org.json.JSONObject
import java.net.IDN
import java.io.InputStream
import java.io.ByteArrayOutputStream

val worlds = linkedMapOf("overworld" to "主世界", "nether" to "下界", "end" to "末地")
val categories = linkedMapOf("spawn" to "出生点", "building" to "建筑", "farm" to "农场", "mine" to "矿洞", "landmark" to "地标", "shop" to "商店", "other" to "其他")
data class User(val username: String, val role: String, val email: String, val token: String, val loginAt: Long) {
    val admin get() = role == "admin" || role == "owner"
    fun valid(now: Long = System.currentTimeMillis()) = token.isNotBlank() && username.isNotBlank() && loginAt > 0 && now >= loginAt && now - loginAt < 7 * 86400000L
}
data class Tile(val x: Int, val z: Int, val url: String, val version: String = "")
data class Marker(val id: Int, val title: String, val description: String, val x: Int, val z: Int, val category: String, val icon: String, val creator: String, val world: String) {
    companion object {
        fun from(j: JSONObject) = Marker(j.getInt("id"), j.optString("title"), j.optString("description"), j.getInt("x"), j.getInt("z"), j.optString("category", "other"), j.optString("icon", "📍"), j.optString("created_by"), j.optString("world", "overworld"))
    }
}
data class WikiRecord(val url: String, val title: String, val time: Long = System.currentTimeMillis())
data class Server(val id: String, val address: String, val pinned: Boolean = false, val favorite: Boolean = false, val online: Int = 0, val max: Int = 0, val latency: Long = 0, val players: List<String> = emptyList(), val failures: Int = 0, val lastSuccess: Long = 0, val failedSince: Long = 0)
data class Endpoint(val host: String, val port: Int) {
    companion object {
        fun parse(value: String): Endpoint {
            val input = value.trim()
            require(input.isNotEmpty() && input.none { it.isWhitespace() || it in "/?#@" }) { "请输入域名或域名:端口" }
            val host: String; val port: Int
            if (input.startsWith("[")) {
                val close = input.indexOf(']'); require(close > 1) { "IPv6 地址格式无效" }
                host = input.substring(1, close)
                val tail = input.substring(close + 1)
                require(tail.isEmpty() || tail.startsWith(":"))
                port = if (tail.isEmpty()) 25565 else tail.drop(1).toIntOrNull() ?: error("端口无效")
            } else {
                require(input.count { it == ':' } <= 1) { "IPv6 请使用 [地址]:端口" }
                host = IDN.toASCII(input.substringBefore(':'))
                port = if (':' in input) input.substringAfter(':').toIntOrNull() ?: error("端口无效") else 25565
            }
            require(host.isNotBlank() && host.length <= 253 && port in 1..65535) { "域名或端口无效" }
            return Endpoint(host, port)
        }
    }
}
fun parseTileName(name: String): Pair<Int, Int>? {
    val m = Regex("^(?:\\d+_\\d+_)?[xX](-?\\d+)_?[zZ](-?\\d+)\\.png$").matchEntire(name) ?: return null
    val x = m.groupValues[1].toIntOrNull() ?: return null
    val z = m.groupValues[2].toIntOrNull() ?: return null
    return if (x in -30000000..30000000 && z in -30000000..30000000) x to z else null
}
fun readTileBytes(input: InputStream, limit: Int = 8 * 1024 * 1024): ByteArray {
    val out = ByteArrayOutputStream(); val buffer = ByteArray(8192)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        require(out.size().toLong() + count <= limit) { "瓦片不能超过 8 MB" }
        out.write(buffer, 0, count)
    }
    return out.toByteArray()
}
