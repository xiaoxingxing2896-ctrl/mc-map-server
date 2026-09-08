package dev.mcmap.nativeapp

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String): IOException(message)
class Api(context: Context) {
    val client = OkHttpClient.Builder().connectTimeout(12, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).callTimeout(40, TimeUnit.SECONDS)
        .cache(Cache(java.io.File(context.cacheDir, "http"), 128L * 1024 * 1024)).build()
    suspend fun request(path: String, token: String? = null, body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(BuildConfig.API_BASE + path).header("Cache-Control", "no-store")
        if (token != null) builder.header("Authorization", "Bearer $token")
        if (body != null) builder.post(body.toString().toRequestBody("application/json".toMediaType()))
        execute(builder.build())
    }
    private fun execute(request: Request): String = client.newCall(request).execute().use { response ->
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) throw ApiException(response.code, runCatching { JSONObject(text).optString("error") }.getOrDefault("").ifBlank { "请求失败 (${response.code})" })
        text
    }
    suspend fun tiles(world: String): List<Tile> {
        val a = JSONArray(request("/api/tiles?world=$world"))
        return List(a.length()) { a.getJSONObject(it).let { j -> Tile(j.getInt("x"), j.getInt("z"), j.getString("url"), j.optString("version")) } }
    }
    suspend fun markers(world: String, token: String?): List<Marker> {
        val a = JSONArray(request("/api/markers?world=$world", token))
        return List(a.length()) { Marker.from(a.getJSONObject(it)) }
    }
    suspend fun login(email: String, password: String): User {
        val j = JSONObject(request("/api/auth/login", body = JSONObject().put("email", email.trim()).put("password", password)))
        return User(j.getString("username"), j.getString("role"), email.trim(), j.getString("token"), System.currentTimeMillis())
    }
    suspend fun resolveServer(address: String): Endpoint = withContext(Dispatchers.IO) {
        val original = Endpoint.parse(address)
        if (':' in address || original.host.matches(Regex("[0-9.]+"))) return@withContext original
        // Keep the existing client's SRV support for domains that use a non-default port.
        val dnsClient = client.newBuilder().callTimeout(5, TimeUnit.SECONDS).build()
        for (provider in listOf("dns.alidns.com", "doh.pub", "cloudflare-dns.com")) {
            try {
                val url = HttpUrl.Builder().scheme("https").host(provider).addPathSegment(if (provider == "dns.alidns.com") "resolve" else "dns-query")
                    .addQueryParameter("name", "_minecraft._tcp.${original.host}").addQueryParameter("type", "SRV").build()
                val resolved = dnsClient.newCall(Request.Builder().url(url).header("Accept", "application/dns-json").build()).execute().use { r ->
                    if (!r.isSuccessful) return@use null
                    val body = r.body?.byteStream()?.use { readTileBytes(it, 65536) } ?: return@use null
                    val json = JSONObject(String(body, Charsets.UTF_8))
                    if (json.optInt("Status", -1) !in listOf(0, 3)) return@use null
                    val answers = json.optJSONArray("Answer") ?: return@use original
                    val records = (0 until answers.length()).mapNotNull { i ->
                        val record = answers.getJSONObject(i)
                        if (record.optInt("type") != 33) return@mapNotNull null
                        val parts = record.optString("data").trim().split(Regex("\\s+"))
                        if (parts.size != 4 || parts[3] == ".") return@mapNotNull null
                        val priority = parts[0].toIntOrNull() ?: return@mapNotNull null
                        val weight = parts[1].toIntOrNull() ?: return@mapNotNull null
                        val port = parts[2].toIntOrNull()?.takeIf { it in 1..65535 } ?: return@mapNotNull null
                        Triple(priority, weight.coerceAtLeast(0), Endpoint(parts[3].trimEnd('.'), port))
                    }
                    val eligible = records.filter { it.first == records.minOfOrNull { item -> item.first } }
                    if (eligible.isEmpty()) return@use original
                    val total = eligible.sumOf { it.second.toLong() }
                    var ticket = if (total > 0) kotlin.random.Random.nextLong(total) else 0L
                    eligible.firstOrNull { ticket -= it.second; ticket < 0 }?.third ?: eligible.random().third
                }
                if (resolved != null) return@withContext resolved
            } catch (_: IOException) { /* Try the next resolver, then the original domain. */ }
              catch (_: org.json.JSONException) { /* Invalid DNS response. */ }
              catch (_: IllegalArgumentException) { /* Oversized DNS response. */ }
        }
        original
    }
    suspend fun upload(world: String, name: String, replace: Boolean, version: String?, bytes: ByteArray, token: String) = withContext(Dispatchers.IO) {
        val url = HttpUrl.Builder().scheme("https").host(java.net.URI(BuildConfig.API_BASE).host).addPathSegments("api/tiles")
            .addQueryParameter("world", world).addQueryParameter("name", name).addQueryParameter("mode", if (replace) "replace" else "add").build()
        val builder = Request.Builder().url(url).header("Authorization", "Bearer $token").put(bytes.toRequestBody("image/png".toMediaType()))
        if (!version.isNullOrBlank()) builder.header("If-Match", version)
        execute(builder.build())
    }
}
