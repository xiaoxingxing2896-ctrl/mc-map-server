package dev.mcmap.nativeapp

import android.app.Application
import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File

class ThemeDeviceTest {
    @Test fun repositoryRoundTripAndMalformedBitmapIsolation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.cacheDir, "theme-storage-test-${System.nanoTime()}").apply { mkdirs() }
        val app = object : Application() { init { attachBaseContext(context) }; override fun getFilesDir() = directory }
        try {
            val repo = ThemeRepository(app)
            val bitmap = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.GREEN) }
            val data = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
            bitmap.recycle()
            val doc = ThemeDocument(ThemeCatalog.packs.first().copy(name = "设备测试"), mapOf("header" to data))
            val first = repo.save(doc); val second = repo.save(doc)
            assertNotEquals(first.document.pack.id, second.document.pack.id)
            assertEquals(16, first.resources.images.getValue("header").width)
            assertArrayEquals(data, repo.read(first.document.pack.id).assets["header"])
            assertThrows(Exception::class.java) { repo.save(doc.copy(assets = mapOf("header" to byteArrayOf(1, 2, 3)))) }
            assertEquals(2, repo.list().size)
            assertThrows(Exception::class.java) { repo.delete("../outside") }
            repo.delete(first.document.pack.id); repo.delete(second.document.pack.id)
            assertTrue(repo.list().isEmpty())
        } finally { directory.deleteRecursively() }
    }
}
