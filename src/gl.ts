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
import { ASCII_CONFIG, ATLAS_CHARS, ATLAS_COLS, ATLAS_ROWS, sequenceFor } from './field'
import type { AsciiGrid, AsciiTouchFrame, AsciiVisit } from './field'

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

function windFragmentSource(): string {
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

function glyphVertexSource(): string {
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

function glyphFragmentSource(): string {
  const head = ASCII_CONFIG.glow.headroom
  const rest = ASCII_CONFIG.strength.rest
  const num = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`)
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

export interface AtlasData {
  texture: Uint8Array
  width: number
  height: number
  boxes: Uint8Array
  missing: boolean[]
}

/** Rasterise the glyph atlas (16×6 cells) on a 2D canvas and measure each
 *  glyph's tight ink box. Glyphs draw white, left-aligned on an alphabetic
 *  baseline, centred horizontally by the "0" advance and vertically by
 *  the font's bounding box; a glyph whose advance differs from "0" by
 *  more than half a pixel counts as missing from the (monospace) font. */
export function buildAtlas(
  doc: Document, cellWidth: number, cellHeight: number, fontFamily: string, scale: number,
): AtlasData {
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
  const missing: boolean[] = new Array(ATLAS_CHARS.length).fill(false)
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

export interface AsciiLayout {
  grid: AsciiGrid
  originX: number
  originY: number
  sampleX: number
  sampleY: number
  canvasSizeX: number
  canvasSizeY: number
  calmRadiiX: number
  calmRadiiY: number
  cellOriginX: number
  cellOriginY: number
  cellCentreX: number
  cellCentreY: number
  cellWorldW: number
  cellWorldH: number
  cssLeft: number
  cssTop: number
  cssW: number
  cssH: number
}
export interface AsciiFrameView { originX: number; originY: number; calmCx: number; calmCy: number }

/** Presentation controls; the underlying wind/tap mathematics is unchanged. */
export interface AsciiTuning {
  ambientScale?: number
  rippleScale?: number
  glowColor?: readonly [number, number, number]
  friction?: number
}
export interface AsciiTuningState {
  ambientScale: number
  rippleScale: number
  glowColor: readonly [number, number, number]
  friction: number
}

export interface AsciiRenderer {
  canvas: HTMLCanvasElement
  readonly rendererName: string
  missing: readonly boolean[]
  /** Structural resize; false if GL is gone. */
  resize: (layout: AsciiLayout) => boolean
  /** Rebuild GL programs, textures, and framebuffer after webglcontextrestored. */
  restore: () => boolean
  /** True when the underlying WebGL2 context is currently lost. */
  isContextLost: () => boolean
  /** Trigger real WEBGL_lose_context loss for resilience verification. */
  loseContext: () => boolean
  /** Trigger real WEBGL_lose_context restoration after loseContext(). */
  restoreContext: () => boolean
  setInk: (rgb: readonly [number, number, number], alpha?: number) => void
  setGlow: (rgb: readonly [number, number, number]) => void
  /** Live controls survive context restoration. Scales default to 1; friction to 0.6. */
  setTuning: (tuning: AsciiTuning) => void
  getTuning: () => AsciiTuningState
  draw: (time: number, reveal: number, touch: AsciiTouchFrame | null, view: AsciiFrameView) => void
  /** True when the last frame's GPU cost exceeded its budget. */
  fellBehind: () => boolean
  /** Raw wind-texture readback for the seeded numerical proof. */
  readWind: () => { width: number; height: number; data: Uint8Array } | null
  destroy: () => void
}

type UniformMap = Record<string, WebGLUniformLocation | null>

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
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

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): { program: WebGLProgram; uniforms: UniformMap } | null {
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
  const uniforms: UniformMap = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name)
  }
  return { program, uniforms }
}

function makeTexture(gl: WebGL2RenderingContext, unit: number): WebGLTexture | null {
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
export function createAsciiRenderer(
  doc: Document, visit: AsciiVisit, fontFamily: string,
): AsciiRenderer | null {
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
  let fences: WebGLSync[] = []
  let fenceMisses = 0
  let drawCount = 0
  let slow = false
  let windProg: { program: WebGLProgram; uniforms: UniformMap } | null = null
  let glyphProg: { program: WebGLProgram; uniforms: UniformMap } | null = null
  let windTex: WebGLTexture | null = null
  let atlasTex: WebGLTexture | null = null
  let boxTex: WebGLTexture | null = null
  let seqTex: WebGLTexture | null = null
  let framebuf: WebGLFramebuffer | null = null
  let wu: UniformMap = {}
  let gu: UniformMap = {}
  let inkRgb: readonly [number, number, number] = [1, 1, 1]
  let inkAlpha = 1
  let glowRgb: readonly [number, number, number] = [...glowCfg.color.light]
  let ambientScale = 1
  let rippleScale = 1
  let friction: number = wind.friction

  const atlasCache = new Map<string, AtlasData>()
  let atlas: AtlasData | null = null
  let grid: AsciiGrid | null = null
  let alive = true
  const missing: boolean[] = new Array(ATLAS_CHARS.length).fill(false)

  // Explicitly retire objects on rebuild as well as destroy. Objects from a
  // lost context must only be forgotten; they no longer belong to the restored
  // context and must never be reused there.
  const releaseGlResources = (deleteObjects: boolean): void => {
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

  const onContextLost = (): void => releaseGlResources(false)
  canvas.addEventListener('webglcontextlost', onContextLost)

  const uploadTuning = (): void => {
    if (!alive || !glyphProg || gl.isContextLost()) return
    gl.useProgram(glyphProg.program)
    if (gu.uAmbientScale) gl.uniform1f(gu.uAmbientScale, ambientScale)
    if (gu.uRippleScale) gl.uniform1f(gu.uRippleScale, rippleScale)
    if (gu.uFriction) gl.uniform1f(gu.uFriction, friction)
    if (gu.uGlowColour) gl.uniform3f(gu.uGlowColour, glowRgb[0], glowRgb[1], glowRgb[2])
  }

  const initGl = (): boolean => {
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

  const uploadAtlas = (g: AsciiGrid): void => {
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

  const setTouch = (uniforms: UniformMap, touch: AsciiTouchFrame | null): void => {
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
        const channel = (value: number, previous: number): number => Number.isFinite(value)
          ? Math.max(0, Math.min(1, value)) : previous
        glowRgb = [channel(rgb[0], glowRgb[0]), channel(rgb[1], glowRgb[1]), channel(rgb[2], glowRgb[2])]
      }
      uploadTuning()
    },
    getTuning: () => ({ ambientScale, rippleScale, friction, glowColor: [...glowRgb] as [number, number, number] }),
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

