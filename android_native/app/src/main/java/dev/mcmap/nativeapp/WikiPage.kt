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
fun WikiPage(url: String, changeUrl: (String) -> Unit, vm: AtlasViewModel) {
    val initialUrl = url.takeIf(::isMinecraftWiki) ?: WIKI_HOME
    var query by rememberSaveable { mutableStateOf("") }
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
    fun search() { if (query.isNotBlank()) navigate(wikiSearch(query)) }
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
        AtlasTopBar("中文 MINECRAFT WIKI", "知识图鉴") {
            AtlasIconButton(onClick = { openBrowser(currentUrl) }, modifier = Modifier.size(48.dp)) {
                AtlasIcon(Icons.Outlined.OpenInBrowser, "在浏览器中打开当前 Wiki 页面")
            }
        }
        Spacer(Modifier.height(12.dp))
        AtlasTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            singleLine = true,
            placeholder = { Text("搜索方块、物品、生物与教程") },
            leadingIcon = { AtlasIcon(Icons.Outlined.MenuBook, null) },
            trailingIcon = {
                AtlasIconButton(onClick = ::search, enabled = query.isNotBlank(), modifier = Modifier.size(48.dp)) {
                    AtlasIcon(Icons.Outlined.Search, "搜索中文 Minecraft Wiki")
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { search() })
        )
        if (Uri.parse(currentUrl).path.orEmpty() in listOf("", "/")) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("方块", "物品", "生物", "合成", "红石电路", "教程").forEach { title ->
                    AtlasOutlinedButton(
                        onClick = { navigate(Uri.parse(WIKI_HOME).buildUpon().appendPath("w").appendPath(title).build().toString()) },
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        contentPadding = PaddingValues(horizontal = 16.dp)
                    ) { Text(title) }
                }
            }
        } else {
            Text(
                pageTitle.removeSuffix(" - 中文 Minecraft Wiki"),
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Box(Modifier.fillMaxWidth().height(4.dp)) {
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
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter))
        }
        HorizontalDivider()
        Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                WikiTool(Icons.AutoMirrored.Outlined.ArrowBack, "返回", canBack) { web?.goBack() }
                WikiTool(Icons.AutoMirrored.Outlined.ArrowForward, "前进", canForward) { web?.goForward() }
                WikiTool(Icons.Outlined.Home, "首页") { navigate(WIKI_HOME) }
                WikiTool(Icons.Outlined.BookmarkAdd, "收藏", pageReady) {
                    if (vm.user == null) notify("请先在「我的」中登录，再收藏 Wiki 页面")
                    else { vm.record(currentUrl, pageTitle, true); notify("已加入 Wiki 收藏，可在「我的」中查看") }
                }
                WikiTool(Icons.Outlined.Refresh, "刷新") { navigate(currentUrl) }
            }
        }
    }
}

@Composable
private fun WikiTool(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    AtlasTextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 56.dp),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
        shape = MaterialTheme.shapes.small
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            AtlasIcon(icon, null, Modifier.size(22.dp))
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}
