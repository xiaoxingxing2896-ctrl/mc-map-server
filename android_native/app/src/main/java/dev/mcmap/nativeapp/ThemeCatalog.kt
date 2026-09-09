package dev.mcmap.nativeapp

/** Versioned built-in design tokens. External packages will use the same semantic model. */
data class AtlasThemePack(val id: String, val name: String, val description: String, val accent: String, val tint: Long, val darkByDefault: Boolean,
    val baseId: String = id, val author: String = "", val style: ThemeStyle = ThemeStyle())

data class ThemeStyle(val radius: Int = 2, val border: Int = 1, val font: String = "sans", val fontScale: Float = 1f,
    val lightBackground: String = "", val darkBackground: String = "", val textureOpacity: Float = .08f)

object ThemeCatalog {
    val packs = listOf(
        AtlasThemePack("grass", "草地方块", "天空、草地与泥土，经典探索风格", "3E7E24", 0xFF557B32, false),
        AtlasThemePack("sculk", "幽匿古城", "深板岩与青色幽匿，安静的地下世界", "248F89", 0xFF17606D, true),
        AtlasThemePack("nether", "下界堡垒", "黑石、暗红与熔岩色点缀", "A74824", 0xFF71362F, true),
    )
    fun find(id: String) = packs.firstOrNull { it.id == id } ?: packs.first()
}

fun Appearance.selectPack(id: String): Appearance {
    val pack = ThemeCatalog.find(id)
    return copy(packId = pack.id, accent = pack.accent, mode = if (pack.darkByDefault) "dark" else "light")
}

fun motionDuration(mode: String, systemEnabled: Boolean, normal: Int): Int = when {
    !systemEnabled || mode == "off" -> 0
    mode == "reduced" -> minOf(normal, 100)
    else -> normal
}
