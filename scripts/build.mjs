// No third-party build dependencies. Requires Node >= 22.18 (built-in type stripping).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await mkdir(out, { recursive: true });
const names = ['field.ts', 'gl.ts', 'fallback.js', 'controller.js'];
const pieces = [];
for (const name of names) {
  let source = await readFile(path.join(root, 'src', name), 'utf8');
  if (name.endsWith('.ts')) source = stripTypeScriptTypes(source, { mode: 'strip' });
  source = source.replace(/^import\s[^;\n]+(?:;)?\s*$/gm, '').replace(/^export\s+(?=(?:const|let|function|class)\b)/gm, '');
  pieces.push(source);
}
const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
const preamble = `/*! Digital Ripples 1.0.0 | Adapted from Orgtree (c) 2026 Maurdekye.\n${license.split('\n').map(l => ' * ' + l).join('\n')}\n */\n`;
const body = `(function () {\n'use strict';\n${pieces.join('\n\n')}\nif (typeof window !== 'undefined') window.DigitalRipples = DigitalRipples;\n})();\n`;
await writeFile(path.join(out, 'digital-ripples.js'), preamble + body);
await writeFile(path.join(out, 'digital-ripples.module.js'), preamble + pieces.join('\n\n') + '\nexport { DigitalRipples };\nexport default DigitalRipples;\n');
const html = await readFile(path.join(out, 'index.html'), 'utf8');
const css = await readFile(path.join(out, 'demo.css'), 'utf8');
const demo = await readFile(path.join(out, 'demo.js'), 'utf8');
const escapeScript = s => s.replace(/<\/script/gi, '<\\/script');
const single = html
  .replace(/<link\b[^>]*href=["'](?:\.\/)?demo\.css["'][^>]*>/, `<style>${css}</style>`)
  .replace(/<script\b[^>]*src=["'](?:\.\/)?digital-ripples\.js["'][^>]*><\/script>/, '')
  .replace(/<script\b[^>]*src=["'](?:\.\/)?demo\.js["'][^>]*><\/script>/, '')
  .replace('</body>', `<script>${escapeScript(preamble + body)}</script>\n<script>${escapeScript(demo)}</script>\n</body>`);
await writeFile(path.join(root, 'digital-ripples-standalone.html'), single);
console.log(JSON.stringify({ built: ['dist/digital-ripples.js', 'dist/digital-ripples.module.js', 'digital-ripples-standalone.html'], bytes: Buffer.byteLength(preamble + body) }));
