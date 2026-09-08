package dev.mcmap.nativeapp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.dataStore by preferencesDataStore("atlas")
class LocalStore(private val context: Context) {
    suspend fun read(key: String): String = context.dataStore.data.first()[stringPreferencesKey(key)] ?: ""
    suspend fun write(key: String, value: String) { context.dataStore.edit { it[stringPreferencesKey(key)] = value } }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey("atlas-session", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("atlas-session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    suspend fun saveUser(user: User?) {
        if (user == null) { write("session", ""); return }
        val j = JSONObject().put("username", user.username).put("role", user.role).put("email", user.email).put("token", user.token).put("at", user.loginAt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(j.toString().toByteArray(Charsets.UTF_8))
        write("session", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP))
    }
    suspend fun user(): User? = runCatching {
        val bytes = Base64.decode(read("session"), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
        val j = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
        User(j.getString("username"), j.getString("role"), j.getString("email"), j.getString("token"), j.getLong("at")).takeIf { it.valid() }
    }.getOrNull()
    suspend fun records(key: String): List<WikiRecord> = runCatching {
        val a = JSONArray(read(key)); List(a.length()) { a.getJSONObject(it).let { j -> WikiRecord(j.getString("url"), j.getString("title"), j.getLong("time")) } }
    }.getOrDefault(emptyList())
    suspend fun addRecord(key: String, record: WikiRecord) {
        val list = (listOf(record) + records(key).filter { it.url != record.url }).take(50)
        write(key, JSONArray(list.map { JSONObject().put("url", it.url).put("title", it.title).put("time", it.time) }).toString())
    }
    suspend fun servers(): List<Server> = runCatching {
        val a = JSONArray(read("servers")); List(a.length()) { a.getJSONObject(it).let { j -> Server(j.getString("id"), j.getString("address"), j.optBoolean("pinned"), j.optBoolean("favorite")) } }.take(5)
    }.getOrDefault(emptyList())
    suspend fun saveServers(servers: List<Server>) = write("servers", JSONArray(servers.map { JSONObject().put("id", it.id).put("address", it.address).put("pinned", it.pinned).put("favorite", it.favorite) }).toString())
}
