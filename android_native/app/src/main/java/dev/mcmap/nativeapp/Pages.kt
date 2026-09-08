@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
package dev.mcmap.nativeapp

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import java.text.Collator
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable fun PageHeading(eyebrow: String, title: String, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(eyebrow, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(title, style = MaterialTheme.typography.headlineMedium)
        }; trailing()
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
        PageHeading("YOUR WORLD, BOOKMARKED", "标记") { WorldPicker(vm.world, select = vm::changeWorld) }
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { filters = !filters }) { Icon(Icons.Outlined.Menu, "显示或收起分类") }
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), placeholder = { Text("搜索名称或描述") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true)
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.weight(1f)) {
            if (filters) LazyColumn(Modifier.fillMaxWidth(.382f).padding(start = 12.dp)) {
                items((linkedMapOf("all" to "全部", "favorites" to "收藏") + categories).toList()) { (id, name) ->
                    FilterChip(selected = category == id, onClick = { category = id }, label = { Text(name) }, modifier = Modifier.fillMaxWidth().padding(end = 8.dp))
                }
            }
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (visible.isEmpty()) item { EmptyState(if (vm.loading) "正在加载" else "没有匹配的标记", "切换分类、维度或搜索词试试") }
                items(visible, key = { it.id }) { marker ->
                    ElevatedCard(onClick = { open(marker) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${marker.icon.ifBlank { "📍" }} ${marker.title}", style = MaterialTheme.typography.titleMedium)
                            Text("X ${marker.x} · Z ${marker.z}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(categories[marker.category] ?: marker.category, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
@Composable fun ProfilePage(vm: AtlasViewModel, navigate: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        PageHeading("MC ATLAS", "我的")
        val user = vm.user
        if (user == null) {
            ElevatedCard(Modifier.padding(horizontal = 20.dp).fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Icon(Icons.Outlined.PersonOutline, null, Modifier.size(36.dp))
                    Text("登录，连接你的世界", style = MaterialTheme.typography.titleLarge)
                    Text("使用地图网站的邮箱账号", style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(email, { email = it }, label = { Text("邮箱") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(password, { password = it }, label = { Text("密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    Button(onClick = { vm.login(email, password); password = "" }, enabled = !vm.authBusy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(if (vm.authBusy) "登录中…" else "登录") }
                }
            }
        } else {
            Card(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.Person, null, Modifier.size(40.dp))
                    Text(user.username, style = MaterialTheme.typography.headlineSmall)
                    Text(user.email)
                    SuggestionChip(onClick = {}, label = { Text(when (user.role) { "owner" -> "Owner · 所有者"; "admin" -> "管理员"; else -> "探索者" }) })
                }
            }
            if (user.admin) Card(onClick = { navigate("upload") }, modifier = Modifier.padding(20.dp).fillMaxWidth()) {
                ListItem(headlineContent = { Text("瓦片管理") }, supportingContent = { Text("上传 PNG · 新增区域或替换地图") }, leadingContent = { Icon(Icons.Outlined.CloudUpload, null) }, trailingContent = { Icon(Icons.Outlined.ChevronRight, null) })
            }
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = { navigate("favorites") }, modifier = Modifier.padding(horizontal = 12.dp)) { Icon(Icons.Outlined.BookmarkBorder, null); Spacer(Modifier.width(12.dp)); Text("Wiki 收藏") }
        TextButton(onClick = { navigate("history") }, modifier = Modifier.padding(horizontal = 12.dp)) { Icon(Icons.Outlined.History, null); Spacer(Modifier.width(12.dp)); Text("浏览历史") }
        if (user != null) TextButton(onClick = vm::logout, modifier = Modifier.padding(12.dp), enabled = !vm.uploadBusy) { Text("退出登录") }
        Text("MC Atlas 2.0\n你的地图，你的探索记录", Modifier.padding(24.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun RecordsPage(vm: AtlasViewModel, favorite: Boolean, back: () -> Unit, open: (String) -> Unit) {
    val clipboard = LocalClipboardManager.current
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = back) { Icon(Icons.Outlined.ArrowBack, "返回") }; PageHeading("LIBRARY", if (favorite) "Wiki 收藏" else "浏览历史") }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.records.isEmpty()) item { EmptyState("还没有记录", if (favorite) "登录后，在 Wiki 页面点击收藏" else "浏览 Wiki 后会自动保留最后访问的页面") }
            items(vm.records, key = { it.url }) { record ->
                Card(Modifier.fillMaxWidth().combinedClickable(onClick = { open(record.url) }, onLongClick = { clipboard.setText(AnnotatedString(record.url)) })) {
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
        PageHeading("STAY CONNECTED", "服务器") { FilledTonalIconButton(onClick = { editing = null; address = ""; dialog = true }, enabled = vm.servers.size < 5) { Icon(Icons.Outlined.Add, "添加服务器") } }
        Text("前台每分钟更新 · ${vm.servers.size}/5 个服务器", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (vm.servers.isEmpty()) item { EmptyState("添加你的第一个世界", "点击右上角 +，输入 Java 版服务器域名。长按卡片可收藏、置顶和管理。") }
            items(vm.servers.sortedByDescending { it.pinned }, key = { it.id }) { server ->
                val frozen = server.failures >= 3
                val good = server.lastSuccess > 0 && server.failures == 0
                Card(Modifier.fillMaxWidth().combinedClickable(onClick = {}, onLongClick = { menu = server }), colors = CardDefaults.cardColors(containerColor = if (good) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (good) Icons.Outlined.CheckCircle else Icons.Outlined.CloudOff, null, tint = if (good) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(8.dp)); Text(server.address, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            if (server.pinned) Icon(Icons.Outlined.PushPin, "已置顶", Modifier.size(18.dp))
                            if (server.favorite) Icon(Icons.Outlined.StarBorder, "已收藏", Modifier.size(18.dp))
                        }
                        if (good) {
                            Text("${server.online} / ${server.max}", style = MaterialTheme.typography.headlineLarge)
                            Text("在线玩家  ·  ${server.latency} ms", style = MaterialTheme.typography.labelLarge)
                            if (server.players.isNotEmpty()) Text(server.players.joinToString(" · "), maxLines = 3, style = MaterialTheme.typography.bodySmall)
                        } else Text(when { frozen -> "暂时离线 · 已持续 ${((System.currentTimeMillis() - server.failedSince) / 60000).coerceAtLeast(0)} 分钟"; server.failures > 0 -> "连接失败 ${server.failures}/3 · 下一轮自动重试"; else -> "正在连接…" })
                        if (server.pinned) Row {
                            TextButton(onClick = { vm.moveServer(server.id, -1) }) { Text("上移") }
                            TextButton(onClick = { vm.moveServer(server.id, 1) }) { Text("下移") }
                        }
                    }
                }
            }
        }
    }
    if (dialog) AlertDialog(onDismissRequest = { dialog = false }, title = { Text(if (editing == null) "添加服务器" else "修改服务器") }, text = { OutlinedTextField(address, { address = it }, label = { Text("域名或域名:端口") }, singleLine = true) }, confirmButton = { TextButton(onClick = { vm.saveServer(address, editing?.id); dialog = false }, enabled = runCatching { Endpoint.parse(address) }.isSuccess) { Text("保存") } }, dismissButton = { TextButton(onClick = { dialog = false }) { Text("取消") } })
    menu?.let { server -> AlertDialog(onDismissRequest = { menu = null }, title = { Text(server.address) }, text = { Column {
        TextButton(onClick = { vm.changeServer(server.id, "pin"); menu = null }) { Text(if (server.pinned) "取消置顶" else "置顶") }
        TextButton(onClick = { vm.changeServer(server.id, "favorite"); menu = null }) { Text(if (server.favorite) "取消收藏" else "收藏") }
        TextButton(onClick = { editing = server; address = server.address; dialog = true; menu = null }) { Text("修改域名") }
        TextButton(onClick = { deletion = server; menu = null }) { Text("删除") }
    } }, confirmButton = { TextButton(onClick = { menu = null }) { Text("关闭") } }) }
    deletion?.let { server -> AlertDialog(onDismissRequest = { deletion = null }, title = { Text("删除服务器？") }, text = { Text(server.address) }, confirmButton = { TextButton(onClick = { vm.changeServer(server.id, "delete"); deletion = null }) { Text("删除") } }, dismissButton = { TextButton(onClick = { deletion = null }) { Text("取消") } }) }
}
