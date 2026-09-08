package dev.mcmap.nativeapp

import android.app.Application
import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.IOException

private val Context.appearanceStore by preferencesDataStore("appearance")
data class Appearance(
    val mode: String = "light",
    val accent: String = "3E7E24",
    val corners: Boolean = false,
    val textScale: Float = 1f,
    val textures: Boolean = true,
)
val LocalAppearance = staticCompositionLocalOf { Appearance() }

class AppearanceViewModel(application: Application) : AndroidViewModel(application) {
    private val store = application.appearanceStore
    var settings by mutableStateOf(Appearance()); private set
    var ready by mutableStateOf(false); private set
    var saveError by mutableStateOf<String?>(null); private set
    private val writes = Channel<Appearance>(Channel.CONFLATED)
    private val modeKey = stringPreferencesKey("mode")
    private val accentKey = stringPreferencesKey("accent")
    private val cornersKey = booleanPreferencesKey("corners")
    private val scaleKey = floatPreferencesKey("text_scale")
    private val texturesKey = booleanPreferencesKey("textures")
    init {
        viewModelScope.launch {
            try {
                val p = store.data.first()
                settings = Appearance(
                    mode = p[modeKey]?.takeIf { it in listOf("light", "dark", "system") } ?: "light",
                    accent = p[accentKey]?.takeIf { it.matches(Regex("[0-9A-Fa-f]{6}")) } ?: "3E7E24",
                    corners = p[cornersKey] ?: false,
                    textScale = (p[scaleKey] ?: 1f).takeIf { it.isFinite() }?.coerceIn(.9f, 1.2f) ?: 1f,
                    textures = p[texturesKey] ?: true,
                )
            } catch (_: IOException) {
                saveError = "暂时无法读取外观设置，已使用默认外观"
            } finally {
                ready = true
            }
            for (value in writes) {
                try {
                    store.edit { p ->
                        p[modeKey] = value.mode; p[accentKey] = value.accent
                        p[cornersKey] = value.corners; p[scaleKey] = value.textScale; p[texturesKey] = value.textures
                    }
                    saveError = null
                } catch (_: IOException) {
                    saveError = "外观已应用，但未能保存到设备；请检查存储空间后重试"
                }
            }
        }
    }
    fun update(value: Appearance) {
        if (!ready) return
        settings = value
        writes.trySend(value)
    }
}

@Composable fun AtlasTheme(appearance: Appearance = Appearance(), content: @Composable () -> Unit) {
    val dark = appearance.mode == "dark" || (appearance.mode == "system" && isSystemInDarkTheme())
    val accent = Color(0xFF000000 or appearance.accent.toLong(16))
    // Keep text and controls readable even when the user chooses a very pale or dark accent.
    val primary = if (dark) lerp(accent, Color.White, .48f) else generateSequence(accent) { lerp(it, Color.Black, .12f) }.first { it.luminance() <= .18f }
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
    val radius = if (appearance.corners) 12.dp else 2.dp
    val density = LocalDensity.current
    CompositionLocalProvider(LocalAppearance provides appearance, LocalDensity provides Density(density.density, density.fontScale * appearance.textScale)) {
        MaterialTheme(colorScheme = colors, shapes = Shapes(
            extraSmall = RoundedCornerShape(radius), small = RoundedCornerShape(radius), medium = RoundedCornerShape(radius),
            large = RoundedCornerShape(radius), extraLarge = RoundedCornerShape(radius),
        ), typography = Typography(
            headlineMedium = Typography().headlineMedium.copy(fontWeight = FontWeight.Bold),
            titleLarge = Typography().titleLarge.copy(fontWeight = FontWeight.Bold),
            titleMedium = Typography().titleMedium.copy(fontWeight = FontWeight.SemiBold),
        ), content = content)
    }
}

/** Original block landscape, drawn in code; no Wiki artwork or logo is bundled. */
@Composable fun MinecraftLandscape(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val pixel = 4.dp.toPx()
        drawRect(Color(0xFF80C8EA))
        for (i in 0..5) {
            val x = i * size.width / 5 - 3 * pixel
            val y = (2 + i % 3) * pixel
            drawRect(Color(0xFFBCE5F4), Offset(x, y), Size(9 * pixel, pixel))
            drawRect(Color(0xFFD7EEF5), Offset(x + 2 * pixel, y - pixel), Size(5 * pixel, pixel))
        }
        val ground = size.height - 5 * pixel
        drawRect(Color(0xFF765334), Offset(0f, ground), Size(size.width, 5 * pixel))
        for (i in 0..(size.width / pixel).toInt()) {
            val x = i * pixel
            val blades = if (i % 7 == 0) 2 else if (i % 3 == 0) 1 else 0
            drawRect(if (i % 3 == 0) Color(0xFF6B9E30) else Color(0xFF4E8228), Offset(x, ground - blades * pixel), Size(pixel, (2 + blades) * pixel))
            if (i % 4 == 0) drawRect(Color(0xFF95734D), Offset(x, ground + 3 * pixel), Size(pixel, pixel))
            if (i % 9 == 0) drawRect(Color(0xFF594535), Offset(x, ground + 4 * pixel), Size(2 * pixel, pixel))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun AppearancePage(vm: AppearanceViewModel, back: () -> Unit) {
    val settings = vm.settings
    var hex by rememberSaveable(settings.accent) { mutableStateOf(settings.accent) }
    val validHex = hex.matches(Regex("[0-9A-Fa-f]{6}"))
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Outlined.ArrowBack, "返回") }
            PageHeading("打造你的工作台", "外观设置")
        }
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            vm.saveError?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { vm.update(settings) }) { Text("重试保存") }
            }
            Card(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)) {
                if (settings.textures) MinecraftLandscape(Modifier.fillMaxWidth().height(56.dp))
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("你的世界，由你定义", style = MaterialTheme.typography.titleLarge)
                    Text("预览 · 配色、文字和面板会即时应用到应用界面。", style = MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.small) { Text("草方块", Modifier.padding(10.dp), color = MaterialTheme.colorScheme.onPrimary) }
                        Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.small) { Text("探索记录", Modifier.padding(10.dp)) }
                    }
                }
            }
            Text("显示模式", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("light" to "明亮", "dark" to "深色", "system" to "跟随系统").forEach { (id, label) ->
                    FilterChip(settings.mode == id, { vm.update(settings.copy(mode = id)) }, label = { Text(label) }, enabled = vm.ready)
                }
            }
            Text("主题色", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("3E7E24" to "草地", "287A91" to "海洋", "955041" to "下界").forEach { (color, label) ->
                    FilterChip(settings.accent == color, { vm.update(settings.copy(accent = color)) }, label = { Text(label) }, leadingIcon = { Box(Modifier.size(14.dp).background(Color(0xFF000000 or color.toLong(16)))) }, enabled = vm.ready)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(hex, { hex = it.removePrefix("#").take(6).uppercase() }, Modifier.weight(1f), singleLine = true,
                    label = { Text("自定义颜色") }, prefix = { Text("#") }, isError = !validHex,
                    supportingText = { Text(if (validHex) "文字对比度会自动调整" else "请输入 6 位十六进制颜色") })
                OutlinedButton(onClick = { vm.update(settings.copy(accent = hex)) }, enabled = validHex && vm.ready) { Text("应用") }
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("柔和圆角", style = MaterialTheme.typography.titleMedium); Text("关闭时使用经典方块面板", style = MaterialTheme.typography.bodySmall) }
                Switch(settings.corners, { vm.update(settings.copy(corners = it)) }, enabled = vm.ready)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("像素景观", style = MaterialTheme.typography.titleMedium); Text("显示天空、草地与泥土装饰", style = MaterialTheme.typography.bodySmall) }
                Switch(settings.textures, { vm.update(settings.copy(textures = it)) }, enabled = vm.ready)
            }
            Text("应用文字大小", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(.9f to "紧凑", 1f to "标准", 1.2f to "大字").forEach { (scale, label) ->
                    FilterChip(settings.textScale == scale, { vm.update(settings.copy(textScale = scale)) }, label = { Text(label) }, enabled = vm.ready)
                }
            }
            Text("在系统字号基础上调整。Wiki 正文保留网站的排版与主题。设置保存在本机，退出账号后仍然有效。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { vm.update(Appearance()) }, enabled = vm.ready, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.RestartAlt, null); Spacer(Modifier.width(8.dp)); Text("恢复默认 MC 外观") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
