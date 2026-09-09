package dev.mcmap.nativeapp

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalLayoutApi::class)
@Composable fun ThemeStudioPage(appearance: AppearanceViewModel, studio: ThemeStudioViewModel = viewModel(), back: () -> Unit) {
    var discard by rememberSaveable { mutableStateOf(false) }
    var deleteId by rememberSaveable { mutableStateOf<String?>(null) }
    var assetRole by rememberSaveable { mutableStateOf("header") }
    var editorTab by rememberSaveable { mutableStateOf("预览") }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(studio::import) }
    val asset = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { uri -> studio.asset(assetRole, uri) } }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream"), studio::export)
    fun leave() { if (studio.dirty) discard = true else { studio.discard(); back() } }
    BackHandler { if (!studio.busy) leave() }
    LaunchedEffect(Unit) { appearance.refreshLibrary() }
    val loaded = studio.draft
    val scroll = rememberScrollState()
    LaunchedEffect(editorTab, loaded?.document?.pack?.id) { scroll.scrollTo(0) }
    // Follow the active theme; a draft only affects its isolated scene preview.
    val workbenchPack = appearance.active.document.pack.let { it.copy(style = it.style.copy(radius = 0, border = 2, font = "mono")) }
    CompositionLocalProvider(LocalMinecraftMenus provides true) {
    AtlasTheme(appearance.settings.copy(corners = false), workbenchPack, appearance.active.resources) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().minecraftBackdrop().themeTexture("background", MaterialTheme.colorScheme.background, MaterialTheme.colorScheme.onBackground, MaterialTheme.colorScheme.primary).verticalScroll(scroll).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AtlasCard(Modifier.fillMaxWidth()) {
                    MinecraftLandscape(Modifier.fillMaxWidth().height(52.dp))
                    Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        AtlasTextButton({ leave() }, enabled = !studio.busy) { Text("返回") }
                        Column(Modifier.weight(1f)) {
                            Text("M C   A T L A S", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text("主题工作室", style = MaterialTheme.typography.headlineSmall)
                            Text("建造属于你的界面", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (studio.busy || appearance.themeBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
                studio.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                appearance.themeMessage?.let { Text(it) }
                appearance.saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                val enabled = appearance.ready && !studio.busy && !appearance.themeBusy
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                  if (loaded == null) {
                    StudioMenuButton("导入主题包", enabled) { import.launch(arrayOf("*/*")) }
                    StudioMenuButton("定制当前主题", enabled) { editorTab = "预览"; studio.open(appearance.active.document.pack) }
                  }
                  // Recovery stays legible even if an imported font is unusable.
                  AtlasTheme(Appearance(mode = appearance.settings.mode, motion = "off", haptics = false), ThemeCatalog.find(workbenchPack.baseId).copy(style = ThemeStyle(radius = 0, border = 2))) {
                    StudioMenuButton("恢复默认", enabled) { appearance.apply("grass") }
                    if (appearance.canRollback) StudioMenuButton("撤回切换", enabled) { appearance.rollback() }
                  }
                }
                Text("已装备 · ${appearance.active.document.pack.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                if (loaded == null) {
                    Text("主题库", style = MaterialTheme.typography.titleLarge)
                    ThemeCatalog.packs.forEach { pack ->
                      AtlasTheme(appearance.settings.copy(packId = pack.id, accent = pack.accent, corners = false), pack.copy(style = ThemeStyle(radius = 0, border = 2))) {
                        AtlasCard(Modifier.fillMaxWidth()) {
                            MinecraftLandscape(Modifier.fillMaxWidth().height(40.dp))
                            Column(Modifier.padding(12.dp)) {
                                Text(pack.name, style = MaterialTheme.typography.titleMedium)
                                Text(pack.description, style = MaterialTheme.typography.bodySmall)
                                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    StudioMenuButton("预览 / 编辑", enabled, Modifier.weight(1f)) { editorTab = "预览"; studio.open(pack) }
                                    StudioMenuButton(if (appearance.settings.packId == pack.id) "已装备" else "应用", enabled, Modifier.weight(1f)) { appearance.apply(pack.id) }
                                }
                            }
                        }
                      }
                    }
                    appearance.library.forEach { entry ->
                        AtlasCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text(entry.name, style = MaterialTheme.typography.titleMedium)
                                if (appearance.settings.packId == entry.id) Text("使用中")
                                FlowRow {
                                    AtlasTextButton({ editorTab = "预览"; studio.open(ThemeCatalog.packs.first().copy(id = entry.id)) }, enabled = enabled && !entry.damaged) { Text("预览 / 编辑 / 导出") }
                                    AtlasTextButton({ appearance.apply(entry.id) }, enabled = enabled && !entry.damaged) { Text("应用") }
                                    AtlasTextButton({ deleteId = entry.id }, enabled = enabled && appearance.settings.packId != entry.id) { Text("删除") }
                                }
                            }
                        }
                    }
                } else {
                    val pack = loaded.document.pack
                    val style = pack.style
                    fun changeStyle(value: ThemeStyle) = studio.edit(pack.copy(style = value))
                    Text(pack.name, style = MaterialTheme.typography.titleLarge)
                    Text(if (studio.dirty) "草稿 · 尚未保存" else "独立副本 · 先预览，再应用", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("预览", "设计", "素材").forEach { title -> AtlasFilterChip(editorTab == title, { editorTab = title }, { Text(title) }) }
                    }
                    if (editorTab == "设计") {
                    AtlasCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AtlasTextField(pack.name, { studio.edit(pack.copy(name = it.take(40))) }, Modifier.fillMaxWidth(), enabled = enabled, label = { Text("主题名称") }, singleLine = true)
                    AtlasTextField(pack.author, { studio.edit(pack.copy(author = it.take(60))) }, Modifier.fillMaxWidth(), enabled = enabled, label = { Text("作者（可选）") }, singleLine = true)
                    AtlasTextField(pack.description, { studio.edit(pack.copy(description = it.take(180))) }, Modifier.fillMaxWidth(), enabled = enabled, label = { Text("描述") })
                    Text("基础风格", style = MaterialTheme.typography.titleMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ThemeCatalog.packs.forEach { base -> AtlasFilterChip(pack.baseId == base.id, { studio.edit(pack.copy(baseId = base.id, tint = base.tint, accent = base.accent)) }, { Text(base.name) }, enabled = enabled) }
                    }
                    HexEditor("强调色", pack.accent, enabled, false) { studio.edit(pack.copy(accent = it)) }
                    HexEditor("浅色背景（留空使用基础主题）", style.lightBackground, enabled) { changeStyle(style.copy(lightBackground = it)) }
                    HexEditor("深色背景（留空使用基础主题）", style.darkBackground, enabled) { changeStyle(style.copy(darkBackground = it)) }
                    Text("系统会调整颜色亮度以保护文字可读性。", style = MaterialTheme.typography.bodySmall)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("默认深色模式"); AtlasSwitch(pack.darkByDefault, { studio.edit(pack.copy(darkByDefault = it)) }, enabled) }
                    Text("圆角：${style.radius} dp · 边框：${style.border} dp")
                    Slider(style.radius.toFloat(), { changeStyle(style.copy(radius = it.toInt())) }, valueRange = 0f..24f, steps = 23, enabled = enabled)
                    Slider(style.border.toFloat(), { changeStyle(style.copy(border = it.toInt())) }, valueRange = 0f..3f, steps = 2, enabled = enabled)
                    Text("字体", style = MaterialTheme.typography.titleMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("sans" to "无衬线", "serif" to "衬线", "mono" to "等宽").forEach { (id, label) -> AtlasFilterChip(style.font == id, { changeStyle(style.copy(font = id)) }, { Text(label) }, enabled = enabled) }
                        if ("font" in loaded.document.assets) AtlasFilterChip(style.font == "custom", { changeStyle(style.copy(font = "custom")) }, { Text("导入字体") }, enabled = enabled)
                    }
                    Text("主题字号：${(style.fontScale * 100).toInt()}%（同时保留个人与系统字号）")
                    Slider(style.fontScale, { changeStyle(style.copy(fontScale = it)) }, valueRange = .85f..1.15f, enabled = enabled)
                    Text("纹理强度：${(style.textureOpacity * 100).toInt()}%")
                    Slider(style.textureOpacity, { changeStyle(style.copy(textureOpacity = it)) }, valueRange = 0f..0.15f, enabled = enabled)
                    }
                    }
                    }
                    if (editorTab == "素材") {
                    Text("素材", style = MaterialTheme.typography.titleMedium)
                    Text("图片使用 PNG / WebP：纹理最大 1024×1024，导航图标最大 256×256。导航图标按当前文字色着色，需成套提供五个。字体支持 TTF / OTF。", style = MaterialTheme.typography.bodySmall)
                    val labels = listOf("标题景观", "页面背景", "卡片纹理", "导航背景", "按钮纹理", "服务器图标", "Wiki 图标", "地图图标", "标记图标", "我的图标", "字体")
                    ThemePackage.roles.forEachIndexed { index, role ->
                      AtlasCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            AtlasOutlinedButton({ assetRole = role; asset.launch(if (role == "font") arrayOf("*/*") else arrayOf("image/png", "image/webp")) }, enabled = enabled) {
                                Text("${labels[index]} · ${if (role in loaded.document.assets) "替换" else "添加"}")
                            }
                            if (role in loaded.document.assets) AtlasTextButton({ studio.removeAsset(role) }, enabled = enabled) { Text("重置") }
                        }
                      }
                    }
                    Text("纹理强度会受文字对比度约束；地图瓦片和 Wiki 正文保持其原始内容。", style = MaterialTheme.typography.bodySmall)
                    }
                    if (editorTab == "预览") CompositionLocalProvider(LocalMinecraftMenus provides false) { ThemePreview(loaded, appearance.settings) }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (editorTab != "预览") AtlasOutlinedButton({ editorTab = "预览" }, enabled = enabled) { Text("查看预览效果") }
                        AtlasButton({ studio.save(appearance, true) }, enabled = enabled) { Text("保存副本并应用") }
                        AtlasOutlinedButton({ studio.save(appearance, false) }, enabled = enabled) { Text("只保存副本") }
                        AtlasOutlinedButton({ studio.prepareExport { export.launch(it) } }, enabled = enabled) { Text("导出主题包") }
                        AtlasTextButton({ if (studio.dirty) discard = true else studio.discard() }, enabled = enabled) { Text("关闭草稿") }
                    }
                    if (studio.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    studio.message?.let { Text(it) }
                }
            }
        }
        if (discard) AtlasDialog({ discard = false }, { AtlasTextButton({ studio.discard(); discard = false }) { Text("放弃草稿") } },
            title = { Text("放弃未保存的修改？") }, text = { Text("已保存主题和当前外观不会改变。") }, dismissButton = { AtlasTextButton({ discard = false }) { Text("继续编辑") } })
        deleteId?.let { id -> AtlasDialog({ deleteId = null }, { AtlasTextButton({ appearance.delete(id); deleteId = null }) { Text("删除") } },
            title = { Text("删除此主题副本？") }, text = { Text("仅删除应用内副本，原始导入文件不受影响。") }, dismissButton = { AtlasTextButton({ deleteId = null }) { Text("取消") } }) }
    }
    }
}

@Composable private fun StudioMenuButton(title: String, enabled: Boolean, modifier: Modifier = Modifier, action: () -> Unit) {
    AtlasOutlinedButton(action, modifier.background(MaterialTheme.colorScheme.surfaceContainerHigh), enabled = enabled,
        shape = androidx.compose.ui.graphics.RectangleShape, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = .38f))
    }
}

@Composable private fun HexEditor(label: String, value: String, enabled: Boolean, allowEmpty: Boolean = true, update: (String) -> Unit) {
    var input by remember(value) { mutableStateOf(value) }
    val valid = (allowEmpty && input.isEmpty()) || input.matches(Regex("[0-9a-fA-F]{6}"))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AtlasTextField(input, { input = it.removePrefix("#").take(6) }, Modifier.weight(1f), enabled = enabled, label = { Text(label) }, singleLine = true, isError = !valid)
        AtlasTextButton({ update(input.uppercase()) }, enabled = enabled && valid, modifier = Modifier.padding(top = 8.dp)) { Text("更新") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun ThemePreview(loaded: LoadedTheme, personal: Appearance) {
    var dark by rememberSaveable { mutableStateOf(false) }
    var page by rememberSaveable { mutableStateOf("地图") }
    Text("场景预览", style = MaterialTheme.typography.titleLarge)
    Row { AtlasFilterChip(!dark, { dark = false }, { Text("浅色") }); Spacer(Modifier.width(8.dp)); AtlasFilterChip(dark, { dark = true }, { Text("深色") }) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("地图", "登录", "Wiki", "标记", "上传").forEach { title -> AtlasFilterChip(page == title, { page = title }, { Text(title) }) } }
    val pack = loaded.document.pack
    AtlasTheme(personal.copy(packId = pack.id, accent = pack.accent, mode = if (dark) "dark" else "light", corners = false), pack, loaded.resources) {
        val colors = MaterialTheme.colorScheme
        Column(Modifier.fillMaxWidth().background(colors.background).themeTexture("background", colors.background, colors.onBackground, colors.primary).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CompositionLocalProvider(LocalContentColor provides colors.onBackground) {
                MinecraftLandscape(Modifier.fillMaxWidth().height(40.dp))
                Text("$page · 示例预览", style = MaterialTheme.typography.titleLarge)
                when (page) {
                    "地图" -> {
                        MinecraftLandscape(Modifier.fillMaxWidth().height(110.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { AtlasFilledTonalButton({}) { Text("主世界") }; AtlasOutlinedButton({}) { Text("定位标记") } }
                        Text("X 128 · Z −64 · 地图瓦片不受主题着色影响")
                    }
                    "登录" -> {
                        AtlasTextField("player@example.com", {}, Modifier.fillMaxWidth(), label = { Text("邮箱") }, singleLine = true)
                        AtlasTextField("••••••••", {}, Modifier.fillMaxWidth(), label = { Text("密码") }, singleLine = true)
                        AtlasButton({}, Modifier.fillMaxWidth()) { Text("登录（预览）") }
                    }
                    "Wiki" -> {
                        AtlasTextField("红石", {}, Modifier.fillMaxWidth(), label = { Text("搜索 Minecraft Wiki") })
                        AtlasCard(Modifier.fillMaxWidth()) { Text("zh.minecraft.wiki\n实际正文使用原站页面，主题只作用于原生控件。", Modifier.padding(12.dp)) }
                    }
                    "标记" -> AtlasCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) { Text("村庄 · 主世界", style = MaterialTheme.typography.titleMedium); Text("X 128 · Z −64"); AtlasOutlinedButton({}) { Text("在地图中查看") } } }
                    else -> {
                        AtlasCard(Modifier.fillMaxWidth()) { Text("管理员瓦片上传\n权限校验和覆盖确认不受主题影响。", Modifier.padding(12.dp)) }
                        AtlasOutlinedButton({}) { Text("选择 PNG 瓦片（预览）") }
                        AtlasButton({}, enabled = false) { Text("上传（预览禁用）") }
                    }
                }
                AtlasNavigationBar(when(page) { "Wiki" -> 1; "地图" -> 2; "标记" -> 3; else -> 4 }) {}
            }
        }
    }
}
