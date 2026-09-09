package dev.mcmap.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity: ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); enableEdgeToEdge()
        setContent {
            val appearance: AppearanceViewModel = viewModel()
            val dark = appearance.settings.mode == "dark" || (appearance.settings.mode == "system" && isSystemInDarkTheme())
            val view = LocalView.current
            SideEffect {
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
            AtlasTheme(appearance.settings) { AtlasApp(appearance = appearance) }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable fun AtlasApp(vm: AtlasViewModel = viewModel(), appearance: AppearanceViewModel = viewModel()) {
    var tab by rememberSaveable { mutableIntStateOf(2) }
    var subpage by rememberSaveable { mutableStateOf("") }
    var selected by remember { mutableStateOf<Marker?>(null) }
    var wikiUrl by rememberSaveable { mutableStateOf("https://zh.minecraft.wiki/") }
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
    var observedToken by remember { mutableStateOf(vm.user?.token) }
    LaunchedEffect(vm.user?.token) {
        if (observedToken != vm.user?.token) {
            observedToken = vm.user?.token
            selected = null
            if (subpage != "appearance") subpage = ""
        }
    }
    BackHandler(subpage.isNotEmpty() || selected != null || tab != 2) {
        when { selected != null -> selected = null; subpage.isNotEmpty() -> subpage = ""; else -> tab = 2 }
    }
    val motion = LocalAtlasMotion.current
    val feedback = LocalAtlasHaptics.current
    var entered by remember(tab, subpage) { mutableStateOf(false) }
    LaunchedEffect(tab, subpage) { entered = true }
    val pageOpacity by animateFloatAsState(if (entered || motion == "off") 1f else 0f, tween(motionDuration(motion, true, 160)), label = "page enter")
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.error) { vm.error?.let { snack.showSnackbar(it); vm.error = null } }
    Scaffold(modifier = Modifier.imePadding(), snackbarHost = { SnackbarHost(snack) }, bottomBar = {
      if (!WindowInsets.isImeVisible) Column {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        AtlasNavigationBar(tab) { index -> tab = index; subpage = ""; if (index == 2) vm.refresh() }
      }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).graphicsLayer { alpha = pageOpacity }) {
          pageState.SaveableStateProvider("$tab/$subpage") {
            when {
                subpage == "upload" -> UploadPage(vm) { subpage = "" }
                subpage == "appearance" -> AppearancePage(appearance) { subpage = "" }
                subpage == "history" || subpage == "favorites" -> RecordsPage(vm, subpage == "favorites", { subpage = "" }) { wikiUrl = it; tab = 1; subpage = "" }
                tab == 0 -> ServersPage(vm)
                tab == 1 -> WikiPage(wikiUrl, { wikiUrl = it }, vm)
                tab == 2 -> MapPage(vm, focusX, focusZ, focusSeq) { selected = it }
                tab == 3 -> MarkersPage(vm) { selected = it }
                else -> ProfilePage(vm) { page -> subpage = page; if (page == "upload") vm.prepareUpload() else if (page == "history" || page == "favorites") vm.loadRecords(page == "favorites") }
            }
          }
        }
    }
    selected?.let { marker ->
        AtlasDialog(onDismissRequest = { selected = null }, title = { Text("${marker.icon.ifBlank { "📍" }} ${marker.title}") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${worlds[marker.world] ?: marker.world}  ·  ${categories[marker.category] ?: marker.category}", color = MaterialTheme.colorScheme.primary)
                Text("X ${marker.x}    Z ${marker.z}")
                Text(marker.description.ifBlank { "暂无描述" }, modifier = Modifier.heightIn(max = 260.dp).verticalScrollCompat())
                Text("标记者：${marker.creator}", style = MaterialTheme.typography.labelMedium)
            }
        }, confirmButton = {
            AtlasTextButton(onClick = { vm.changeWorld(marker.world); focusX = marker.x.toFloat(); focusZ = marker.z.toFloat(); focusSeq++; tab = 2; selected = null }) { Text("在地图中查看") }
        }, dismissButton = { Row {
            AtlasTextButton(onClick = { if (vm.user != null) feedback?.emit(AtlasFeedback.Selection); vm.favorite(marker) }) { Text(if (marker.id in vm.favorites) "取消收藏" else "收藏") }
            AtlasTextButton(onClick = { selected = null }) { Text("关闭") }
        } })
    }
}
@Composable fun Modifier.verticalScrollCompat(): Modifier = this.verticalScroll(rememberScrollState())
