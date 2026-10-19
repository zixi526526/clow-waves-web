# Clow Waves Web

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

Interactive, flowing ASCII waves and digital click ripples — a standalone, embeddable web background.

[![Clow Waves preview](preview/demo.gif)](https://fluxarium.pages.dev/effects/clow-waves/)

**[▶ Demo](https://fluxarium.pages.dev/effects/clow-waves/)** — Interactive preview and controls on Fluxarium.

This repository provides the reusable renderer, source code and integration examples. The core ripple mathematics, glyph field and WebGL renderer are adapted from the MIT-licensed [Maurdekye/orgtree](https://github.com/Maurdekye/orgtree).

## Minimal integration: plain HTML

Copy **`dist/digital-ripples.js`** into your website and add:

```html
<div id="ripples" aria-hidden="true"
     style="position:fixed;inset:0;z-index:0;pointer-events:none"></div>

<main style="position:relative;z-index:1">
  <!-- Your normal page content, links, buttons, and forms -->
</main>

<script src="./digital-ripples.js"></script>
<script>
  const effect = new DigitalRipples('#ripples', {
    preset: 'reference',
    shape: 'auto',
  });
</script>
```

The controller listens for pointer events on the current document and converts coordinates relative to the container, so the background may keep `pointer-events:none`. Links, buttons, input fields, selects, and `contenteditable="true"` regions are skipped automatically. Add **`data-ripple-ignore`** to any additional region or custom editable control to exclude its clicks. The component does not prevent normal scrolling, text selection, or form behavior.

An opaque foreground background will hide the effect underneath it. Arrange the stacking order appropriately and use transparent foreground regions where the waves should remain visible.

Complete example: [`examples/vanilla.html`](examples/vanilla.html).

## Use within a section

Give the parent `position:relative`, stretch the background absolutely, and lay out foreground content normally:

```html
<section style="position:relative;height:500px">
  <div id="hero-ripples" aria-hidden="true"
       style="position:absolute;inset:0;pointer-events:none"></div>
  <div style="position:relative;z-index:1">Your homepage content</div>
</section>
<script src="./digital-ripples.js"></script>
<script>
  const hero = new DigitalRipples('#hero-ripples', { preset: 'warm' });
</script>
```

See [`examples/section.html`](examples/section.html) for a full scrolling example. Rendering pauses while the section is outside the viewport and resumes when it returns; click coordinates follow the container's current position.

## React / Next.js / Vite

Copy `dist/digital-ripples.module.js` and its corresponding `.d.ts` file into your project, then consult [`examples/ReactBackground.jsx`](examples/ReactBackground.jsx). The standalone ESM build does not require a `window` global at import time and is safe to import in SSR environments, but instances must be created after the browser component mounts.

```jsx
'use client';
import { useEffect, useRef } from 'react';
import { DigitalRipples } from './digital-ripples.module.js';

export default function Background() {
  const host = useRef(null);
  useEffect(() => {
    const effect = new DigitalRipples(host.current, { preset: 'reference' });
    return () => effect.destroy();
  }, []);
  return <div ref={host} aria-hidden="true"
    style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}
```

Do not instantiate the effect inside React's render function. Call `destroy()` on route changes or unmounting to avoid orphaned listeners and render loops.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `preset` | `'reference'` | Paper-white `'reference'`, warm ivory `'warm'`, or dark `'dark'` |
| `shape` | `'auto'` | Cycles circle, circle, heart; or force `'ripple'` / `'heart'` |
| `glyphPool` | `'mixed'` | Ordered glyph pools: `'mixed'` / `'lettered'` / `'figured'` |
| `scale` | `1` | Overall glyph, scene, and ripple scale; 0.45–2.5 |
| `speed` | `1` | Shared multiplier for wind field, glyph changes, and ripples; 0.15–3 |
| `ambientOpacity` | `0.075` | Relative ambient density; 0–0.6 (not final CSS alpha) |
| `rippleOpacity` | `0.4` | Relative ripple highlight and residual trail strength; 0–1 |
| `backgroundColor` | Preset | Six-digit hexadecimal; `null` retains the host background |
| `inkColor` | Preset | Ambient glyph color, six-digit hexadecimal |
| `rippleColor` | Preset | Ripple color, six-digit hexadecimal |
| `seed` | `526526` | Fixed pseudorandom seed for reproducible fields under the same conditions |
| `interactive` | `true` | Mouse/touch input; programmatic `ripple()` still works when disabled |
| `pointerWake` | `true` | Fast pointer movement leaves a wake; touch movement does not |
| `respectReducedMotion` | `true` | Displays a static glyph field when reduced motion is requested |
| `maxDpr` | `2` | Maximum device pixel ratio; buffer also capped at about 21 million pixels |
| `fps` | `60` | Target active frame rate, not guaranteed hardware FPS |
| `idleFps` | `25` | Target ambient-only frame rate |
| `idleAfter` | `180` | Seconds of inactivity before settling; `0` keeps animating while visible |
| `introDuration` | `1.5` | Initial fade-in duration in seconds; `0` skips it |
| `renderer` | `'auto'` | Try WebGL2 then Canvas 2D; either can be requested explicitly |
| `fontFamily` | System monospace stack | Typeface affects glyph outlines and visual density |
| `calmCentre` | `[0.5, 0.45]` | Proportional position of the calmer center area |
| `calmRadii` | `[250, 80]` | Horizontal/vertical calm-area radii in logical scene pixels |
| `eventTarget` | Current document | Custom pointer event target set in the constructor |

Reference video dimensions, zoom levels, and sampling influence the apparent glyph grid. Approximate measured cells were 7 × 14 pixels in the first recording and 8.75 × 17.5 pixels in the second. Start with the default scale; if the second recording appears larger at the same viewport size, try `scale: 1.25`.

## API and lifecycle

```js
await effect.ready;                     // Initialization done; inspect getStats().renderer/phase
effect.ripple(300, 200);                // Container-local CSS pixels
effect.ripple(500, 260, { shape: 'heart', strength: 1 });
effect.setOptions({ speed: 0.8, ambientOpacity: 0.06 });
effect.setPreset('warm');               // Switch preset and clear active ripples
effect.pause();
effect.resume();
effect.clear();                         // Clear ripples/trails and reset click counter
console.log(effect.getOptions());
console.log(effect.getStats());
effect.destroy();                       // Release GPU, listeners, observers, timers
```

`ready` resolves after asynchronous initialization. If neither rendering context is available, the component emits an `error` event and `getStats().phase` becomes `unavailable`. A too-small, invisible, or destroyed container is not rendered. Changing the font, glyph pool, seed, or renderer rebuilds internal resources and refreshes `effect.ready` with the current initialization Promise.

Host element events: `ready`, `ripple`, `statechange`, `error`. A `ripple` event's `detail` contains `{ x, y, shape, count }`.

The controller handles `document.visibilitychange`, container resizing, entering/leaving the viewport, and WebGL context loss/recovery. `pause()` is explicit: clicking will not undo it; call `resume()` first.

## Deterministic rendering and screenshots

```js
await effect.ready;
effect.renderAt(8, [
  { at: 7.2, x: 640, y: 400, shape: 'heart', strength: 1 }
]);
// Frozen at t=8s, when the heart ripple is 0.8s old.
effect.resume();
```

`renderAt()` renders an explicit frozen comparison frame; it does not start playback.

## Implementation and upstream references

The implementation uses a fixed glyph grid, multiscale moving wind field, glyph-specific transformation rates, direction-dependent stroke illumination, click-driven field displacement, an outer wavefront, inner repeating bands, and fading blue trails. The U-shaped curves visible inside waves result from the wave bands interacting with the wind field: no separate eyes or mouth icons are added.

This project adapts the MIT-licensed [Maurdekye/orgtree](https://github.com/Maurdekye/orgtree) implementation. The upstream project was created with reference to Claude Desktop's **Claude Waves** animated background. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PROVENANCE.md](PROVENANCE.md) for attribution and licensing details.

Selected propagation parameters:

```text
Wavefront radius R(t) = 620 × (1 − exp(−t / 1.3))
Band width W(t) = 85 + 60t
Inner periodic ring spacing = 130 logical pixels
Per-click event lifetime = 3.6 seconds
At most 6 stored clicks and 48 pointer-trail segments
```

These produce initially quick, then slower expansion, thicker bands, inner arcs, and fading residual traces. The strongest visible waves tend to fade well before the stored event expires.

The two light presets approximate the recordings' backgrounds and appearance; the dark preset is an additional option for personal websites. The Canvas 2D fallback uses the same field mathematics but samples more sparsely and approximates stroke illumination, so its visual precision and frame rate are lower than WebGL2. Use WebGL2 for the closest rendering.

## Build, hosting, and files

No package manager is required to run the prebuilt artifacts. You only need **Node.js 22.18+** when rebuilding `dist/` after changing `src/`:

```bash
npm run build
npm run check
```

The build uses Node's built-in type-stripping functionality and no third-party build dependencies. An `ExperimentalWarning: stripTypeScriptTypes` message is a Node API warning.

Deploy `dist/` to any static host or web server, including Nginx, Caddy, Apache, and existing frontend applications. The effect does not call a backend, transmit typed input or pointer coordinates, or require an API key; rendering happens on the visitor's device. See [DEPLOYMENT.md](DEPLOYMENT.md) for build and hosting details.

| File | Purpose |
| --- | --- |
| [`dist/digital-ripples.js`](dist/digital-ripples.js) | Classic `<script>` build exposing `window.DigitalRipples` |
| [`dist/digital-ripples.module.js`](dist/digital-ripples.module.js) / `.d.ts` | Standalone ESM and TypeScript declarations |
| `src/field.ts` / `gl.ts` | Wind-field math and WebGL2 pipeline |
| `src/controller.js` / `fallback.js` | Component lifecycle and Canvas 2D fallback |
| [`examples/`](examples/) | Plain HTML, scoped sections, and React integrations |
| `scripts/build.mjs` | Reproducible distribution builds |
| [`LICENSE`](LICENSE) / [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | MIT license and detailed upstream notices |
| [`VALIDATION.md`](VALIDATION.md) | Checks performed and verification scope |

## Credits, license, and trademarks

The core effect was **substantially adapted from [Maurdekye/orgtree](https://github.com/Maurdekye/orgtree)**. Copyright (c) 2026 Maurdekye, MIT License. Keep the copyright and license notice when distributing adapted code. Consult [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PROVENANCE.md](PROVENANCE.md) for the specific upstream sources and attribution details.

**This is an unofficial community project, not affiliated with, sponsored, or endorsed by Anthropic.** Claude and Anthropic are trademarks of their respective owner. This repository does not distribute Anthropic's proprietary application files or official recordings; visual similarity does not imply Anthropic authorization.
