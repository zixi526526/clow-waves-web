# Provenance, credits and limitations

## Primary source

**[Maurdekye/orgtree](https://github.com/Maurdekye/orgtree)**, MIT License, Copyright (c) 2026 Maurdekye.

Core upstream files consulted on October 18, 2026:

| Upstream source | Git blob SHA |
| --- | --- |
| [asciifield.ts](https://github.com/Maurdekye/orgtree/blob/main/apps/desktop/renderer/src/canvas/asciifield.ts) | `484e419bcd351d0f28d994c97c2968c95cbe1344` |
| [asciigl.ts](https://github.com/Maurdekye/orgtree/blob/main/apps/desktop/renderer/src/canvas/asciigl.ts) | `de36c414837d2a910128ecbddd678052820b76c0` |

The character field, noise mathematics, glyph rendering and heart/circular ripple algorithm are **adaptations of the upstream work**. The portable browser lifecycle, adjustable presets, standalone demo, usage examples and fallback renderer are additional packaging and integration work.

Upstream author's detailed documentation: [Canvas background themes](https://github.com/Maurdekye/orgtree/blob/main/docs/rust-engine/canvas-background-themes.md).

## Claude / Anthropic

According to the upstream documentation, the upstream implementation was independently rewritten after studying a mathematical description derived from a user-supplied Claude renderer excerpt. This is **the upstream author's account of its research process**, not a legal clearance or endorsement from Anthropic.

This repository is an **unofficial** community project. It is not affiliated with, sponsored or endorsed by Anthropic. Claude and Anthropic are marks of their respective owners. No Anthropic proprietary app source, installers, branding assets or reference videos should be distributed here.

## License

Retain the full original MIT notice and terms when copying or distributing substantial parts of the adapted upstream implementation. An open-source license from Orgtree does not automatically resolve independent claims by other rightsholders.
