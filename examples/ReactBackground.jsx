'use client';

import { useEffect, useRef } from 'react';
import { DigitalRipples } from '../dist/digital-ripples.module.js';

/**
 * A reusable full-viewport React background.
 *
 * Foreground content can remain fully interactive. The renderer listens on
 * the document and automatically ignores links, buttons, and inputs. Add
 * data-ripple-ignore to any other widget or region that should not emit waves.
 *
 * Props passed to the renderer can be changed after mounting. The instance is
 * always destroyed on unmount (including React Strict Mode's effect replay).
 */
export default function ReactBackground({
  preset = 'reference',
  options = {},
  className,
  style,
  onReady,
  onRipple,
}) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const latestOptions = useRef(options);
  const latestPreset = useRef(preset);
  const appliedPreset = useRef(preset);
  const onReadyRef = useRef(onReady);
  const onRippleRef = useRef(onRipple);

  latestOptions.current = options;
  latestPreset.current = preset;
  onReadyRef.current = onReady;
  onRippleRef.current = onRipple;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const handleRipple = (event) => onRippleRef.current?.(event.detail);
    const handleReady = () => {
      if (rendererRef.current) onReadyRef.current?.(rendererRef.current);
    };
    host.addEventListener('ripple', handleRipple);
    host.addEventListener('ready', handleReady);
    const instance = new DigitalRipples(host, {
      interactive: true,
      respectReducedMotion: true,
      ...latestOptions.current,
      preset: latestPreset.current,
    });
    rendererRef.current = instance;
    appliedPreset.current = latestPreset.current;

    return () => {
      host.removeEventListener('ripple', handleRipple);
      host.removeEventListener('ready', handleReady);
      instance.destroy();
      if (rendererRef.current === instance) rendererRef.current = null;
    };
  }, []);

  // A preset change resets its visual defaults, then reapplies explicit overrides.
  useEffect(() => {
    const instance = rendererRef.current;
    if (!instance || appliedPreset.current === preset) return;
    appliedPreset.current = preset;
    instance.setPreset(preset);
    instance.setOptions(latestOptions.current);
  }, [preset]);

  // Update the mounted instance. Fonts, glyph pools, seeds, and renderer changes
  // can rebuild its internal canvas without remounting this React component.
  useEffect(() => {
    rendererRef.current?.setOptions(options);
  }, [options]);

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', ...style }}
    />
  );
}

/* Usage:

import ReactBackground from './ReactBackground.jsx';

export function PersonalPage() {
  return (
    <>
      <ReactBackground preset="reference" options={{ scale: 1, shape: 'auto' }} />
      <main style={{ position: 'relative', zIndex: 1 }}>
        <h1>My personal page</h1>
        <a href="/about" data-ripple-ignore>
          About me
        </a>
      </main>
    </>
  );
}

*/
