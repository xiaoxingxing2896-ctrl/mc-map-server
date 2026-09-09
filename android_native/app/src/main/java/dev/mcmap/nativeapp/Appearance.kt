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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import android.provider.Settings
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween

private val Context.appearanceStore by preferencesDataStore("appearance")
data class Appearance(
    val mode: String = "light",
    val accent: String = "3E7E24",
    val corners: Boolean = false,
    val textScale: Float = 1f,
    val textures: Boolean = true,
    val packId: String = "grass",
    val motion: String = "full",
    val haptics: Boolean = true,
)
val LocalAppearance = staticCompositionLocalOf { Appearance() }
private val LocalThemeBaseDensity = staticCompositionLocalOf<Density?> { null }

class AppearanceViewModel(application: Application) : AndroidViewModel(application) {
    private val store = application.appearanceStore
    private val repository = ThemeRepository(application)
    var active by mutableStateOf(LoadedTheme(ThemeDocument(ThemeCatalog.packs.first()), ThemeResources())); private set
    var library by mutableStateOf<List<ThemeLibraryEntry>>(emptyList()); private set
    var themeMessage by mutableStateOf<String?>(null); private set
    var themeBusy by mutableStateOf(false); private set
    private var previous: Pair<Appearance, LoadedTheme>? = null
    var canRollback by mutableStateOf(false); private set
    var settings by mutableStateOf(Appearance()); private set
    var ready by mutableStateOf(false); private set
    var saveError by mutableStateOf<String?>(null); private set
    private val writes = Channel<Appearance>(Channel.CONFLATED)
    private val modeKey = stringPreferencesKey("mode")
    private val accentKey = stringPreferencesKey("accent")
    private val cornersKey = booleanPreferencesKey("corners")
    private val scaleKey = floatPreferencesKey("text_scale")
    private val texturesKey = booleanPreferencesKey("textures")
    private val packKey = stringPreferencesKey("theme_pack")
    private val motionKey = stringPreferencesKey("motion")
    private val hapticsKey = booleanPreferencesKey("haptics")
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
                    packId = p[packKey] ?: "grass",
                    motion = p[motionKey]?.takeIf { it in listOf("full", "reduced", "off") } ?: "full",
                    haptics = p[hapticsKey] ?: true,
                )
                library = withContext(Dispatchers.IO) { repository.list() }
                if (settings.packId.startsWith("custom-")) {
                    try { active = withContext(Dispatchers.IO) { repository.load(repository.read(settings.packId)) } }
                    catch (_: Exception) {
                        settings = settings.selectPack("grass")
                        themeMessage = "原主题丢失或损坏，已回退到草地方块；可在主题工作室删除损坏副本"
                        writes.trySend(settings)
                    }
                } else {
                    active = LoadedTheme(ThemeDocument(ThemeCatalog.find(settings.packId)), ThemeResources())
                    settings = settings.copy(packId = active.document.pack.id)
                }
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
                        p[packKey] = value.packId; p[motionKey] = value.motion; p[hapticsKey] = value.haptics
                    }
                    saveError = null
                } catch (_: IOException) {
                    saveError = "外观已应用，但未能保存到设备；请检查存储空间后重试"
                }
            }
        }
    }
    fun update(value: Appearance) {
        if (!ready || themeBusy) return
        if (value.packId != settings.packId && !value.packId.startsWith("custom-")) {
            previous = settings to active; canRollback = true
            active = LoadedTheme(ThemeDocument(ThemeCatalog.find(value.packId)), ThemeResources())
        }
        settings = value
        writes.trySend(value)
    }
    fun refreshLibrary() { viewModelScope.launch { library = withContext(Dispatchers.IO) { repository.list() } } }
    fun applyLoaded(value: LoadedTheme) {
        if (!ready || themeBusy) return
        previous = settings to active; canRollback = true
        active = value
        val pack = value.document.pack
        settings = settings.copy(packId = pack.id, accent = pack.accent, mode = if (pack.darkByDefault) "dark" else "light")
        writes.trySend(settings)
    }
    fun rollback() {
        if (!ready || themeBusy) return
        val old = previous ?: return
        previous = settings to active
        active = old.second
        settings = old.first.copy(motion = settings.motion, haptics = settings.haptics, textScale = settings.textScale)
        writes.trySend(settings)
        themeMessage = "已恢复 ${active.document.pack.name}"
    }
    fun apply(id: String) {
        if (!ready || themeBusy) return
        if (!id.startsWith("custom-")) { update(settings.selectPack(id)); return }
        themeBusy = true
        viewModelScope.launch {
            try {
                val loaded = withContext(Dispatchers.IO) { repository.load(repository.read(id)) }
                themeBusy = false; applyLoaded(loaded); themeMessage = "已应用 ${loaded.document.pack.name}"
            } catch (_: Exception) { themeMessage = "主题损坏或无法读取，当前主题未变更" }
            finally { themeBusy = false }
        }
    }
    fun delete(id: String) {
        if (!ready || themeBusy) return
        // Active themes must first be replaced explicitly; prevents dangling persisted references.
        if (settings.packId == id) { themeMessage = "请先应用其他主题，再删除当前主题"; return }
        themeBusy = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repository.delete(id) }
                if (previous?.first?.packId == id) { previous = null; canRollback = false }
                refreshLibrary(); themeMessage = "主题已删除"
            }
            catch (_: Exception) { themeMessage = "删除失败，请稍后重试" }
            finally { themeBusy = false }
        }
    }
}

@Composable fun AtlasTheme(appearance: Appearance = Appearance(), pack: AtlasThemePack = ThemeCatalog.find(appearance.packId), resources: ThemeResources = ThemeResources(), content: @Composable () -> Unit) {
    val context = LocalContext.current
    val view = LocalView.current
    val latestAppearance by rememberUpdatedState(appearance)
    val haptics = remember(view) { AtlasHaptics(view) { latestAppearance.haptics } }
    fun systemMotion() = runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f }.getOrDefault(false)
    var systemAnimations by remember { mutableStateOf(systemMotion()) }
    DisposableEffect(context) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { systemAnimations = systemMotion() }
        }
        context.contentResolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { context.contentResolver.unregisterContentObserver(observer) }
    }
    val dark = appearance.mode == "dark" || (appearance.mode == "system" && isSystemInDarkTheme())
    val themedColors = resolveThemeColors(appearance, dark, pack)
    val effectiveMotion = if (systemAnimations) appearance.motion else "off"
    // Only interpolate within the same brightness mode; switching brightness snaps
    // text and surfaces together, avoiding unreadable intermediate combinations.
    val displayedColors = key(dark) {
        val background by animateColorAsState(themedColors.background, tween(motionDuration(effectiveMotion, true, 200)), label = "theme background")
        val surface by animateColorAsState(themedColors.surface, tween(motionDuration(effectiveMotion, true, 200)), label = "theme surface")
        themedColors.copy(background = background, surface = surface)
    }
    val radius = if (appearance.corners && pack.id in ThemeCatalog.packs.map { it.id }) 12.dp else pack.style.radius.dp
    val density = LocalThemeBaseDensity.current ?: LocalDensity.current
    CompositionLocalProvider(LocalAppearance provides appearance, LocalAtlasTheme provides pack,
        LocalThemeResources provides resources,
        LocalThemeBaseDensity provides density,
        LocalAtlasHaptics provides haptics, LocalAtlasMotion provides effectiveMotion,
        LocalDensity provides Density(density.density, density.fontScale * appearance.textScale * pack.style.fontScale)) {
        MaterialTheme(colorScheme = displayedColors, shapes = Shapes(
            extraSmall = RoundedCornerShape(radius), small = RoundedCornerShape(radius), medium = RoundedCornerShape(radius),
            large = RoundedCornerShape(radius), extraLarge = RoundedCornerShape(radius),
        ), typography = themeTypography(pack.style.font, resources.font), content = content)
    }
}

/** Original block landscape, drawn in code; no Wiki artwork or logo is bundled. */
@Composable fun MinecraftLandscape(modifier: Modifier = Modifier) {
    val artwork = LocalThemeResources.current.images["header"]
    if (artwork != null) {
        androidx.compose.foundation.Image(artwork, null, modifier, contentScale = androidx.compose.ui.layout.ContentScale.Crop)
        return
    }
    val pack = LocalAtlasTheme.current.baseId
    val sky = when(pack) { "sculk" -> Color(0xFF10282F); "nether" -> Color(0xFF471F1B); else -> Color(0xFF80C8EA) }
    val groundColor = when(pack) { "sculk" -> Color(0xFF243A40); "nether" -> Color(0xFF352A28); else -> Color(0xFF765334) }
    val highlight = when(pack) { "sculk" -> Color(0xFF54BEB1); "nether" -> Color(0xFFE28442); else -> Color(0xFF6B9E30) }
    Canvas(modifier) {
        val pixel = 4.dp.toPx()
        drawRect(sky)
        for (i in 0..5) {
            val x = i * size.width / 5 - 3 * pixel
            val y = (2 + i % 3) * pixel
            drawRect(lerp(sky, highlight, .25f), Offset(x, y), Size(9 * pixel, pixel))
            drawRect(lerp(sky, Color.White, .2f), Offset(x + 2 * pixel, y - pixel), Size(5 * pixel, pixel))
        }
        val ground = size.height - 5 * pixel
        drawRect(groundColor, Offset(0f, ground), Size(size.width, 5 * pixel))
        for (i in 0..(size.width / pixel).toInt()) {
            val x = i * pixel
            val blades = if (i % 7 == 0) 2 else if (i % 3 == 0) 1 else 0
            drawRect(if (i % 3 == 0) highlight else lerp(highlight, groundColor, .25f), Offset(x, ground - blades * pixel), Size(pixel, (2 + blades) * pixel))
            if (i % 4 == 0) drawRect(lerp(groundColor, highlight, .3f), Offset(x, ground + 3 * pixel), Size(pixel, pixel))
            if (i % 9 == 0) drawRect(lerp(groundColor, Color.Black, .25f), Offset(x, ground + 4 * pixel), Size(2 * pixel, pixel))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun AppearancePage(vm: AppearanceViewModel, openStudio: () -> Unit, back: () -> Unit) {
    val settings = vm.settings
    var hex by rememberSaveable(settings.accent) { mutableStateOf(settings.accent) }
    val validHex = hex.matches(Regex("[0-9A-Fa-f]{6}"))
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AtlasIconButton(onClick = back) { AtlasIcon(Icons.Outlined.ArrowBack, "返回") }
            AtlasTopBar("打造你的工作台", "主题与反馈")
        }
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            AtlasButton(openStudio, Modifier.fillMaxWidth(), enabled = vm.ready) { Text("打开主题工作室 · 导入 / 编辑 / 导出") }
            vm.themeMessage?.let { Text(it) }
            Text("内置主题", style = MaterialTheme.typography.titleMedium)
            ThemeCatalog.packs.forEach { pack ->
                AtlasCard(onClick = { vm.update(settings.selectPack(pack.id)) }, modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = if (settings.packId == pack.id) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(32.dp).background(Color(pack.tint)))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(pack.name, style = MaterialTheme.typography.titleMedium); Text(pack.description, style = MaterialTheme.typography.bodySmall) }
                        if (settings.packId == pack.id) AtlasIcon(Icons.Outlined.Check, "已选中")
                    }
                }
            }
            vm.saveError?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                AtlasTextButton(onClick = { vm.update(settings) }) { Text("重试保存") }
            }
            AtlasCard(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)) {
                if (settings.textures) MinecraftLandscape(Modifier.fillMaxWidth().height(56.dp))
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${LocalAtlasTheme.current.name} · 实时预览", style = MaterialTheme.typography.titleLarge)
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
                    AtlasFilterChip(settings.mode == id, { vm.update(settings.copy(mode = id)) }, label = { Text(label) }, enabled = vm.ready)
                }
            }
            Text("主题色", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("3E7E24" to "草地", "287A91" to "海洋", "955041" to "下界").forEach { (color, label) ->
                    AtlasFilterChip(settings.accent == color, { vm.update(settings.copy(accent = color)) }, label = { Text(label) }, leadingIcon = { Box(Modifier.size(14.dp).background(Color(0xFF000000 or color.toLong(16)))) }, enabled = vm.ready)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AtlasTextField(hex, { hex = it.removePrefix("#").take(6).uppercase() }, Modifier.weight(1f), singleLine = true,
                    label = { Text("自定义颜色") }, prefix = { Text("#") }, isError = !validHex,
                    supportingText = { Text(if (validHex) "文字对比度会自动调整" else "请输入 6 位十六进制颜色") })
                AtlasOutlinedButton(onClick = { vm.update(settings.copy(accent = hex)) }, enabled = validHex && vm.ready) { Text("应用") }
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("柔和圆角", style = MaterialTheme.typography.titleMedium); Text("关闭时使用经典方块面板", style = MaterialTheme.typography.bodySmall) }
                AtlasSwitch(settings.corners, { vm.update(settings.copy(corners = it)) }, enabled = vm.ready && !settings.packId.startsWith("custom-"))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("像素景观", style = MaterialTheme.typography.titleMedium); Text("显示天空、草地与泥土装饰", style = MaterialTheme.typography.bodySmall) }
                AtlasSwitch(settings.textures, { vm.update(settings.copy(textures = it)) }, enabled = vm.ready)
            }
            Text("应用文字大小", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(.9f to "紧凑", 1f to "标准", 1.2f to "大字").forEach { (scale, label) ->
                    AtlasFilterChip(settings.textScale == scale, { vm.update(settings.copy(textScale = scale)) }, label = { Text(label) }, enabled = vm.ready)
                }
            }
            HorizontalDivider()
            Text("动效与触感", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("full" to "标准动效", "reduced" to "减少动态", "off" to "关闭动效").forEach { (mode, title) ->
                    AtlasFilterChip(settings.motion == mode, { vm.update(settings.copy(motion = mode)) }, label = { Text(title) }, enabled = vm.ready)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("触感反馈", style = MaterialTheme.typography.titleMedium); Text("选择、长按和完成操作时轻反馈", style = MaterialTheme.typography.bodySmall) }
                AtlasSwitch(settings.haptics, { vm.update(settings.copy(haptics = it)) }, enabled = vm.ready)
            }
            val feedback = LocalAtlasHaptics.current
            AtlasOutlinedButton(onClick = { feedback?.emit(AtlasFeedback.Success) }, enabled = settings.haptics) { Text("体验完成反馈") }
            Text("减少动态保留短暂淡入，关闭动效立即切换。遵循系统关闭动画和触感的设置；震感因设备而异。换主题不会重置这些偏好。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("在系统字号基础上调整。Wiki 正文保留网站的排版与主题。设置保存在本机，退出账号后仍然有效。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AtlasOutlinedButton(onClick = { vm.update(Appearance().copy(motion = settings.motion, haptics = settings.haptics)) }, enabled = vm.ready, modifier = Modifier.fillMaxWidth()) { AtlasIcon(Icons.Outlined.RestartAlt, null); Spacer(Modifier.width(8.dp)); Text("恢复默认 MC 外观") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
