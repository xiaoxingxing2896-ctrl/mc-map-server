/* map-integration.js —— 地图应用嵌入站点外壳的整合桥（仅地图首页使用）
 *
 * 为什么存在：首页 index.astro 用 set:html 把 public/index.html（上游地图应用源码，
 * 保持不改动）整体注入页面。浏览器不会执行 innerHTML 注入的 <script>（既不取也不跑），
 * 因此这里把地图应用自己的脚本按原顺序重新执行，并在地图启动后补齐外壳侧适配：
 *   1. 重跑 head 里地图的经典内联脚本（防闪烁/Leaflet 回退定义，幂等）；
 *   2. 依序执行地图 body 的经典脚本：/vendor/leaflet.js → Turnstile(不阻塞) → 应用主脚本；
 *   3. 地图就绪后创建左下角状态胶囊（map-status）并轮询标注/瓦片/后端健康；
 *   4. 容器化后的 Leaflet 尺寸校准（首帧 + resize/orientation 防抖）。
 */
(function () {
  'use strict';
  var ws = document.querySelector('.map-workspace');
  if (!ws || window.__mapIntegrationRan) return;
  window.__mapIntegrationRan = true;

  var headInline = Array.prototype.slice.call(
    document.head.querySelectorAll('script:not([type]):not([src])')
  );
  var bodyScripts = Array.prototype.slice.call(
    ws.querySelectorAll('script:not([type])')
  );
  var queue = headInline.concat(bodyScripts);

  /* 重新执行一个经典脚本：克隆节点后追加到 body。
   * - 内联脚本：追加即同步执行；
   * - src 脚本：async 为 false 依序加载；非 async 属性的会阻塞队列直到加载完成；
   * - 带 async 属性的（Turnstile）不阻塞队列；
   * - 加载失败时尝试调用原页面约定的全局回退（loadLeafletJsFallback / loadLeafletCssFallback）。
   */
  function execOne(node) {
    return new Promise(function (resolve) {
      var copy = node.cloneNode(true);
      if (node.hasAttribute('src')) {
        copy.async = false;
        if (node.hasAttribute('async')) {
          // 外部脚本原样放行（Turnstile 这类异步加载器），不等待
          document.body.appendChild(copy);
          resolve();
          return;
        }
        copy.onload = function () { resolve(); };
        copy.onerror = function () {
          try {
            if (typeof loadLeafletJsFallback === 'function') loadLeafletJsFallback();
          } catch (e) { /* 忽略 */ }
          resolve();
        };
        document.body.appendChild(copy);
      } else {
        // 内联脚本：以经典脚本方式同步执行，保持原全局词法环境（let/const 共享）
        var inline = node.cloneNode(true);
        document.body.appendChild(inline);
        resolve();
      }
    });
  }

  var chain = Promise.resolve();
  queue.forEach(function (s) { chain = chain.then(function () { return execOne(s); }); });

  chain.then(function () {
    bootIntegration();
  });

  function bootIntegration() {
    // ---- 1. 尺寸校准：容器内首帧 + 窗口尺寸变化 ----
    function invalidate() {
      try {
        if (typeof map !== 'undefined' && map) map.invalidateSize();
      } catch (e) { /* 地图未就绪 */ }
    }
    setTimeout(invalidate, 0);
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(invalidate, 180);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(invalidate, 180);
      });
    }

    // ---- 2. 左下角状态胶囊（样式见 map-theme.css .map-status） ----
    var status = document.createElement('div');
    status.className = 'map-status';
    status.style.pointerEvents = 'none';
    status.textContent = '连接地图服务…';
    ws.appendChild(status);

    var serverOk = null;   // true / false / null=未知
    var attempts = 0;
    try {
      fetch('/api/health', { cache: 'no-store' }).then(function (r) {
        serverOk = r.ok;
      }).catch(function () { serverOk = false; });
    } catch (e) { serverOk = false; }

    function finalText() {
      var n = -1, t = -1;
      try { n = typeof markersData !== 'undefined' ? (markersData ? markersData.length : 0) : -1; } catch (e) {}
      try { t = typeof tileIndex !== 'undefined' ? (tileIndex ? tileIndex.length : 0) : -1; } catch (e) {}
      if (serverOk === false) return '地图服务未连接';
      if (t > 0) return n > 0 ? '在线 · ' + n + ' 个标注' : '在线 · 地图已就绪';
      if (t === 0 && serverOk === true) return n > 0 ? n + ' 个标注' : '已连接 · 暂无地图内容';
      return null;
    }

    var timer = setInterval(function () {
      attempts++;
      var text = finalText();
      if (text !== null) { status.textContent = text; clearInterval(timer); return; }
      if (attempts >= 14) {
        status.textContent = serverOk === false ? '地图服务未连接' : (serverOk === true ? '已连接 · 内容加载中' : '连接中…');
        clearInterval(timer);
      }
    }, 600);
  }
})();
