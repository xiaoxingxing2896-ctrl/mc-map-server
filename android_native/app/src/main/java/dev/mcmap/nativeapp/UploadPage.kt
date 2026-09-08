package dev.mcmap.nativeapp

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import android.graphics.BitmapFactory

@Composable fun UploadPage(vm: AtlasViewModel, back: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::selectUpload) }
    val draft = vm.draft
    val existing = draft?.let { d -> vm.uploadTiles.find { it.x == d.x && it.z == d.z } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row { IconButton(onClick = back, enabled = !vm.uploadBusy) { Icon(Icons.Outlined.ArrowBack, "返回") }; Text("瓦片管理", style = MaterialTheme.typography.headlineMedium) }
        Text("为你的世界补上新区域", style = MaterialTheme.typography.titleMedium)
        Text("选择维度与 PNG 瓦片。系统根据文件名中的 X、Z 坐标判断新增或替换。", style = MaterialTheme.typography.bodyMedium)
        WorldPicker(vm.uploadWorld, enabled = !vm.uploadBusy, select = vm::prepareUpload)
        OutlinedButton(onClick = { picker.launch(arrayOf("image/png")) }, enabled = !vm.uploadBusy && vm.user?.admin == true, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.AddPhotoAlternate, null); Spacer(Modifier.width(8.dp)); Text("选择 PNG 瓦片")
        }
        Text("1024 × 1024 像素 · 单张最多 8 MB\n文件名示例：x0_z0.png、3_16_x-1024_z0.png", style = MaterialTheme.typography.bodySmall)
        if (draft != null) {
            val bitmap = remember(draft) { BitmapFactory.decodeByteArray(draft.bytes, 0, draft.bytes.size)?.asImageBitmap() }
            ElevatedCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    bitmap?.let { Image(it, "待上传瓦片预览", Modifier.fillMaxWidth().aspectRatio(1f)) }
                    Text(draft.name, style = MaterialTheme.typography.titleMedium)
                    Text("${worlds[vm.uploadWorld]} · X ${draft.x} · Z ${draft.z}")
                    Text(if (!vm.uploadIndexReady) "请先刷新目标检查" else if (existing == null) "新增：此坐标还没有瓦片" else "替换：此坐标已有瓦片", color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        if (vm.uploadBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
        vm.uploadMessage?.let { Text(it, color = if (it.startsWith("上传成功")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) }
        if (!vm.uploadIndexReady) TextButton(onClick = { vm.prepareUpload() }, enabled = !vm.uploadBusy) { Text("刷新权限与目标检查") }
        Button(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(), enabled = draft != null && vm.uploadIndexReady && !vm.uploadBusy && vm.user?.admin == true) { Text(if (vm.uploadBusy) "上传中…" else if (existing == null) "预览并新增" else "预览并替换") }
    }
    if (confirm && draft != null) AlertDialog(onDismissRequest = { confirm = false }, title = { Text(if (existing == null) "确认新增瓦片" else "确认替换瓦片") }, text = {
        Text("${worlds[vm.uploadWorld]}\nX ${draft.x} · Z ${draft.z}\n${draft.name}\n\n${if (existing == null) "新增区域将在地图上显示。" else "地图将显示这张新图片。其他管理员若已更新此瓦片，系统会阻止本次替换。"}")
    }, confirmButton = { TextButton(onClick = { confirm = false; vm.upload(existing != null) }) { Text("确认上传") } }, dismissButton = { TextButton(onClick = { confirm = false }) { Text("取消") } })
}
