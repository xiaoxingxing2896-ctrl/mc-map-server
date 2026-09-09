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

import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.Stroke
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest


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
@Composable fun MapPage(vm: AtlasViewModel, focusX: Double, focusZ: Double, focusSeq: Int, open: (Marker) -> Unit) {
    val feedback = LocalAtlasHaptics.current
    var cx by rememberSaveable { mutableStateOf(0.0) }; var cz by rememberSaveable { mutableStateOf(0.0) }
    var scale by rememberSaveable { mutableFloatStateOf(.5f) }
    var showMarkers by rememberSaveable { mutableStateOf(true) }
    var groupDialog by remember { mutableStateOf<List<Marker>?>(null) }
    val scope = rememberCoroutineScope()
    val motion by rememberUpdatedState(LocalAtlasMotion.current)
    var moveJob by remember { mutableStateOf<Job?>(null) }
    fun moveTo(x: Double, z: Double, zoom: Float = scale) {
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
    var targetX by rememberSaveable { mutableStateOf<Double?>(null) }
    var targetZ by rememberSaveable { mutableStateOf<Double?>(null) }
    var targetWorld by rememberSaveable { mutableStateOf("") }
    var coordinate by rememberSaveable { mutableStateOf("X 0  ·  Z 0") }
    var jump by remember { mutableStateOf(false) }
    var jumpX by remember { mutableStateOf("") }; var jumpZ by remember { mutableStateOf("") }
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val loader = vm.mapImageLoader
    LaunchedEffect(motion, vm.world) { moveJob?.cancel() }
    fun locate(x: Double, z: Double) {
        // A jump is exact and immediate: no intermediate tiles or interrupted animation.
        moveJob?.cancel()
        cx = x; cz = z
        targetX = x; targetZ = z; targetWorld = vm.world
        coordinate = "X ${x.roundToInt()}  ·  Z ${z.roundToInt()}"
    }
    LaunchedEffect(focusSeq) { if (focusSeq > appliedFocus) { locate(focusX, focusZ); appliedFocus = focusSeq } }
    val density = LocalDensity.current
    val groups = remember(vm.markers, scale, density.density) { groupMapMarkers(vm.markers, 32f * density.density / scale) }
    val latestGroups by rememberUpdatedState(if (showMarkers) groups else emptyList())
    LaunchedEffect(vm.world, vm.user?.token, vm.markers) { groupDialog = null }
    fun openGroup(group: MapMarkerGroup, list: Boolean = false) {
        feedback?.emit(if (list) AtlasFeedback.LongPress else AtlasFeedback.Selection)
        if (group.members.size == 1) open(group.members.first())
        else if (list || scale >= 8f || group.members.all { it.x == group.x && it.z == group.z }) groupDialog = group.members
        else moveTo(group.members.map { it.x.toDouble() }.average(), group.members.map { it.z.toDouble() }.average(), (scale * 2).coerceAtMost(8f))
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
                cx = mapGestureCenter(cx, centroid.x, pan.x, width, scale, next)
                cz = mapGestureCenter(cz, centroid.y, pan.y, height, scale, next)
                scale = next
            }
        }.pointerInput(vm.world, width, height, density.density) {
            fun hit(p: Offset): MapMarkerGroup? = latestGroups.minByOrNull { group ->
                (Offset(mapScreenPosition(group.x.toDouble(), cx, scale, width), mapScreenPosition(group.z.toDouble(), cz, scale, height) - 18 * density.density) - p).getDistance()
            }?.takeIf { group -> (Offset(mapScreenPosition(group.x.toDouble(), cx, scale, width), mapScreenPosition(group.z.toDouble(), cz, scale, height) - 18 * density.density) - p).getDistance() <= 24 * density.density }
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
                    var x = (((-cx * scale + width / 2) % step + step) % step).toFloat()
                    while (x < width) { drawLine(Color.White.copy(alpha = .04f), Offset(x, 0f), Offset(x, height)); x += step }
                    var y = (((-cz * scale + height / 2) % step + step) % step).toFloat()
                    while (y < height) { drawLine(Color.White.copy(alpha = .04f), Offset(0f, y), Offset(width, y)); y += step }
                }
            }
            // A small world-space buffer prevents cancellation at viewport edges.
            vm.tiles.filter { it.x + 1024 >= x0 - 256 && it.x <= x1 + 256 && it.z + 1024 >= z0 - 256 && it.z <= z1 + 256 }
                .sortedBy { (it.x + 512 - cx) * (it.x + 512 - cx) + (it.z + 512 - cz) * (it.z + 512 - cz) }.forEach { tile ->
                key(tile.url) {
                    val px = mapScreenPosition(tile.x.toDouble(), cx, scale, width); val pz = mapScreenPosition(tile.z.toDouble(), cz, scale, height)
                    val decodeSize = mapTileDecodeSize(scale)
                    val request = remember(context, tile.url, decodeSize) {
                        val cacheKey = BuildConfig.API_BASE + tile.url
                        ImageRequest.Builder(context).data(cacheKey).size(decodeSize)
                            .memoryCacheKey(cacheKey).placeholderMemoryCacheKey(cacheKey)
                            .precision(coil.size.Precision.INEXACT).build()
                    }
                    val painter = rememberAsyncImagePainter(model = request, imageLoader = loader)
                    // Draw in viewport coordinates, independent of layout constraints and zoom.
                    Canvas(Modifier.fillMaxSize()) {
                        translate(px, pz) {
                            with(painter) { draw(androidx.compose.ui.geometry.Size(1024 * scale, 1024 * scale)) }
                        }
                    }
                }
            }
            if (targetWorld == vm.world && targetX != null && targetZ != null) {
                Canvas(Modifier.fillMaxSize()) {
                    val point = Offset(mapScreenPosition(targetX!!, cx, scale, width), mapScreenPosition(targetZ!!, cz, scale, height))
                    val radius = 12.dp.toPx()
                    drawCircle(Color.Black, radius, point, style = Stroke(5.dp.toPx()))
                    drawCircle(Color.Yellow, radius, point, style = Stroke(2.dp.toPx()))
                    drawLine(Color.Yellow, point - Offset(radius + 5.dp.toPx(), 0f), point + Offset(radius + 5.dp.toPx(), 0f), 2.dp.toPx())
                    drawLine(Color.Yellow, point - Offset(0f, radius + 5.dp.toPx()), point + Offset(0f, radius + 5.dp.toPx()), 2.dp.toPx())
                }
            }
            if (showMarkers) groups.filter { it.x >= x0 - 32 * density.density / scale && it.x <= x1 + 32 * density.density / scale && it.z >= z0 && it.z <= z1 + 32 * density.density / scale }.forEach { group ->
                key(group.members.first().id) {
                    MapMarkerPin(group, Modifier.offset { IntOffset((mapScreenPosition(group.x.toDouble(), cx, scale, width) - 11 * density.density).roundToInt(), (mapScreenPosition(group.z.toDouble(), cz, scale, height) - 29 * density.density).roundToInt()) }) { openGroup(group) }
                }
            }
        }
        Row(Modifier.align(Alignment.TopStart).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WorldPicker(vm.world, select = vm::changeWorld)
            AtlasFilledIconButton(onClick = { moveTo(0.0, 0.0, .5f); vm.refresh() }) { AtlasIcon(Icons.Outlined.Refresh, "刷新并回到原点") }
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
    } }, confirmButton = { AtlasTextButton(onClick = { locate(jumpX.toDouble(), jumpZ.toDouble()); jump = false }, enabled = jumpX.toIntOrNull() in -30000000..30000000 && jumpZ.toIntOrNull() in -30000000..30000000) { Text("前往") } }, dismissButton = { AtlasTextButton(onClick = { jump = false }) { Text("取消") } })
}
