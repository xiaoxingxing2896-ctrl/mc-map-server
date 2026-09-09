package dev.mcmap.nativeapp

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch

private const val WIKI_HOME = "https://zh.minecraft.wiki/"

private fun isMinecraftWiki(target: String): Boolean {
    val uri = Uri.parse(target)
    val host = uri.host.orEmpty().lowercase()
    return uri.scheme == "https" && (host == "minecraft.wiki" || host.endsWith(".minecraft.wiki"))
}

private fun wikiSearch(query: String): String = Uri.parse(WIKI_HOME).buildUpon()
    .appendQueryParameter("search", query.trim()).build().toString()

private class WikiBrowserState(var saved: Bundle = Bundle()) {
    var view: WebView? = null
    fun snapshot(): Bundle = view?.let { current -> Bundle().also { current.saveState(it); it.putString("atlasCurrentUrl", current.url) } } ?: saved
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WikiPage(url: String, changeUrl: (String) -> Unit, vm: AtlasViewModel, reading: Boolean = false, changeReading: (Boolean) -> Unit = {}) {
    val initialUrl = url.takeIf(::isMinecraftWiki) ?: WIKI_HOME
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    val searchFocus = remember { FocusRequester() }
    LaunchedEffect(searching) { if (searching) searchFocus.requestFocus() }
    var menu by remember { mutableStateOf(false) }
    var topics by remember { mutableStateOf(false) }
    var web by remember { mutableStateOf<WebView?>(null) }
    var currentUrl by rememberSaveable { mutableStateOf(initialUrl) }
    var pageTitle by rememberSaveable { mutableStateOf("中文 Minecraft Wiki") }
    val browserState = rememberSaveable(saver = Saver<WikiBrowserState, Bundle>(
        save = { it.snapshot() }, restore = { WikiBrowserState(it) }
    )) { WikiBrowserState() }
    var canBack by remember { mutableStateOf(false) }
    var canForward by remember { mutableStateOf(false) }
    var progress by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var pageReady by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val latestChangeUrl by rememberUpdatedState(changeUrl)
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    fun notify(message: String) { scope.launch { snack.showSnackbar(message) } }
    fun openBrowser(target: String) {
        if (Uri.parse(target).scheme != "https") return
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
        } catch (_: ActivityNotFoundException) {
            notify("未找到可打开网页的浏览器")
        }
    }
    fun navigate(target: String) {
        focus.clearFocus()
        web?.let {
            failure = null
            currentUrl = target
            latestChangeUrl(target)
            if (it.url == target) it.reload() else { it.stopLoading(); it.loadUrl(target) }
        }
    }
    fun search() { if (query.isNotBlank()) { searching = false; navigate(wikiSearch(query)) } }
    fun updateNavigation(view: WebView?) {
        canBack = view?.canGoBack() == true
        canForward = view?.canGoForward() == true
    }
    fun fail(message: String) {
        failure = message
        loading = false
        pageReady = false
    }

    // A callback URL is an echo, not another navigation request.
    LaunchedEffect(url, web) {
        val target = url.takeIf(::isMinecraftWiki) ?: WIKI_HOME
        web?.let { if (target != currentUrl) navigate(target) }
        if (url != target) latestChangeUrl(target)
    }
    BackHandler(canBack) { focus.clearFocus(); web?.goBack() }
    BackHandler(reading) { changeReading(false) }
    BackHandler(searching) { searching = false; focus.clearFocus() }
    DisposableEffect(web, lifecycle) {
        val view = web
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> view?.onPause()
                Lifecycle.Event.ON_START -> view?.onResume()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) view?.onPause()
        onDispose { lifecycle.removeObserver(observer) }
    }

    Column(Modifier.fillMaxSize()) {
        if (!reading) Surface(color = MaterialTheme.colorScheme.surface) {
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                AtlasIconButton({ if (searching) { searching = false; focus.clearFocus() } else web?.goBack() }, enabled = searching || canBack) {
                    AtlasIcon(if (searching) Icons.Outlined.Close else Icons.AutoMirrored.Outlined.ArrowBack, if (searching) "关闭搜索" else "Wiki 后退")
                }
                if (searching) {
                    AtlasTextField(query, { query = it }, Modifier.weight(1f).focusRequester(searchFocus), singleLine = true,
                        placeholder = { Text("搜索中文 Wiki") }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { search() }))
                } else {
                    Column(Modifier.weight(1f).padding(horizontal = 4.dp)) {
                        Text(pageTitle.removeSuffix(" - 中文 Minecraft Wiki"), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                        Text("zh.minecraft.wiki", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                AtlasIconButton({ if (searching) search() else searching = true }, enabled = !searching || query.isNotBlank()) { AtlasIcon(Icons.Outlined.Search, if (searching) "搜索中文 Minecraft Wiki" else "打开 Wiki 搜索") }
                Box {
                    AtlasIconButton({ menu = true }) { AtlasIcon(Icons.Outlined.MoreVert, "Wiki 工具与阅读模式") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text("阅读模式 · 扩大正文") }, leadingIcon = { AtlasIcon(Icons.Outlined.Fullscreen, null) }, onClick = { menu = false; searching = false; focus.clearFocus(); changeReading(true) })
                        DropdownMenuItem(text = { Text("前进") }, enabled = canForward, onClick = { menu = false; web?.goForward() })
                        DropdownMenuItem(text = { Text("Wiki 首页") }, onClick = { menu = false; navigate(WIKI_HOME) })
                        DropdownMenuItem(text = { Text("分类导航") }, onClick = { menu = false; topics = true })
                        DropdownMenuItem(text = { Text("收藏当前页面") }, enabled = pageReady, onClick = {
                            menu = false
                            if (vm.user == null) notify("请先在「我的」中登录，再收藏 Wiki 页面")
                            else { vm.record(currentUrl, pageTitle, true); notify("已加入 Wiki 收藏，可在「我的」中查看") }
                        })
                        DropdownMenuItem(text = { Text("刷新") }, onClick = { menu = false; navigate(currentUrl) })
                        DropdownMenuItem(text = { Text("在浏览器中打开") }, onClick = { menu = false; openBrowser(currentUrl) })
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(if (loading) 2.dp else 0.dp)) {
            if (loading) LinearProgressIndicator(progress = { progress.coerceIn(0, 100) / 100f }, modifier = Modifier.fillMaxSize())
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        settings.setSupportZoom(true)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, value: Int) { progress = value }
                            override fun onReceivedTitle(view: WebView?, title: String?) {
                                title?.takeIf { it.isNotBlank() }?.let { pageTitle = it }
                            }
                        }
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                request ?: return false
                                if (!request.isForMainFrame) return request.url.scheme != "https"
                                val target = request.url.toString()
                                if (isMinecraftWiki(target)) return false
                                if (request.url.scheme == "https" && request.hasGesture()) openBrowser(target)
                                else notify("请使用右上角的浏览器入口打开此链接")
                                return true
                            }
                            override fun onPageStarted(view: WebView?, target: String?, favicon: Bitmap?) {
                                failure = null
                                pageReady = false
                                loading = true
                                progress = 0
                                target?.let { currentUrl = it; latestChangeUrl(it) }
                                updateNavigation(view)
                            }
                            override fun onPageFinished(view: WebView?, target: String?) {
                                if (target == null || view?.url != target) return
                                updateNavigation(view)
                                loading = false
                                if (failure == null && isMinecraftWiki(target)) {
                                    currentUrl = target
                                    pageTitle = view.title.orEmpty().ifBlank { "中文 Minecraft Wiki" }
                                    latestChangeUrl(target)
                                    pageReady = true
                                    vm.record(target, pageTitle)
                                }
                            }
                            override fun doUpdateVisitedHistory(view: WebView?, target: String?, isReload: Boolean) {
                                updateNavigation(view)
                                target?.takeIf(::isMinecraftWiki)?.let { currentUrl = it; latestChangeUrl(it) }
                            }
                            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                                if (request?.isForMainFrame == true) fail("无法连接中文 Minecraft Wiki，请检查网络后重试。")
                            }
                            override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, response: WebResourceResponse?) {
                                if (request?.isForMainFrame == true && response != null && response.statusCode != 404) {
                                    fail("Wiki 暂时无法打开此页面（${response.statusCode}）。可重试或使用浏览器访问。")
                                }
                            }
                            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                                handler?.cancel()
                                fail("无法验证 Wiki 的安全连接，请检查设备时间和网络后重试。")
                            }
                        }
                        val restored = if (browserState.saved.getString("atlasCurrentUrl") == initialUrl) restoreState(browserState.saved) else null
                        if (restored == null || this.url != initialUrl) {
                            currentUrl = initialUrl
                            loadUrl(initialUrl)
                        } else {
                            currentUrl = this.url ?: initialUrl
                            pageTitle = title.orEmpty().ifBlank { "中文 Minecraft Wiki" }
                            updateNavigation(this)
                            reload()
                        }
                        browserState.view = this
                        web = this
                    }
                },
                onRelease = { view ->
                    browserState.saved = browserState.snapshot()
                    browserState.view = null
                    view.stopLoading()
                    view.webChromeClient = null
                    view.webViewClient = WebViewClient()
                    view.destroy()
                    web = null
                }
            )
            failure?.let { message ->
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
                    Column(
                        Modifier.fillMaxSize().padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        AtlasIcon(Icons.Outlined.CloudOff, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(16.dp))
                        Text("图鉴暂时未能加载", style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.height(10.dp))
                        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(20.dp))
                        AtlasButton(onClick = { navigate(currentUrl) }, modifier = Modifier.heightIn(min = 48.dp)) {
                            AtlasIcon(Icons.Outlined.Refresh, null)
                            Spacer(Modifier.width(8.dp))
                            Text("重新加载")
                        }
                        AtlasTextButton(onClick = { openBrowser(currentUrl) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("在浏览器中打开") }
                    }
                }
            }
            if (reading) Surface(Modifier.align(Alignment.BottomEnd).padding(8.dp), shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.surface.copy(alpha = .92f)) {
                AtlasIconButton({ changeReading(false) }) { AtlasIcon(Icons.Outlined.FullscreenExit, "退出 Wiki 阅读模式") }
            }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
    }
    if (topics) AtlasDialog(onDismissRequest = { topics = false }, title = { Text("Wiki 分类") }, text = {
        Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("方块", "物品", "生物", "合成", "红石电路", "教程").forEach { title ->
                AtlasOutlinedButton({ topics = false; navigate(Uri.parse(WIKI_HOME).buildUpon().appendPath("w").appendPath(title).build().toString()) }, Modifier.fillMaxWidth()) { Text(title) }
            }
        }
    }, confirmButton = { AtlasTextButton({ topics = false }) { Text("关闭") } })
}
