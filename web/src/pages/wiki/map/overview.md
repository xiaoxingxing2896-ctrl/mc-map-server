---
layout: ../../../layouts/WikiLayout.astro
title: 坐标准则
tag: MAP / 坐标
description: 坐标怎么写、F3 怎么看、设施之间的相对位置，以及为什么地图上的方块只是示意图。
---

在这个服务器里，「在哪里」永远用三个数字回答：**x / y / z**。写错顺序、抄漏负号，人就会跑到几万格以外。

这一页讲怎么看坐标、怎么写坐标，以及一张把设施位置画在一起的示意图。

## 坐标怎么读

按 **F3** 打开调试界面，左上角会有一行 `XYZ`，三个数字依次是：

| 轴 | 含义 | 正方向 |
| --- | --- | --- |
| x | 东西方向 | 向东为正 |
| y | 高度 | 向上为正，海平面约 63 |
| z | 南北方向 | 向南为正 |

<div class="wiki-callout"><strong>顺序永远是 x / y / z。</strong>别看反了。报坐标时用斜杠分开最不容易出错，例如 <code>23 / 65 / 589</code>。</div>

### 几个容易搞错的地方

- **负坐标要带负号。** 出生点以西、以北都是负数，抄的时候别丢。
- **y 是高度，不是「第几层」。** 说「往下 20 格」的时候，指的是 y 减 20。
- **主世界的 1 格 ≠ 下界的 1 格。** 下界走 1 格等于主世界 8 格，所以地狱交通比走路快得多。
- **同一个位置改了地形，坐标不会变。** 但看起来完全不同，不要以为自己走错了。

## 设施分布示意图

下图把主要设施画在一张网格上，方块上的数字对应 [设施总表](/wiki/facilities/) 的编号，点方块可以直接跳到设施页面。

<svg class="wiki-map" viewBox="0 0 780 420" aria-label="服务器设施分布示意图">
<defs><pattern id="wikiMapGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="var(--line)" stroke-width="1" opacity=".5"/></pattern></defs>
<rect class="wiki-map-bg" x="24" y="24" width="732" height="372" rx="20"/>
<rect x="24" y="24" width="732" height="372" rx="20" fill="url(#wikiMapGrid)"/>
<path class="wiki-map-link" d="M234 302 C 262 302 276 262 300 232"/>
<path class="wiki-map-link" d="M500 238 C 530 238 542 280 566 296"/>
<path class="wiki-map-link" d="M400 160 C 440 160 470 122 520 120"/>
<path class="wiki-map-link" d="M300 196 C 292 172 282 162 270 140"/>
<a href="/wiki/start/02-first-hour/" aria-label="出生区：新手起点与复活点">
<rect class="wiki-map-block" x="64" y="250" width="170" height="105" rx="16"/>
<circle class="wiki-map-badge" cx="64" cy="250" r="15"/>
<text class="wiki-map-num" x="64" y="254.5" text-anchor="middle">01</text>
<text class="wiki-map-label" x="149" y="300.5" text-anchor="middle">出生区</text>
<text class="wiki-map-sub" x="149" y="322.5" text-anchor="middle">起点 / 复活点</text>
</a>
<a href="/wiki/facilities/villager-hall/" aria-label="村民交易所">
<rect class="wiki-map-block" x="300" y="160" width="200" height="130" rx="16"/>
<circle class="wiki-map-badge" cx="300" cy="160" r="15"/>
<text class="wiki-map-num" x="300" y="164.5" text-anchor="middle">02</text>
<text class="wiki-map-label" x="400" y="223" text-anchor="middle">村民交易所</text>
<text class="wiki-map-sub" x="400" y="245" text-anchor="middle">附魔书 / 工具 / 护甲</text>
</a>
<a href="/wiki/facilities/iron-farm/" aria-label="铁农场">
<rect class="wiki-map-block" x="566" y="250" width="150" height="105" rx="16"/>
<circle class="wiki-map-badge" cx="566" cy="250" r="15"/>
<text class="wiki-map-num" x="566" y="254.5" text-anchor="middle">03</text>
<text class="wiki-map-label" x="641" y="300.5" text-anchor="middle">铁农场</text>
<text class="wiki-map-sub" x="641" y="322.5" text-anchor="middle">铁锭</text>
</a>
<a href="/wiki/facilities/mob-farm/" aria-label="经验农场">
<rect class="wiki-map-block" x="520" y="64" width="196" height="88" rx="16"/>
<circle class="wiki-map-badge" cx="520" cy="64" r="15"/>
<text class="wiki-map-num" x="520" y="68.5" text-anchor="middle">04</text>
<text class="wiki-map-label" x="618" y="106" text-anchor="middle">经验农场</text>
<text class="wiki-map-sub" x="618" y="128" text-anchor="middle">小黑塔 / 猪人塔</text>
</a>
<a href="/wiki/map/overview/" aria-label="下界与末地站点">
<rect class="wiki-map-block" x="90" y="64" width="180" height="96" rx="16"/>
<circle class="wiki-map-badge" cx="90" cy="64" r="15"/>
<text class="wiki-map-num" x="90" y="68.5" text-anchor="middle">05</text>
<text class="wiki-map-label" x="180" y="110" text-anchor="middle">下界与末地站点</text>
<text class="wiki-map-sub" x="180" y="132" text-anchor="middle">3 · 7 · 8 号线</text>
</a>
<text class="wiki-map-sub" x="726" y="386" text-anchor="end">X → 东　Z ↓ 南</text>
</svg>

<!-- 本示意图与 /wiki/ 首页的「设施分布图」为同一份内联 SVG，改动时请同步两处。 -->

<p class="wiki-figcaption">示意图，坐标与设施以设施手册为准。方块之间的相对位置只表示「大致在同一片区域」，不代表真实方位和距离。</p>

## 图例

<div class="wiki-grid">
<a class="wiki-card" href="/wiki/start/02-first-hour/"><span class="section-tag">01 / 主城</span><h3>出生区</h3><p>第一落脚点。别在这里盖房子，也别砍周围的树。</p></a>
<a class="wiki-card" href="/wiki/facilities/villager-hall/"><span class="section-tag">02 / 主城</span><h3>村民交易所</h3><p>入口坐标 23 / 65 / 589。附魔书、工具、护甲，以及附魔房。</p></a>
<a class="wiki-card" href="/wiki/facilities/iron-farm/"><span class="section-tag">03 / 待补充</span><h3>铁农场</h3><p>铁锭来源。是否对外开放、能不能挂机，以群公告为准。</p></a>
<a class="wiki-card" href="/wiki/facilities/mob-farm/"><span class="section-tag">04 / 末地与下界</span><h3>经验农场</h3><p>小黑塔和猪人塔，都用 <code>/warp</code> 直达，30 级前效率最高。</p></a>
<a class="wiki-card" href="/wiki/facilities/mob-farm/"><span class="section-tag">05 / 交通</span><h3>下界与末地站点</h3><p>地狱交通 3、7、8 号线的换乘点，去末地农场从这里走。</p></a>
</div>

## 怎么到达

三种方式，按省事程度排：

1. **`/warp 名称`**：最快的办法，能把人直接送到农场门口。已确认可用的传送点见 [常用指令](/wiki/start/04-commands/)。
2. **地狱交通**：从交易所的地狱门进下界，沿线路走到对应的站点。下界 1 格等于主世界 8 格，走起来比在主世界跑快得多。
3. **走路**：适合几百格以内的距离。走的时候用 F3 盯坐标，别只靠地形记忆——同一片森林有几百片。

<div class="wiki-callout"><strong>沿主路走。</strong>主城有铺设好的道路，路上通常有牌子写方向和距离。走野地容易掉进别人挖的矿洞或者沟里。</div>

## 报坐标的格式

报坐标、报位置、报机器出问题，统一用这个格式：

```
位置：主城 · 交易所地下附魔房
坐标：23 / 65 / 589（入口）
现象：右键附魔台没有反应
```

<div class="wiki-callout"><strong>只给 x 和 z 不够。</strong>少了 y，别人可能在你头顶 30 格的地方转半天。地下设施一定带上 y。</div>

## 常见问题

| 现象 | 原因 | 怎么处理 |
| --- | --- | --- |
| 按坐标走过去是一片空地 | 少抄了负号，或把 x / z 写反了 | 重新确认三个数字和顺序 |
| 到了坐标但看不到入口 | 入口在地下，y 对不上 | 往 y 的方向挖/走几格，或问一下入口在哪 |
| 下界坐标和主世界对不上 | 两边比例是 8 倍 | 换算之后再走，或者直接走传送门 |
| 地图上的方块位置和实际不符 | 这张图只是示意图 | 以 [设施总表](/wiki/facilities/) 里的坐标为准 |

更多换乘路线可以看站内的转运页 [/transit/](/transit/)（如已上线）。
