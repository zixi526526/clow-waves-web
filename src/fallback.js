/* CPU fallback: the same field/touch math sampled on a coarser lattice.
 * Glyph-edge lighting is approximated; WebGL2 remains the reference renderer.
 * Copyright (c) 2026 Digital Ripples contributors. MIT.
 */
import { ATLAS_CHARS, fieldAt, spanFor, tapsAt, glyphChoiceAt, sequenceFor } from './field';
import { buildAtlas } from './gl';

export function createCanvasRenderer(doc, visit, fontFamily) {
  const canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;pointer-events:none;';
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  let lay, atlas, seq, ink = [0.52, 0.52, 0.51], glow = [0, .25, 1], inkAlpha = 1;
  let tuning = { ambientScale: 1, rippleScale: 1, friction: .6 };
  let atlasCanvas, atlasKey = '', alive = true;
  const build = g => {
    const key = [g.cellWidth, g.cellHeight, g.scale].join('/');
    if (key === atlasKey) return;
    atlasKey = key;
    atlas = buildAtlas(doc, g.cellWidth, g.cellHeight, fontFamily, g.scale);
    seq = sequenceFor(visit.key, atlas.missing);
    atlasCanvas = doc.createElement('canvas');
    atlasCanvas.width = atlas.width;
    atlasCanvas.height = atlas.height;
    const ac = atlasCanvas.getContext('2d');
    const pixels = ac.createImageData(atlas.width, atlas.height);
    for (let i = 0; i < atlas.texture.length; i++) {
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
      pixels.data[i * 4 + 3] = atlas.texture[i];
    }
    ac.putImageData(pixels, 0, 0);
  };
  // Cache tinted atlases. Quantizing hue here only affects the fallback.
  let tinted = [];
  const tintAtlases = () => {
    if (!atlasCanvas) return;
    tinted = Array.from({ length: 9 }, (_, i) => {
      const c = doc.createElement('canvas'); c.width = atlasCanvas.width; c.height = atlasCanvas.height;
      const a = c.getContext('2d'); a.drawImage(atlasCanvas, 0, 0); a.globalCompositeOperation = 'source-in';
      a.fillStyle = `rgb(${ink.map((v, k) => Math.round((v + (glow[k] - v) * i / 8) * 255)).join(',')})`;
      a.fillRect(0, 0, c.width, c.height); return c;
    });
  };
  const s01 = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  return {
    kind: 'canvas2d', rendererName: 'Canvas 2D · coarse field fallback', canvas, missing: [],
    resize(layout) {
      lay = layout;
      const g = lay.grid;
      canvas.width = g.columns * g.cellWidth; canvas.height = g.rows * g.cellHeight;
      canvas.style.left = `${lay.cssLeft}px`; canvas.style.top = `${lay.cssTop}px`;
      canvas.style.width = `${lay.cssW}px`; canvas.style.height = `${lay.cssH}px`;
      build(g); tintAtlases(); return true;
    },
    setInk(rgb, a) { ink = [...rgb]; if (a !== undefined) inkAlpha = a; tintAtlases(); },
    setGlow(rgb) { glow = [...rgb]; tintAtlases(); },
    setTuning(values) { tuning = { ...tuning, ...values }; },
    getTuning() { return { ...tuning }; },
    draw(time, reveal, frame, view) {
      if (!alive || !lay || !atlas || !seq) return;
      const g = lay.grid;
      const taps = Array.from({ length: frame?.tapCount || 0 }, (_, i) => ({
        x: frame.taps[i * 4], y: frame.taps[i * 4 + 1], at: frame.taps[i * 4 + 2], force: frame.taps[i * 4 + 3], wayX: 0, wayY: 0,
      }));
      const now = frame?.now || 0;
      const nx = Math.ceil(g.columns / 3) + 1, ny = Math.ceil(g.rows / 2) + 1;
      const samples = new Float32Array(nx * ny * 2);
      const span = spanFor(visit, lay.canvasSizeX, lay.canvasSizeY);
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const value = fieldAt({ x: lay.originX + x * 3 * lay.cellWorldW, y: lay.originY + y * 2 * lay.cellWorldH,
          time, reveal, visit, span, calmCx: view.calmCx, calmCy: view.calmCy, taps, touchFrame: frame, now });
        const i = (y * nx + x) * 2; samples[i] = value.strength; samples[i + 1] = value.gate;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const get = (x, y, k) => samples[(y * nx + x) * 2 + k];
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.columns; x++) {
        const u = x / 3, v = y / 2, xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi;
        const sample = k => (get(xi, yi, k) * (1 - fx) + get(xi + 1, yi, k) * fx) * (1 - fy)
          + (get(xi, yi + 1, k) * (1 - fx) + get(xi + 1, yi + 1, k) * fx) * fy;
        const strength = sample(0), gate = sample(1);
        const effect = taps.length ? tapsAt(lay.cellCentreX + x * lay.cellWorldW, lay.cellCentreY + y * lay.cellWorldH, taps, now) : null;
        if (strength <= .001 && (!effect || effect.glowX < .04)) continue;
        const choice = glyphChoiceAt(x, y, time, visit.seed, seq, effect);
        if (!choice) continue;
        const tint = s01((choice.glowX - .04) / .26);
        const light = Math.min(1, strength * .97) + .03 * gate;
        const bright = Math.min(1, light) * (inkAlpha * tuning.ambientScale * (1 - tint) + 3 * tuning.rippleScale * tint);
        const left = .3 * choice.glowY * gate * tuning.rippleScale;
        ctx.globalAlpha = Math.min(1, (bright + left) / 3);
        const glyph = choice.glyph;
        ctx.drawImage(tinted[Math.min(8, Math.round(tint * 8))],
          (glyph % 16) * g.cellWidth, Math.floor(glyph / 16) * g.cellHeight, g.cellWidth, g.cellHeight,
          x * g.cellWidth, y * g.cellHeight, g.cellWidth, g.cellHeight);
      }
      ctx.globalAlpha = 1;
    },
    restore() { return true; }, isContextLost() { return false; }, fellBehind() { return false; },
    loseContext() { return false; }, restoreContext() { return false; }, readWind() { return null; },
    destroy() { alive = false; canvas.remove(); tinted = []; },
  };
}
