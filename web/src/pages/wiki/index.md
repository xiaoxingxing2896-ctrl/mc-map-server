---
layout: ../../layouts/WikiLayout.astro
title: 服务器 Wiki
tag: SERVER WIKI
description: 从「怎么进服」到「一座农场怎么用」，把服务器里口口相传的规矩、指令和设施整理成随时能查的页面。
---

这里是「一辈子存档」的服务器 Wiki。老玩家嘴里的黑话、群公告里翻不到的细节、某个拉杆到底往哪边推——尽量都记在这里。

第一次来，建议按 **新手线** 的顺序从 01 读到 05；已经在服里玩了一阵，可以直接翻 **设施手册** 或 **参考**。

<div class="wiki-grid">
<a class="wiki-card" href="/wiki/start/"><span class="section-tag">START / 新手线</span><h3>新手线</h3><p>进服、第一个小时、服务器规则、常用指令，五页读完基本能自己活下去。</p></a>
<a class="wiki-card" href="/wiki/facilities/"><span class="section-tag">FACILITIES / 设施手册</span><h3>设施手册</h3><p>交易所、铁农场、经验农场怎么用，哪些东西能拿，哪些千万不能碰。</p></a>
<a class="wiki-card" href="/wiki/map/overview/"><span class="section-tag">MAP / 坐标准则</span><h3>坐标准则</h3><p>坐标怎么写、F3 怎么看、设施分布示意图，以及怎么到达目的地。</p></a>
</div>

## 设施分布图

把主要设施画在一张网格上，方块上的数字对应 [设施总表](/wiki/facilities/) 的编号，点方块直接跳转。

<!-- 本示意图与 /wiki/map/overview/ 的「设施分布示意图」为同一份内联 SVG，改动时请同步两处。 -->

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

<p class="wiki-figcaption">示意图，坐标与设施以设施手册为准。相对位置只表示大致区域，不代表真实方位与距离。完整说明见 <a href="/wiki/map/overview/">坐标准则</a>。</p>

## 这本 Wiki 怎么读

新手线是**顺序阅读**的教程：每页都有「下一步」，读完 05 页你会知道规矩、指令和该找谁。

设施手册是**按设施查**的手册：每座公共设施一页，写清楚用途、使用方法、维护状态和不能做的事。地址、产量、负责人这类信息在陆续补齐，还没确认的地方会明确标注「待补充」或「以群公告为准」。

参考是**随手翻**的资料：术语表解释生电服黑话，装备与附魔是从服务器《新手教程》里提炼的完整攻略，变更日志记录 Wiki 和公开资料的改动。

## 几条通用的约定

<div class="wiki-callout"><strong>不确定的事，以群公告为准。</strong>服务器地址、游戏版本、白名单、管理员名单这类会变的信息不写死在 Wiki 里，请以群公告和群置顶为准。</div>

<div class="wiki-callout"><strong>公共设施按需索取。</strong>仓库和农场的物资是大家的，不是免费的无限资源。拿够用就好，损坏了立刻在群里说。</div>

看完全部内容，还有一条最重要的：**发现有人在拆机器或者卡服，先离开那个区块再报告**，不要上手去「帮忙修」。

## 全部页面

- **新手线**：[总览](/wiki/start/) · [01 加入服务器](/wiki/start/01-join/) · [02 第一个小时](/wiki/start/02-first-hour/) · [03 服务器规则](/wiki/start/03-rules/) · [04 常用指令](/wiki/start/04-commands/) · [05 去哪问人](/wiki/start/05-where-to-ask/)
- **设施手册**：[总表](/wiki/facilities/) · [村民交易所](/wiki/facilities/villager-hall/) · [铁农场](/wiki/facilities/iron-farm/) · [刷怪与经验农场](/wiki/facilities/mob-farm/)
- **地图**：[设施分布图](/wiki/map/overview/)
- **参考**：[术语表](/wiki/reference/glossary/) · [装备与附魔](/wiki/reference/gear/) · [变更日志](/wiki/reference/changelog/) · [反馈与报错](/wiki/reference/report/)

## 维护与勘误

Wiki 由服内玩家整理，内容来自群公告、管理员说明和《新手教程》原文。发现有写错、过期或者缺页的地方，请按 [反馈与报错](/wiki/reference/report/) 里的格式提出来，不要直接在页面上改数字——一处坐标写错，可能让新人白跑半个小时。

想补一座设施的页面时，复制 [设施页模板](/wiki/facilities/) 里说明的格式即可；模板文件在仓库的 `web/src/pages/wiki/facilities/_template.md`。
