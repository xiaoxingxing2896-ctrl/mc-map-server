package dev.mcmap.nativeapp

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize

fun themeTypography(name: String, custom: FontFamily?): Typography {
    val family = when (name) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; "custom" -> custom ?: FontFamily.Default; else -> FontFamily.SansSerif }
    val t = Typography()
    return t.copy(
        displayLarge = t.displayLarge.copy(fontFamily = family), displayMedium = t.displayMedium.copy(fontFamily = family), displaySmall = t.displaySmall.copy(fontFamily = family),
        headlineLarge = t.headlineLarge.copy(fontFamily = family), headlineMedium = t.headlineMedium.copy(fontFamily = family, fontWeight = FontWeight.Bold), headlineSmall = t.headlineSmall.copy(fontFamily = family),
        titleLarge = t.titleLarge.copy(fontFamily = family, fontWeight = FontWeight.Bold), titleMedium = t.titleMedium.copy(fontFamily = family, fontWeight = FontWeight.SemiBold), titleSmall = t.titleSmall.copy(fontFamily = family),
        bodyLarge = t.bodyLarge.copy(fontFamily = family), bodyMedium = t.bodyMedium.copy(fontFamily = family), bodySmall = t.bodySmall.copy(fontFamily = family),
        labelLarge = t.labelLarge.copy(fontFamily = family), labelMedium = t.labelMedium.copy(fontFamily = family), labelSmall = t.labelSmall.copy(fontFamily = family))
}

fun contrast(a: Color, b: Color): Float = (maxOf(a.luminance(), b.luminance()) + .05f) / (minOf(a.luminance(), b.luminance()) + .05f)
/** Bound both black and white texture extremes before drawing underneath text. */
fun safeTextureOpacity(requested: Float, background: Color, foregrounds: List<Color>): Float {
    for (step in 15 downTo 0) {
        val alpha = minOf(requested, step / 100f)
        if (foregrounds.all { contrast(it, lerp(background, Color.Black, alpha)) >= 4.5f && contrast(it, lerp(background, Color.White, alpha)) >= 4.5f }) return alpha
    }
    return 0f
}

@Composable fun Modifier.themeTexture(role: String, background: Color, foreground: Color, secondary: Color = foreground): Modifier {
    val bitmap = LocalThemeResources.current.images[role]
    val enabled = LocalAppearance.current.textures
    val opacity = safeTextureOpacity(LocalAtlasTheme.current.style.textureOpacity, background, listOf(foreground, secondary))
    if (!enabled || bitmap == null || opacity <= 0f) return this
    return drawWithCache {
        onDrawBehind {
            drawImage(bitmap, dstSize = IntSize(size.width.toInt().coerceAtLeast(1), size.height.toInt().coerceAtLeast(1)), alpha = opacity)
        }
    }
}
