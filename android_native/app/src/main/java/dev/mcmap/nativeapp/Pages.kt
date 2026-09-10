@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
package dev.mcmap.nativeapp

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import java.text.Collator
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable fun AtlasTopBar(eyebrow: String, title: String, trailing: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(eyebrow, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(title, style = MaterialTheme.typography.headlineMedium)
            }; trailing()
        }
        if (LocalAppearance.current.textures) MinecraftLandscape(Modifier.fillMaxWidth().height(28.dp))
    }
}
@Composable fun EmptyState(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium); Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun MarkersPage(vm: AtlasViewModel, open: (Marker) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }; var category by rememberSaveable { mutableStateOf("all") }
    var filters by rememberSaveable { mutableStateOf(true) }
    val collator = remember { Collator.getInstance(Locale.CHINA) }
    val visible = remember(vm.markers, vm.favorites, query, category) {
        vm.markers.filter { (it.title.contains(query, true) || it.description.contains(query, true)) && (category == "all" || (category == "favorites" && it.id in vm.favorites) || it.category == category) }
            .sortedWith { a, b -> collator.compare(a.title, b.title) }
    }
    Column {
        AtlasTopBar("把探索留在地图上", "世界标记") { WorldPicker(vm.world, select = vm::changeWorld) }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            AtlasIconButton(onClick = { filters = !filters }) { AtlasIcon(Icons.Outlined.Menu, "显示或收起分类") }
            AtlasTextField(query, { query = it }, Modifier.weight(1f), placeholder = { Text("搜索名称或描述") }, leadingIcon = { AtlasIcon(Icons.Outlined.Search, null) }, singleLine = true)
        }
        Spacer(Modifier.height(12.dp))
        if (filters) LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items((linkedMapOf("all" to "全部", "favorites" to "收藏") + categories).toList()) { (id, name) ->
                    AtlasFilterChip(selected = category == id, onClick = { category = id }, label = { Text(name) })
                }
        }
        Text("${worlds[vm.world]} · ${visible.size} 处标记", Modifier.padding(horizontal = 20.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (visible.isEmpty()) item { EmptyState(if (vm.loading) "正在加载" else "没有匹配的标记", "切换分类、维度或搜索词试试") }
                items(visible, key = { it.id }) { marker ->
                    AtlasCard(onClick = { open(marker) }, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${marker.icon.ifBlank { "📍" }} ${marker.title}", style = MaterialTheme.typography.titleMedium)
                            Text("X ${marker.x} · Z ${marker.z}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(categories[marker.category] ?: marker.category, style = MaterialTheme.typography.bodySmall)
                            if (marker.description.isNotBlank()) Text(marker.description, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
    }
}
@Composable fun ProfilePage(vm: AtlasViewModel, navigate: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val user = vm.user
    LaunchedEffect(user?.token) { if (user != null) { password = ""; showPassword = false; focus.clearFocus(); keyboard?.hide() } }
    val submit = {
        if (!vm.authBusy) { focus.clearFocus(); keyboard?.hide(); vm.login(email, password) }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        AtlasTopBar("MC ATLAS · 探索者工作台", "我的") {
            AtlasIconButton(onClick = { navigate("appearance") }) { AtlasIcon(Icons.Outlined.Palette, "外观设置") }
        }
        Spacer(Modifier.height(20.dp))
        if (user == null) {
            Surface(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 2.dp) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small) {
                            AtlasIcon(Icons.Outlined.PersonOutline, null, Modifier.padding(10.dp).size(28.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("欢迎回来，探索者", style = MaterialTheme.typography.titleLarge)
                            Text("登录以收藏地点和管理地图", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    AtlasTextField(email, { email = it; vm.clearAuthError() }, label = { Text("邮箱") }, placeholder = { Text("name@example.com") },
                        leadingIcon = { AtlasIcon(Icons.Outlined.AlternateEmail, null) }, singleLine = true, enabled = !vm.authBusy,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next, autoCorrectEnabled = false, capitalization = KeyboardCapitalization.None),
                        keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }), modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.Username + ContentType.EmailAddress })
                    AtlasTextField(password, { password = it; vm.clearAuthError() }, label = { Text("密码") },
                        leadingIcon = { AtlasIcon(Icons.Outlined.Lock, null) }, trailingIcon = {
                            AtlasIconButton(onClick = { showPassword = !showPassword }) { AtlasIcon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (showPassword) "隐藏密码" else "显示密码") }
                        }, singleLine = true, enabled = !vm.authBusy,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                        keyboardActions = KeyboardActions(onDone = { submit() }), modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.Password })
                    if (password.isNotEmpty() && (password.first().isWhitespace() || password.last().isWhitespace())) {
                        Text("密码包含首尾空格，请确认它们属于你的密码。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    vm.authError?.let { message ->
                        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AtlasIcon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(20.dp))
                                Text(message, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                    AtlasButton(onClick = submit, enabled = !vm.authBusy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp), shape = MaterialTheme.shapes.small) {
                        if (vm.authBusy) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp); Spacer(Modifier.width(10.dp)) }
                        Text(if (vm.authBusy) "正在连接账号…" else "登录地图账号")
                        if (!vm.authBusy) { Spacer(Modifier.width(8.dp)); AtlasIcon(Icons.Outlined.ArrowForward, null, Modifier.size(18.dp)) }
                    }
                    Text("使用地图网站的邮箱与密码。Wiki 网站的账号独立管理。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            AtlasCard(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    AtlasIcon(Icons.Outlined.Person, null, Modifier.size(40.dp))
                    Text(user.username, style = MaterialTheme.typography.headlineSmall)
                    Text(user.email)
                    Text(when (user.role) { "owner" -> "所有者"; "admin" -> "管理员"; else -> "探索者" }, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
            }
            if (user.admin) AtlasCard(onClick = { navigate("upload") }, modifier = Modifier.padding(20.dp).fillMaxWidth()) {
                ListItem(headlineContent = { Text("瓦片管理") }, supportingContent = { Text("上传 PNG · 新增区域或替换地图") }, leadingContent = { AtlasIcon(Icons.Outlined.CloudUpload, null) }, trailingContent = { AtlasIcon(Icons.Outlined.ChevronRight, null) })
            }
        }
        Spacer(Modifier.height(16.dp))
        Column(Modifier.padding(horizontal = 20.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)) {
            ProfileLink("外观设置", "主题色、明暗模式、方块风格与字号", Icons.Outlined.Palette) { navigate("appearance") }
            HorizontalDivider()
            ProfileLink("Wiki 收藏", "留住有用的合成与探索知识", Icons.Outlined.BookmarkBorder) { navigate("favorites") }
            HorizontalDivider()
            ProfileLink("浏览历史", "继续上次的 Wiki 阅读", Icons.Outlined.History) { navigate("history") }
        }
        if (user != null) AtlasTextButton(onClick = vm::logout, modifier = Modifier.padding(12.dp), enabled = !vm.uploadBusy) { Text("退出登录") }
        Text("MC Atlas ${BuildConfig.VERSION_NAME} · 你的地图，你的探索记录", Modifier.padding(24.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable private fun ProfileLink(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Surface(onClick = onClick, color = MaterialTheme.colorScheme.surface) {
        ListItem(headlineContent = { Text(title) }, supportingContent = { Text(subtitle) }, leadingContent = { AtlasIcon(icon, null, tint = MaterialTheme.colorScheme.primary) }, trailingContent = { AtlasIcon(Icons.Outlined.ChevronRight, null) })
    }
}
@Composable fun RecordsPage(vm: AtlasViewModel, favorite: Boolean, back: () -> Unit, open: (String) -> Unit) {
    val clipboard = LocalClipboardManager.current
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) { AtlasIconButton(onClick = back) { AtlasIcon(Icons.Outlined.ArrowBack, "返回") }; AtlasTopBar("探索知识库", if (favorite) "Wiki 收藏" else "浏览历史") }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.records.isEmpty()) item { EmptyState("还没有记录", if (favorite) "登录后，在 Wiki 页面点击收藏" else "浏览 Wiki 后会自动保留最后访问的页面") }
            items(vm.records, key = { it.url }) { record ->
                AtlasCard(Modifier.fillMaxWidth().combinedClickable(onClick = { open(record.url) }, onLongClick = { clipboard.setText(AnnotatedString(record.url)) })) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(record.title.ifBlank { record.url }, maxLines = 2, style = MaterialTheme.typography.titleMedium)
                        Text(DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(record.time)), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
@Composable fun ServersPage(vm: AtlasViewModel) {
    var editing by remember { mutableStateOf<Server?>(null) }; var dialog by remember { mutableStateOf(false) }; var address by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf<Server?>(null) }; var deletion by remember { mutableStateOf<Server?>(null) }
    Column {
        AtlasTopBar("与你的世界保持连接", "服务器") { AtlasFilledTonalIconButton(onClick = { editing = null; address = ""; dialog = true }, enabled = vm.servers.size < 5) { AtlasIcon(Icons.Outlined.Add, "添加服务器") } }
        Spacer(Modifier.height(12.dp))
        Text("前台每分钟更新 · ${vm.servers.size}/5 个服务器", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (vm.servers.isEmpty()) item { EmptyState("添加你的第一个世界", "点击右上角 +，输入 Java 版服务器域名。长按卡片可收藏、置顶和管理。") }
            items(vm.servers.sortedByDescending { it.pinned }, key = { it.id }) { server ->
                val frozen = server.failures >= 3
                val good = server.lastSuccess > 0 && server.failures == 0
                AtlasCard(Modifier.fillMaxWidth().combinedClickable(onClick = { menu = server }, onLongClick = { menu = server }), colors = CardDefaults.cardColors(containerColor = if (good) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AtlasIcon(if (good) Icons.Outlined.CheckCircle else Icons.Outlined.CloudOff, null, tint = if (good) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(8.dp)); Text(server.address, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            if (server.pinned) AtlasIcon(Icons.Outlined.PushPin, "已置顶", Modifier.size(18.dp))
                            if (server.favorite) AtlasIcon(Icons.Outlined.StarBorder, "已收藏", Modifier.size(18.dp))
                        }
                        if (good) {
                            Text("${server.online} / ${server.max}", style = MaterialTheme.typography.headlineLarge)
                            Text("在线玩家  ·  ${server.latency} ms", style = MaterialTheme.typography.labelLarge)
                            ServerPlayersSection(server.id, server.players)
                        } else Text(when { frozen -> "暂时离线 · 已持续 ${((System.currentTimeMillis() - server.failedSince) / 60000).coerceAtLeast(0)} 分钟"; server.failures > 0 -> "连接失败 ${server.failures}/3 · 下一轮自动重试"; else -> "正在连接…" })
                        if (server.pinned) Row {
                            AtlasTextButton(onClick = { vm.moveServer(server.id, -1) }) { Text("上移") }
                            AtlasTextButton(onClick = { vm.moveServer(server.id, 1) }) { Text("下移") }
                        }
                    }
                }
            }
        }
    }
    if (dialog) AtlasDialog(onDismissRequest = { dialog = false }, title = { Text(if (editing == null) "添加服务器" else "修改服务器") }, text = { AtlasTextField(address, { address = it }, label = { Text("域名或域名:端口") }, singleLine = true) }, confirmButton = { AtlasTextButton(onClick = { vm.saveServer(address, editing?.id); dialog = false }, enabled = runCatching { Endpoint.parse(address) }.isSuccess) { Text("保存") } }, dismissButton = { AtlasTextButton(onClick = { dialog = false }) { Text("取消") } })
    menu?.let { server -> AtlasDialog(onDismissRequest = { menu = null }, title = { Text(server.address) }, text = { Column {
        AtlasTextButton(onClick = { vm.changeServer(server.id, "pin"); menu = null }) { Text(if (server.pinned) "取消置顶" else "置顶") }
        AtlasTextButton(onClick = { vm.changeServer(server.id, "favorite"); menu = null }) { Text(if (server.favorite) "取消收藏" else "收藏") }
        AtlasTextButton(onClick = { editing = server; address = server.address; dialog = true; menu = null }) { Text("修改域名") }
        AtlasTextButton(onClick = { deletion = server; menu = null }) { Text("删除") }
    } }, confirmButton = { AtlasTextButton(onClick = { menu = null }) { Text("关闭") } }) }
    deletion?.let { server -> AtlasDialog(onDismissRequest = { deletion = null }, title = { Text("删除服务器？") }, text = { Text(server.address) }, confirmButton = { AtlasTextButton(onClick = { vm.changeServer(server.id, "delete"); deletion = null }) { Text("删除") } }, dismissButton = { AtlasTextButton(onClick = { deletion = null }) { Text("取消") } }) }
}

@Composable
private fun ServerPlayersSection(serverId: String, players: List<String>) {
    if (players.isEmpty()) return

    val normalPlayers = players.filterNot(::isAnonymousPlayer)
    val anonymousPlayers = players.filter(::isAnonymousPlayer)
    var anonymousExpanded by rememberSaveable(serverId) { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (normalPlayers.isNotEmpty()) {
            Text(
                "在线玩家：${normalPlayers.joinToString(" · ")}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (anonymousPlayers.isNotEmpty()) {
            Surface(
                onClick = { anonymousExpanded = !anonymousExpanded },
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.small,
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "匿名玩家（${anonymousPlayers.size}）",
                        Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    AtlasIcon(
                        if (anonymousExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        if (anonymousExpanded) "收起匿名玩家" else "展开匿名玩家",
                    )
                }
            }
            if (anonymousExpanded) {
                Text(
                    anonymousPlayers.joinToString(" · "),
                    Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

private fun isAnonymousPlayer(name: String): Boolean {
    val normalized = name.trim().lowercase(Locale.ROOT)
    return normalized == "anonymous player" ||
        normalized.startsWith("anonymous player") ||
        normalized.startsWith("anonymousplayer") ||
        normalized.startsWith("anonymous")
}
