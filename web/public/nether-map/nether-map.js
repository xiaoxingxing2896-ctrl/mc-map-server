/*!
 * nether-map.js —— 数据驱动的线路示意图组件（无依赖）
 * ---------------------------------------------------------------------------
 * 用法一：<nether-map src="nether-map-data.json"></nether-map>
 * 用法二：<nether-map><script type="application/json">{...}</script></nether-map>
 * 用法三：<nether-map></nether-map> + window.NETHER_MAP_DATA = {...}
 *
 * 核心导出：NetherMap.core.buildSVG(data, opts) -> string
 *          NetherMap.core.roundPath(points, radius) -> string
 *
 * 设计要点：
 *  1) 线路、站点全部是「数据」，SVG 由数据渲染 —— 因此天然可编辑、可导出、可换肤。
 *  2) 坐标与底图同一坐标系（默认 1122x1080），便于用原图校对 / 描图。
 *  3) 视觉样式写在 SVG 内部 <style> 里，导出的 .svg 是自包含的。
 */
(function (global, factory) {
  'use strict';
  var api = factory();
  global.NetherMap = Object.assign(global.NetherMap || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ------------------------------------------------------------------ */
  /* 主题                                                                */
  /* ------------------------------------------------------------------ */
  var THEMES = {
    light: {
      bg: '#ffffff',
      ink: '#1f2328',
      inkSoft: '#5a6472',
      labelZh: '#1f2328',
      labelEn: '#6b7280',
      code: '#8a8f98',
      ring: '#2b2b2b',
      lineInk: '#ffffff',
      grid: '#e8ecf2',
      halo: '#ffffff',
      accent: '#2b7cbf'
    },
    dark: {
      bg: '#0f1115',
      ink: '#e8eaed',
      inkSoft: '#a8b0bd',
      labelZh: '#e8eaed',
      labelEn: '#98a2b3',
      code: '#7b8494',
      ring: '#d7dbe0',
      lineInk: '#0f1115',
      grid: '#1c2028',
      halo: '#0f1115',
      accent: '#4aa3e0'
    }
  };

  var FONT_STACK = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif';

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */
  function num(v, d) {
    v = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(v) ? v : (d || 0);
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function indexNodes(data) {
    var m = {};
    (data.nodes || []).forEach(function (n) { m[n.id] = n; });
    return m;
  }
  function indexLines(data) {
    var m = {};
    (data.lines || []).forEach(function (l) { m[l.id] = l; });
    return m;
  }

  /* 把 path 里的每一段引用（站点 id / [x,y] / {x,y}）解析成坐标 */
  function resolveRef(ref, nodeIndex) {
    if (Array.isArray(ref)) return { x: num(ref[0]), y: num(ref[1]) };
    if (typeof ref === 'string') {
      var n = nodeIndex[ref];
      if (!n) return null;
      return { x: num(n.x), y: num(n.y), node: n };
    }
    if (ref && typeof ref === 'object') return { x: num(ref.x), y: num(ref.y) };
    return null;
  }

  /* 折线 → 带圆角拐角的 <path d>，贴合地铁图那种"拐弯抹角"的观感 */
  function roundPath(points, radius) {
    var pts = (points || []).filter(Boolean);
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + r2(pts[0].x) + ',' + r2(pts[0].y);
    var rad = radius == null ? 10 : radius;
    var d = 'M' + r2(pts[0].x) + ',' + r2(pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      var v1x = p0.x - p1.x, v1y = p0.y - p1.y;
      var v2x = p2.x - p1.x, v2y = p2.y - p1.y;
      var l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (!l1 || !l2) { d += ' L' + r2(p1.x) + ',' + r2(p1.y); continue; }
      // 共线就不做圆角
      if (Math.abs(v1x * v2y - v1y * v2x) < 1e-6) { d += ' L' + r2(p1.x) + ',' + r2(p1.y); continue; }
      var rr = Math.min(rad, l1 / 2, l2 / 2);
      var ax = p1.x + v1x / l1 * rr, ay = p1.y + v1y / l1 * rr;
      var bx = p1.x + v2x / l2 * rr, by = p1.y + v2y / l2 * rr;
      d += ' L' + r2(ax) + ',' + r2(ay) + ' Q' + r2(p1.x) + ',' + r2(p1.y) + ' ' + r2(bx) + ',' + r2(by);
    }
    var last = pts[pts.length - 1];
    d += ' L' + r2(last.x) + ',' + r2(last.y);
    return d;
  }

  /* 站点归属的线路（自动从 routes 里推导，不用手写） */
  function computeNodeLines(data) {
    var idx = indexNodes(data);
    var map = {};
    (data.nodes || []).forEach(function (n) { map[n.id] = []; });
    (data.routes || []).forEach(function (route) {
      (route.via || []).forEach(function (ref) {
        if (typeof ref !== 'string') return;
        var n = idx[ref];
        if (!n) return;
        var arr = map[ref] || (map[ref] = []);
        if (arr.indexOf(route.line) < 0) arr.push(route.line);
      });
    });
    (data.links || []).forEach(function (l) {
      [l.from, l.to].forEach(function (ref) {
        if (typeof ref !== 'string' || !map[ref]) return;
        if (map[ref].indexOf(l.line) < 0) map[ref].push(l.line);
      });
    });
    return map;
  }

  /* 文字标签排版：返回 zh / en 两行的 x,y,anchor */
  function labelLayout(node, fonts) {
    var cfg = node.label || {};
    var side = cfg.side || (node.kind === 'junction' ? 'bottom' : 'right');
    var dx = num(cfg.dx), dy = num(cfg.dy);
    var k = cfg.size || 1;
    var zh = fonts.zh * k, en = fonts.en * k;
    var gap = 10;
    var L = { anchor: 'start', x: gap, y1: -1, y2: en + 1.2, side: side };
    if (side === 'right') { L.anchor = 'start'; L.x = gap; L.y1 = -1.5; L.y2 = L.y1 + en + 1.4; }
    else if (side === 'left') { L.anchor = 'end'; L.x = -gap; L.y1 = -1.5; L.y2 = L.y1 + en + 1.4; }
    else if (side === 'top') { L.anchor = 'middle'; L.x = 0; L.y2 = -8; L.y1 = L.y2 - en - 2; }
    else if (side === 'bottom') { L.anchor = 'middle'; L.x = 0; L.y1 = 16; L.y2 = L.y1 + en + 1.4; }
    L.x += dx; L.y1 += dy; L.y2 += dy;
    L.zhSize = zh; L.enSize = en;
    return L;
  }

  /* ------------------------------------------------------------------ */
  /* 主渲染器                                                            */
  /* ------------------------------------------------------------------ */
  /**
   * @param {object} data   地图数据
   * @param {object} opts   { theme, lang, selectedId, hotId, showBadges, showCodes, title, viewport, editMode, hiddenLines, movedOnly }
   * @returns {string} SVG 字符串
   */
  function buildSVG(data, opts) {
    opts = opts || {};
    var theme = THEMES[opts.theme] || THEMES.light;
    var themeName = THEMES[opts.theme] ? opts.theme : 'light';
    var nodeIndex = indexNodes(data);
    var lineIndex = indexLines(data);
    var nodeLines = computeNodeLines(data);
    var meta = data.meta || {};
    var vb = meta.viewBox || [0, 0, 1122, 1080];
    var lang = opts.lang || 'both';
    var fonts = { zh: 8.6, en: 5.9 };
    var hidden = opts.hiddenLines || {};
    var out = [];

    var vp = opts.viewport || { k: 1, tx: 0, ty: 0 };
    var transform = 'translate(' + r2(vp.tx) + ',' + r2(vp.ty) + ') scale(' + (vp.k || 1) + ')';

    out.push(
      '<svg xmlns="http://www.w3.org/2000/svg" class="nm-svg" viewBox="' + vb.join(' ') + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" data-theme="' + themeName + '" ' +
      'aria-label="' + esc(meta.title || '线路示意图') + '" ' +
      'style="font-family:' + FONT_STACK + '">'
    );

    /* ---- 样式（写在 SVG 内，保证导出后仍然生效） ---- */
    out.push('<style>' +
      '.nm-svg{display:block;width:100%;height:auto;background:' + theme.bg + ';touch-action:none}' +
      '.nm-svg text{user-select:none;dominant-baseline:auto}' +
      '.nm-line{fill:none;stroke-linecap:round;stroke-linejoin:round;transition:opacity .18s ease,stroke-width .18s ease}' +
      '.nm-link{fill:none;stroke-linecap:round}' +
      '.nm-node{transition:opacity .18s ease}' +
      '.nm-node .nm-marker{transition:transform .12s ease}' +
      '.nm-hit{fill:transparent;stroke:none}' +
      '.nm-svg.has-hot .nm-line.is-dim{opacity:.16}' +
      '.nm-svg.has-sel .nm-line.is-dim{opacity:.42}' +
      '.nm-svg.has-hot .nm-node.is-dim{opacity:.28}' +
      '.nm-svg.has-sel .nm-node.is-dim{opacity:.58}' +
      '.nm-svg.has-hot .nm-node.is-hot .nm-marker{transform:scale(1.28)}' +
      '.nm-node[data-clickable="1"]{cursor:pointer;outline:none}' +
      '.nm-node:focus-visible .nm-focus{opacity:1}' +
      '.nm-focus{opacity:0;fill:none;stroke:' + theme.accent + ';stroke-width:2;stroke-dasharray:3 2.4}' +
      '.nm-selected-ring{fill:none;stroke:' + theme.accent + ';stroke-width:1.6;opacity:.95}' +
      '.nm-label-zh{font-weight:700;fill:' + theme.labelZh + '}' +
      '.nm-label-en{font-weight:400;fill:' + theme.labelEn + '}' +
      '.nm-code{font-weight:600;fill:' + theme.code + '}' +
      '.nm-badge-text{font-weight:700;fill:' + theme.ink + '}' +
      '.nm-badge-sub{font-weight:400;fill:' + theme.inkSoft + '}' +
      '.nm-edit-node{cursor:move}' +
      '</style>'
    );

    out.push('<rect class="nm-bg" x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="' + theme.bg + '"/>');

    /* ---- 描图底图（把原图垫在下面，方便照着原图校正坐标） ---- */
    if (opts.underlay) {
      var raster = meta.raster || [0, 0, 1122, 1080];
      out.push('<image class="nm-underlay" href="' + esc(opts.underlay) + '" x="' + raster[0] + '" y="' + raster[1] + '" ' +
        'width="' + raster[2] + '" height="' + raster[3] + '" opacity="' + (opts.underlayOpacity == null ? 0.32 : opts.underlayOpacity) + '" ' +
        'preserveAspectRatio="none" style="pointer-events:none"/>');
    }

    out.push('<g class="nm-viewport" transform="' + transform + '">');

    /* ---- 线路 ---- */
    out.push('<g class="nm-lines">');
    (data.routes || []).forEach(function (route) {
      var line = lineIndex[route.line];
      if (!line) return;
      var pts = (route.via || []).map(function (ref) { return resolveRef(ref, nodeIndex); }).filter(Boolean);
      if (pts.length < 2) return;
      var d = roundPath(pts, line.round == null ? 10 : line.round);
      var dim = hidden[line.id];
      out.push('<path class="nm-line" data-line="' + esc(line.id) + '" d="' + d + '" ' +
        'stroke="' + esc(line.color) + '" stroke-width="' + num(line.width, 6.5) + '" ' +
        'opacity="' + (dim ? 0.1 : 1) + '"><title>' + esc(line.name + ' ' + (line.sub || '')) + '</title></path>');
    });
    out.push('</g>');

    /* ---- 支线 / 未运营连接线 ---- */
    out.push('<g class="nm-links">');
    (data.links || []).forEach(function (link) {
      var line = lineIndex[link.line] || { color: theme.ring };
      var a = resolveRef(link.from, nodeIndex);
      var b = resolveRef(link.to, nodeIndex);
      if (!a || !b) return;
      if (link.style === 'dashed') {
        out.push('<line class="nm-link" x1="' + r2(a.x) + '" y1="' + r2(a.y) + '" x2="' + r2(b.x) + '" y2="' + r2(b.y) + '" ' +
          'stroke="' + esc(link.color || theme.code) + '" stroke-width="1.5" stroke-dasharray="2 2.4" opacity=".9"/>');
      } else {
        // 双线效果：外描边 + 白芯，模拟原图里的“站点支线”
        var w = num(link.width, 3.4);
        out.push('<g class="nm-link-pair" data-line="' + esc(link.line) + '">' +
          '<line class="nm-link" x1="' + r2(a.x) + '" y1="' + r2(a.y) + '" x2="' + r2(b.x) + '" y2="' + r2(b.y) + '" ' +
          'stroke="' + esc(link.color || line.color) + '" stroke-width="' + w + '"/>' +
          '<line class="nm-link" x1="' + r2(a.x) + '" y1="' + r2(a.y) + '" x2="' + r2(b.x) + '" y2="' + r2(b.y) + '" ' +
          'stroke="' + theme.lineInk + '" stroke-width="' + Math.max(0.8, w - 2) + '" opacity=".92"/>' +
          '</g>');
      }
    });
    out.push('</g>');

    /* ---- 线路徽标 ---- */
    if (opts.showBadges !== false) {
      out.push('<g class="nm-badges">');
      (data.lines || []).forEach(function (line) {
        if (!line.badge) return;
        if (hidden[line.id]) return;
        var no = line.no || (String(line.name).match(/\d+/) || [''])[0];
        var label = no || '·';
        var dispName = String(line.name).replace(/^\s*\d+\s*号?线?/, '号线');
        var sub = line.sub || '';
        var bw = 15;
        out.push('<g class="nm-badge" transform="translate(' + num(line.badge[0]) + ',' + num(line.badge[1]) + ')">' +
          '<rect x="0" y="0" width="' + bw + '" height="15" rx="2.5" fill="' + esc(line.color) + '"/>' +
          '<text x="' + (bw / 2) + '" y="11" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">' + esc(label) + '</text>' +
          '<text class="nm-badge-text" x="' + (bw + 4) + '" y="7.4" font-size="8">' + esc(dispName) + '</text>' +
          (sub ? '<text class="nm-badge-sub" x="' + (bw + 4) + '" y="15.4" font-size="5.4">' + esc(sub) + '</text>' : '') +
          '</g>');
      });
      out.push('</g>');
    }

    /* ---- 站点 / 岔路口 ---- */
    out.push('<g class="nm-nodes">');
    (data.nodes || []).forEach(function (node) {
      var kind = node.kind || 'station';
      var x = num(node.x), y = num(node.y);
      var lines = nodeLines[node.id] || [];
      var firstColor = lines.length && lineIndex[lines[0]] ? lineIndex[lines[0]].color : theme.ring;
      var title = (node.name || node.code || '') + (node.nameEn ? ' / ' + node.nameEn : '');
      var hiddenNode = lines.length && lines.every(function (l) { return hidden[l]; });
      var cls = 'nm-node';
      if (hiddenNode) cls += ' is-dim';
      out.push('<g class="' + cls + '" data-id="' + esc(node.id) + '" data-kind="' + esc(kind) + '" ' +
        'data-lines="' + esc(lines.join(' ')) + '" transform="translate(' + r2(x) + ',' + r2(y) + ')" ' +
        'tabindex="0" role="button" aria-label="' + esc(title) + '" data-clickable="1">');
      out.push('<title>' + esc(title) + '</title>');

      /* 键盘焦点环 & 选中环 */
      var ringR = kind === 'junction' || kind === 'interchange' ? 15 : 9.5;
      out.push('<circle class="nm-focus" r="' + ringR + '"/>');
      if (opts.selectedId === node.id) out.push('<circle class="nm-selected-ring" r="' + (ringR - 1.5) + '"/>');

      out.push('<g class="nm-marker">');
      if (kind === 'junction') {
        out.push('<rect x="-10" y="-6" width="20" height="12" rx="6" fill="' + theme.bg + '" stroke="' + theme.ring + '" stroke-width="1.7"/>');
        out.push('<path d="M-2.6,-3.4 V3.4 M2.6,-3.4 V3.4" stroke="' + theme.ring + '" stroke-width="1.5" stroke-linecap="round" fill="none"/>');
      } else if (kind === 'interchange') {
        out.push('<rect x="-12" y="-6.4" width="24" height="12.8" rx="6.4" fill="' + theme.bg + '" stroke="' + theme.ring + '" stroke-width="1.9"/>');
        out.push('<rect x="-6" y="-1.5" width="12" height="3" rx="1.5" fill="' + firstColor + '"/>');
      } else if (kind === 'wip') {
        out.push('<circle r="5.4" fill="' + theme.bg + '" stroke="' + theme.code + '" stroke-width="1.5" stroke-dasharray="2 1.8"/>');
      } else {
        out.push('<circle r="5.4" fill="' + theme.bg + '" stroke="' + theme.ring + '" stroke-width="2"/>');
      }
      out.push('<circle class="nm-hit" r="13"/>');
      out.push('</g>');

      /* 文字标签 */
      var showName = node.name || node.nameEn;
      if (kind === 'junction') {
        var code = node.code || node.name || '';
        if (opts.showCodes !== false && code) {
          out.push('<text class="nm-code" x="11" y="12.5" font-size="6.4" text-anchor="start">' + esc(code) + '</text>');
        }
      } else if (showName) {
        var L = labelLayout(node, fonts);
        var zh = lang !== 'en' ? (node.name || '') : '';
        var en = lang !== 'zh' ? (node.nameEn || '') : '';
        if (!zh) { en = node.nameEn || node.name || ''; }
        var anchor = L.anchor === 'middle' ? 'middle' : L.anchor;
        if (zh) {
          out.push('<text class="nm-label-zh" x="' + r2(L.x) + '" y="' + r2(L.y1) + '" font-size="' + r2(L.zhSize) + '" text-anchor="' + anchor + '">' + esc(zh) + '</text>');
        }
        if (en) {
          out.push('<text class="nm-label-en" x="' + r2(L.x) + '" y="' + r2(L.y2) + '" font-size="' + r2(L.enSize) + '" text-anchor="' + anchor + '">' + esc(en) + '</text>');
        }
      }
      out.push('</g>');
    });
    out.push('</g>');
    out.push('</g>');
    out.push('</svg>');
    return out.join('');
  }

  return {
    version: VERSION,
    core: {
      THEMES: THEMES,
      buildSVG: buildSVG,
      roundPath: roundPath,
      resolveRef: resolveRef,
      labelLayout: labelLayout,
      indexNodes: indexNodes,
      indexLines: indexLines,
      computeNodeLines: computeNodeLines,
      themes: THEMES
    }
  };
});


/* ==========================================================================
 * 以下：<nether-map> 自定义元素（可点击 / 有反馈 / 可编辑 / 可嵌入）
 * ========================================================================== */
(function (global) {
  'use strict';
  var NM = global.NetherMap = global.NetherMap || {};
  var core = NM.core;
  if (!core) { console.warn('[nether-map] 需要先加载 nether-map.js 的核心部分'); return; }
  if (typeof HTMLElement === 'undefined' || typeof customElements === 'undefined') return; // Node 等环境跳过

  var SHELL_CSS = [
    ':host{display:block;position:relative;--nm-bg:#fff;--nm-fg:#1f2328;--nm-muted:#6b7280;--nm-line:#e5e9ef;--nm-accent:#2b7cbf;--nm-panel:#fff;--nm-soft:#f6f8fb;font-family:"PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--nm-fg);}',
    ':host([theme="dark"]){--nm-bg:#0f1115;--nm-fg:#e8eaed;--nm-muted:#98a2b3;--nm-line:#242a33;--nm-accent:#4aa3e0;--nm-panel:#151a21;--nm-soft:#1a2029;}',
    '*{box-sizing:border-box}',
    '.shell{display:flex;align-items:stretch;background:var(--nm-bg);border-radius:14px;border:1px solid var(--nm-line);overflow:hidden}',
    '.stage{position:relative;flex:1 1 auto;min-width:0;background:var(--nm-bg);display:flex;flex-direction:column}',
    '.toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:8px 10px 0;flex-wrap:wrap}',
    '.toolbar:empty{display:none}',
    '.canvas{padding:2px 6px 6px}',
    '.canvas svg{width:100%;height:auto;display:block;border-radius:10px}',
    '.bar{display:flex;gap:6px;flex-wrap:wrap;max-width:100%}',
    '.bar.tr{justify-content:flex-end;margin-left:auto}',
    'button.ui{appearance:none;border:1px solid var(--nm-line);background:var(--nm-panel);color:var(--nm-fg);border-radius:8px;padding:5px 9px;font-size:12px;line-height:1.4;cursor:pointer;transition:.15s;opacity:.94}',
    'button.ui:hover{border-color:var(--nm-accent);color:var(--nm-accent);opacity:1}',
    'button.ui[aria-pressed="true"]{background:var(--nm-accent);border-color:var(--nm-accent);color:#fff}',
    'button.ui.ghost{background:transparent}',
    'button.ui:disabled{opacity:.35;cursor:not-allowed}',
    '.hint{position:absolute;left:12px;bottom:8px;font-size:11px;color:var(--nm-muted);background:var(--nm-bg);opacity:.9;padding:3px 8px;border-radius:7px;pointer-events:none;max-width:calc(100% - 24px)}',
    '.panel{flex:0 0 272px;max-width:272px;border-left:1px solid var(--nm-line);background:var(--nm-panel);display:flex;flex-direction:column;overflow:hidden}',
    '.panel[hidden]{display:none}',
    '.head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 12px 6px}',
    '.head h3{margin:0;font-size:13px;font-weight:700;line-height:1.4}',
    '.body{padding:0 12px 14px;overflow:auto;font-size:12px;line-height:1.6}',
    '.chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:1px 9px;font-size:11px;color:#fff;margin:2px 4px 2px 0}',
    '.tag{display:inline-block;border:1px solid var(--nm-line);color:var(--nm-muted);border-radius:6px;padding:0 6px;font-size:11px;margin:2px 4px 2px 0}',
    '.kv{display:grid;grid-template-columns:58px 1fr;gap:4px 8px;margin:10px 0 0}',
    '.kv dt{color:var(--nm-muted)}',
    '.kv dd{margin:0}',
    '.field{display:flex;flex-direction:column;gap:3px;margin-bottom:8px;min-width:0}',
    '.field label{font-size:11px;color:var(--nm-muted)}',
    '.field input,.field select,.field textarea{font:inherit;font-size:12px;color:var(--nm-fg);background:var(--nm-soft);border:1px solid var(--nm-line);border-radius:7px;padding:5px 7px;outline:none;width:100%}',
    '.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--nm-accent)}',
    '.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.btnrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.empty{color:var(--nm-muted);font-size:12px;padding:4px 0 10px}',
    '.sep{height:1px;background:var(--nm-line);margin:12px 0}',
    '.close{border:0;background:transparent;color:var(--nm-muted);cursor:pointer;font-size:18px;line-height:1;padding:0 2px}',
    'textarea.json{height:110px;font-family:ui-monospace,Consolas,monospace;font-size:11px;resize:vertical}',
    '.sec{font-weight:700;margin:0 0 6px;font-size:12px}',
    '@media (max-width:820px){.shell{flex-direction:column}.panel{flex:1 1 auto;max-width:none;border-left:0;border-top:1px solid var(--nm-line)}}'
  ].join('\n');

  class NetherMapElement extends HTMLElement {
    static get observedAttributes() { return ['mode', 'theme', 'lang', 'src', 'badges']; }
  }
  var P = NetherMapElement.prototype;

  /* ---------------- 工具 ---------------- */
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function escText(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 生命周期 ---------------- */
  P.connectedCallback = function () {
    if (this._built) return;
    this.data = null;
    this.view = { k: 1, tx: 0, ty: 0 };
    this.selectedId = null;
    this.hotId = null;
    this.mode = this.getAttribute('mode') === 'edit' ? 'edit' : 'view';
    this.tool = 'select';
    this.hiddenLines = {};
    this._past = [];
    this._future = [];
    this._built = false;
    this._drag = null;
    this._raf = 0;
    this._saveTimer = 0;
    this._suppressClick = false;
    this._underlayOn = false;
    this._handleMove = this._handleMove.bind(this);
    this._handleUp = this._handleUp.bind(this);
    this.themeName = 'light';
    this._build();
    this._load();
  };

  P.disconnectedCallback = function () {
    window.removeEventListener('pointermove', this._handleMove);
    window.removeEventListener('pointerup', this._handleUp);
  };

  P.attributeChangedCallback = function (name, oldV, newV) {
    if (!this._built || oldV === newV) return;
    if (name === 'mode') this.setMode(newV === 'edit' ? 'edit' : 'view');
    else if (name === 'theme') { this._applyTheme(); this._render(); }
    else if (name === 'lang' || name === 'badges') this._render();
    else if (name === 'src') this._load();
  };

  /* ---------------- DOM 骨架 ---------------- */
  P._build = function () {
    var root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' + SHELL_CSS + '</style>' +
      '<div class="shell">' +
        '<div class="stage">' +
          '<div class="toolbar"><div class="bar tl"></div><div class="bar tr"></div></div>' +
          '<div class="canvas"></div>' +
          '<div class="hint"></div>' +
        '</div>' +
        '<aside class="panel" hidden></aside>' +
      '</div>';
    this._stage = root.querySelector('.stage');
    this._canvas = root.querySelector('.canvas');
    this._barTL = root.querySelector('.bar.tl');
    this._barTR = root.querySelector('.bar.tr');
    this._hint = root.querySelector('.hint');
    this._panel = root.querySelector('.panel');
    this._built = true;
    this._applyTheme();

    /* 快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 重做 */
    var self = this;
    this.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) self.redo(); else self.undo();
      }
    });
  };

  P._applyTheme = function () {
    var t = this.getAttribute('theme');
    if (!t || t === 'auto') {
      t = (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    this.themeName = (t === 'dark') ? 'dark' : 'light';
    if (this.themeName === 'dark' && this.getAttribute('theme') !== 'dark' && this.getAttribute('theme') !== 'auto') {
      this.setAttribute('theme', 'dark');
    } else if (this.themeName !== 'dark' && this.getAttribute('theme') === 'dark') {
      this.removeAttribute('theme');
    }
  };

  /* ---------------- 数据 ---------------- */
  P._storageKey = function () {
    var s = this.getAttribute('storage');
    if (s === 'off') return null;
    return 'nether-map:' + (s || this.getAttribute('src') || 'default');
  };

  P._load = function () {
    var self = this;
    var src = this.getAttribute('src');
    var holder = this.querySelector('script[type="application/json"]');
    var key = this._storageKey();

    if (holder && holder.textContent.trim()) {
      try { return this._applyInitial(JSON.parse(holder.textContent), key); }
      catch (e) { console.error('[nether-map] 内联 JSON 解析失败', e); }
    }
    if (src) {
      fetch(src, { cache: 'no-cache' })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          // 兼容「纯 JSON」和「window.NETHER_MAP_DATA = {...};」两种文件
          var json;
          try { json = JSON.parse(t); }
          catch (e) { json = JSON.parse(t.replace(/^[^{]*/, '').replace(/;?\s*$/, '')); }
          self._applyInitial(json, key);
        })
        .catch(function (err) {
          console.error('[nether-map] 加载 ' + src + ' 失败', err);
          if (global.NETHER_MAP_DATA) self._applyInitial(global.NETHER_MAP_DATA, key);
        });
    } else if (global.NETHER_MAP_DATA) {
      this._applyInitial(global.NETHER_MAP_DATA, key);
    } else {
      console.warn('[nether-map] 没有可用的数据：请设置 src 属性、内联 JSON 或 window.NETHER_MAP_DATA');
    }
  };

  P._applyInitial = function (json, key) {
    var data = json;
    if (key) {
      var saved = null;
      try { saved = localStorage.getItem(key); } catch (e) { /* 隐私模式 */ }
      if (saved) {
        try { data = JSON.parse(saved); } catch (e) { /* 坏数据就忽略 */ }
      }
    }
    this._initial = json;
    this._setData(data);
  };

  P._setData = function (json) {
    if (!json || !json.nodes) { console.warn('[nether-map] 数据格式不对：缺少 nodes'); return; }
    this.data = json;
    this._nodeLineMap = null;
    this._nodeIndex = null;
    this._render();
    this._renderPanel();
    this._emit('data-ready', { data: this.data });
  };

  /* ---------------- 渲染 ---------------- */
  P._render = function () {
    if (!this.data || !this._canvas) return;
    var underlay = null;
    if (this._underlayOn) {
      underlay = this.getAttribute('underlay') || (this.data.meta && this.data.meta.sourceImage) || null;
    }
    this._canvas.innerHTML = core.buildSVG(this.data, {
      theme: this.themeName,
      lang: this.getAttribute('lang') || 'both',
      selectedId: this.selectedId,
      showBadges: this.getAttribute('badges') !== 'off',
      hiddenLines: this.hiddenLines,
      viewport: this.view,
      underlay: underlay,
      underlayOpacity: parseFloat(this.getAttribute('underlay-opacity') || '0.32')
    });
    this._svg = this._canvas.querySelector('svg');
    this._bindSvg();
    this._applyHot();
    this._renderToolbar();
  };

  P._applyHot = function () {
    var svg = this._svg;
    if (!svg) return;
    var id = this.hotId || this.selectedId;
    var nodes = svg.querySelectorAll('.nm-node');
    var lines = svg.querySelectorAll('.nm-line');
    svg.classList.toggle('has-hot', !!(this._hover && this.hotId));
    svg.classList.toggle('has-sel', !!this.selectedId);
    if (!id) {
      [].forEach.call(nodes, function (g) { g.classList.remove('is-dim', 'is-hot'); });
      [].forEach.call(lines, function (p) { p.classList.remove('is-dim'); });
      return;
    }
    var hotLines = this._nodeLines(id);
    [].forEach.call(lines, function (p) {
      p.classList.toggle('is-dim', hotLines.indexOf(p.getAttribute('data-line')) < 0);
    });
    [].forEach.call(nodes, function (g) {
      var ls = (g.getAttribute('data-lines') || '').split(' ').filter(Boolean);
      var on = g.getAttribute('data-id') === id || ls.some(function (l) { return hotLines.indexOf(l) >= 0; });
      g.classList.toggle('is-dim', !on);
      g.classList.toggle('is-hot', g.getAttribute('data-id') === id);
    });
  };

  P._nodeLines = function (id) {
    if (!this._nodeLineMap) this._nodeLineMap = core.computeNodeLines(this.data);
    return this._nodeLineMap[id] || [];
  };

  P._nodeById = function (id) {
    if (!this._nodeIndex) this._nodeIndex = core.indexNodes(this.data);
    return this._nodeIndex[id];
  };

  /* ---------------- 交互 ---------------- */
  P._bindSvg = function () {
    var self = this;
    var svg = this._svg;
    if (!svg) return;
    svg.addEventListener('pointerdown', function (e) { self._onDown(e); });
    svg.addEventListener('pointermove', function (e) { self._onHover(e); });
    svg.addEventListener('pointerleave', function () {
      if (self._drag) return;
      self._hover = false;
      self.hotId = null;
      self._applyHot();
    });
    svg.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
    svg.addEventListener('dblclick', function (e) { e.preventDefault(); self.resetView(); });
    svg.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('.nm-node') : null;
      if (self._suppressClick) { self._suppressClick = false; return; }
      if (!g) { self.select(null); return; }
      self.select(g.getAttribute('data-id'), true);
    });
    svg.addEventListener('keydown', function (e) {
      var g = e.target.closest ? e.target.closest('.nm-node') : null;
      if (!g) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.select(g.getAttribute('data-id'), true); }
      if (e.key === 'Escape') self.select(null);
    });
    svg.addEventListener('focusin', function (e) {
      var g = e.target.closest ? e.target.closest('.nm-node') : null;
      if (g) { self.hotId = g.getAttribute('data-id'); self._hover = true; self._applyHot(); }
    });
    svg.addEventListener('focusout', function () {
      if (!self._drag) { self.hotId = null; self._hover = false; self._applyHot(); }
    });
  };

  P._onHover = function (e) {
    if (this._drag) return;
    var g = e.target.closest ? e.target.closest('.nm-node') : null;
    var id = g ? g.getAttribute('data-id') : null;
    this._hover = !!id;
    if (id === this.hotId && this._hover === this._hoverPrev) return;
    this._hoverPrev = this._hover;
    this.hotId = id;
    this._applyHot();
  };

  P._onWheel = function (e) {
    e.preventDefault();
    var m = this._toMap(e);
    if (!m) return;
    var factor = Math.exp(-e.deltaY * 0.0016);
    this._zoomAt(m, factor);
  };

  P._zoomAt = function (m, factor) {
    var v = this.view;
    var k = Math.max(0.6, Math.min(9, v.k * factor));
    if (k === v.k) return;
    v.tx = m.vbX - m.x * k;
    v.ty = m.vbY - m.y * k;
    v.k = k;
    this._applyView();
  };

  P._zoomCenter = function (factor) {
    var vb = this._vb();
    var vbx = vb[0] + vb[2] / 2, vby = vb[1] + vb[3] / 2;
    this._zoomAt({ x: (vbx - this.view.tx) / this.view.k, y: (vby - this.view.ty) / this.view.k, vbX: vbx, vbY: vby }, factor);
  };

  P._vb = function () {
    return (this.data && this.data.meta && this.data.meta.viewBox) || [0, 0, 1122, 1080];
  };

  P._applyView = function () {
    var g = this._svg && this._svg.querySelector('.nm-viewport');
    if (!g) return;
    g.setAttribute('transform', 'translate(' + Math.round(this.view.tx * 100) / 100 + ',' + Math.round(this.view.ty * 100) / 100 + ') scale(' + this.view.k + ')');
  };

  P._toMap = function (e) {
    var svg = this._svg;
    if (!svg || !svg.getScreenCTM) return null;
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    var pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var loc = pt.matrixTransform(ctm.inverse());
    var v = this.view;
    return { x: (loc.x - v.tx) / v.k, y: (loc.y - v.ty) / v.k, vbX: loc.x, vbY: loc.y };
  };

  P._onDown = function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var nodeEl = e.target.closest ? e.target.closest('.nm-node') : null;
    this._dragMoved = false;
    var m = this._toMap(e);
    if (!m) return;

    if (this.mode === 'edit' && this.tool === 'add' && !nodeEl) {
      this._addNodeAt(m.x, m.y);
      return;
    }
    if (this.mode === 'edit' && this.tool === 'delete' && nodeEl) {
      e.preventDefault();
      this._deleteNode(nodeEl.getAttribute('data-id'));
      return;
    }
    if (nodeEl && this.mode === 'edit' && this.tool === 'select') {
      var id = nodeEl.getAttribute('data-id');
      var node = this._nodeById(id);
      this.select(id, false);
      this._drag = { kind: 'node', id: id, offX: m.x - node.x, offY: m.y - node.y, origin: JSON.stringify(this.data), moved: false };
      this._suppressClick = true;
    } else {
      this._drag = { kind: 'pan', startVbX: m.vbX, startVbY: m.vbY, tx0: this.view.tx, ty0: this.view.ty, moved: false };
    }
    e.preventDefault();
    window.addEventListener('pointermove', this._handleMove);
    window.addEventListener('pointerup', this._handleUp);
  };

  P._handleMove = function (e) {
    var d = this._drag;
    if (!d) return;
    var m = this._toMap(e);
    if (!m) return;
    if (d.kind === 'pan') {
      var dx = m.vbX - d.startVbX, dy = m.vbY - d.startVbY;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      this.view.tx = d.tx0 + dx;
      this.view.ty = d.ty0 + dy;
      this._applyView();
    } else if (d.kind === 'node') {
      var node = this._nodeById(d.id);
      if (!node) return;
      node.x = Math.round((m.x - d.offX) * 2) / 2;
      node.y = Math.round((m.y - d.offY) * 2) / 2;
      d.moved = true;
      this._scheduleRender();
      this._syncXY();
    }
  };

  P._handleUp = function () {
    var d = this._drag;
    this._drag = null;
    window.removeEventListener('pointermove', this._handleMove);
    window.removeEventListener('pointerup', this._handleUp);
    if (!d) return;
    if (d.moved) {
      this._dragMoved = true;
      this._suppressClick = true;
      var self = this;
      setTimeout(function () { self._suppressClick = false; }, 60);
      if (d.kind === 'node') this._commit('移动站点', d.origin);
    }
    this._renderPanel();
  };

  P._scheduleRender = function () {
    var self = this;
    if (this._raf) return;
    this._raf = requestAnimationFrame(function () { self._raf = 0; self._render(); });
  };

  /* ---------------- 选择与面板 ---------------- */
  P.select = function (id, emitClick) {
    this.selectedId = id;
    this.hotId = id;
    this._hover = false;
    this._hoverPrev = false;
    this._render();
    this._renderPanel();
    if (id) {
      this._emit('station-select', { id: id, node: this._nodeById(id) });
      if (emitClick) this._emit('station-click', { id: id, node: this._nodeById(id) });
    }
  };

  P._emit = function (type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail: detail, bubbles: true, composed: true }));
  };

  P._renderPanel = function () {
    var panel = this._panel;
    if (!panel) return;
    if (!this.selectedId && this.mode !== 'edit') { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    panel.innerHTML = (this.mode === 'edit')
      ? this._inspectorHTML(this.selectedId)
      : this._detailHTML(this.selectedId);
    this._bindPanel();
  };

  P._detailHTML = function (id) {
    var n = id && this._nodeById(id);
    if (!n) return '';
    var idx = core.indexLines(this.data);
    var lines = this._nodeLines(id);
    var chips = lines.map(function (l) {
      var line = idx[l];
      if (!line) return '';
      return '<span class="chip" style="background:' + line.color + '">' + escText(line.name) + '</span>';
    }).join('');
    var tags = (n.tags || []).map(function (t) { return '<span class="tag">' + escText(t) + '</span>'; }).join('');
    var kindText = { station: '普通车站', interchange: '换乘站', junction: '岔路口', wip: '暂未运营' }[n.kind] || n.kind || '站点';
    return '<div class="head"><h3>' + escText(n.name || n.code || '站点') + '</h3>' +
      '<button class="close" data-action="close" title="关闭">×</button></div>' +
      '<div class="body">' +
      (n.nameEn ? '<div style="color:var(--nm-muted);margin-top:-4px">' + escText(n.nameEn) + '</div>' : '') +
      (chips ? '<div style="margin:8px 0 2px">' + chips + '</div>' : '') +
      (tags ? '<div>' + tags + '</div>' : '') +
      (n.desc ? '<p style="margin:8px 0 0">' + escText(n.desc) + '</p>' : '') +
      '<dl class="kv">' + (n.code ? '<dt>编号</dt><dd>' + escText(n.code) + '</dd>' : '') +
      '<dt>类型</dt><dd>' + kindText + '</dd>' +
      '<dt>坐标</dt><dd>' + n.x + ', ' + n.y + '</dd></dl>' +
      '<div class="btnrow"><button class="ui" data-action="focus">居中放大</button>' +
      '<button class="ui" data-action="copy-link">复制定位链接</button></div>' +
      '</div>';
  };

  P._inspectorHTML = function (id) {
    var n = id ? this._nodeById(id) : null;
    if (!n) {
      return '<div class="head"><h3>编辑数据</h3><button class="close" data-action="close">×</button></div>' +
        '<div class="body"><div class="empty">在图上点选站点即可编辑；选「＋ 添加站点」后在空白处点一下可新建。</div>' +
        this._linesEditorHTML() + '</div>';
    }
    var kinds = [['station', '普通车站'], ['interchange', '换乘站'], ['junction', '岔路口'], ['wip', '暂未运营']];
    var sides = [['top', '上'], ['bottom', '下'], ['left', '左'], ['right', '右']];
    var L = n.label || {};
    return '<div class="head"><h3>' + escText(n.name || n.code || '站点') + '</h3>' +
      '<button class="close" data-action="close">×</button></div>' +
      '<div class="body">' +
      '<div class="field"><label>中文名</label><input data-field="name" value="' + escAttr(n.name) + '"></div>' +
      '<div class="field"><label>英文名</label><input data-field="nameEn" value="' + escAttr(n.nameEn) + '"></div>' +
      '<div class="row">' +
        '<div class="field"><label>编号</label><input data-field="code" value="' + escAttr(n.code) + '" placeholder="04-05"></div>' +
        '<div class="field"><label>类型</label><select data-field="kind">' +
          kinds.map(function (k) { return '<option value="' + k[0] + '"' + (n.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>X 坐标</label><input type="number" step="0.5" data-field="x" value="' + n.x + '"></div>' +
        '<div class="field"><label>Y 坐标</label><input type="number" step="0.5" data-field="y" value="' + n.y + '"></div>' +
      '</div>' +
      '<div class="field"><label>站名位置</label><select data-field="label.side">' +
        sides.map(function (s) { return '<option value="' + s[0] + '"' + ((L.side || 'right') === s[0] ? ' selected' : '') + '>' + s[1] + '侧</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>描述</label><textarea data-field="desc" rows="2">' + escText(n.desc) + '</textarea></div>' +
      '<div class="btnrow"><button class="ui" data-action="delete-node">删除该站点</button>' +
      '<button class="ui" data-action="focus">居中</button></div>' +
      '<div class="sep"></div>' + this._linesEditorHTML() + '</div>';
  };

  P._linesEditorHTML = function () {
    var lines = (this.data.lines || []).map(function (l) {
      return '<div class="row" style="align-items:end;margin-bottom:6px">' +
        '<div class="field" style="margin:0"><label>' + escText(l.name) + '</label>' +
        '<input data-line-name="' + escAttr(l.id) + '" value="' + escAttr(l.sub || '') + '"></div>' +
        '<div class="field" style="margin:0"><label>颜色</label>' +
        '<input type="color" data-line-color="' + escAttr(l.id) + '" value="' + escAttr(l.color || '#888888') + '" style="padding:2px;height:28px"></div>' +
        '</div>';
    }).join('');
    return '<div class="sec">线路样式</div>' + lines +
      '<div class="sep"></div><div class="sec">JSON 数据（可直接改）</div>' +
      '<div class="field"><textarea class="json" data-field="json" spellcheck="false">' + escText(JSON.stringify(this.data)) + '</textarea></div>' +
      '<div class="btnrow">' +
      '<button class="ui" data-action="apply-json">应用 JSON</button>' +
      '<button class="ui" data-action="download-json">下载</button>' +
      '<button class="ui" data-action="import-json">导入</button>' +
      '<button class="ui" data-action="reset-data">还原</button>' +
      '</div><input type="file" accept="application/json,.json" hidden data-role="file">';
  };

  P._syncXY = function () {
    var n = this.selectedId && this._nodeById(this.selectedId);
    if (!n || this.mode !== 'edit' || !this._panel) return;
    var xi = this._panel.querySelector('[data-field="x"]');
    var yi = this._panel.querySelector('[data-field="y"]');
    if (xi) xi.value = n.x;
    if (yi) yi.value = n.y;
  };

  P._bindPanel = function () {
    var self = this;
    var panel = this._panel;
    panel.onclick = function (e) {
      var btn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      var a = btn.getAttribute('data-action');
      if (a === 'close') self.select(null);
      else if (a === 'delete-node') self._deleteNode(self.selectedId);
      else if (a === 'focus') self.focusStation(self.selectedId);
      else if (a === 'copy-link') self._copyLink(self.selectedId);
      else if (a === 'apply-json') self._applyJson();
      else if (a === 'download-json') self.exportJSON();
      else if (a === 'import-json') { var f = panel.querySelector('[data-role="file"]'); if (f) f.click(); }
      else if (a === 'reset-data') self.resetData();
    };
    panel.oninput = function (e) {
      var el = e.target;
      var n = self.selectedId && self._nodeById(self.selectedId);
      if (el.dataset.field && n && el.dataset.field !== 'json') {
        var f = el.dataset.field;
        var v = el.value;
        if (f === 'x' || f === 'y') v = parseFloat(v) || 0;
        if (f.indexOf('label.') === 0) {
          n.label = n.label || {};
          n.label[f.split('.')[1]] = v;
        } else {
          n[f] = v;
        }
        self._scheduleRender();
        self._autosave();
      } else if (el.dataset.lineColor || el.dataset.lineName) {
        var idx = core.indexLines(self.data);
        var line = idx[el.dataset.lineColor || el.dataset.lineName];
        if (line) {
          if (el.dataset.lineColor) line.color = el.value; else line.sub = el.value;
          self._scheduleRender();
          self._autosave();
        }
      }
    };
    var file = panel.querySelector('[data-role="file"]');
    if (file) {
      file.onchange = function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try { self.setData(JSON.parse(String(reader.result))); }
          catch (err) { alert('JSON 解析失败：' + err.message); }
        };
        reader.readAsText(f);
      };
    }
  };

  /* ---------------- 编辑操作 ---------------- */
  P._addNodeAt = function (x, y) {
    var origin = JSON.stringify(this.data);
    var id = 'n_' + Date.now().toString(36);
    this.data.nodes.push({
      id: id, name: '新站点', nameEn: 'New Station',
      x: Math.round(x), y: Math.round(y), kind: 'station', label: { side: 'right' }
    });
    this.selectedId = id;
    this._nodeLineMap = null;
    this._nodeIndex = null;
    this._render();
    this._renderPanel();
    this._commit('新增站点', origin);
    this._emit('station-add', { id: id, node: this._nodeById(id) });
  };

  P._deleteNode = function (id) {
    if (!id) return;
    var origin = JSON.stringify(this.data);
    this.data.nodes = this.data.nodes.filter(function (n) { return n.id !== id; });
    (this.data.routes || []).forEach(function (r) { r.via = (r.via || []).filter(function (v) { return v !== id; }); });
    (this.data.links || []).forEach(function (l) {
      if (l.from === id) l.from = null;
      if (l.to === id) l.to = null;
    });
    this.data.links = (this.data.links || []).filter(function (l) { return l.from && l.to; });
    if (this.selectedId === id) this.selectedId = null;
    this._nodeLineMap = null;
    this._nodeIndex = null;
    this._render();
    this._renderPanel();
    this._commit('删除站点', origin);
    this._emit('station-delete', { id: id });
  };

  P._applyJson = function () {
    var ta = this._panel.querySelector('[data-field="json"]');
    if (!ta) return;
    try { this.setData(JSON.parse(ta.value)); }
    catch (e) { alert('JSON 解析失败：' + e.message); }
  };

  P._copyLink = function (id) {
    var url = location.href.split('#')[0] + '#station=' + encodeURIComponent(id);
    var self = this;
    var done = function () { self._emit('copied', { url: url }); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { prompt('复制链接：', url); });
    } else {
      prompt('复制链接：', url);
    }
  };

  /* ---------------- 撤销 / 重做 / 自动保存 ---------------- */
  P._commit = function (label, originJson) {
    if (originJson) {
      this._past.push(originJson);
      if (this._past.length > 60) this._past.shift();
      this._future.length = 0;
    }
    this._autosave();
    this._emit('edit-commit', { label: label, data: this.getData() });
    this._renderToolbar();
  };

  P.undo = function () {
    if (!this._past.length) return;
    this._future.push(JSON.stringify(this.data));
    this.data = JSON.parse(this._past.pop());
    this._nodeLineMap = null; this._nodeIndex = null;
    if (this.selectedId && !this._nodeById(this.selectedId)) this.selectedId = null;
    this._render(); this._renderPanel();
    this._emit('data-change', { data: this.getData(), reason: 'undo' });
  };

  P.redo = function () {
    if (!this._future.length) return;
    this._past.push(JSON.stringify(this.data));
    this.data = JSON.parse(this._future.pop());
    this._nodeLineMap = null; this._nodeIndex = null;
    this._render(); this._renderPanel();
    this._emit('data-change', { data: this.getData(), reason: 'redo' });
  };

  P._autosave = function () {
    var key = this._storageKey();
    if (!key) return;
    var self = this;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () {
      try { localStorage.setItem(key, JSON.stringify(self.data)); } catch (e) { /* 配额不足时忽略 */ }
    }, 350);
  };

  /* ---------------- 工具栏 ---------------- */
  P._renderToolbar = function () {
    var self = this;
    if (!this._barTL) return;
    if (this.mode === 'edit') {
      this._barTL.innerHTML =
        '<button class="ui" data-tool="select" aria-pressed="' + (this.tool === 'select') + '">选择/拖动</button>' +
        '<button class="ui" data-tool="add" aria-pressed="' + (this.tool === 'add') + '">＋ 添加站点</button>' +
        '<button class="ui" data-tool="delete" aria-pressed="' + (this.tool === 'delete') + '">删除</button>' +
        '<button class="ui" data-act="undo"' + (this._past.length ? '' : ' disabled') + '>撤销</button>' +
        '<button class="ui" data-act="redo"' + (this._future.length ? '' : ' disabled') + '>重做</button>';
      this._barTR.innerHTML =
        '<button class="ui" data-act="underlay" aria-pressed="' + this._underlayOn + '">描图</button>' +
        '<button class="ui" data-act="export-json">导出 JSON</button>' +
        '<button class="ui" data-act="export-svg">SVG</button>' +
        '<button class="ui" data-act="export-png">PNG</button>' +
        '<button class="ui ghost" data-act="mode-view">完成</button>';
    } else {
      this._barTL.innerHTML = '';
      this._barTR.innerHTML =
        '<button class="ui" data-act="zoom-in" title="放大">＋</button>' +
        '<button class="ui" data-act="zoom-out" title="缩小">－</button>' +
        '<button class="ui" data-act="fit">复位</button>' +
        '<button class="ui" data-act="mode-edit">编辑</button>';
    }
    var handler = function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.dataset.tool) { self.tool = b.dataset.tool; self._renderToolbar(); return; }
      var act = b.dataset.act;
      if (act === 'undo') self.undo();
      else if (act === 'redo') self.redo();
      else if (act === 'zoom-in') self._zoomCenter(1.3);
      else if (act === 'zoom-out') self._zoomCenter(1 / 1.3);
      else if (act === 'fit') self.resetView();
      else if (act === 'underlay') { self._underlayOn = !self._underlayOn; self._render(); }
      else if (act === 'mode-edit') self.setMode('edit');
      else if (act === 'mode-view') self.setMode('view');
      else if (act === 'export-json') self.exportJSON();
      else if (act === 'export-svg') self.exportSVG();
      else if (act === 'export-png') self.exportPNG();
    };
    this._barTL.onclick = handler;
    this._barTR.onclick = handler;
    this._hint.textContent = this.mode === 'edit'
      ? '拖动站点改位置 · 右侧改站名/线路色 · Ctrl+Z 撤销'
      : '点击站点看详情 · 滚轮缩放 · 拖动平移 · 双击复位';
  };

  /* ---------------- 公开 API ---------------- */
  P.setMode = function (m) {
    this.mode = (m === 'edit') ? 'edit' : 'view';
    if (this.mode === 'edit') { if (this.getAttribute('mode') !== 'edit') this.setAttribute('mode', 'edit'); }
    else if (this.getAttribute('mode')) this.removeAttribute('mode');
    this._render();
    this._renderPanel();
    this._emit('mode-change', { mode: this.mode });
  };

  P.setData = function (json, opts) {
    if (this.data) this._past.push(JSON.stringify(this.data));
    this._future.length = 0;
    this.data = json;
    this._nodeLineMap = null;
    this._nodeIndex = null;
    if (this.selectedId && !this._nodeById(this.selectedId)) this.selectedId = null;
    this._render();
    this._renderPanel();
    if (!opts || opts.emit !== false) this._emit('data-change', { data: this.getData(), reason: 'set' });
    this._autosave();
  };

  P.getData = function () { return JSON.parse(JSON.stringify(this.data)); };

  P.focusStation = function (id) {
    var n = id && this._nodeById(id);
    if (!n) return;
    var vb = this._vb();
    var k = Math.max(this.view.k, 2.4);
    this.view.k = k;
    this.view.tx = (vb[0] + vb[2] / 2) - n.x * k;
    this.view.ty = (vb[1] + vb[3] / 2) - n.y * k;
    this._applyView();
  };

  P.resetView = function () {
    this.view = { k: 1, tx: 0, ty: 0 };
    this._applyView();
  };

  /* 只显示部分线路：传 null 恢复全部，例如 setLineFilter(['l1']) */
  P.setLineFilter = function (visible) {
    if (!this.data) return;
    this.hiddenLines = {};
    if (visible && visible.length) {
      var self = this;
      (this.data.lines || []).forEach(function (l) {
        if (visible.indexOf(l.id) < 0) self.hiddenLines[l.id] = true;
      });
    }
    this._render();
    this._emit('line-filter', { visible: visible || null });
  };
  P.resetData = function () {
    var key = this._storageKey();
    if (key) { try { localStorage.removeItem(key); } catch (e) {} }
    if (this._initial) this.setData(JSON.parse(JSON.stringify(this._initial)));
  };

  /* ---------------- 导出 ---------------- */
  P.exportJSON = function () {
    this._download(new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }), 'nether-map-data.json');
    this._emit('export', { format: 'json' });
  };

  P._cleanSVG = function () {
    var clone = this._svg.cloneNode(true);
    var vp = clone.querySelector('.nm-viewport');
    if (vp) vp.setAttribute('transform', 'translate(0,0) scale(1)');
    [].forEach.call(clone.querySelectorAll('.is-dim, .is-hot'), function (el) {
      el.classList.remove('is-dim'); el.classList.remove('is-hot');
    });
    var sel = clone.querySelectorAll('.nm-selected-ring, .nm-focus, .nm-underlay');
    [].forEach.call(sel, function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  P.exportSVG = function () {
    this._download(new Blob([this._cleanSVG()], { type: 'image/svg+xml;charset=utf-8' }), 'nether-map.svg');
    this._emit('export', { format: 'svg' });
  };

  P.exportPNG = function (scale) {
    var self = this;
    var vb = this._vb();
    var s = scale || 2;
    var w = Math.round(vb[2] * s), h = Math.round(vb[3] * s);
    var svgText = this._cleanSVG();
    var url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = (self.themeName === 'dark') ? '#0f1115' : '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(function (blob) {
        self._download(blob, 'nether-map.png');
        self._emit('export', { format: 'png' });
      }, 'image/png');
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert('PNG 导出失败，请改用 SVG 导出。'); };
    img.src = url;
  };

  P._download = function (blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };

  /* ---------------- 注册 ---------------- */
  NM.NetherMapElement = NetherMapElement;
  NM.define = function () {
    if (!customElements.get('nether-map')) customElements.define('nether-map', NetherMapElement);
    return customElements.get('nether-map');
  };
  NM.define();
})(typeof window !== 'undefined' ? window : globalThis);
