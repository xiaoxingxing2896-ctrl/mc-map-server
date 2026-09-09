package dev.mcmap.nativeapp

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlin.math.roundToInt
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@Composable fun WorldPicker(world: String, enabled: Boolean = true, select: (String) -> Unit) {
    val feedback = LocalAtlasHaptics.current
    var expanded by remember { mutableStateOf(false) }
    Box {
        AtlasFilledTonalButton(onClick = { expanded = true }, enabled = enabled) { Text(worlds[world] ?: world); AtlasIcon(Icons.Outlined.ExpandMore, "切换维度") }
        DropdownMenu(expanded, { expanded = false }) { worlds.forEach { (key, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { expanded = false; if (world != key) feedback?.emit(AtlasFeedback.Selection); select(key) }) } }
    }
}
@Composable fun MapPage(vm: AtlasViewModel, focusX: Float, focusZ: Float, focusSeq: Int, open: (Marker) -> Unit) {
    val feedback = LocalAtlasHaptics.current
    var cx by rememberSaveable { mutableFloatStateOf(0f) }; var cz by rememberSaveable { mutableFloatStateOf(0f) }
    var scale by rememberSaveable { mutableFloatStateOf(.5f) }
    var showMarkers by rememberSaveable { mutableStateOf(true) }
    var groupDialog by remember { mutableStateOf<List<Marker>?>(null) }
    val scope = rememberCoroutineScope()
    val motion by rememberUpdatedState(LocalAtlasMotion.current)
    var moveJob by remember { mutableStateOf<Job?>(null) }
    fun moveTo(x: Float, z: Float, zoom: Float = scale) {
        moveJob?.cancel()
        if (motion != "full") { cx = x; cz = z; scale = zoom; return }
        val fromX = cx; val fromZ = cz; val fromZoom = scale
        moveJob = scope.launch {
            Animatable(0f).animateTo(1f, tween(240)) {
                cx = fromX + (x - fromX) * value; cz = fromZ + (z - fromZ) * value
                scale = fromZoom + (zoom - fromZoom) * value
            }
        }
    }
    var appliedFocus by rememberSaveable { mutableIntStateOf(0) }
    var coordinate by rememberSaveable { mutableStateOf("X 0  ·  Z 0") }
    var jump by remember { mutableStateOf(false) }
    var jumpX by remember { mutableStateOf("") }; var jumpZ by remember { mutableStateOf("") }
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val permits = remember { Semaphore(3) }
    val loader = remember {
        ImageLoader.Builder(context).okHttpClient(vm.api.client).components { add(coil.intercept.Interceptor { chain -> permits.withPermit { chain.proceed(chain.request) } }) }
            .memoryCache { coil.memory.MemoryCache.Builder(context).maxSizePercent(.15).build() }.build()
    }
    DisposableEffect(loader) { onDispose { loader.shutdown() } }
    LaunchedEffect(motion, vm.world) { moveJob?.cancel() }
    LaunchedEffect(focusSeq) { if (focusSeq > appliedFocus) { moveTo(focusX, focusZ, 1f); appliedFocus = focusSeq } }
    val density = LocalDensity.current
    val groups = remember(vm.markers, scale, density.density) { groupMapMarkers(vm.markers, 32f * density.density / scale) }
    val latestGroups by rememberUpdatedState(if (showMarkers) groups else emptyList())
    LaunchedEffect(vm.world, vm.user?.token, vm.markers) { groupDialog = null }
    fun openGroup(group: MapMarkerGroup, list: Boolean = false) {
        feedback?.emit(if (list) AtlasFeedback.LongPress else AtlasFeedback.Selection)
        if (group.members.size == 1) open(group.members.first())
        else if (list || scale >= 8f || group.members.all { it.x == group.x && it.z == group.z }) groupDialog = group.members
        else moveTo(group.members.map { it.x.toDouble() }.average().toFloat(), group.members.map { it.z.toDouble() }.average().toFloat(), (scale * 2).coerceAtMost(8f))
    }
    val mapBackground = MaterialTheme.colorScheme.surfaceContainerHighest
    BoxWithConstraints(Modifier.fillMaxSize().clipToBounds().background(mapBackground)) {
        val width = constraints.maxWidth.toFloat(); val height = constraints.maxHeight.toFloat()
        val x0 = cx - width / (2 * scale); val z0 = cz - height / (2 * scale)
        val x1 = cx + width / (2 * scale); val z1 = cz + height / (2 * scale)
        Box(Modifier.fillMaxSize().pointerInput(width, height) {
            detectTransformGestures { centroid, pan, zoom, _ ->
                moveJob?.cancel()
                val next = (scale * zoom).coerceIn(.125f, 8f)
                cx += (centroid.x - width / 2) / scale - (centroid.x - width / 2 + pan.x) / next
                cz += (centroid.y - height / 2) / scale - (centroid.y - height / 2 + pan.y) / next
                scale = next
            }
        }.pointerInput(vm.world, width, height, density.density) {
            fun hit(p: Offset): MapMarkerGroup? = latestGroups.minByOrNull { group ->
                (Offset((group.x - cx) * scale + width / 2, (group.z - cz) * scale + height / 2 - 19 * density.density) - p).getDistance()
            }?.takeIf { group -> (Offset((group.x - cx) * scale + width / 2, (group.z - cz) * scale + height / 2 - 19 * density.density) - p).getDistance() <= 24 * density.density }
            detectTapGestures(onTap = { p ->
                coordinate = "X ${(cx + (p.x - width / 2) / scale).roundToInt()}  ·  Z ${(cz + (p.y - height / 2) / scale).roundToInt()}"
                hit(p)?.let { openGroup(it) }
            }, onLongPress = { p ->
                hit(p)?.let { openGroup(it, true) }
            })
        }) {
            Canvas(Modifier.fillMaxSize()) {
                val step = 128 * scale
                if (step >= 16) {
                    var x = ((-cx * scale + width / 2) % step + step) % step
                    while (x < width) { drawLine(Color.White.copy(alpha = .04f), Offset(x, 0f), Offset(x, height)); x += step }
                    var y = ((-cz * scale + height / 2) % step + step) % step
                    while (y < height) { drawLine(Color.White.copy(alpha = .04f), Offset(0f, y), Offset(width, y)); y += step }
                }
            }
            vm.tiles.filter { it.x + 1024 >= x0 && it.x <= x1 && it.z + 1024 >= z0 && it.z <= z1 }.forEach { tile ->
                key(tile.url) {
                    val px = (tile.x - cx) * scale + width / 2; val pz = (tile.z - cz) * scale + height / 2
                    val request = remember(context, tile.url) { ImageRequest.Builder(context).data(BuildConfig.API_BASE + tile.url).size(1024).build() }
                    AsyncImage(model = request, imageLoader = loader,
                        contentDescription = null, contentScale = ContentScale.FillBounds,
                        modifier = Modifier.offset { IntOffset(px.roundToInt(), pz.roundToInt()) }.wrapContentSize(Alignment.TopStart, unbounded = true).requiredSize(with(density) { (1024 * scale).toDp() }))
                }
            }
            if (showMarkers) groups.filter { it.x >= x0 - 32 * density.density / scale && it.x <= x1 + 32 * density.density / scale && it.z >= z0 && it.z <= z1 + 32 * density.density / scale }.forEach { group ->
                key(group.members.first().id) {
                    MapMarkerPin(group, Modifier.offset { IntOffset(((group.x - cx) * scale + width / 2 - 11 * density.density).roundToInt(), ((group.z - cz) * scale + height / 2 - 30 * density.density).roundToInt()) }) { openGroup(group) }
                }
            }
        }
        Row(Modifier.align(Alignment.TopStart).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WorldPicker(vm.world, select = vm::changeWorld)
            AtlasFilledIconButton(onClick = { moveTo(0f, 0f, .5f); vm.refresh() }) { AtlasIcon(Icons.Outlined.Refresh, "刷新并回到原点") }
            AtlasFilledTonalIconButton(onClick = { showMarkers = !showMarkers }) { AtlasIcon(if (showMarkers) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff, if (showMarkers) "隐藏地图标记" else "显示地图标记") }
        }
        Surface(Modifier.align(Alignment.TopEnd).padding(top = 76.dp, end = 16.dp), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface.copy(alpha = .95f)) {
            Text(if (showMarkers) "${vm.markers.size} 处 · ${groups.size} 组" else "标记已隐藏", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium)
        }
        Column(Modifier.align(Alignment.BottomEnd).padding(16.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            AtlasFilledTonalIconButton(onClick = { moveTo(cx, cz, (scale * 2).coerceAtMost(8f)) }) { AtlasIcon(Icons.Outlined.Add, "放大地图") }
            AtlasFilledTonalIconButton(onClick = { moveTo(cx, cz, (scale / 2).coerceAtLeast(.125f)) }) { AtlasIcon(Icons.Outlined.Remove, "缩小地图") }
            AtlasFilledTonalIconButton(onClick = { jump = true }) { AtlasIcon(Icons.Outlined.MyLocation, "跳转坐标") }
            Surface(shape = MaterialTheme.shapes.medium) {
                Text(coordinate, Modifier.pointerInput(coordinate) { detectTapGestures(onLongPress = { clipboard.setText(AnnotatedString(coordinate)) }) }.padding(12.dp), style = MaterialTheme.typography.labelLarge)
            }
        }
        if (vm.loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        if (!vm.loading && vm.tiles.isEmpty()) Surface(Modifier.align(Alignment.Center).padding(24.dp), shape = MaterialTheme.shapes.medium) { Text("暂无地图瓦片\n可切换维度或点击刷新", modifier = Modifier.padding(20.dp)) }
    }
    groupDialog?.let { members ->
        AtlasDialog(onDismissRequest = { groupDialog = null }, title = { Text("此处有 ${members.size} 个标记") }, text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                members.forEach { marker ->
                    AtlasOutlinedButton({ groupDialog = null; open(marker) }, Modifier.fillMaxWidth()) {
                        Column { Text(marker.title); Text("${categories[marker.category] ?: "其他"} · X ${marker.x} · Z ${marker.z}", style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
        }, confirmButton = { AtlasTextButton({ groupDialog = null }) { Text("关闭") } })
    }
    if (jump) AtlasDialog(onDismissRequest = { jump = false }, title = { Text("前往坐标") }, text = { Column {
        AtlasTextField(jumpX, { jumpX = it }, label = { Text("X") }, singleLine = true)
        AtlasTextField(jumpZ, { jumpZ = it }, label = { Text("Z") }, singleLine = true)
    } }, confirmButton = { AtlasTextButton(onClick = { moveTo(jumpX.toFloat(), jumpZ.toFloat()); coordinate = "X $jumpX  ·  Z $jumpZ"; jump = false }, enabled = jumpX.toIntOrNull() in -30000000..30000000 && jumpZ.toIntOrNull() in -30000000..30000000) { Text("前往") } }, dismissButton = { AtlasTextButton(onClick = { jump = false }) { Text("取消") } })
}
