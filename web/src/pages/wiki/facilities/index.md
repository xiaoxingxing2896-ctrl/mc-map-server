---
layout: ../../../layouts/WikiLayout.astro
title: 设施总表
tag: FACILITIES / 总表
description: 服务器上所有对外开放的公共设施一览，可按状态筛选、按名称或区域搜索。
---

公共设施是服务器的家底：谁建的、怎么用、什么时候能进，都在这一页。点设施名进入详细页面，看具体的使用方法和注意事项。

<div class="wiki-callout"><strong>坐标、产量、负责人还在补。</strong>标成「待补充」的格子不是没有，而是还没核实。急用请直接在群里问，别照着空地挖。</div>

<div class="wiki-toolbar">
<div class="wiki-filters" role="group" aria-label="按状态筛选">
<button type="button" class="wiki-chip" data-filter="all" aria-pressed="true">全部</button>
<button type="button" class="wiki-chip" data-filter="open" aria-pressed="false">已开放</button>
<button type="button" class="wiki-chip" data-filter="wip" aria-pressed="false">建设中</button>
<button type="button" class="wiki-chip" data-filter="todo" aria-pressed="false">待补充</button>
</div>
<input type="search" class="wiki-search" data-filter-search placeholder="搜索设施名或区域…" aria-label="搜索设施名或区域" autocomplete="off" />
</div>

<div class="wiki-table-wrap">
<table class="wiki-table">
<thead><tr><th>编号</th><th>设施</th><th>区域</th><th>坐标</th><th>状态</th><th>产出 / 用途</th><th>负责人</th><th>备注</th></tr></thead>
<tbody>
<tr data-status="open" data-search="村民交易所 交易所 附魔书 主城 地下"><td>01</td><td><a href="/wiki/facilities/villager-hall/">村民交易所</a></td><td>主城 · 地下</td><td>23 / 65 / 589（入口）</td><td>已开放</td><td>附魔书、工具、护甲、书架</td><td>待补充</td><td>严禁击杀村民与破坏装备</td></tr>
<tr data-status="open" data-search="附魔房 附魔台 青金石 交易所 主城"><td>02</td><td>附魔房</td><td>交易所内</td><td>待补充</td><td>已开放</td><td>附魔台、青金石</td><td>待补充</td><td>与交易所同一区域，青金石在箱子里</td></tr>
<tr data-status="open" data-search="小黑塔 末地 经验农场 末影人 经验"><td>03</td><td><a href="/wiki/facilities/mob-farm/">末地小黑塔</a></td><td>末地 · 7、8 号线交汇</td><td>待补充（<code>/warp 小黑塔</code>）</td><td>已开放</td><td>经验</td><td>待补充</td><td>建议带横扫之刃的剑</td></tr>
<tr data-status="open" data-search="猪人塔 僵尸猪灵 下界 三号线 经验农场 经验 金"><td>04</td><td><a href="/wiki/facilities/mob-farm/">僵尸猪灵塔</a></td><td>下界 · 三号线</td><td>待补充（<code>/warp 猪人塔</code>）</td><td>已开放</td><td>经验、金锭</td><td>待补充</td><td>使用前确认拉杆状态</td></tr>
<tr data-status="todo" data-search="铁农场 铁锭 铁"><td>05</td><td><a href="/wiki/facilities/iron-farm/">铁农场</a></td><td>待补充</td><td>待补充</td><td>待补充</td><td>铁锭</td><td>待补充</td><td>是否对外开放以群公告为准</td></tr>
<tr data-status="todo" data-search="刷怪塔 怪物 掉落物 经验"><td>06</td><td>刷怪塔</td><td>待补充</td><td>待补充</td><td>待补充</td><td>待补充</td><td>待补充</td><td>待补充</td></tr>
</tbody>
</table>
</div>

<p class="wiki-filter-empty" data-filter-empty hidden>没有匹配的设施。换个关键词，或者点「全部」看完整列表。</p>

<script is:inline>
  (function () {
    var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
    var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-status]'));
    var search = document.querySelector('[data-filter-search]');
    var empty = document.querySelector('[data-filter-empty]');
    if (!rows.length) return;
    var active = 'all';
    function apply() {
      var q = ((search && search.value) || '').trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var okStatus = active === 'all' || row.getAttribute('data-status') === active;
        var okText = !q || (row.getAttribute('data-search') || '').toLowerCase().indexOf(q) !== -1;
        var show = okStatus && okText;
        row.hidden = !show;
        if (show) shown++;
      });
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', chip.getAttribute('data-filter') === active ? 'true' : 'false');
      });
      if (empty) empty.hidden = shown > 0;
    }
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        active = chip.getAttribute('data-filter');
        apply();
      });
    });
    if (search) search.addEventListener('input', apply);
    apply();
  })();
</script>

## 列是什么意思

| 列 | 说明 |
| --- | --- |
| 编号 | 对应 [设施分布图](/wiki/map/overview/) 上的徽标数字，方便对照 |
| 区域 | 主城、下界、末地，或者「待补充」 |
| 坐标 | 按 x / y / z 的顺序写，入口坐标而不是机器中心 |
| 状态 | 已开放＝可以自行使用；建设中＝未完工，不要动；待补充＝信息还没核实 |
| 产出 / 用途 | 能拿到什么，或者能在这里做什么 |
| 负责人 | 建这座设施的人，出问题找他最快 |

## 使用设施的通用规矩

- **按需取用。** 一次拿够当前用量，不要清空箱子。
- **走的时候复位。** 拉杆、按钮、门、漏斗矿车，恢复成你看到的样子。
- **坏了立刻说。** 在群里报设施名、坐标和现象，不要自己拆开修。
- **不要在设施旁边建同类机器。** 刷怪上限和区块加载会互相抢。

## 怎么补一座设施的页面

新增设施页时，复制 `web/src/pages/wiki/facilities/_template.md`，把文件名改成设施名（不要用下划线开头，下划线开头的文件不会生成页面），然后：

1. 填 frontmatter 里的 `title`、`tag`、`description`。
2. 把「待补充」换成核实过的信息，没核实的保持原样。
3. 回到这一页，在表格里加一行，带上 `data-status` 和 `data-search` 两个属性——筛选和搜索就是靠它们工作的。
4. 在 [设施分布图](/wiki/map/overview/) 的编号列表里补一条。

<div class="wiki-callout"><strong>不要写没核实的东西。</strong>一个错误的坐标会让新人白跑半小时，也会让后面维护的人不敢相信这一页。</div>
