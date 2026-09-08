package dev.mcmap.nativeapp

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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

@Composable fun WorldPicker(world: String, enabled: Boolean = true, select: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        FilledTonalButton(onClick = { expanded = true }, enabled = enabled) { Text(worlds[world] ?: world); Icon(Icons.Outlined.ExpandMore, "切换维度") }
        DropdownMenu(expanded, { expanded = false }) { worlds.forEach { (key, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { expanded = false; select(key) }) } }
    }
}
@Composable fun MapPage(vm: AtlasViewModel, focusX: Float, focusZ: Float, focusSeq: Int, open: (Marker) -> Unit) {
    var cx by rememberSaveable { mutableFloatStateOf(0f) }; var cz by rememberSaveable { mutableFloatStateOf(0f) }
    var scale by rememberSaveable { mutableFloatStateOf(.5f) }
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
    LaunchedEffect(focusSeq) { if (focusSeq > appliedFocus) { cx = focusX; cz = focusZ; scale = 1f; appliedFocus = focusSeq } }
    val density = LocalDensity.current
    val mapBackground = MaterialTheme.colorScheme.surfaceContainerHighest
    BoxWithConstraints(Modifier.fillMaxSize().background(mapBackground)) {
        val width = constraints.maxWidth.toFloat(); val height = constraints.maxHeight.toFloat()
        val x0 = cx - width / (2 * scale); val z0 = cz - height / (2 * scale)
        val x1 = cx + width / (2 * scale); val z1 = cz + height / (2 * scale)
        Box(Modifier.fillMaxSize().pointerInput(width, height) {
            detectTransformGestures { centroid, pan, zoom, _ ->
                val next = (scale * zoom).coerceIn(.125f, 8f)
                cx += (centroid.x - width / 2) / scale - (centroid.x - width / 2 + pan.x) / next
                cz += (centroid.y - height / 2) / scale - (centroid.y - height / 2 + pan.y) / next
                scale = next
            }
        }.pointerInput(vm.markers, vm.user, width, height) {
            detectTapGestures(onTap = { p ->
                coordinate = "X ${(cx + (p.x - width / 2) / scale).roundToInt()}  ·  Z ${(cz + (p.y - height / 2) / scale).roundToInt()}"
                vm.markers.minByOrNull { m -> (Offset((m.x - cx) * scale + width / 2, (m.z - cz) * scale + height / 2) - p).getDistance() }?.let { m ->
                    if ((Offset((m.x - cx) * scale + width / 2, (m.z - cz) * scale + height / 2) - p).getDistance() < 28 * density.density) open(m)
                }
            }, onLongPress = { p ->
                vm.markers.minByOrNull { m -> (Offset((m.x - cx) * scale + width / 2, (m.z - cz) * scale + height / 2) - p).getDistance() }?.let { m ->
                    if ((Offset((m.x - cx) * scale + width / 2, (m.z - cz) * scale + height / 2) - p).getDistance() < 40 * density.density) open(m)
                }
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
                    AsyncImage(model = ImageRequest.Builder(context).data(BuildConfig.API_BASE + tile.url).size(1024).build(), imageLoader = loader,
                        contentDescription = null, contentScale = ContentScale.FillBounds,
                        modifier = Modifier.offset { IntOffset(px.roundToInt(), pz.roundToInt()) }.wrapContentSize(Alignment.TopStart, unbounded = true).requiredSize(with(density) { (1024 * scale).toDp() }))
                }
            }
            vm.markers.filter { it.x in x0.toInt()..x1.toInt() && it.z in z0.toInt()..z1.toInt() }.forEach { marker ->
                Text(marker.icon.ifBlank { "📍" }, color = Color.White, modifier = Modifier.offset { IntOffset(((marker.x - cx) * scale + width / 2 - 12 * density.density).roundToInt(), ((marker.z - cz) * scale + height / 2 - 12 * density.density).roundToInt()) }, style = MaterialTheme.typography.headlineSmall)
            }
        }
        Row(Modifier.align(Alignment.TopStart).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WorldPicker(vm.world, select = vm::changeWorld)
            FilledIconButton(onClick = { cx = 0f; cz = 0f; scale = .5f; vm.refresh() }) { Icon(Icons.Outlined.Refresh, "刷新并回到原点") }
        }
        Surface(Modifier.align(Alignment.TopEnd).padding(top = 76.dp, end = 16.dp), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface.copy(alpha = .95f)) {
            Text("${vm.tiles.size} 张瓦片 · ${vm.markers.size} 处标记", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium)
        }
        Column(Modifier.align(Alignment.BottomEnd).padding(16.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FilledTonalIconButton(onClick = { scale = (scale * 2).coerceAtMost(8f) }) { Icon(Icons.Outlined.Add, "放大地图") }
            FilledTonalIconButton(onClick = { scale = (scale / 2).coerceAtLeast(.125f) }) { Icon(Icons.Outlined.Remove, "缩小地图") }
            FilledTonalIconButton(onClick = { jump = true }) { Icon(Icons.Outlined.MyLocation, "跳转坐标") }
            Surface(shape = MaterialTheme.shapes.medium) {
                Text(coordinate, Modifier.pointerInput(coordinate) { detectTapGestures(onLongPress = { clipboard.setText(AnnotatedString(coordinate)) }) }.padding(12.dp), style = MaterialTheme.typography.labelLarge)
            }
        }
        if (vm.loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        if (!vm.loading && vm.tiles.isEmpty()) Surface(Modifier.align(Alignment.Center).padding(24.dp), shape = MaterialTheme.shapes.medium) { Text("暂无地图瓦片\n可切换维度或点击刷新", modifier = Modifier.padding(20.dp)) }
    }
    if (jump) AlertDialog(onDismissRequest = { jump = false }, title = { Text("前往坐标") }, text = { Column {
        OutlinedTextField(jumpX, { jumpX = it }, label = { Text("X") }, singleLine = true)
        OutlinedTextField(jumpZ, { jumpZ = it }, label = { Text("Z") }, singleLine = true)
    } }, confirmButton = { TextButton(onClick = { cx = jumpX.toFloat(); cz = jumpZ.toFloat(); coordinate = "X $jumpX  ·  Z $jumpZ"; jump = false }, enabled = jumpX.toIntOrNull() in -30000000..30000000 && jumpZ.toIntOrNull() in -30000000..30000000) { Text("前往") } }, dismissButton = { TextButton(onClick = { jump = false }) { Text("取消") } })
}
