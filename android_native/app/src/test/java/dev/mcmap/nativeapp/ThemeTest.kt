package dev.mcmap.nativeapp

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.*
import org.junit.Test

class ThemeTest {
    @Test fun switchingPacksKeepsAccessibilityAndPersonalChoices() {
        val personal = Appearance(corners = true, textScale = 1.2f, textures = false, motion = "off", haptics = false)
        ThemeCatalog.packs.forEach { pack ->
            val selected = personal.selectPack(pack.id)
            assertEquals(pack.id, selected.packId)
            assertEquals("off", selected.motion)
            assertFalse(selected.haptics)
            assertTrue(selected.corners)
            assertFalse(selected.textures)
            assertEquals(1.2f, selected.textScale)
        }
        assertEquals("grass", ThemeCatalog.find("missing-theme").id)
    }
    @Test fun systemDisableTakesPrecedenceOverApplicationMotion() {
        assertEquals(0, motionDuration("full", false, 160))
        assertEquals(0, motionDuration("off", true, 160))
        assertTrue(motionDuration("reduced", true, 160) <= 100)
    }
    @Test fun allThemesAndExtremeAccentsKeepTextReadable() {
        fun contrast(a: Color, b: Color): Float {
            val x = a.luminance(); val y = b.luminance()
            return (maxOf(x, y) + .05f) / (minOf(x, y) + .05f)
        }
        for (pack in ThemeCatalog.packs) for (dark in listOf(false, true)) for (accent in listOf(pack.accent, "000000", "FFFFFF", "FF00FF")) {
            val colors = resolveThemeColors(Appearance(packId = pack.id, accent = accent), dark)
            val pairs = listOf(colors.onBackground to colors.background, colors.onSurface to colors.surface,
                colors.onPrimary to colors.primary, colors.onPrimaryContainer to colors.primaryContainer,
                colors.onSecondaryContainer to colors.secondaryContainer, colors.onSurface to colors.surfaceContainerHighest)
            pairs.forEachIndexed { index, (text, background) ->
                assertTrue("${pack.id} dark=$dark accent=$accent pair=$index ratio=${contrast(text, background)}", contrast(text, background) >= 4.5f)
            }
        }
    }
}
