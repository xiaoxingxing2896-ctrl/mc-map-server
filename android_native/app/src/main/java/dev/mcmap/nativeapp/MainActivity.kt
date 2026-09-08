package dev.mcmap.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity: ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); enableEdgeToEdge()
        setContent { AtlasTheme { AtlasApp() } }
    }
}
@Composable fun AtlasTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(primary = Color(0xFFA8D6A5), background = Color(0xFF111812), surface = Color(0xFF19221B), secondaryContainer = Color(0xFF2B3E2E))
    else lightColorScheme(primary = Color(0xFF376B44), background = Color(0xFFF6F8F2), surface = Color(0xFFF6F8F2), secondaryContainer = Color(0xFFDCEBD6), onSecondaryContainer = Color(0xFF193820))
    MaterialTheme(colorScheme = colors, content = content)
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun AtlasApp(vm: AtlasViewModel = viewModel()) {
    var tab by rememberSaveable { mutableIntStateOf(2) }
    var subpage by rememberSaveable { mutableStateOf("") }
    var selected by remember { mutableStateOf<Marker?>(null) }
    var wikiUrl by rememberSaveable { mutableStateOf("https://www.mcmod.cn/") }
    var focusX by rememberSaveable { mutableFloatStateOf(0f) }
    var focusZ by rememberSaveable { mutableFloatStateOf(0f) }
    var focusSeq by rememberSaveable { mutableIntStateOf(0) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val pageState = rememberSaveableStateHolder()
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) vm.foreground(true)
            if (event == Lifecycle.Event.ON_STOP) vm.foreground(false)
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) vm.foreground(true)
        onDispose { lifecycle.removeObserver(observer); vm.foreground(false) }
    }
    LaunchedEffect(vm.user?.token) { selected = null; subpage = "" }
    BackHandler(subpage.isNotEmpty() || selected != null || tab != 2) {
        when { selected != null -> selected = null; subpage.isNotEmpty() -> subpage = ""; else -> tab = 2 }
    }
    val names = listOf("服务器", "Wiki", "地图", "标记", "我的")
    val icons = listOf(Icons.Outlined.Dns, Icons.Outlined.MenuBook, Icons.Outlined.Map, Icons.Outlined.Bookmarks, Icons.Outlined.Person)
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.error) { vm.error?.let { snack.showSnackbar(it); vm.error = null } }
    Scaffold(snackbarHost = { SnackbarHost(snack) }, bottomBar = {
        NavigationBar(tonalElevation = 0.dp) {
            names.forEachIndexed { index, name ->
                NavigationBarItem(selected = tab == index, onClick = { tab = index; subpage = ""; if (index == 2) vm.refresh() }, icon = { Icon(icons[index], name, Modifier.size(if (index == 2) 29.dp else 24.dp)) }, label = { Text(name) })
            }
        }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
          pageState.SaveableStateProvider("$tab/$subpage") {
            when {
                subpage == "upload" -> UploadPage(vm) { subpage = "" }
                subpage == "history" || subpage == "favorites" -> RecordsPage(vm, subpage == "favorites", { subpage = "" }) { wikiUrl = it; tab = 1; subpage = "" }
                tab == 0 -> ServersPage(vm)
                tab == 1 -> WikiPage(wikiUrl, { wikiUrl = it }, vm)
                tab == 2 -> MapPage(vm, focusX, focusZ, focusSeq) { selected = it }
                tab == 3 -> MarkersPage(vm) { selected = it }
                else -> ProfilePage(vm) { page -> subpage = page; if (page == "upload") vm.prepareUpload() else vm.loadRecords(page == "favorites") }
            }
          }
        }
    }
    selected?.let { marker ->
        AlertDialog(onDismissRequest = { selected = null }, title = { Text("${marker.icon.ifBlank { "📍" }} ${marker.title}") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${worlds[marker.world] ?: marker.world}  ·  ${categories[marker.category] ?: marker.category}", color = MaterialTheme.colorScheme.primary)
                Text("X ${marker.x}    Z ${marker.z}")
                Text(marker.description.ifBlank { "暂无描述" }, modifier = Modifier.heightIn(max = 260.dp).verticalScrollCompat())
                Text("标记者：${marker.creator}", style = MaterialTheme.typography.labelMedium)
            }
        }, confirmButton = {
            TextButton(onClick = { vm.changeWorld(marker.world); focusX = marker.x.toFloat(); focusZ = marker.z.toFloat(); focusSeq++; tab = 2; selected = null }) { Text("在地图中查看") }
        }, dismissButton = { Row {
            TextButton(onClick = { vm.favorite(marker) }) { Text(if (marker.id in vm.favorites) "取消收藏" else "收藏") }
            TextButton(onClick = { selected = null }) { Text("关闭") }
        } })
    }
}
@Composable fun Modifier.verticalScrollCompat(): Modifier = this.verticalScroll(rememberScrollState())
