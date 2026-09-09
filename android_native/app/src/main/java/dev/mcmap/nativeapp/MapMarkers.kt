package dev.mcmap.nativeapp

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.floor

data class MapMarkerGroup(val x: Int, val z: Int, val members: List<Marker>)

/** Stable world-space anchors avoid regrouping on pan. A grid bounds neighbor searches. */
fun groupMapMarkers(markers: List<Marker>, separation: Float): List<MapMarkerGroup> {
    require(separation.isFinite() && separation > 0)
    val groups = mutableListOf<MutableList<Marker>>()
    val buckets = mutableMapOf<Pair<Int, Int>, MutableList<Int>>()
    fun cell(value: Int) = floor(value.toDouble() / separation).toInt()
    markers.sortedBy { it.id }.forEach { marker ->
        val bx = cell(marker.x); val bz = cell(marker.z)
        var closest: Int? = null; var distance = separation.toDouble() * separation
        for (x in bx - 1..bx + 1) for (z in bz - 1..bz + 1) {
            buckets[x to z].orEmpty().forEach { index ->
                val anchor = groups[index].first()
                val dx = marker.x.toDouble() - anchor.x; val dz = marker.z.toDouble() - anchor.z
                val squared = dx * dx + dz * dz
                if (squared <= distance) { distance = squared; closest = index }
            }
        }
        if (closest != null) groups[closest].add(marker)
        else { buckets.getOrPut(bx to bz) { mutableListOf() }.add(groups.size); groups.add(mutableListOf(marker)) }
    }
    return groups.map { MapMarkerGroup(it.first().x, it.first().z, it.toList()) }
}

private fun pinColor(category: String) = when(category) {
    "spawn" -> Color(0xFF72C9B5); "building" -> Color(0xFFEF7887); "farm" -> Color(0xFF88B86C)
    "mine" -> Color(0xFFAB91BB); "landmark" -> Color(0xFF88ABC9); "shop" -> Color(0xFFE8B46D); else -> Color(0xFF8D9EAF)
}

/** Compact teardrop pins: white rim, pastel category color and a small original pixel glyph. */
@Composable fun MapMarkerPin(group: MapMarkerGroup, modifier: Modifier = Modifier, open: () -> Unit) {
    val marker = group.members.first()
    val fill = if (group.members.size > 1) Color(0xFF536E86) else pinColor(marker.category)
    Box(modifier.size(22.dp, 30.dp).semantics {
        contentDescription = if (group.members.size == 1) "${marker.title}，X ${marker.x}，Z ${marker.z}" else "${group.members.size} 个相邻标记，点击展开"
        onClick { open(); true }
    }) {
        Canvas(Modifier.fillMaxSize()) {
            val u = size.width / 22f
            val pin = Path().apply {
                moveTo(11 * u, 29 * u)
                cubicTo(8 * u, 24 * u, 1 * u, 18 * u, 1 * u, 11 * u)
                cubicTo(1 * u, -2 * u, 21 * u, -2 * u, 21 * u, 11 * u)
                cubicTo(21 * u, 18 * u, 14 * u, 24 * u, 11 * u, 29 * u)
                close()
            }
            drawPath(pin, Color.Black.copy(alpha = .22f), style = Stroke(2.5f * u))
            drawPath(pin, fill)
            drawPath(pin, Color.White, style = Stroke(1.1f * u))
            if (group.members.size == 1) {
                fun block(x: Int, y: Int, w: Int = 1, h: Int = 1, color: Color = Color.White) = drawRect(color, Offset((5 + x) * u, (5 + y) * u), Size(w * u, h * u))
                val ink = Color(0xFF354854)
                when(marker.category) {
                    "building" -> { block(2, 5, 8, 6); block(1, 4, 10, 2, Color(0xFFB54F57)); block(3, 2, 6, 2, Color(0xFFB54F57)); block(5, 0, 2, 2, Color(0xFFB54F57)); block(5, 7, 2, 4, ink) }
                    "farm" -> { block(5, 1, 2, 11, Color(0xFFF5DA77)); block(2, 3, 3, 2); block(7, 5, 3, 2); block(2, 7, 3, 2); block(7, 1, 3, 2) }
                    "mine" -> { block(1, 1, 9, 2); block(9, 3, 2, 3); for (i in 0..6) block(7 - i, 4 + i, 2, 2, Color(0xFF695540)) }
                    "shop" -> { block(1, 3, 10, 8, Color(0xFF986333)); block(1, 2, 10, 2, Color(0xFFF5D286)); block(1, 6, 10, 1, ink); block(5, 5, 2, 3) }
                    "spawn" -> { block(3, 0, 2, 12); block(5, 1, 6, 5, Color(0xFFEA727E)); block(1, 11, 6, 1, ink) }
                    "landmark" -> { block(3, 4, 6, 8); block(2, 2, 8, 2); block(3, 0, 2, 2); block(7, 0, 2, 2); block(5, 6, 2, 2, ink); block(5, 10, 2, 2, ink) }
                    else -> { block(5, 1, 2, 2); block(3, 3, 6, 2); block(1, 5, 10, 2); block(3, 7, 6, 2); block(5, 9, 2, 2) }
                }
            }
        }
        if (group.members.size > 1) {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1f)) {
                Text(if (group.members.size > 99) "99+" else group.members.size.toString(), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 4.dp), maxLines = 1)
            }
        }
    }
}
