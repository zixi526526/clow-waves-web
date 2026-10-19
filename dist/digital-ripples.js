/*! Digital Ripples 1.0.0 | Adapted from Orgtree (c) 2026 Maurdekye.
 * MIT License
 * 
 * Copyright (c) 2026 Maurdekye
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * 
 */
(function () {
'use strict';
/*
 * Digital Ripples — personal-web adaptation of Orgtree
 * Upstream: https://github.com/Maurdekye/orgtree
 * Source: apps/desktop/renderer/src/canvas/asciifield.ts
 * Upstream blob SHA: 484e419bcd351d0f28d994c97c2968c95cbe1344
 * Retrieved 2026-10-18. This adaptation preserves the upstream field math
 * and adds browser-facing controls and resource-lifecycle handling.
 * This is not Anthropic source code or an official Anthropic release.
 *
 * MIT License
 * 
 * Copyright (c) 2026 Maurdekye
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/* The flowing-ASCII backdrop's mathematics — pure functions, no DOM, no
 * GL — shared by the WebGL renderer (asciigl.ts), the layer orchestration
 * (canvasbackground.tsx) and the tests.
 *
 * This is an independent re-implementation of the Claude Code desktop
 * "New session" backdrop algorithm, written from a prose/math study of the
 * real renderer under the user's 2026-10-15 ruling (read the real code
 * read-only; copy none of it; parameters and algorithm matched). The model
 * in brief: a seeded per-visit wind (heading, speed, gust size, bend)
 * carries a field of gradient-noise gusts in its own frame; the field's
 * strength lights a grid of glyphs, each cell cycling through one of three
 * character pools at its own hashed pace; pointer motion warms wakes and
 * clicks launch ripples (every third in a heart shape); a power budget
 * settles the whole thing to calm after minutes unless roused. The CPU
 * mirror of the field at the bottom exists so tests can compare the GL
 * output against this spec numerically at a pinned seed. */

/** Every tunable, grouped as the reference groups them. Adaptations for
 *  Orgtree (world-space sampling, intensity = strength.scale) live in the
 *  layer, not by editing these values. */
const ASCII_CONFIG = {
  strength: { scale: 1, base: { dark: 0.26, light: 0.26 }, cap: { dark: 0.9, light: 0.9 }, rest: 0.03 },
  surface: { fill: 1, weight: 300, glyphCss: 9, skipUnseen: true },
  wind: {
    energy: 1, friction: 0.6, flick: 1.2, lull: 0.5, streak: 0.4, detail: 0.6,
    edge: 0.75, curl: 0.65, wisp: 0.5, tail: 0.35, sweep: 0.3, morph: 3, revealS: 4,
  },
  glow: { amount: 1, headroom: 3, color: { dark: [0.1, 0.68, 1], light: [0, 0.25, 1] } },
  touch: { stir: 1, ripple: 1, slowPxS: 60, fastPxS: 800 },
  card: { centerY: 0.45, calmX: 250, calmY: 80, left: 0.3 },
  grid: { cellCss: 6.5, minCols: 24, minRows: 8, maxDevicePixels: 21_000_000 },
  power: {
    frameMs: 40, rippleFrameMs: 10, backoffFrameMs: 83, budgetS: 180, settleS: 8,
    resumeS: 3, retryS: 60, retryMaxS: 480, resizeSettleMs: 150, linkDeadlineMs: 20_000,
  },
}         

/** The atlas set: printable ASCII in code order, plus the middle dot. */
const ATLAS_CHARS         =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·'
const ATLAS_COLS = 16
const ATLAS_ROWS = 6

/** The three character pools ("looks"), in cycle order. Parameters of the
 *  reference algorithm, recorded from study. */
const GLYPH_POOLS = {
  mixed: 'ab0cAde1fEgh2iGjk3lHmn4oKpq5rMst6uRvw7xSyz8nT9eW',
  lettered: 'abcd3efgRhijk7lmnAopqr0stuEvwxy5zaeKiou2gcS9',
  figured: '0a1b2C3d4e5F6g7h8i9J0k1m2N3p4q5R6s7t8U9v0w1X2y3z',
}         
                                                   
const GLYPH_POOL_KEYS = Object.keys(GLYPH_POOLS)                  

/** Clamped cubic smoothstep on [0,1] — the one easing used everywhere. */
function smooth01(x        )         {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** Xorshift-multiply u32 finalizer (the JS-side visit hash). */
function hash32(v        )         {
  let t = v >>> 0
  t = Math.imul(t ^ (t >>> 16), 569420461)
  t = Math.imul(t ^ (t >>> 15), 1935289751)
  return (t ^ (t >>> 15)) >>> 0
}

/** A labelled deterministic stream: fold the label's chars into the hash,
 *  then step by the golden-ratio increment, hashing each draw. */
function rngStream(seed        , label        )               {
  let state = hash32(seed)
  for (const ch of label) state = hash32(state ^ ch.charCodeAt(0))
  return () => {
    state = (state + 2654435769) >>> 0
    return hash32(state) / 4294967296
  }
}

/** Pick this visit's pool: one not among the recent looks if possible, else
 *  one differing from the most recent, else any — seeded, never Math.random. */
function pickLook(seed        , recent                   , keys                          = GLYPH_POOL_KEYS)               {
  const fresh = keys.filter(k => !recent.includes(k))
  const notLast = keys.filter(k => k !== recent[0])
  const pool = fresh.length > 0 ? fresh : notLast.length > 0 ? notLast : keys
  return pool[Math.floor(rngStream(seed, 'look')() * pool.length)] ?? 'mixed'
}

                             
                   
              
                 
               
                    
                   
              
                   
 

/** Heading draw: an angle sliding π/10 → π/4.3 across u, mirrored past u=½
 *  so the wind always blows sideways, never straight up or down. */
function headingFor(u        )         {
  const lo = Math.PI / 10
  const a = lo + (Math.PI / 4.3 - lo) * ((u * 2) % 1)
  return u < 0.5 ? a : Math.PI - a
}

/** Everything one mount ("visit") fixes for its lifetime, drawn from the
 *  seed in a fixed order: heading, speed, gustLength, gustWidth, bend,
 *  bendScale. Speeds/sizes in CSS px (world units in Orgtree at zoom 1). */
function visitFromSeed(seed        , look        )             {
  const next = rngStream(seed, 'wind')
  const between = (a        , b        )         => a + (b - a) * next()
  const heading = headingFor(next())
  const speed = between(42, 64)
  const gustLength = between(380, 560)
  const gustWidth = between(120, 190)
  const bend = between(60, 110)
  const bendScale = between(300, 440)
  return {
    key: (look in GLYPH_POOLS ? look : 'mixed')                ,
    seed: seed >>> 0, heading, speed, gustLength, gustWidth, bend, bendScale,
  }
}

                            
                   
                    
                 
              
              
             
               
 

/** Grid geometry for a device-pixel size: cells 6.5 CSS px wide (min 5
 *  device px) and twice as tall, centred, shrunk to the device-pixel
 *  budget; null when the pane is too small to bother (or degenerate). */
function gridFor(deviceWidth        , deviceHeight        , devicePixelRatio        )                   {
  const { grid } = ASCII_CONFIG
  const dpr = devicePixelRatio
  if (!(deviceWidth > 0 && deviceHeight > 0 && dpr > 0)) return null
  const cellWidth = Math.max(5, Math.round(grid.cellCss * dpr))
  const cellHeight = cellWidth * 2
  let columns = Math.ceil(deviceWidth / cellWidth)
  let rows = Math.ceil(deviceHeight / cellHeight)
  if (columns < grid.minCols || rows < grid.minRows) return null
  const over = (columns * cellWidth * rows * cellHeight) / grid.maxDevicePixels
  if (over > 1) {
    columns = Math.floor(columns / Math.sqrt(over))
    rows = Math.floor(rows / Math.sqrt(over))
  }
  return {
    cellWidth, cellHeight, columns, rows,
    left: Math.round((deviceWidth - columns * cellWidth) / 2),
    top: Math.round((deviceHeight - rows * cellHeight) / 2),
    scale: dpr,
  }
}

/* ── touch: pointer wakes and tap ripples ────────────────────────────────
 * All coordinates are in the field's own units (CSS px in the reference;
 * world units in Orgtree — the layer converts at record time). */

                                                                                                         
                                                       
                                                                             
                                                                            
                                  
             
                  
                    
                   
                     
                    
 

const TAP_LIFE_S = 3.6
const WAKE_LIFE_S = 2.4
const SPEED_TAU_S = 0.08
const WAKE_MIN_DIST = 18
const WAKE_MIN_DT = 0.035
const WAKE_RISE_S = 0.05
const WAKE_DECAY_S = 0.65
const WAKE_REACH_BASE = 50
const WAKE_REACH_GROWTH = 40
const MAX_TAPS = 6
const MAX_WAKES = 48

                             
                                                             
                                                      
                                                                                  
                                                                                       
                                                                                   
                   
                   
                                
                                    
                                  
                                         
                                                        
                                       
 

function createTouch()             {
  const { touch } = ASCII_CONFIG
  let taps             = []
  let wakeRecs             = []
  let last                                              = null
  let anchor                                              = null
  let speedEma = 0
  let tapTotal = 0
  const out                  = {
    now: 0, tapCount: 0, taps: new Float32Array(24),
    wakeCount: 0, wakes: new Float32Array(192), ways: new Float32Array(192),
  }
  return {
    move(x, y, now) {
      if (!last || !anchor || now - last.at > 0.25) {
        last = { x, y, at: now }
        anchor = last
        speedEma = 0
        return false
      }
      const dt = Math.max(now - last.at, 1 / 240)
      const dist = Math.hypot(x - last.x, y - last.y)
      speedEma += (dist / dt - speedEma) * Math.min(1, dt / SPEED_TAU_S)
      last = { x, y, at: now }
      const span = Math.hypot(x - anchor.x, y - anchor.y)
      if (span < WAKE_MIN_DIST || now - anchor.at < WAKE_MIN_DT) return false
      const force0 = touch.stir * smooth01((speedEma - touch.slowPxS) / (touch.fastPxS - touch.slowPxS))
      const from = anchor
      anchor = last
      if (force0 < 0.04) return false
      wakeRecs = [...wakeRecs.slice(-(MAX_WAKES - 1)), {
        x: (x + from.x) / 2, y: (y + from.y) / 2, at: now,
        force: force0 * span / (span + 90), wayX: (x - from.x) / 2, wayY: (y - from.y) / 2,
      }]
      return true
    },
    tap(x, y, now, options = {}) {
      tapTotal += 1
      const shape = options.shape === 'heart' || (options.shape !== 'ripple' && tapTotal % 3 === 0)
        ? 'heart' : 'ripple'
      const strength = options.strength === undefined || !Number.isFinite(options.strength)
        ? 1 : Math.max(0, options.strength)
      const force = (shape === 'heart' ? -1.15 : 1) * touch.ripple * strength
      taps = [...taps.slice(-(MAX_TAPS - 1)), { x, y, at: now, force, wayX: 0, wayY: 0 }]
      return { shape, count: tapTotal }
    },
    clear() {
      taps = []
      wakeRecs = []
      last = null
      anchor = null
      speedEma = 0
      tapTotal = 0
      out.now = 0
      out.tapCount = 0
      out.wakeCount = 0
      out.taps.fill(0)
      out.wakes.fill(0)
      out.ways.fill(0)
    },
    leave() { last = null },
    busy: now => taps.some(t => now - t.at < TAP_LIFE_S) || wakeRecs.some(w => now - w.at < WAKE_LIFE_S),
    rippling: now => taps.some(t => now - t.at < TAP_LIFE_S),
    waking: now => wakeRecs.some(w => now - w.at < WAKE_LIFE_S),
    liveTaps: now => taps.filter(t => now - t.at < TAP_LIFE_S),
    frame(now) {
      taps = taps.filter(t => now - t.at < TAP_LIFE_S)
      wakeRecs = wakeRecs.filter(w => now - w.at < WAKE_LIFE_S)
      out.now = now
      out.tapCount = taps.length
      taps.forEach((t, i) => { out.taps.set([t.x, t.y, t.at, t.force], i * 4) })
      const missing = MAX_WAKES - wakeRecs.length
      let count = 0
      wakeRecs.forEach((w, i) => {
        const age = Math.max(0, now - w.at)
        const warm = w.force * Math.min(1, (i + 1 + missing) / 8)
          * (1 - Math.exp(-age / WAKE_RISE_S)) * Math.exp(-age / WAKE_DECAY_S)
        if (warm < 0.002) return
        const reach = WAKE_REACH_BASE + WAKE_REACH_GROWTH * age
        const len = Math.hypot(w.wayX, w.wayY)
        out.wakes.set([w.x, w.y, warm, 1 / (reach * reach)], count * 4)
        out.ways.set([w.wayX / (len || 1), w.wayY / (len || 1), len, 0], count * 4)
        count += 1
      })
      out.wakeCount = count
      return out
    },
  }
}

/* ── CPU mirror of the field mathematics ─────────────────────────────────
 * The same math the shaders run, in TypeScript, so tests can pin the GL
 * output numerically. u32 ops go through Math.imul/>>>0 to stay bit-exact
 * with GLSL uint arithmetic (including wraparound of negative lattice
 * coordinates, which world-space sampling produces). */

/** PCG hash (published constants). */
function pcg(v        )         {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737)
  return ((w >>> 22) ^ w) >>> 0
}

const unitFromHash = (h        )         => (h >>> 8) * (1 / 16777216)

const latticeHashes = (ix        , iy        , iz        , seed        , salt        ) => {
  const z0 = pcg(((iz >>> 0) ^ seed ^ salt) >>> 0)
  const z1 = pcg((((iz + 1) >>> 0) ^ seed ^ salt) >>> 0)
  return {
    x0: ix >>> 0, x1: (ix + 1) >>> 0,
    a: pcg(((iy >>> 0) ^ z0) >>> 0), b: pcg((((iy + 1) >>> 0) ^ z0) >>> 0),
    c: pcg(((iy >>> 0) ^ z1) >>> 0), d: pcg((((iy + 1) >>> 0) ^ z1) >>> 0),
  }
}

const fade = (f        )         => f * f * f * (f * (f * 6 - 15) + 10)
const mix = (a        , b        , t        )         => a + (b - a) * t
const cornerValue = (v        )         => unitFromHash(pcg(v)) * 2 - 1

/** 3D value noise on a seed-hashed integer lattice, about [−1, 1]. */
function valueNoise(px        , py        , pz        , seed        , salt        )         {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz)
  const fx = px - ix, fy = py - iy, fz = pz - iz
  const { x0, x1, a, b, c, d } = latticeHashes(ix, iy, iz, seed >>> 0, salt >>> 0)
  const wx = fade(fx), wy = fade(fy), wz = fade(fz)
  return mix(
    mix(mix(cornerValue((x0 ^ a) >>> 0), cornerValue((x1 ^ a) >>> 0), wx),
      mix(cornerValue((x0 ^ b) >>> 0), cornerValue((x1 ^ b) >>> 0), wx), wy),
    mix(mix(cornerValue((x0 ^ c) >>> 0), cornerValue((x1 ^ c) >>> 0), wx),
      mix(cornerValue((x0 ^ d) >>> 0), cornerValue((x1 ^ d) >>> 0), wx), wy),
    wz)
}

const slopeOf = (v        )                           => {
  const h = pcg(v)
  return [
    (h & 1023) * (2 / 1023) - 1,
    ((h >>> 10) & 1023) * (2 / 1023) - 1,
    ((h >>> 20) & 1023) * (2 / 1023) - 1,
  ]
}

/** Gradient noise on the same lattice (“swirl”): crosses zero between
 *  lattice points, scaled ×1.5, about [−1, 1]. */
function gradientNoise(px        , py        , pz        , seed        , salt        )         {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz)
  const fx = px - ix, fy = py - iy, fz = pz - iz
  const { x0, x1, a, b, c, d } = latticeHashes(ix, iy, iz, seed >>> 0, salt >>> 0)
  const wx = fade(fx), wy = fade(fy), wz = fade(fz)
  const dot = (g                          , ox        , oy        , oz        )         =>
    g[0] * (fx - ox) + g[1] * (fy - oy) + g[2] * (fz - oz)
  return 1.5 * mix(
    mix(mix(dot(slopeOf((x0 ^ a) >>> 0), 0, 0, 0), dot(slopeOf((x1 ^ a) >>> 0), 1, 0, 0), wx),
      mix(dot(slopeOf((x0 ^ b) >>> 0), 0, 1, 0), dot(slopeOf((x1 ^ b) >>> 0), 1, 1, 0), wx), wy),
    mix(mix(dot(slopeOf((x0 ^ c) >>> 0), 0, 0, 1), dot(slopeOf((x1 ^ c) >>> 0), 1, 0, 1), wx),
      mix(dot(slopeOf((x0 ^ d) >>> 0), 0, 1, 1), dot(slopeOf((x1 ^ d) >>> 0), 1, 1, 1), wx), wy),
    wz)
}

/** How far a heart's outline lies in direction (ux, uy) (unit, y down)
 *  against a circle's 1 — solved by fixed-point iteration. */
function heartRadius(ux        , uy        )         {
  const k = -ux * ux * uy * uy * uy
  const c = Math.sign(k) * Math.pow(Math.abs(k), 1 / 3)
  let r = 1
  for (let i = 0; i < 6; i++) r = Math.sqrt(Math.max(0.05, 1 + c * Math.pow(r, 5 / 3)))
  return r
}

                                                                                                                       

/** The combined effect of all live taps at a point: an expanding front
 *  (heart-shaped for negative-force taps) that pushes air outward, raises
 *  the wind in rings behind it, and leaves a fading glow trail. */
function tapsAt(px        , py        , taps                     , now        )            {
  let pushX = 0, pushY = 0, raise = 0, rouse = 0, glowX = 0, glowY = 0
  for (const tap of taps.slice(0, MAX_TAPS)) {
    const age = now - tap.at
    const awayX = px - tap.x, awayY = py - tap.y
    const d = Math.hypot(awayX, awayY)
    const reach = tap.force < 0 ? d / heartRadius(awayX / Math.max(d, 1), awayY / Math.max(d, 1)) : d
    const behind = 620 * (1 - Math.exp(-age / 1.3)) - reach
    const width = 85 + 60 * age
    const front = smooth01((behind + 16) / 26) * Math.exp(-behind * behind / (width * width))
    const swell = Math.abs(tap.force) * Math.exp(-age / 1.5) * front
    pushX += (awayX / Math.max(d, 1)) * (44 * swell)
    pushY += (awayY / Math.max(d, 1)) * (44 * swell)
    raise += 1.9 * swell * (0.25 + 0.75 * Math.cos(behind * (Math.PI * 2 / 130)))
    rouse += swell
    const trail = smooth01(behind / 70) * Math.exp(-Math.max(behind, 0) / 260)
    glowX += Math.abs(tap.force) * (Math.exp(-age / 1.0) * front + 0.7 * Math.exp(-age / 1.3) * trail)
    glowY += Math.abs(tap.force) * (1 - Math.exp(-age / 0.2)) * Math.exp(-age / 1.2) * trail
  }
  return { pushX, pushY, raise, rouse, glowX, glowY }
}

/** Warmth left by the moving hand: capsule segments with gaussian falloff,
 *  saturated so stirring can only warm so far. Reads the packed frame. */
function warmthAt(px        , py        , frame                 )         {
  let warmth = 0
  for (let i = 0; i < frame.wakeCount; i++) {
    const wx = frame.wakes[i * 4] ?? 0, wy = frame.wakes[i * 4 + 1] ?? 0
    const warm = frame.wakes[i * 4 + 2] ?? 0, inv = frame.wakes[i * 4 + 3] ?? 0
    const dx = frame.ways[i * 4] ?? 0, dy = frame.ways[i * 4 + 1] ?? 0, half = frame.ways[i * 4 + 2] ?? 0
    let ax = px - wx, ay = py - wy
    const along = Math.min(half, Math.max(-half, ax * dx + ay * dy))
    ax -= dx * along
    ay -= dy * along
    warmth += warm * Math.exp(-(ax * ax + ay * ay) * inv)
  }
  return 1 - Math.exp(-1.5 * warmth)
}

/** Distance the wind has carried the field by time t (surges and slackens). */
function carriedAt(time        , visit            )         {
  return visit.speed * (time + valueNoise(time * 0.09, 3.7, 0, visit.seed, 0x58))
}

/** The pane's extent projected onto the wind heading (swell wavelength). */
function spanFor(visit            , sizeX        , sizeY        )         {
  return 0.58 * (Math.abs(Math.cos(visit.heading)) * sizeX + Math.abs(Math.sin(visit.heading)) * sizeY)
}

/** Gusts in the wind's own frame: four gradient-noise octaves travelling
 *  nearly together, thin strands between, gathered on long swells. */
function gustsAt(ax        , ay        , carried        , time        , visit            , span        )         {
  const { wind } = ASCII_CONFIG
  const gain = mix(0.38, 0.62, wind.detail)
  let gust = 0, weight = 1, power = 0
  let sizeX = 0.85 * visit.gustLength, sizeY = 0.75 * visit.gustWidth
  for (let k = 0; k < 4; k++) {
    gust += weight * gradientNoise(
      (ax - carried * (1 + 0.1 * k)) / sizeX, ay / sizeY,
      wind.morph * time * (0.03 + 0.018 * k) + 11 * k, visit.seed, 0x60 + k)
    power += weight * weight
    weight *= gain
    sizeX *= 0.5
    sizeY *= 0.58
  }
  const strand = 1 - Math.abs(gradientNoise(
    (ax - 1.15 * carried) / (0.7 * visit.gustLength), ay / (0.95 * visit.gustWidth),
    wind.morph * time * 0.05 + 2, visit.seed, 0x66))
  const swell = Math.cos(
    (ax - carried + 0.5 * span * valueNoise(time * 0.045, ay / (2.5 * visit.gustWidth), 7, visit.seed, 0x67))
    * (Math.PI * 2 / span))
  return gust / Math.sqrt(power) + wind.wisp * 0.5 * (strand * strand * strand - 0.35) + wind.sweep * swell
}

                             
           
           
              
                
                   
              
                
                
                           
                                    
             
 
                                                                                             

/** One wind-field sample, exactly as the wind pass computes it:
 *  strength (R), local wind direction (GB before encoding), gate (A). */
function fieldAt(input            )              {
  const { wind, card } = ASCII_CONFIG
  const { visit, time } = input
  const seed = visit.seed
  const headingX = Math.cos(visit.heading), headingY = Math.sin(visit.heading)
  const acrossX = -headingY, acrossY = headingX
  const carried = carriedAt(time, visit)
  const frame = input.touchFrame
  const hasTouch = input.taps.length > 0 || (frame !== null && frame.wakeCount > 0)
  let hand            = { pushX: 0, pushY: 0, raise: 0, rouse: 0, glowX: 0, glowY: 0 }
  let warm = 0
  if (hasTouch) {
    const nearX = input.x + 24 * valueNoise(input.x / 95, input.y / 95, input.now * 0.12, seed, 0x71)
    const nearY = input.y + 24 * valueNoise(input.x / 95 + 9.1, input.y / 95 + 9.1, input.now * 0.12 + 4, seed, 0x72)
    hand = tapsAt(nearX, nearY, input.taps, input.now)
    warm = frame ? warmthAt(nearX, nearY, frame) : 0
    hand.raise += 0.25 * warm
    hand.rouse += 0.05 * warm
  }
  const fromX = input.x - hand.pushX, fromY = input.y - hand.pushY
  const turnX = valueNoise(fromX / visit.bendScale, fromY / visit.bendScale, time * 0.04, seed, 0x51)
  const turnY = valueNoise(fromX / visit.bendScale + 17.3, fromY / visit.bendScale + 17.3, time * 0.04 + 5, seed, 0x52)
  const bentX = fromX + visit.bend * turnX, bentY = fromY + visit.bend * turnY
  const qx = bentX * headingX + bentY * headingY
  const qy = bentX * acrossX + bentY * acrossY
  const ridingX = qx - 0.85 * carried, ridingY = qy
  const eddySize = 1.15 * visit.gustWidth, fineSize = 0.38 * visit.gustWidth
  const eddyX = gradientNoise(ridingX / eddySize, ridingY / eddySize, wind.morph * time * 0.04, seed, 0x59)
  const eddyY = gradientNoise(ridingX / eddySize + 31.7, ridingY / eddySize + 31.7, wind.morph * time * 0.04 + 3, seed, 0x5a)
  const foldedX = ridingX + wind.curl * 0.9 * visit.gustWidth * eddyX
  const foldedY = ridingY + wind.curl * 0.9 * visit.gustWidth * eddyY
  const fineX = gradientNoise(foldedX / fineSize, foldedY / fineSize, wind.morph * time * 0.06, seed, 0x5b)
  const fineY = gradientNoise(foldedX / fineSize + 13.1, foldedY / fineSize + 13.1, wind.morph * time * 0.06 + 7, seed, 0x5c)
  const creasedX = (foldedX + 0.3 * visit.gustWidth * fineX) / 24
  const creasedY = (foldedY + 0.3 * visit.gustWidth * fineY) / 24
  const tinyX = gradientNoise(creasedX, creasedY, time * 0.07, seed, 0x5d)
  const tinyY = gradientNoise(creasedX + 5.3, creasedY + 5.3, time * 0.07 + 1, seed, 0x5e)
  const pullScale = wind.curl * (1 + 0.9 * Math.min(hand.rouse, 1.5))
  const curledX = qx + pullScale * (visit.gustWidth * (0.9 * eddyX + 0.3 * fineX) + wind.detail * 30 * tinyX)
  const curledY = qy + pullScale * (visit.gustWidth * (0.9 * eddyY + 0.3 * fineY) + wind.detail * 30 * tinyY)
  const blX = headingX + 0.6 * turnX + hand.pushX / 14
    + wind.curl * ((0.45 * eddyX + 0.25 * fineX) * headingX + (0.45 * eddyY + 0.25 * fineY) * acrossX)
  const blY = headingY + 0.6 * turnY + hand.pushY / 14
    + wind.curl * ((0.45 * eddyX + 0.25 * fineX) * headingY + (0.45 * eddyY + 0.25 * fineY) * acrossY)
  const blLen = Math.hypot(blX, blY) || 1
  const still = gustsAt(curledX, curledY, carried, time, visit, input.span)
  const field = still + hand.raise
  const level = mix(0.02, 0.82, wind.lull)
  const band = mix(0.26, 0.03, wind.edge)
  const blowing = field > level - band - 0.55 * wind.tail
  let streaks = 0, strength = 0
  if (blowing || warm > 0) {
    const thread = valueNoise((curledX - carried * 1.6) / 140, curledY / 30, time * 0.16, seed, 0x57)
    streaks = 1 - smooth01(Math.abs(thread) / 0.5)
  }
  if (blowing) {
    const ahead = gustsAt(curledX + 56, curledY, carried, time, visit, input.span)
    const leaving = smooth01((ahead - still + 0.05) / 0.12)
    const lit = smooth01((field - (level - band - 0.55 * wind.tail * leaving)) / (2 * band + 0.55 * wind.tail * leaving))
    const broad = lit * lit * mix(0.45, 1, Math.min(1, Math.max(0, (field - level) / 0.45))) * (0.82 + 0.18 * fineY)
    strength = broad * mix(1, 0.25 + 0.95 * streaks, wind.streak)
  }
  if (warm > 0) {
    const grain = 0.55 * fineY + 0.45 * tinyX + 0.3 * (streaks - 0.4)
    strength = 1 - (1 - strength) * (1 - 0.85 * warm * smooth01((grain + 0.5) / 0.75))
  }
  const ex = (input.x - input.calmCx) / card.calmX, ey = (input.y - input.calmCy) / card.calmY
  const calm = 1 - (1 - card.left) * Math.exp(-0.9 * (ex * ex + ey * ey))
  const shown = Math.max(input.reveal, Math.min(1, 2 * hand.rouse + warm))
  return { strength: strength * calm * shown, blowX: blX / blLen, blowY: blY / blLen, gate: calm * shown }
}

/** The atlas sequence for a pool: pool chars → atlas indices (>0, present),
 *  in pool order; [index of "."] if somehow empty. */
function sequenceFor(key              , missing                    )             {
  const chars = [...(GLYPH_POOLS[key] ?? GLYPH_POOLS.mixed)]
  const idx = chars.map(ch => ATLAS_CHARS.indexOf(ch)).filter(i => i > 0 && missing[i] !== true)
  return Uint8Array.from(idx.length > 0 ? idx : [ATLAS_CHARS.indexOf('.')])
}

                                                                                           

/** Which glyph a cell shows at a time, and its tap glow — the vertex
 *  stage's choice, minus the wind-based unseen cull (needs field samples;
 *  tests compose it from fieldAt). Null when the fill draw skips the cell. */
function glyphChoiceAt(
  cx        , cy        , time        , seed        ,
  sequence            , tapEffect                  ,
)                     {
  const cell = pcg((Math.imul(cx >>> 0, 0x9E3779B9) ^ pcg(((cy >>> 0) ^ (seed >>> 0)) >>> 0)) >>> 0)
  if (unitFromHash(cell) >= ASCII_CONFIG.surface.fill) return null
  const pace = pcg(cell)
  let steps = Math.floor(time * ASCII_CONFIG.wind.flick * (0.6 + 0.8 * unitFromHash(pace)) + unitFromHash(pcg(pace)))
  let glowX = 0, glowY = 0
  if (tapEffect) {
    steps += Math.floor(6 * tapEffect.rouse + unitFromHash(pcg((pace ^ 0x33) >>> 0)))
    const vary = 0.65 + 0.35 * unitFromHash(pcg((pace ^ 0x51) >>> 0))
    glowX = tapEffect.glowX * vary
    glowY = tapEffect.glowY * vary
  }
  const at = ((cell >>> 8) + steps) % sequence.length
  return { glyph: sequence[at] ?? 0, steps, glowX, glowY }
}



/*
 * Digital Ripples — personal-web adaptation of Orgtree
 * Upstream: https://github.com/Maurdekye/orgtree
 * Source: apps/desktop/renderer/src/canvas/asciigl.ts
 * Upstream blob SHA: de36c414837d2a910128ecbddd678052820b76c0
 * Retrieved 2026-10-18. This adaptation preserves the upstream field math
 * and adds browser-facing controls and resource-lifecycle handling.
 * This is not Anthropic source code or an official Anthropic release.
 *
 * MIT License
 * 
 * Copyright (c) 2026 Maurdekye
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/* WebGL2 pipeline for the flowing-ASCII backdrop: a wind-field pass into
 * an offscreen texture, then a glyph pass drawing one quad per grid cell.
 * Independent implementation of the algorithm specified in asciifield.ts
 * (which see for provenance): the shaders below are written from that
 * prose/math specification, and asciifield's CPU mirror exists so tests
 * can pin this pipeline's output numerically at a fixed seed.
 *
 * Adapted to Orgtree's canvas in exactly one respect: field coordinates
 * are WORLD units (the backdrop pans/zooms like a floor, per the picker's
 * ruling), where the reference samples its pane's CSS pixels. At view
 * (0,0, zoom 1) the two coincide. The calm ellipse stays screen-centred
 * via a per-frame centre uniform. */

const NOISE_GLSL = /* glsl */`
uint pcgHash(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hashUnit(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
float latticeValue(uint v) { return hashUnit(pcgHash(v)) * 2.0 - 1.0; }
vec3 latticeFades(vec3 f) { return f * f * f * (f * (f * 6.0 - 15.0) + 10.0); }
void latticeHashes(ivec3 cell, uint salt, out uint x0, out uint x1, out uint a, out uint b, out uint c, out uint d) {
  uint z0 = pcgHash(uint(cell.z) ^ uSeed ^ salt);
  uint z1 = pcgHash(uint(cell.z + 1) ^ uSeed ^ salt);
  x0 = uint(cell.x); x1 = uint(cell.x + 1);
  a = pcgHash(uint(cell.y) ^ z0); b = pcgHash(uint(cell.y + 1) ^ z0);
  c = pcgHash(uint(cell.y) ^ z1); d = pcgHash(uint(cell.y + 1) ^ z1);
}
float valueNoise(vec3 p, uint salt) {
  vec3 fl = floor(p);
  ivec3 cell = ivec3(fl);
  vec3 f = p - fl;
  vec3 w = latticeFades(f);
  uint x0, x1, a, b, c, d;
  latticeHashes(cell, salt, x0, x1, a, b, c, d);
  return mix(
    mix(mix(latticeValue(x0 ^ a), latticeValue(x1 ^ a), w.x),
        mix(latticeValue(x0 ^ b), latticeValue(x1 ^ b), w.x), w.y),
    mix(mix(latticeValue(x0 ^ c), latticeValue(x1 ^ c), w.x),
        mix(latticeValue(x0 ^ d), latticeValue(x1 ^ d), w.x), w.y),
    w.z);
}
vec3 gradientOf(uint v) {
  uint h = pcgHash(v);
  return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) * (2.0 / 1023.0) - 1.0;
}
float gradientNoise(vec3 p, uint salt) {
  vec3 fl = floor(p);
  ivec3 cell = ivec3(fl);
  vec3 f = p - fl;
  vec3 w = latticeFades(f);
  uint x0, x1, a, b, c, d;
  latticeHashes(cell, salt, x0, x1, a, b, c, d);
  return 1.5 * mix(
    mix(mix(dot(gradientOf(x0 ^ a), f), dot(gradientOf(x1 ^ a), f - vec3(1.0, 0.0, 0.0)), w.x),
        mix(dot(gradientOf(x0 ^ b), f - vec3(0.0, 1.0, 0.0)), dot(gradientOf(x1 ^ b), f - vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(dot(gradientOf(x0 ^ c), f - vec3(0.0, 0.0, 1.0)), dot(gradientOf(x1 ^ c), f - vec3(1.0, 0.0, 1.0)), w.x),
        mix(dot(gradientOf(x0 ^ d), f - vec3(0.0, 1.0, 1.0)), dot(gradientOf(x1 ^ d), f - vec3(1.0)), w.x), w.y),
    w.z);
}
`

const TOUCH_GLSL = /* glsl */`
uniform float uNow;
uniform int uTapCount;
uniform vec4 uTaps[6];
uniform int uWakeCount;
uniform vec4 uWakes[48];
uniform vec4 uWays[48];
float heartRadius(vec2 u) {
  float k = -u.x * u.x * u.y * u.y * u.y;
  float c = sign(k) * pow(abs(k), 1.0 / 3.0);
  float r = 1.0;
  for (int i = 0; i < 6; i++) r = sqrt(max(0.05, 1.0 + c * pow(r, 5.0 / 3.0)));
  return r;
}
vec4 tapsAt(vec2 p, out vec2 glow) {
  vec4 sum = vec4(0.0);
  glow = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    if (i >= uTapCount) break;
    vec4 tap = uTaps[i];
    float age = uNow - tap.z;
    vec2 away = p - tap.xy;
    float d = length(away);
    float reach = tap.w < 0.0 ? d / heartRadius(away / max(d, 1.0)) : d;
    float behind = 620.0 * (1.0 - exp(-age / 1.3)) - reach;
    float width = 85.0 + 60.0 * age;
    float front = smoothstep(-16.0, 10.0, behind) * exp(-behind * behind / (width * width));
    float swell = abs(tap.w) * exp(-age / 1.5) * front;
    sum.xy += (away / max(d, 1.0)) * (44.0 * swell);
    sum.z += 1.9 * swell * (0.25 + 0.75 * cos(behind * (6.2831853 / 130.0)));
    sum.w += swell;
    float trail = smoothstep(0.0, 70.0, behind) * exp(-max(behind, 0.0) / 260.0);
    glow.x += abs(tap.w) * (exp(-age / 1.0) * front + 0.7 * exp(-age / 1.3) * trail);
    glow.y += abs(tap.w) * (1.0 - exp(-age / 0.2)) * exp(-age / 1.2) * trail;
  }
  return sum;
}
float warmthAt(vec2 p) {
  float warmth = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uWakeCount) break;
    vec4 wake = uWakes[i];
    vec3 way = uWays[i].xyz;
    vec2 away = p - wake.xy;
    away -= way.xy * clamp(dot(away, way.xy), -way.z, way.z);
    warmth += wake.z * exp(-dot(away, away) * wake.w);
  }
  return 1.0 - exp(-1.5 * warmth);
}
`

const WIND_VERTEX = /* glsl */`#version 300 es
precision highp float;
precision highp int;
uniform uint uSeed;
uniform float uTime;
uniform vec4 uWindVec;
uniform vec2 uCanvasSize;
out vec4 vAir;
${NOISE_GLSL}
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
  vec2 heading = vec2(cos(uWindVec.x), sin(uWindVec.x));
  float carried = uWindVec.y * (uTime + valueNoise(vec3(uTime * 0.09, 3.7, 0.0), 0x58u));
  vAir = vec4(heading, carried, 0.58 * (abs(heading.x) * uCanvasSize.x + abs(heading.y) * uCanvasSize.y));
}
`

function windFragmentSource()         {
  return /* glsl */`#version 300 es
precision highp float;
precision highp int;
uniform uint uSeed;
uniform vec2 uSample;
uniform vec2 uOrigin;
uniform vec2 uCalmCentre;
uniform vec2 uCalmRadii;
uniform float uTime;
uniform float uReveal;
uniform vec4 uWindVec;
uniform vec4 uGustVec;
uniform vec4 uShapeVec;
uniform float uTail;
uniform float uSweep;
uniform float uMorph;
in vec4 vAir;
out vec4 o;
const float TAU = 6.2831853;
const float CALM_LEFT = ${ASCII_CONFIG.card.left};
${NOISE_GLSL}
${TOUCH_GLSL}
float gustsAt(vec2 at, float carried) {
  float gain = mix(0.38, 0.62, uShapeVec.x);
  float gust = 0.0, weight = 1.0, power = 0.0;
  vec2 size = vec2(0.85, 0.75) * uWindVec.zw;
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    gust += weight * gradientNoise(vec3((at.x - carried * (1.0 + 0.1 * k)) / size.x, at.y / size.y, uMorph * uTime * (0.03 + 0.018 * k) + 11.0 * k), 0x60u + uint(i));
    power += weight * weight;
    weight *= gain;
    size *= vec2(0.5, 0.58);
  }
  float strand = 1.0 - abs(gradientNoise(vec3((at.x - 1.15 * carried) / (0.7 * uWindVec.z), at.y / (0.95 * uWindVec.w), uMorph * uTime * 0.05 + 2.0), 0x66u));
  float span = vAir.w;
  float swell = cos((at.x - carried + 0.5 * span * valueNoise(vec3(uTime * 0.045, at.y / (2.5 * uWindVec.w), 7.0), 0x67u)) * (TAU / span));
  return gust * inversesqrt(power) + uShapeVec.w * 0.5 * (strand * strand * strand - 0.35) + uSweep * swell;
}
void main() {
  vec2 p = uOrigin + gl_FragCoord.xy * uSample;
  vec2 heading = vAir.xy;
  vec2 across = vec2(-heading.y, heading.x);
  vec4 hand = vec4(0.0);
  float warm = 0.0;
  if (uTapCount + uWakeCount > 0) {
    vec2 near = p + 24.0 * vec2(
      valueNoise(vec3(p / 95.0, uNow * 0.12), 0x71u),
      valueNoise(vec3(p / 95.0 + 9.1, uNow * 0.12 + 4.0), 0x72u));
    vec2 glow;
    hand = tapsAt(near, glow);
    warm = warmthAt(near);
    hand.zw += vec2(0.25, 0.05) * warm;
  }
  vec2 from = p - hand.xy;
  vec2 turn = vec2(
    valueNoise(vec3(from / uGustVec.y, uTime * 0.04), 0x51u),
    valueNoise(vec3(from / uGustVec.y + 17.3, uTime * 0.04 + 5.0), 0x52u));
  vec2 bent = from + uGustVec.x * turn;
  vec2 q = vec2(dot(bent, heading), dot(bent, across));
  float carried = vAir.z;
  vec2 riding = vec2(q.x - 0.85 * carried, q.y);
  float eddySize = 1.15 * uWindVec.w, fineSize = 0.38 * uWindVec.w;
  vec2 eddy = vec2(
    gradientNoise(vec3(riding / eddySize, uMorph * uTime * 0.04), 0x59u),
    gradientNoise(vec3(riding / eddySize + 31.7, uMorph * uTime * 0.04 + 3.0), 0x5au));
  vec2 folded = riding + uShapeVec.z * 0.9 * uWindVec.w * eddy;
  vec2 fine = vec2(
    gradientNoise(vec3(folded / fineSize, uMorph * uTime * 0.06), 0x5bu),
    gradientNoise(vec3(folded / fineSize + 13.1, uMorph * uTime * 0.06 + 7.0), 0x5cu));
  vec2 creased = (folded + 0.3 * uWindVec.w * fine) / 24.0;
  vec2 tiny = vec2(
    gradientNoise(vec3(creased, uTime * 0.07), 0x5du),
    gradientNoise(vec3(creased + 5.3, uTime * 0.07 + 1.0), 0x5eu));
  vec2 pull = uShapeVec.z * (1.0 + 0.9 * min(hand.w, 1.5)) * (uWindVec.w * (0.9 * eddy + 0.3 * fine) + uShapeVec.x * 30.0 * tiny);
  vec2 curled = q + pull;
  vec2 blows = normalize(heading + 0.6 * turn + hand.xy / 14.0
    + uShapeVec.z * ((0.45 * eddy.x + 0.25 * fine.x) * heading + (0.45 * eddy.y + 0.25 * fine.y) * across));
  float still = gustsAt(curled, carried);
  float field = still + hand.z;
  float level = mix(0.02, 0.82, uGustVec.z);
  float band = mix(0.26, 0.03, uShapeVec.y);
  bool blowing = field > level - band - 0.55 * uTail;
  float strength = 0.0, streaks = 0.0;
  if (blowing || warm > 0.0) {
    float thread = valueNoise(vec3((curled.x - carried * 1.6) / 140.0, curled.y / 30.0, uTime * 0.16), 0x57u);
    streaks = 1.0 - smoothstep(0.0, 0.5, abs(thread));
  }
  if (blowing) {
    float ahead = gustsAt(curled + vec2(56.0, 0.0), carried);
    float leaving = smoothstep(-0.05, 0.07, ahead - still);
    float lit = smoothstep(level - band - 0.55 * uTail * leaving, level + band, field);
    float broad = lit * lit * mix(0.45, 1.0, clamp((field - level) / 0.45, 0.0, 1.0)) * (0.82 + 0.18 * fine.y);
    strength = broad * mix(1.0, 0.25 + 0.95 * streaks, uGustVec.w);
  }
  if (warm > 0.0) {
    float grain = 0.55 * fine.y + 0.45 * tiny.x + 0.3 * (streaks - 0.4);
    strength = 1.0 - (1.0 - strength) * (1.0 - 0.85 * warm * smoothstep(-0.5, 0.25, grain));
  }
  vec2 e = (p - uCalmCentre) / uCalmRadii;
  float calm = 1.0 - (1.0 - CALM_LEFT) * exp(-0.9 * dot(e, e));
  float shown = max(uReveal, min(1.0, 2.0 * hand.w + warm));
  o = vec4(strength * calm * shown, blows * 0.5 + 0.5, calm * shown);
}
`
}

function glyphVertexSource()         {
  const skipUnseen = ASCII_CONFIG.surface.skipUnseen && ASCII_CONFIG.strength.rest <= 0.03
  return /* glsl */`#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D uBoxes;
uniform highp sampler2D uSequence;
uniform highp sampler2D uWindTex;
uniform ivec2 uGrid;
uniform ivec2 uCell;
uniform ivec2 uBuffer;
uniform ivec2 uCellOrigin;
uniform uint uSeed;
uniform float uTime;
uniform float uFill;
uniform float uFlick;
uniform int uCount;
uniform vec4 uCellWorld;
out vec2 vShift;
out vec4 vBox;
out vec2 vGlow;
const ivec2 CORNER[6] = ivec2[6](ivec2(0, 0), ivec2(1, 0), ivec2(0, 1), ivec2(0, 1), ivec2(1, 0), ivec2(1, 1));
const ivec2 SAMPLES = ivec2(1, 2);
uint pcgHash(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hashUnit(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
${TOUCH_GLSL}
void bury() {
  gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
  vShift = vec2(0.0);
  vBox = vec4(0.0);
  vGlow = vec2(0.0);
}
void main() {
  int id = gl_VertexID / 6;
  ivec2 local = ivec2(id % uGrid.x, id / uGrid.x);
  ivec2 c = local + uCellOrigin;
  uint cell = pcgHash((uint(c.x) * 0x9E3779B9u) ^ pcgHash(uint(c.y) ^ uSeed));
  if (hashUnit(cell) >= uFill) { bury(); return; }
  uint pace = pcgHash(cell);
  int steps = int(floor(uTime * uFlick * (0.6 + 0.8 * hashUnit(pace)) + hashUnit(pcgHash(pace))));
  vec2 glow = vec2(0.0);
  if (uTapCount > 0) {
    vec2 g2;
    vec4 effect = tapsAt(uCellWorld.xy + vec2(local) * uCellWorld.zw, g2);
    glow = g2;
    steps += int(floor(6.0 * effect.w + hashUnit(pcgHash(pace ^ 0x33u))));
    glow *= 0.65 + 0.35 * hashUnit(pcgHash(pace ^ 0x51u));
  }
  ${skipUnseen ? `if (glow.x < 0.04 && glow.y < 0.015) {
    ivec2 first = local * SAMPLES, last = uGrid * SAMPLES - 1;
    float most = 0.0;
    for (int y = -1; y <= SAMPLES.y; y++) {
      for (int x = -1; x <= SAMPLES.x; x++) {
        most = max(most, texelFetch(uWindTex, clamp(first + ivec2(x, y), ivec2(0), last), 0).r);
      }
    }
    if (most == 0.0) { bury(); return; }
  }` : ''}
  int g = int(texelFetch(uSequence, ivec2((int(cell >> 8u) + steps) % uCount, 0), 0).r * 255.0 + 0.5);
  uvec4 box = texelFetch(uBoxes, ivec2(g, 0), 0);
  ivec2 origin = local * uCell;
  ivec2 px = origin + ivec2(box.xy) + CORNER[gl_VertexID - id * 6] * ivec2(box.zw);
  ivec2 home = ivec2(g & 15, g >> 4) * uCell;
  vShift = vec2(home - origin);
  vBox = vec4(home, home + uCell - 1);
  vGlow = glow;
  vec2 n = vec2(px) / vec2(uBuffer) * 2.0 - 1.0;
  gl_Position = vec4(n.x, -n.y, 0.0, 1.0);
}
`
}

function glyphFragmentSource()         {
  const head = ASCII_CONFIG.glow.headroom
  const rest = ASCII_CONFIG.strength.rest
  const num = (v        )         => (Number.isInteger(v) ? `${v}.0` : `${v}`)
  return /* glsl */`#version 300 es
precision highp float;
precision highp int;
in vec2 vShift;
in vec4 vBox;
in vec2 vGlow;
uniform highp sampler2D uAtlas;
uniform highp sampler2D uWindTex;
uniform vec3 uInk;
uniform vec3 uGlowColour;
uniform ivec2 uBuffer;
uniform float uFriction;
uniform float uGlowAmount;
uniform float uInkAlpha;
uniform float uAmbientScale;
uniform float uRippleScale;
out vec4 o;
const float REST = ${num(rest)};
const float HEAD = ${num(head)};
ivec4 box = ivec4(0);
float inkAt(ivec2 at) { return texelFetch(uAtlas, clamp(at, box.xy, box.zw), 0).r; }
void main() {
  box = ivec4(floor(vBox + 0.5));
  ivec2 px = ivec2(int(gl_FragCoord.x), uBuffer.y - 1 - int(gl_FragCoord.y));
  ivec2 at = px + ivec2(floor(vShift + 0.5));
  float ink = inkAt(at);
  if (ink <= 0.0) { o = vec4(0.0); return; }
  vec4 wind = texture(uWindTex, (vec2(px) + 0.5) / vec2(uBuffer));
  vec2 blows = wind.gb * 2.0 - 1.0;
  vec2 rise = vec2(inkAt(at + ivec2(1, 0)) - inkAt(at - ivec2(1, 0)),
                   inkAt(at + ivec2(0, 1)) - inkAt(at - ivec2(0, 1)));
  float steep = length(rise);
  float facing = steep > 0.02 ? max(0.0, dot(rise / steep, blows)) : 0.35;
  float caught = mix(1.0, 0.45 + 1.1 * facing, uFriction);
  float light = min(1.0, wind.r * caught) + REST * wind.a;
  float tint = smoothstep(0.04, 0.3, uGlowAmount * vGlow.x);
  float bright = min(1.0, light) * mix(uInkAlpha * uAmbientScale, HEAD * uRippleScale, tint);
  float left = uGlowAmount * 0.3 * vGlow.y * wind.a * uRippleScale;
  float a = ink * min(1.0, (bright + left) / HEAD);
  o = vec4((mix(uInk, uGlowColour, tint) * bright + uGlowColour * left) / (bright + left + 0.0001) * a, a);
}
`
}

                            
                     
               
                
                   
                    
 

/** Rasterise the glyph atlas (16×6 cells) on a 2D canvas and measure each
 *  glyph's tight ink box. Glyphs draw white, left-aligned on an alphabetic
 *  baseline, centred horizontally by the "0" advance and vertically by
 *  the font's bounding box; a glyph whose advance differs from "0" by
 *  more than half a pixel counts as missing from the (monospace) font. */
function buildAtlas(
  doc          , cellWidth        , cellHeight        , fontFamily        , scale        ,
)            {
  const width = cellWidth * ATLAS_COLS
  const height = cellHeight * ATLAS_ROWS
  const c = doc.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('ascii atlas: no 2d context')
  const effScale = Math.max(5 / ASCII_CONFIG.grid.cellCss, scale)
  const weight = effScale < 1.5 ? 400 : ASCII_CONFIG.surface.weight
  ctx.font = `${weight} 100px ${fontFamily}`
  const adv = ctx.measureText('0').width / 100 || 0.6
  const pad = cellWidth < 7 ? 1 : 2
  const glyphPx = Math.max(1, Math.min(
    Math.round(ASCII_CONFIG.surface.glyphCss * effScale), Math.floor((cellWidth - pad) / adv)))
  ctx.font = `${weight} ${glyphPx}px ${fontFamily}`
  const zeroAdv = ctx.measureText('0').width
  const probe = ctx.measureText('Mg|')
  const centreLift = ((probe.fontBoundingBoxAscent ?? glyphPx * 0.8) - (probe.fontBoundingBoxDescent ?? glyphPx * 0.2)) / 2
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const missing            = new Array(ATLAS_CHARS.length).fill(false)
  for (let i = 0; i < ATLAS_CHARS.length; i++) {
    const ch = ATLAS_CHARS[i] ?? ''
    if (!ch) { missing[i] = true; continue }
    if (Math.abs(ctx.measureText(ch).width - zeroAdv) > 0.5) { missing[i] = true; continue }
    const cx = (i % ATLAS_COLS) * cellWidth, cy = Math.floor(i / ATLAS_COLS) * cellHeight
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx, cy, cellWidth, cellHeight)
    ctx.clip()
    ctx.fillText(ch, cx + (cellWidth - zeroAdv) / 2, cy + cellHeight / 2 + centreLift)
    ctx.restore()
  }
  const rgba = ctx.getImageData(0, 0, width, height).data
  const texture = new Uint8Array(width * height)
  for (let i = 0; i < texture.length; i++) texture[i] = rgba[i * 4 + 3] ?? 0
  const boxes = new Uint8Array(ATLAS_CHARS.length * 4)
  for (let i = 0; i < ATLAS_CHARS.length; i++) {
    if (missing[i]) continue
    const cx = (i % ATLAS_COLS) * cellWidth, cy = Math.floor(i / ATLAS_COLS) * cellHeight
    let left = cellWidth, top = cellHeight, right = -1, bottom = -1
    for (let y = 0; y < cellHeight; y++) {
      for (let x = 0; x < cellWidth; x++) {
        if ((rgba[((cy + y) * width + cx + x) * 4 + 3] ?? 0) >= 8) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }
    if (right < 0) { missing[i] = true; continue }
    boxes[i * 4] = left
    boxes[i * 4 + 1] = top
    boxes[i * 4 + 2] = right - left + 1
    boxes[i * 4 + 3] = bottom - top + 1
  }
  return { texture, width, height, boxes, missing }
}

                              
                 
                 
                 
                 
                 
                     
                     
                    
                    
                     
                     
                     
                     
                    
                    
                 
                
              
              
 
                                                                                                    

/** Presentation controls; the underlying wind/tap mathematics is unchanged. */
                              
                       
                      
                                               
                   
 
                                   
                      
                     
                                              
                  
 

                                
                           
                               
                             
                                                
                                          
                                                                                   
                        
                                                                   
                              
                                                                          
                            
                                                                         
                               
                                                                          
                                                           
                                                                                         
                                          
                                   
                                                                                                   
                                                                 
                           
                                                                  
                                                                            
                     
 

                                                             

function compile(gl                        , type        , source        )                     {
  const shader = gl.createShader(type)
  if (!shader) {
    console.error('[Digital Ripples] Unable to allocate a WebGL shader.')
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader
  console.error(`[Digital Ripples] ${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'} shader compilation failed:`, gl.getShaderInfoLog(shader) || 'No compiler diagnostic.')
  gl.deleteShader(shader)
  return null
}

function link(gl                        , vertex        , fragment        )                                                         {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    console.error('[Digital Ripples] Unable to allocate a WebGL program.')
    return null
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.detachShader(program, vs)
  gl.detachShader(program, fs)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    console.error('[Digital Ripples] Shader linking failed:', gl.getProgramInfoLog(program) || 'No linker diagnostic.')
    gl.deleteProgram(program)
    return null
  }
  const uniforms             = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)          
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name)
  }
  return { program, uniforms }
}

function makeTexture(gl                        , unit        )                      {
  const tex = gl.createTexture()
  if (!tex) return null
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  return tex
}

/** Create the renderer. Software WebGL is allowed for compatibility and QA.
 *  Returns null if WebGL2 or a required shader/resource cannot be created. */
function createAsciiRenderer(
  doc          , visit            , fontFamily        ,
)                       {
  const { wind, surface, glow: glowCfg } = ASCII_CONFIG
  const canvas = doc.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:absolute;pointer-events:none;'
  const gl = canvas.getContext('webgl2', {
    alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
    premultipliedAlpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false,
  })
  if (!gl) return null
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const rendererName = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
    : String(gl.getParameter(gl.RENDERER) ?? '')
  const loseContextExt = gl.getExtension('WEBGL_lose_context')
  let fences              = []
  let fenceMisses = 0
  let drawCount = 0
  let slow = false
  let windProg                                                         = null
  let glyphProg                                                         = null
  let windTex                      = null
  let atlasTex                      = null
  let boxTex                      = null
  let seqTex                      = null
  let framebuf                          = null
  let wu             = {}
  let gu             = {}
  let inkRgb                                    = [1, 1, 1]
  let inkAlpha = 1
  let glowRgb                                    = [...glowCfg.color.light]
  let ambientScale = 1
  let rippleScale = 1
  let friction         = wind.friction

  const atlasCache = new Map                   ()
  let atlas                   = null
  let grid                   = null
  let alive = true
  const missing            = new Array(ATLAS_CHARS.length).fill(false)

  // Explicitly retire objects on rebuild as well as destroy. Objects from a
  // lost context must only be forgotten; they no longer belong to the restored
  // context and must never be reused there.
  const releaseGlResources = (deleteObjects         )       => {
    if (deleteObjects && !gl.isContextLost()) {
      gl.useProgram(null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      for (let unit = 0; unit < 4; unit++) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, null)
      }
      for (const fence of fences) gl.deleteSync(fence)
      if (windProg) gl.deleteProgram(windProg.program)
      if (glyphProg) gl.deleteProgram(glyphProg.program)
      if (windTex) gl.deleteTexture(windTex)
      if (atlasTex) gl.deleteTexture(atlasTex)
      if (boxTex) gl.deleteTexture(boxTex)
      if (seqTex) gl.deleteTexture(seqTex)
      if (framebuf) gl.deleteFramebuffer(framebuf)
    }
    fences = []
    fenceMisses = 0
    windProg = null
    glyphProg = null
    windTex = null
    atlasTex = null
    boxTex = null
    seqTex = null
    framebuf = null
    wu = {}
    gu = {}
    atlas = null
    grid = null
  }

  const onContextLost = ()       => releaseGlResources(false)
  canvas.addEventListener('webglcontextlost', onContextLost)

  const uploadTuning = ()       => {
    if (!alive || !glyphProg || gl.isContextLost()) return
    gl.useProgram(glyphProg.program)
    if (gu.uAmbientScale) gl.uniform1f(gu.uAmbientScale, ambientScale)
    if (gu.uRippleScale) gl.uniform1f(gu.uRippleScale, rippleScale)
    if (gu.uFriction) gl.uniform1f(gu.uFriction, friction)
    if (gu.uGlowColour) gl.uniform3f(gu.uGlowColour, glowRgb[0], glowRgb[1], glowRgb[2])
  }

  const initGl = ()          => {
    releaseGlResources(true)
    drawCount = 0
    slow = false
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    windProg = link(gl, WIND_VERTEX, windFragmentSource())
    glyphProg = link(gl, glyphVertexSource(), glyphFragmentSource())
    if (!windProg || !glyphProg) {
      releaseGlResources(true)
      return false
    }
    windTex = makeTexture(gl, 0)
    atlasTex = makeTexture(gl, 1)
    boxTex = makeTexture(gl, 2)
    seqTex = makeTexture(gl, 3)
    framebuf = gl.createFramebuffer()
    if (!atlasTex || !boxTex || !windTex || !seqTex || !framebuf) {
      console.error('[Digital Ripples] Unable to allocate a required WebGL texture or framebuffer.')
      releaseGlResources(true)
      return false
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, windTex, 0)

    wu = windProg.uniforms
    gl.useProgram(windProg.program)
    if (wu.uSeed) gl.uniform1ui(wu.uSeed, visit.seed >>> 0)
    if (wu.uWindVec) gl.uniform4f(wu.uWindVec, visit.heading, visit.speed, visit.gustLength, visit.gustWidth)
    if (wu.uGustVec) gl.uniform4f(wu.uGustVec, visit.bend, visit.bendScale, wind.lull, wind.streak)
    if (wu.uShapeVec) gl.uniform4f(wu.uShapeVec, wind.detail, wind.edge, wind.curl, wind.wisp)
    if (wu.uTail) gl.uniform1f(wu.uTail, wind.tail)
    if (wu.uSweep) gl.uniform1f(wu.uSweep, wind.sweep)
    if (wu.uMorph) gl.uniform1f(wu.uMorph, wind.morph)

    gu = glyphProg.uniforms
    gl.useProgram(glyphProg.program)
    if (gu.uAtlas) gl.uniform1i(gu.uAtlas, 1)
    if (gu.uBoxes) gl.uniform1i(gu.uBoxes, 2)
    if (gu.uWindTex) gl.uniform1i(gu.uWindTex, 0)
    if (gu.uSequence) gl.uniform1i(gu.uSequence, 3)
    if (gu.uSeed) gl.uniform1ui(gu.uSeed, visit.seed >>> 0)
    if (gu.uFill) gl.uniform1f(gu.uFill, surface.fill)
    if (gu.uFlick) gl.uniform1f(gu.uFlick, wind.flick)
    if (gu.uGlowAmount) gl.uniform1f(gu.uGlowAmount, glowCfg.amount)
    if (gu.uInk) gl.uniform3f(gu.uInk, inkRgb[0], inkRgb[1], inkRgb[2])
    if (gu.uInkAlpha) gl.uniform1f(gu.uInkAlpha, inkAlpha)
    uploadTuning()
    return true
  }

  if (!initGl()) {
    canvas.removeEventListener('webglcontextlost', onContextLost)
    loseContextExt?.loseContext()
    return null
  }

  const uploadAtlas = (g           )       => {
    if (!glyphProg) return
    const cacheKey = `${g.cellWidth}x${g.cellHeight}@${g.scale}`
    let cached = atlasCache.get(cacheKey)
    if (!cached) {
      cached = buildAtlas(doc, g.cellWidth, g.cellHeight, fontFamily, g.scale)
      if (atlasCache.size >= 12) {
        const oldest = atlasCache.keys().next().value
        if (oldest !== undefined) atlasCache.delete(oldest)
      }
      atlasCache.set(cacheKey, cached)
    } else {
      // Keep frequently used DPR/size combinations in a small LRU cache.
      atlasCache.delete(cacheKey)
      atlasCache.set(cacheKey, cached)
    }
    atlas = cached
    missing.splice(0, missing.length, ...atlas.missing)
    gl.activeTexture(gl.TEXTURE1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlas.width, atlas.height, 0, gl.RED, gl.UNSIGNED_BYTE, atlas.texture)
    gl.activeTexture(gl.TEXTURE2)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, ATLAS_CHARS.length, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, atlas.boxes)
    const sequence = sequenceFor(visit.key, atlas.missing)
    gl.activeTexture(gl.TEXTURE3)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, sequence.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, sequence)
    gl.useProgram(glyphProg.program)
    if (gu.uCount) gl.uniform1i(gu.uCount, sequence.length)
  }

  const setTouch = (uniforms            , touch                        )       => {
    if (uniforms.uNow) gl.uniform1f(uniforms.uNow, touch?.now ?? 0)
    if (uniforms.uTapCount) gl.uniform1i(uniforms.uTapCount, touch?.tapCount ?? 0)
    if (touch && touch.tapCount > 0 && uniforms.uTaps) gl.uniform4fv(uniforms.uTaps, touch.taps)
    if (uniforms.uWakeCount) gl.uniform1i(uniforms.uWakeCount, touch?.wakeCount ?? 0)
    if (touch && touch.wakeCount > 0) {
      if (uniforms.uWakes) gl.uniform4fv(uniforms.uWakes, touch.wakes)
      if (uniforms.uWays) gl.uniform4fv(uniforms.uWays, touch.ways)
    }
  }

  return {
    canvas,
    rendererName,
    missing,
    restore() {
      if (!alive || gl.isContextLost()) return false
      return initGl()
    },
    isContextLost: () => gl.isContextLost(),
    loseContext() {
      if (!alive || !loseContextExt) return false
      loseContextExt.loseContext()
      return true
    },
    restoreContext() {
      if (!alive || !loseContextExt) return false
      loseContextExt.restoreContext()
      return true
    },
    resize(layout) {
      if (!alive || gl.isContextLost() || !windProg || !glyphProg) return false
      const g = layout.grid
      const prev = grid
      const sameShape = prev !== null && prev.columns === g.columns && prev.rows === g.rows
        && prev.cellWidth === g.cellWidth && prev.cellHeight === g.cellHeight && prev.scale === g.scale
      if (!atlas || !sameShape) {
        if (!atlas || prev?.cellWidth !== g.cellWidth || prev?.cellHeight !== g.cellHeight || prev?.scale !== g.scale) uploadAtlas(g)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, windTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, g.columns, g.rows * 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf)
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          console.error(`[Digital Ripples] Incomplete wind-field framebuffer (0x${status.toString(16)}).`)
          grid = null
          return false
        }
        canvas.width = g.columns * g.cellWidth
        canvas.height = g.rows * g.cellHeight
      }
      grid = g
      canvas.style.width = `${layout.cssW}px`
      canvas.style.height = `${layout.cssH}px`
      canvas.style.left = `${layout.cssLeft}px`
      canvas.style.top = `${layout.cssTop}px`
      gl.useProgram(windProg.program)
      if (wu.uSample) gl.uniform2f(wu.uSample, layout.sampleX, layout.sampleY)
      if (wu.uCanvasSize) gl.uniform2f(wu.uCanvasSize, layout.canvasSizeX, layout.canvasSizeY)
      if (wu.uCalmRadii) gl.uniform2f(wu.uCalmRadii, layout.calmRadiiX, layout.calmRadiiY)
      gl.useProgram(glyphProg.program)
      if (gu.uGrid) gl.uniform2i(gu.uGrid, g.columns, g.rows)
      if (gu.uCell) gl.uniform2i(gu.uCell, g.cellWidth, g.cellHeight)
      if (gu.uBuffer) gl.uniform2i(gu.uBuffer, canvas.width, canvas.height)
      if (gu.uCellOrigin) gl.uniform2i(gu.uCellOrigin, layout.cellOriginX, layout.cellOriginY)
      if (gu.uCellWorld) gl.uniform4f(gu.uCellWorld, layout.cellCentreX, layout.cellCentreY, layout.cellWorldW, layout.cellWorldH)
      return true
    },
    setInk(rgb, alpha) {
      inkRgb = [rgb[0], rgb[1], rgb[2]]
      if (alpha !== undefined) inkAlpha = alpha
      if (!alive || !glyphProg || gl.isContextLost()) return
      gl.useProgram(glyphProg.program)
      if (gu.uInk) gl.uniform3f(gu.uInk, rgb[0], rgb[1], rgb[2])
      if (alpha !== undefined && gu.uInkAlpha) gl.uniform1f(gu.uInkAlpha, alpha)
    },
    setGlow(rgb) {
      glowRgb = [rgb[0], rgb[1], rgb[2]]
      uploadTuning()
    },
    setTuning(tuning) {
      if (tuning.ambientScale !== undefined && Number.isFinite(tuning.ambientScale)) {
        ambientScale = Math.max(0, tuning.ambientScale)
      }
      if (tuning.rippleScale !== undefined && Number.isFinite(tuning.rippleScale)) {
        rippleScale = Math.max(0, tuning.rippleScale)
      }
      if (tuning.friction !== undefined && Number.isFinite(tuning.friction)) {
        friction = Math.max(0, Math.min(1, tuning.friction))
      }
      if (tuning.glowColor) {
        const rgb = tuning.glowColor
        const channel = (value        , previous        )         => Number.isFinite(value)
          ? Math.max(0, Math.min(1, value)) : previous
        glowRgb = [channel(rgb[0], glowRgb[0]), channel(rgb[1], glowRgb[1]), channel(rgb[2], glowRgb[2])]
      }
      uploadTuning()
    },
    getTuning: () => ({ ambientScale, rippleScale, friction, glowColor: [...glowRgb]                             }),
    draw(time, reveal, touch, view) {
      if (!alive || !grid || !windProg || !glyphProg || gl.isContextLost()) return
      slow = false
      const head = fences[0]
      if (head) {
        const status = gl.getSyncParameter(head, gl.SYNC_STATUS)
        if (status === gl.SIGNALED || status === null) {
          gl.deleteSync(head)
          fences = fences.slice(1)
          fenceMisses = 0
        } else {
          fenceMisses += 1
          if (fenceMisses >= 2) {
            gl.deleteSync(head)
            fences = fences.slice(1)
            fenceMisses = 0
            slow = true
          }
        }
      }
      // The wind pass OVERWRITES its texture: blending here would smear
      // each frame into the last (the gate channel is data, not coverage).
      gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf)
      gl.viewport(0, 0, grid.columns, grid.rows * 2)
      gl.useProgram(windProg.program)
      if (wu.uTime) gl.uniform1f(wu.uTime, time)
      if (wu.uReveal) gl.uniform1f(wu.uReveal, reveal)
      if (wu.uOrigin) gl.uniform2f(wu.uOrigin, view.originX, view.originY)
      if (wu.uCalmCentre) gl.uniform2f(wu.uCalmCentre, view.calmCx, view.calmCy)
      setTouch(wu, touch)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.enable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(glyphProg.program)
      if (gu.uTime) gl.uniform1f(gu.uTime, time)
      setTouch(gu, touch)
      gl.drawArrays(gl.TRIANGLES, 0, grid.columns * grid.rows * 6)
      drawCount += 1
      if (drawCount % 4 === 0) {
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        if (fence) {
          gl.flush?.()
          while (fences.length >= 4) {
            const expired = fences.shift()
            if (expired) gl.deleteSync(expired)
          }
          fences.push(fence)
        }
      }
    },
    fellBehind: () => slow,
    readWind() {
      if (!alive || !grid || !framebuf || gl.isContextLost()) return null
      const width = grid.columns, height = grid.rows * 2
      const data = new Uint8Array(width * height * 4)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return { width, height, data }
    },
    destroy() {
      if (!alive) return
      alive = false
      canvas.removeEventListener('webglcontextlost', onContextLost)
      releaseGlResources(true)
      atlasCache.clear()
      loseContextExt?.loseContext()
      canvas.remove()
    },
  }
}



/* CPU fallback: the same field/touch math sampled on a coarser lattice.
 * Glyph-edge lighting is approximated; WebGL2 remains the reference renderer.
 * Copyright (c) 2026 Digital Ripples contributors. MIT.
 */


function createCanvasRenderer(doc, visit, fontFamily) {
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


/* Digital Ripples — a portable browser lifecycle around the Orgtree field.
 * Copyright (c) 2026 Digital Ripples contributors. MIT.
 * The adapted field/GL modules retain Maurdekye's MIT notice.
 */



const PRESETS = Object.freeze({
  reference: Object.freeze({ backgroundColor: '#fafafa', inkColor: '#858582', rippleColor: '#2062f0', scale: 1, ambientOpacity: 0.075, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
  warm: Object.freeze({ backgroundColor: '#fbfbf8', inkColor: '#87877f', rippleColor: '#2047f4', scale: 1, ambientOpacity: 0.075, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
  dark: Object.freeze({ backgroundColor: '#191a1b', inkColor: '#a2a3a5', rippleColor: '#19adff', scale: 1, ambientOpacity: 0.10, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
});
const DEFAULTS = Object.freeze({
  ...PRESETS.reference, preset: 'reference', shape: 'auto', seed: 526526,
  interactive: true, pointerWake: true, respectReducedMotion: true,
  maxDpr: 2, fps: 60, idleFps: 25, idleAfter: 180,
  fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace',
  renderer: 'auto', eventTarget: null, introDuration: 1.5,
  calmCentre: [0.5, 0.45], calmRadii: [250, 80],
});
const EXCLUDE = '[data-ripple-ignore],a,button,input,textarea,select,option,label,summary,[role="button"],[role="slider"],[contenteditable="true"],video,audio';
const clip = (x, min, max, otherwise) => Number.isFinite(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : otherwise;
const rgba = (value, fallback) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(value));
  const s = m ? m[1] : fallback.slice(1);
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};
function cleanOptions(raw, base = DEFAULTS) {
  const o = { ...base, ...raw };
  o.scale = clip(o.scale, 0.45, 2.5, 1);
  o.speed = clip(o.speed, 0.15, 3, 1);
  o.ambientOpacity = clip(o.ambientOpacity, 0, 0.6, .075);
  o.rippleOpacity = clip(o.rippleOpacity, 0, 1, .4);
  o.maxDpr = clip(o.maxDpr, 0.75, 3, 2);
  o.fps = clip(o.fps, 10, 120, 60);
  o.idleFps = clip(o.idleFps, 5, 60, 25);
  o.idleAfter = clip(o.idleAfter, 0, 86400, 180);
  o.introDuration = clip(o.introDuration, 0, 10, 1.5);
  o.seed = Number.isFinite(Number(o.seed)) ? Number(o.seed) >>> 0 : 526526;
  if (!['mixed', 'lettered', 'figured'].includes(o.glyphPool)) o.glyphPool = 'mixed';
  if (!['auto', 'ripple', 'heart'].includes(o.shape)) o.shape = 'auto';
  if (!['auto', 'webgl2', 'canvas2d'].includes(o.renderer)) o.renderer = 'auto';
  for (const k of ['inkColor', 'rippleColor']) if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DEFAULTS[k];
  if (o.backgroundColor !== null && !/^#[0-9a-f]{6}$/i.test(o.backgroundColor)) o.backgroundColor = DEFAULTS.backgroundColor;
  o.calmCentre = Array.isArray(o.calmCentre) && o.calmCentre.length === 2 ? o.calmCentre.map((n, i) => clip(n, -2, 3, DEFAULTS.calmCentre[i])) : [...DEFAULTS.calmCentre];
  o.calmRadii = Array.isArray(o.calmRadii) && o.calmRadii.length === 2 ? o.calmRadii.map((n, i) => clip(n, 1, 4000, DEFAULTS.calmRadii[i])) : [...DEFAULTS.calmRadii];
  return o;
}

class DigitalRipples {
  static presets = PRESETS;
  static version = '1.0.0';
  constructor(target, options = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host || host.nodeType !== 1) throw new TypeError('DigitalRipples: provide a container element or a matching selector.');
    this.host = host;
    this.doc = host.ownerDocument;
    this.win = this.doc.defaultView;
    this.options = cleanOptions({ ...(PRESETS[options.preset] || PRESETS.reference), ...options });
    this._originalStyle = { position: host.style.position, overflow: host.style.overflow, backgroundColor: host.style.backgroundColor };
    if (this.win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    this._abort = new this.win.AbortController();
    this._touch = createTouch();
    this._time = 0;
    this._fieldTime = 8;
    this._elapsed = 0;
    this._lastActive = 0;
    this._lastFrame = null;
    this._totalClicks = 0;
    this._paused = false;
    this._destroyed = false;
    this._inView = true;
    this._lost = false;
    this._phase = 'initializing';
    this._samples = [];
    this._frameMs = 0;
    this._generation = 0;
    this._errors = [];
    this._media = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this._bind();
    this.ready = this._initialize();
  }
  _event(name, detail = {}) { this.host.dispatchEvent(new this.win.CustomEvent(name, { detail })); }
  _bind() {
    const opts = { signal: this._abort.signal, passive: true };
    this._eventTarget = this.options.eventTarget || this.doc;
    const point = e => {
      if (!this.options.interactive || this._paused || this._destroyed || this._reduced()) return null;
      const el = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
      if (el?.closest(EXCLUDE)) return null;
      const r = this.host.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null;
    };
    this._eventTarget.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const p = point(e);
      if (p) this.ripple(p.x, p.y);
    }, opts);
    this._eventTarget.addEventListener('pointermove', e => {
      if (!this.options.pointerWake || e.pointerType === 'touch') return;
      const p = point(e);
      if (!p) { this._touch.leave(); return; }
      if (this._touch.move(p.x / this.options.scale, p.y / this.options.scale, this._time)) this._rouse();
    }, opts);
    this._eventTarget.addEventListener('pointerleave', () => this._touch.leave(), opts);
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.hidden) { this._stop(); this._phase = 'hidden'; }
      else { this._lastFrame = null; this._rouse(); }
    }, opts);
    this.win.addEventListener('resize', () => this._queueResize(), opts);
    const motionChanged = () => { this._stop(); this._draw(); this._start(); };
    this._media.addEventListener('change', motionChanged, { signal: this._abort.signal });
    this._ro = new this.win.ResizeObserver(() => this._queueResize());
    this._ro.observe(this.host);
    if (this.win.IntersectionObserver) {
      this._io = new this.win.IntersectionObserver(entries => {
        this._inView = entries.some(e => e.isIntersecting);
        if (this._inView) this._start(); else { this._stop(); this._phase = 'offscreen'; }
      });
      this._io.observe(this.host);
    }
  }
  _reduced() { return this.options.respectReducedMotion && this._media.matches; }
  async _initialize() {
    const generation = ++this._generation;
    this._stop();
    this._layout = null;
    this._phase = 'initializing';
    this._renderer?.destroy();
    this._renderer = null;
    try {
      await Promise.race([this.doc.fonts?.load(`400 12px ${this.options.fontFamily}`), new Promise(resolve => this.win.setTimeout(resolve, 200))]);
    } catch { /* Local system monospace remains available. */ }
    if (this._destroyed || generation !== this._generation) return this;
    this._lost = false;
    this._visit = visitFromSeed(this.options.seed, this.options.glyphPool);
    try {
      if (this.options.renderer !== 'canvas2d') this._renderer = createAsciiRenderer(this.doc, this._visit, this.options.fontFamily);
    } catch (e) { this._errors.push(String(e?.message || e)); }
    if (!this._renderer && this.options.renderer !== 'webgl2') this._renderer = createCanvasRenderer(this.doc, this._visit, this.options.fontFamily);
    if (!this._renderer) {
      this._phase = 'unavailable';
      this._event('error', { message: 'No supported rendering context is available.' });
      return this;
    }
    this.canvas = this._renderer.canvas;
    this.canvas.dataset.digitalRipples = '';
    this.canvas.style.opacity = '.78';
    this.host.appendChild(this.canvas);
    this.canvas.addEventListener('webglcontextlost', e => {
      if (generation !== this._generation || this._destroyed) return;
      e.preventDefault();
      this._lost = true;
      this._stop();
      this._phase = 'context-lost';
      this._event('statechange', this.getStats());
    }, { signal: this._abort.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      if (generation !== this._generation || this._destroyed) return;
      this._lost = false;
      if (!this._renderer.restore()) { this._phase = 'unavailable'; return; }
      this._layout = null;
      this._applyColours();
      this._resize();
      this._lastFrame = null;
      this._start();
    }, { signal: this._abort.signal });
    this._applyColours();
    this._resize();
    this._phase = this._reduced() ? 'reduced-motion' : 'running';
    this._start();
    this._event('ready', this.getStats());
    return this;
  }
  _applyColours() {
    if (this.options.backgroundColor !== null) this.host.style.backgroundColor = this.options.backgroundColor;
    else this.host.style.backgroundColor = this._originalStyle.backgroundColor;
    if (!this._renderer) return;
    this._renderer.setInk(rgba(this.options.inkColor, DEFAULTS.inkColor), 1);
    this._renderer.setGlow(rgba(this.options.rippleColor, DEFAULTS.rippleColor));
    this._renderer.setTuning({ ambientScale: this.options.ambientOpacity / .075, rippleScale: this.options.rippleOpacity / .4 });
  }
  _queueResize() {
    this.win.cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = this.win.requestAnimationFrame(() => {
      if (this._destroyed) return;
      this._resize();
      this._start();
    });
  }
  _resize() {
    if (!this._renderer || this._lost || this._destroyed) return;
    const rect = this.host.getBoundingClientRect();
    this._width = rect.width;
    this._height = rect.height;
    const device = this.win.devicePixelRatio || 1;
    const budgetDpr = Math.sqrt(ASCII_CONFIG.grid.maxDevicePixels / Math.max(1, rect.width * rect.height));
    const dpr = Math.max(.5, Math.min(device, this.options.maxDpr, budgetDpr));
    this._dpr = dpr;
    const scale = this.options.scale;
    const g = gridFor(Math.round(rect.width * dpr), Math.round(rect.height * dpr), dpr * scale);
    if (!g) { this._layout = null; this.canvas.style.display = 'none'; this._phase = 'too-small'; return; }
    const unit = dpr * scale;
    const cw = g.cellWidth / unit, ch = g.cellHeight / unit;
    const cssLeft = g.left / dpr, cssTop = g.top / dpr;
    const layout = {
      grid: g, originX: cssLeft / scale, originY: cssTop / scale,
      sampleX: cw, sampleY: ch / 2,
      canvasSizeX: g.columns * cw, canvasSizeY: g.rows * ch,
      calmRadiiX: this.options.calmRadii[0], calmRadiiY: this.options.calmRadii[1],
      cellOriginX: 0, cellOriginY: 0,
      cellCentreX: cssLeft / scale + cw / 2, cellCentreY: cssTop / scale + ch / 2,
      cellWorldW: cw, cellWorldH: ch,
      cssLeft, cssTop, cssW: g.columns * g.cellWidth / dpr, cssH: g.rows * g.cellHeight / dpr,
    };
    this.canvas.style.display = '';
    if (!this._renderer.resize(layout)) return;
    this._layout = layout;
    this._draw();
  }
  _rouse() {
    this._lastActive = this._elapsed;
    if (this._phase === 'calm') this._phase = 'running';
    this._start();
  }
  _draw() {
    if (!this._layout || !this._renderer || this._lost || this._destroyed) return;
    const intro = this._reduced() || this.options.introDuration === 0 ? 1 : smooth01(this._elapsed / this.options.introDuration);
    const idle = this.options.idleAfter === 0 ? 1 : 1 - smooth01((this._elapsed - this._lastActive - this.options.idleAfter) / 8);
    this._reveal = intro * idle;
    const start = this.win.performance.now();
    this._renderer.draw(this._fieldTime, this._reveal, this._touch.frame(this._time), {
      originX: this._layout.originX, originY: this._layout.originY,
      calmCx: this._width * this.options.calmCentre[0] / this.options.scale,
      calmCy: this._height * this.options.calmCentre[1] / this.options.scale,
    });
    this._frameMs = this.win.performance.now() - start;
    this.canvas.dataset.phase = this._phase;
    this.canvas.dataset.renderer = this._renderer.kind || 'webgl2';
  }
  _start() {
    if (this._raf || this._timer || this._destroyed || this._lost || this._paused || !this._renderer || !this._layout || this.doc.hidden || !this._inView) return;
    if (this._reduced()) { this._phase = 'reduced-motion'; this._draw(); return; }
    if (this._phase === 'calm') return;
    this._phase = 'running';
    this._lastFrame = null;
    this._raf = this.win.requestAnimationFrame(t => this._tick(t));
  }
  _tick(timestamp) {
    this._raf = 0;
    if (this._destroyed || this._lost || this._paused || !this._renderer || !this._layout || this.doc.hidden || !this._inView) { this._stop(); return; }
    if (this._reduced()) { this._stop(); this._phase = 'reduced-motion'; this._draw(); return; }
    const rawDelta = this._lastFrame === null ? 0 : Math.max(0, (timestamp - this._lastFrame) / 1000);
    // Preserve measured frame rate; cap only simulation jumps after a long stall.
    const delta = Math.min(.25, rawDelta);
    if (this._lastFrame !== null && rawDelta > 0) {
      this._samples.push(rawDelta);
      if (this._samples.length > 60) this._samples.shift();
    }
    this._lastFrame = timestamp;
    this._elapsed += delta;
    this._time += delta * this.options.speed;
    const settle = this.options.idleAfter === 0 ? 1 : 1 - smooth01((this._elapsed - this._lastActive - this.options.idleAfter) / 8);
    this._fieldTime += delta * this.options.speed * settle;
    this._draw();
    const active = this._touch.busy(this._time);
    if (settle === 0 && !active) { this._phase = 'calm'; this._stop(); this._event('statechange', this.getStats()); return; }
    const fallback = this._renderer.kind === 'canvas2d';
    const fps = Math.min(fallback ? 15 : 120, active ? this.options.fps : this.options.idleFps);
    const targetMs = 1000 / fps;
    const delay = Math.max(0, targetMs - this._frameMs - 8);
    this._timer = this.win.setTimeout(() => {
      this._timer = 0;
      this._raf = this.win.requestAnimationFrame(t => this._tick(t));
    }, delay);
  }
  _stop() {
    this.win.cancelAnimationFrame(this._raf);
    this.win.clearTimeout(this._timer);
    this._raf = this._timer = 0;
    this._lastFrame = null;
  }
  ripple(x, y, options = {}) {
    if (this._destroyed || this._paused || this._reduced() || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const shape = ['auto', 'ripple', 'heart'].includes(options.shape) ? options.shape : this.options.shape;
    this._totalClicks++;
    const actualShape = shape === 'auto' ? this._totalClicks % 3 === 0 ? 'heart' : 'ripple' : shape;
    this._touch.tap(x / this.options.scale, y / this.options.scale, this._time, { shape: actualShape, strength: clip(options.strength ?? 1, 0, 3, 1) });
    this._rouse();
    const detail = { x, y, shape: actualShape, count: this._totalClicks };
    this._event('ripple', detail);
    return detail;
  }
  setOptions(patch = {}) {
    if (this._destroyed) return this;
    const old = this.options;
    this.options = cleanOptions(patch, old);
    if (old.respectReducedMotion !== this.options.respectReducedMotion) this._stop();
    const fresh = ['seed', 'glyphPool', 'fontFamily', 'renderer'].some(k => old[k] !== this.options[k]);
    if (fresh) this.ready = this._initialize();
    else { this._applyColours(); this._resize(); this._rouse(); }
    return this;
  }
  setPreset(name) {
    if (!PRESETS[name]) throw new RangeError(`Unknown Digital Ripples preset: ${name}`);
    this.clear();
    return this.setOptions({ ...PRESETS[name], preset: name });
  }
  getOptions() { const { eventTarget, ...plain } = this.options; return { ...plain, calmCentre: [...plain.calmCentre], calmRadii: [...plain.calmRadii] }; }
  getStats() {
    const span = this._samples.reduce((s, x) => s + x, 0);
    return {
      version: DigitalRipples.version, renderer: this._renderer?.kind || (this._renderer ? 'webgl2' : 'none'),
      rendererName: this._renderer?.rendererName || '', phase: this._phase,
      fps: span ? Math.round(this._samples.length / span * 10) / 10 : 0,
      frameMs: Math.round(this._frameMs * 100) / 100,
      columns: this._layout?.grid.columns || 0, rows: this._layout?.grid.rows || 0,
      dpr: this._dpr || 1, width: this._width || 0, height: this._height || 0,
      activeRipples: this._touch.liveTaps(this._time).length, totalClicks: this._totalClicks,
      time: this._time, fieldTime: this._fieldTime, paused: this._paused,
      reducedMotion: !!this._reduced(), seed: this.options.seed, errors: [...this._errors],
    };
  }
  clear() { this._touch.clear(); this._totalClicks = 0; this._samples = []; this._draw(); return this; }
  pause() { this._paused = true; this._stop(); this._phase = 'paused'; this._event('statechange', this.getStats()); return this; }
  resume() { this._paused = false; this._rouse(); this._event('statechange', this.getStats()); return this; }
  /** Deterministic rendering for comparison/export; events use CSS pixels and seconds. */
  renderAt(time, events = []) {
    this.pause();
    this._time = Math.max(0, Number(time) || 0);
    this._fieldTime = 8 + this._time;
    this._elapsed = Math.max(this.options.introDuration, this._time);
    this._lastActive = this._elapsed;
    this._touch.clear();
    this._totalClicks = 0;
    for (const e of events) {
      if (e.at > this._time || this._time - e.at >= 3.6) continue;
      this._touch.tap(e.x / this.options.scale, e.y / this.options.scale, e.at, { shape: e.shape || 'ripple', strength: e.strength ?? 1 });
      this._totalClicks++;
    }
    this._draw();
    return this;
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._generation++;
    this._stop();
    this.win.cancelAnimationFrame(this._resizeFrame);
    this._abort.abort();
    this._ro.disconnect();
    this._io?.disconnect();
    this._renderer?.destroy();
    this._renderer = null;
    Object.assign(this.host.style, this._originalStyle);
    this._phase = 'destroyed';
  }
}

if (typeof window !== 'undefined') window.DigitalRipples = DigitalRipples;
})();
