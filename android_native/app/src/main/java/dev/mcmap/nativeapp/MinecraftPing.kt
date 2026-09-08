package dev.mcmap.nativeapp

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.*
import java.net.InetSocketAddress
import java.net.Socket

object MinecraftPing {
    fun readVarInt(input: InputStream): Int {
        var value = 0
        repeat(5) { index ->
            val b = input.read(); require(b >= 0) { "服务器提前断开连接" }
            require(index != 4 || b and 0xf0 == 0) { "VarInt 越界" }
            value = value or ((b and 127) shl (7 * index))
            if (b and 128 == 0) return value
        }
        error("VarInt 过长")
    }
    fun writeVarInt(out: OutputStream, number: Int) {
        var value = number
        do { val b = value and 127; value = value ushr 7; out.write(if (value != 0) b or 128 else b) } while (value != 0)
    }
    private fun packet(out: OutputStream, data: ByteArray) { writeVarInt(out, data.size); out.write(data); out.flush() }
    suspend fun ping(server: Server, target: Endpoint = Endpoint.parse(server.address)): Server = withContext(Dispatchers.IO) {
        val ep = Endpoint.parse(server.address)
        Socket().use { socket ->
            socket.soTimeout = 6000
            socket.connect(InetSocketAddress(target.host, target.port), 5000)
            val out = socket.getOutputStream(); val input = DataInputStream(socket.getInputStream())
            val handshake = ByteArrayOutputStream()
            writeVarInt(handshake, 0); writeVarInt(handshake, 47)
            val host = ep.host.toByteArray(Charsets.UTF_8); writeVarInt(handshake, host.size); handshake.write(host)
            DataOutputStream(handshake).writeShort(ep.port); writeVarInt(handshake, 1)
            packet(out, handshake.toByteArray()); packet(out, byteArrayOf(0))
            val length = readVarInt(input); require(length in 3..1048576) { "服务器响应过大" }
            val frame = ByteArray(length); input.readFully(frame)
            val payload = ByteArrayInputStream(frame); require(readVarInt(payload) == 0)
            val jsonLength = readVarInt(payload); require(jsonLength in 1..payload.available())
            val json = ByteArray(jsonLength); DataInputStream(payload).readFully(json)
            val players = JSONObject(String(json, Charsets.UTF_8)).optJSONObject("players") ?: JSONObject()
            val start = System.nanoTime()
            val ping = ByteArrayOutputStream(); ping.write(1); DataOutputStream(ping).writeLong(start); packet(out, ping.toByteArray())
            require(readVarInt(input) == 9 && input.readUnsignedByte() == 1 && input.readLong() == start) { "Ping 响应无效" }
            val sample = players.optJSONArray("sample")
            server.copy(online = players.optInt("online"), max = players.optInt("max"), players = if (sample == null) emptyList() else List(sample.length()) { sample.getJSONObject(it).optString("name") }, latency = (System.nanoTime() - start) / 1000000, lastSuccess = System.currentTimeMillis(), failures = 0, failedSince = 0)
        }
    }
}
