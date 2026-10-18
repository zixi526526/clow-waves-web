#!/usr/bin/env python3
"""Record an animated README preview from this project's own renderer."""
from pathlib import Path
import hashlib
import os
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'preview' / 'demo.gif'
SOURCE = ROOT / 'digital-ripples-standalone.html'
FPS = 6
DURATION = 4.6

with tempfile.TemporaryDirectory(prefix='clow-readme-') as tmp:
    frames = Path(tmp)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_EXECUTABLE'), args=[
            '--no-sandbox', '--disable-dev-shm-usage',
            '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'
        ])
        page = browser.new_page(viewport={'width': 960, 'height': 540}, device_scale_factor=1)
        page.set_content(SOURCE.read_text(encoding='utf-8'), wait_until='load')
        page.wait_for_function('window.ripplesDemo?.engine', timeout=30000)
        page.evaluate("""async () => {
            const { engine, setUIHidden } = window.ripplesDemo;
            await engine.ready;
            setUIHidden(true);
            document.getElementById('restore-interface').hidden = true;
            engine.pause();
        }""")
        for index in range(int(DURATION * FPS)):
            now = index / FPS
            events = [{'at': 0.10, 'x': 470, 'y': 285, 'shape': 'ripple', 'strength': 1.3}]
            if now >= 2.15:
                events.append({'at': 2.15, 'x': 485, 'y': 265, 'shape': 'heart', 'strength': 1.35})
            page.evaluate("""([time, ripples]) => {
                window.ripplesDemo.engine.renderAt(time, ripples);
            }""", [now, events])
            page.screenshot(path=str(frames / f'{index:03d}.png'), animations='disabled')
        print('Renderer:', page.evaluate('window.ripplesDemo.getState().stats.rendererName'))
        browser.close()

    DEST.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-framerate', str(FPS), '-i', str(frames / '%03d.png'),
        '-filter_complex',
        '[0:v]fps=6,scale=550:-1:flags=lanczos,split[a][b];'
        '[a]palettegen=stats_mode=full:max_colors=24[p];'
        '[b][p]paletteuse=dither=bayer:bayer_scale=4',
        '-loop', '0', str(DEST)
    ], check=True)

print(f'Created {DEST.relative_to(ROOT)} ({DEST.stat().st_size} bytes)')
print('SHA256:', hashlib.sha256(DEST.read_bytes()).hexdigest())
