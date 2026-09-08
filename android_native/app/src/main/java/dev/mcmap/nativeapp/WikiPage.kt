package dev.mcmap.nativeapp

import android.annotation.SuppressLint
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.net.URLEncoder

@SuppressLint("SetJavaScriptEnabled")
@Composable fun WikiPage(url: String, changeUrl: (String) -> Unit, vm: AtlasViewModel) {
    var query by rememberSaveable { mutableStateOf("") }; var web by remember { mutableStateOf<WebView?>(null) }
    var canBack by remember { mutableStateOf(false) }; var progress by remember { mutableIntStateOf(0) }
    var failure by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(url, web) { web?.let { if (it.url != url) it.loadUrl(url) } }
    BackHandler(canBack) { web?.goBack() }
    DisposableEffect(web, lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) web?.let { it.onPause(); vm.record(it.url.orEmpty(), it.title.orEmpty()) }
            if (event == Lifecycle.Event.ON_START) web?.onResume()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    Column {
        PageHeading("MCMOD.CN", "Wiki") { IconButton(onClick = { web?.let { vm.record(it.url.orEmpty(), it.title.orEmpty(), true) } }, enabled = vm.user != null) { Icon(Icons.Outlined.BookmarkAdd, "收藏当前网页") } }
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), singleLine = true, placeholder = { Text("搜索物品、模组或教程") })
            IconButton(onClick = { changeUrl("https://www.mcmod.cn/s?key=" + URLEncoder.encode(query, "UTF-8")) }) { Icon(Icons.Outlined.Search, "搜索 Wiki") }
            IconButton(onClick = { web?.reload() }) { Icon(Icons.Outlined.Refresh, "刷新网页") }
        }
        if (progress < 100) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
        if (failure) Text("网页加载失败，请检查网络后刷新", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error)
        AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true; settings.domStorageEnabled = true
                settings.allowFileAccess = false; settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webChromeClient = object: WebChromeClient() { override fun onProgressChanged(view: WebView?, value: Int) { progress = value } }
                webViewClient = object: WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = request?.url?.scheme != "https"
                    override fun onPageStarted(view: WebView?, target: String?, favicon: android.graphics.Bitmap?) { failure = false; if (target != null) changeUrl(target) }
                    override fun onPageFinished(view: WebView?, target: String?) { canBack = view?.canGoBack() == true }
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) { if (request?.isForMainFrame == true) failure = true }
                }
                loadUrl(url); web = this
            }
        }, onRelease = { view -> vm.record(view.url.orEmpty(), view.title.orEmpty()); view.stopLoading(); view.destroy(); web = null })
    }
}
