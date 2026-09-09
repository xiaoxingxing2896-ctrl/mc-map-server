package dev.mcmap.nativeapp

import androidx.compose.material3.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance

fun resolveThemeColors(appearance: Appearance, dark: Boolean, pack: AtlasThemePack = ThemeCatalog.find(appearance.packId)): ColorScheme {
    val accent = Color(0xFF000000 or appearance.accent.toLong(16))
    // Keep text and controls readable even when the user chooses a very pale or dark accent.
    val primary = if (dark) generateSequence(lerp(accent, Color.White, .48f)) { lerp(it, Color.White, .12f) }.first { it.luminance() >= .45f }
        else generateSequence(accent) { lerp(it, Color.Black, .12f) }.first { it.luminance() <= .12f }
    val colors = if (dark) darkColorScheme(
        primary = primary, onPrimary = Color.Black, primaryContainer = lerp(accent, Color.Black, .63f), onPrimaryContainer = Color(0xFFE7EDE3),
        secondary = Color(0xFFBCCCBA), onSecondary = Color(0xFF233121), secondaryContainer = Color(0xFF364532), onSecondaryContainer = Color(0xFFE3ECDC),
        tertiary = Color(0xFFB5D4E5), onTertiary = Color(0xFF16313F), tertiaryContainer = Color(0xFF304752), onTertiaryContainer = Color(0xFFD8EDF7),
        background = Color(0xFF191D1B), onBackground = Color(0xFFE3E6E1), surface = Color(0xFF232724), onSurface = Color(0xFFE3E6E1),
        surfaceVariant = Color(0xFF424941), onSurfaceVariant = Color(0xFFC0C8BD), outline = Color(0xFF899183), outlineVariant = Color(0xFF444E42),
        surfaceContainerLowest = Color(0xFF151916), surfaceContainerLow = Color(0xFF222823), surfaceContainer = Color(0xFF2C332C),
        surfaceContainerHigh = Color(0xFF343D33), surfaceContainerHighest = Color(0xFF404B3E), surfaceBright = Color(0xFF414940), surfaceDim = Color(0xFF191D1B),
    ) else lightColorScheme(
        primary = primary, onPrimary = Color.White, primaryContainer = lerp(accent, Color.White, .85f), onPrimaryContainer = Color(0xFF20301D),
        secondary = Color(0xFF52634B), onSecondary = Color.White, secondaryContainer = Color(0xFFDCE6D6), onSecondaryContainer = Color(0xFF283E23),
        tertiary = Color(0xFF366377), onTertiary = Color.White, tertiaryContainer = Color(0xFFD8EBF3), onTertiaryContainer = Color(0xFF234655),
        background = Color(0xFFE7EFF2), onBackground = Color(0xFF262C27), surface = Color(0xFFF8F9F6), onSurface = Color(0xFF262C27),
        surfaceVariant = Color(0xFFE0E5DD), onSurfaceVariant = Color(0xFF50584D), outline = Color(0xFF858D80), outlineVariant = Color(0xFFBFC7BA),
        surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF2F4EF), surfaceContainer = Color(0xFFEAEDE5),
        surfaceContainerHigh = Color(0xFFE1E6DC), surfaceContainerHighest = Color(0xFFD8DFD2), surfaceBright = Color(0xFFFAFCF7), surfaceDim = Color(0xFFD9E1D5),
    )
    val themedColors = if (pack.baseId == "grass") colors else {
        val tint = Color(pack.tint)
        colors.copy(
            background = if (dark) (if (pack.baseId == "sculk") Color(0xFF0E171B) else Color(0xFF201411)) else lerp(Color.White, tint, .1f),
            surface = if (dark) lerp(Color(0xFF161616), tint, .19f) else lerp(Color.White, tint, .035f),
            surfaceContainerLowest = if (dark) Color(0xFF111111) else Color.White,
            surfaceContainerLow = lerp(colors.surfaceContainerLow, tint, .13f),
            surfaceContainer = lerp(colors.surfaceContainer, tint, .18f),
            surfaceContainerHigh = lerp(colors.surfaceContainerHigh, tint, .24f),
            surfaceContainerHighest = lerp(colors.surfaceContainerHighest, tint, .3f),
            secondaryContainer = lerp(colors.secondaryContainer, tint, .25f),
            outline = lerp(colors.outline, tint, .15f), outlineVariant = lerp(colors.outlineVariant, tint, .2f),
            tertiaryContainer = lerp(colors.tertiaryContainer, tint, .15f),
        )
    }
    val custom = if (dark) pack.style.darkBackground else pack.style.lightBackground
    if (custom.isEmpty()) return themedColors
    val background = Color(0xFF000000 or custom.toLong(16))
    // Background editing stays within the selected brightness family, keeping all controls legible.
    val safeBackground = if (dark) generateSequence(background) { lerp(it, Color.Black, .12f) }.first { it.luminance() <= .035f }
        else generateSequence(background) { lerp(it, Color.White, .12f) }.first { it.luminance() >= .8f }
    return themedColors.copy(background = safeBackground)
}
