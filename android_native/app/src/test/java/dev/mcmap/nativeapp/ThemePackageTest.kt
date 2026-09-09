package dev.mcmap.nativeapp

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import androidx.compose.ui.graphics.Color

class ThemePackageTest {
    @Test fun publishedExampleUsesSupportedFormat() {
        val sample = ThemePackage.decode(java.io.File("../examples/Moss-Workbench.mcatlas-theme").readBytes())
        assertEquals("苔石工作台", sample.pack.name)
        assertEquals("grass", sample.pack.baseId)
        assertArrayEquals(byteArrayOf(-119, 80, 78, 71), sample.assets.getValue("header").copyOf(4))
    }
    private val manifest = """{"formatVersion":1,"name":"方块测试","baseTheme":"grass"}"""
    private fun zip(vararg files: Pair<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip -> files.forEach { (name, data) -> zip.putNextEntry(ZipEntry(name)); zip.write(data); zip.closeEntry() } }
        return out.toByteArray()
    }
    private fun json(source: String) = zip("manifest.json" to source.toByteArray())
    private fun rejects(bytes: ByteArray) { assertThrows(Exception::class.java) { ThemePackage.decode(bytes) } }
    @Test fun roundTripPreservesTokensAndAllAssets() {
        val pack = ThemeCatalog.packs[1].copy(name = "幽匿·自定义", author = "地图玩家", style = ThemeStyle(24, 3, "mono", 1.15f, "E0F0FF", "101020", .15f))
        val assets = ThemePackage.iconRoles.associateWith { byteArrayOf(1, 2, 3) }
        val result = ThemePackage.decode(ThemePackage.encode(ThemeDocument(pack, assets)))
        assertEquals(pack.copy(id = "draft"), result.pack)
        assets.forEach { (role, bytes) -> assertArrayEquals(bytes, result.assets[role]) }
    }
    @Test fun rejectsUnsafeAndUndeclaredPaths() {
        listOf("../manifest.json", "/manifest.json", "assets/../bad.bin", "assets\\bad.bin", "assets/a.js", "Assets/header.bin").forEach { path -> rejects(zip("manifest.json" to manifest.toByteArray(), path to byteArrayOf(1))) }
        rejects(zip("manifest.json" to manifest.toByteArray(), "assets/unknown.bin" to byteArrayOf(1)))
    }
    @Test fun rejectsTruncationAndCorruptCrc() {
        val valid = json(manifest)
        rejects(valid.copyOf(valid.size - 1))
        rejects(valid.copyOf(valid.size - 22))
        val broken = valid.copyOf(); broken[50] = (broken[50].toInt() xor 127).toByte(); rejects(broken)
    }
    @Test fun rejectsUnsupportedVersionAndExecutableSettings() {
        rejects(json(manifest.replace(":1,", ":2,")))
        rejects(json(manifest.replace("}", ",\"scripts\":\"doSomething\"}")))
        rejects(json(manifest.replace("}", ",\"haptics\":true}")))
        rejects(json(manifest.replace("}", ",\"admin\":true}")))
    }
    @Test fun rejectsInvalidTokensAndPartialIcons() {
        rejects(json(manifest.replace("}", ",\"style\":{\"radius\":100}}")))
        rejects(json(manifest.replace("}", ",\"accent\":\"XYZXYZ\"}")))
        rejects(json(manifest.replace("}", ",\"style\":{\"font\":\"custom\"}}")))
        val partial = manifest.replace("}", ",\"assets\":{\"nav_map\":\"assets/nav_map.bin\"}}")
        rejects(zip("manifest.json" to partial.toByteArray(), "assets/nav_map.bin" to byteArrayOf(1)))
    }
    @Test fun boundsExpandedDataAndJsonDepth() {
        rejects(zip("manifest.json" to ByteArray(65537) { 32 }))
        rejects(zip("manifest.json" to manifest.toByteArray(), "assets/header.bin" to ByteArray(4 * 1024 * 1024 + 1)))
        rejects(json("[".repeat(1000) + "]".repeat(1000)))
        assertThrows(IllegalArgumentException::class.java) { ThemePackage.boundedRead(ByteArray(100).inputStream(), 99) }
    }
    @Test fun importedIdsCannotOverwriteBuiltins() {
        rejects(json(manifest.replace("}", ",\"id\":\"grass\"}")))
        assertEquals("draft", ThemePackage.decode(json(manifest)).pack.id)
        assertEquals("grass", ThemePackage.decode(json(manifest)).pack.baseId)
    }
    @Test fun customBackgroundAndTextureRemainReadable() {
        for (base in ThemeCatalog.packs) for (dark in listOf(false, true)) for (hex in listOf("000000", "FFFFFF", "FF00FF", "00FF00")) {
            val pack = base.copy(style = ThemeStyle(lightBackground = hex, darkBackground = hex))
            val colors = resolveThemeColors(Appearance(accent = base.accent), dark, pack)
            assertTrue(contrast(colors.onBackground, colors.background) >= 4.5f)
            assertTrue(contrast(colors.primary, colors.background) >= 4.5f)
            val alpha = safeTextureOpacity(.15f, colors.background, listOf(colors.onBackground))
            assertTrue(contrast(colors.onBackground, androidx.compose.ui.graphics.lerp(colors.background, Color.Black, alpha)) >= 4.5f)
            assertTrue(contrast(colors.onBackground, androidx.compose.ui.graphics.lerp(colors.background, Color.White, alpha)) >= 4.5f)
        }
    }
}
