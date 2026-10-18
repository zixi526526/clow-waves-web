# Clow Waves Web

Interactive, flowing ASCII waves and digital click ripples · 交互式 ASCII 字符流与数字涟漪

[![Animated preview of the actual Clow Waves Web ripple renderer](preview/demo.gif)](https://clow-waves-web.pages.dev/)

**[▶ Live Demo / 在线体验 — clow-waves-web.pages.dev](https://clow-waves-web.pages.dev/)**

> **Language / 语言：** Expand the language you want below; English is open by default. / 展开下方对应语言即可阅读完整文档，默认展开英文。

<details open>
<summary><strong>🇬🇧 English · Full README (default)</strong></summary>

## What it is

A drop-in **WebGL2 ASCII-wave background** with a Canvas 2D fallback. Flowing glyphs react to pointer movement; clicks produce expanding circular ripples, with a heart-shaped ripple every third click. No backend, third-party runtime package, or API key is needed.

This is a **standalone web adaptation of [Orgtree's Claude Waves](https://github.com/Maurdekye/orgtree/blob/main/docs/rust-engine/canvas-background-themes.md)**. The core mathematical field, glyph logic, ripple behavior, and WebGL renderer are substantially adapted from **Maurdekye's MIT-licensed work**, not originally invented by this project.

## Features

- Circular and heart-shaped click waves with flowing ASCII characters.
- Paper, warm ivory, and dark presets; customizable color, size, density, and speed.
- Responsive full-page or section backgrounds; mouse and touch input.
- Plain JavaScript and ESM/React integration; lifecycle cleanup and reduced-motion support.

## Quick start

Copy [`dist/digital-ripples.js`](dist/digital-ripples.js) into your site:

```html
<div id="waves" aria-hidden="true"
     style="position:fixed;inset:0;z-index:0;pointer-events:none"></div>
<main style="position:relative;z-index:1">Your content</main>

<script src="./digital-ripples.js"></script>
<script>
  const waves = new DigitalRipples('#waves', {
    preset: 'reference', // 'reference' | 'warm' | 'dark'
    shape: 'auto'        // 'auto' | 'ripple' | 'heart'
  });
</script>
```

The background doesn't intercept clicks on your content. The controller skips common interactive elements; mark other regions with `data-ripple-ignore` if needed. For isolated areas and React, see [section](examples/section.html), [vanilla](examples/vanilla.html), and [React](examples/ReactBackground.jsx) examples. The ESM build is [`dist/digital-ripples.module.js`](dist/digital-ripples.module.js).

## API and configuration

```js
await waves.ready;
waves.ripple(300, 200, { shape: 'heart' }); // local CSS pixels
waves.setOptions({ speed: 0.8, rippleOpacity: 0.35 });
waves.setPreset('warm');
waves.pause();
waves.resume();
waves.getStats();
waves.destroy(); // release events, timers, and GPU resources
```

| Option | Default | Purpose |
| --- | --- | --- |
| `preset` | `reference` | `reference`, `warm`, or `dark` |
| `shape` | `auto` | Circle → circle → heart; or force `ripple` / `heart` |
| `scale` | `1` | Overall glyph and ripple scale |
| `speed` | `1` | Wave and wind-field speed multiplier |
| `ambientOpacity` | `0.075` | Ambient character density |
| `rippleOpacity` | `0.4` | Ripple highlight and tail strength |
| `glyphPool` | `mixed` | `mixed`, `lettered`, or `figured` |
| `seed` | `526526` | Reproducible procedural pattern |
| `renderer` | `auto` | WebGL2 first, Canvas 2D fallback |
| `interactive`, `pointerWake` | `true` | Click/touch and pointer-trail interactions |
| `respectReducedMotion` | `true` | Honor system reduced-motion preference |
| `backgroundColor`, `inkColor`, `rippleColor` | Preset | Override individual colors |
| `fps`, `idleFps`, `idleAfter` | `60`, `25`, `180` | Frame pacing and settle timer (seconds) |

See [`dist/digital-ripples.module.d.ts`](dist/digital-ripples.module.d.ts) for additional typed options and the [`src/`](src/) implementation for internals. `window.ripplesDemo` is a demo-only interface and not required by your website.

## Build, test, and deploy

The prebuilt files are already in [`dist/`](dist/). To rebuild from source, use **Node.js ≥ 22.18**:

```bash
npm run build
npm run check
```

For your own static host, serve the contents of `dist/`. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for Cloudflare Pages configuration. An all-in-one offline example is [`digital-ripples-standalone.html`](digital-ripples-standalone.html).

## Credits and license

The fundamental effect is adapted from **[Maurdekye/orgtree](https://github.com/Maurdekye/orgtree)**. Copyright (c) 2026 Maurdekye, **MIT License**. Keep the original copyright and license notice when redistributing the adapted work. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PROVENANCE.md](PROVENANCE.md) for source files and reconstruction details.

**Unofficial community project. Not affiliated with, sponsored, or endorsed by Anthropic.** Claude and Anthropic are trademarks of their respective owner. This repository does not distribute Anthropic's proprietary application files or official recordings. Visual similarity does not imply authorization by Anthropic.

</details>

<details>
<summary><strong>🇨🇳 简体中文 · 完整 README</strong></summary>

## 项目介绍

这是一个可以直接嵌入网页的 **WebGL2 ASCII 字符波纹背景**，并提供 Canvas 2D 降级渲染。字符随风场流动，鼠标移动产生扰动，点击生成扩散圆形波纹；每第三次点击会生成心形波纹。**不需要后端、第三方运行时依赖或 API 密钥。**

本项目是 **[Orgtree 的 Claude Waves](https://github.com/Maurdekye/orgtree/blob/main/docs/rust-engine/canvas-background-themes.md) 的独立网页移植版**。核心风场数学、字符选择、波纹行为及 WebGL 渲染主要改编自 **Maurdekye 以 MIT 许可证公开的工作**，并非本项目原创。

## 功能特点

- 流动 ASCII 字符与点击扩散的圆形、心形波纹。
- 纸白、暖白、深色主题；可调整颜色、尺寸、浓度与速度。
- 支持全屏或局部背景、鼠标及触屏交互。
- 支持普通 JavaScript、ESM / React 接入，具备资源清理与减少动态效果支持。

## 快速接入

将 [`dist/digital-ripples.js`](dist/digital-ripples.js) 复制到你的网站：

```html
<div id="waves" aria-hidden="true"
     style="position:fixed;inset:0;z-index:0;pointer-events:none"></div>
<main style="position:relative;z-index:1">你的网页内容</main>

<script src="./digital-ripples.js"></script>
<script>
  const waves = new DigitalRipples('#waves', {
    preset: 'reference', // 'reference' | 'warm' | 'dark'
    shape: 'auto'        // 'auto' | 'ripple' | 'heart'
  });
</script>
```

背景不会拦截前景按钮、链接等交互；控制器自动忽略常见可点击元素。其他不希望触发波纹的区域可加入 `data-ripple-ignore`。局部背景、普通网页与 React 示例分别参见：[section](examples/section.html)、[vanilla](examples/vanilla.html)、[React](examples/ReactBackground.jsx)。ESM 构建产物位于 [`dist/digital-ripples.module.js`](dist/digital-ripples.module.js)。

## API 与配置

```js
await waves.ready;
waves.ripple(300, 200, { shape: 'heart' }); // 容器内 CSS 像素
waves.setOptions({ speed: 0.8, rippleOpacity: 0.35 });
waves.setPreset('warm');
waves.pause();
waves.resume();
waves.getStats();
waves.destroy(); // 释放事件、定时器和 GPU 资源
```

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `preset` | `reference` | `reference` 纸白、`warm` 暖白、`dark` 深色 |
| `shape` | `auto` | 圆 → 圆 → 心，或固定 `ripple` / `heart` |
| `scale` | `1` | 字符和波纹整体尺度 |
| `speed` | `1` | 风场与波纹速度倍率 |
| `ambientOpacity` | `0.075` | 背景字符浓度 |
| `rippleOpacity` | `0.4` | 波纹高光及残影强度 |
| `glyphPool` | `mixed` | `mixed`、`lettered` 或 `figured` |
| `seed` | `526526` | 固定随机种子，便于重现 |
| `renderer` | `auto` | 优先 WebGL2，失败时降级 Canvas 2D |
| `interactive`、`pointerWake` | `true` | 点击/触屏及鼠标尾迹交互 |
| `respectReducedMotion` | `true` | 遵循系统减少动态效果设置 |
| `backgroundColor`、`inkColor`、`rippleColor` | 预设值 | 分别覆盖各项颜色 |
| `fps`、`idleFps`、`idleAfter` | `60`、`25`、`180` | 帧率调度和自动平静时间（秒） |

完整类型及更多参数见 [`dist/digital-ripples.module.d.ts`](dist/digital-ripples.module.d.ts)，实现原理见 [`src/`](src/)；`window.ripplesDemo` 仅用于展示页，实际网页无需使用它。

## 构建、测试及部署

[`dist/`](dist/) 中已包含构建产物。修改源码后重新构建需要 **Node.js ≥ 22.18**：

```bash
npm run build
npm run check
```

自己的静态网站直接托管 `dist/` 内容即可；Cloudflare Pages 配置参见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。也提供无需联网或安装的 [`digital-ripples-standalone.html`](digital-ripples-standalone.html) 单文件演示。

## 来源、版权与许可

核心特效改编自 **[Maurdekye/orgtree](https://github.com/Maurdekye/orgtree)**。Copyright (c) 2026 Maurdekye，采用 **MIT License**。再次分发时须保留原作者版权与许可声明。详细来源、原始文件和还原过程参见 [LICENSE](LICENSE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [PROVENANCE.md](PROVENANCE.md)。

**本项目为社区非官方作品，与 Anthropic 无隶属、赞助或认可关系。** Claude 和 Anthropic 为其权利人持有的商标。本仓库不分发 Anthropic 的闭源程序或官方录屏，视觉相似不代表获得 Anthropic 授权。

</details>