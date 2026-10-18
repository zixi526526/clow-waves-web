export type RippleShape = 'auto' | 'ripple' | 'heart';
export type RipplePreset = 'reference' | 'warm' | 'dark';
export interface DigitalRipplesOptions {
  preset?: RipplePreset;
  shape?: RippleShape;
  glyphPool?: 'mixed' | 'lettered' | 'figured';
  seed?: number;
  /** Overall visual scale, including cell size and wave radius. Default 1. */
  scale?: number;
  speed?: number;
  /** Relative control, not a CSS alpha; default 0.075. */
  ambientOpacity?: number;
  /** Relative control, not a CSS alpha; default 0.4. */
  rippleOpacity?: number;
  /** Six-digit hex, or null to preserve the host's background. */
  backgroundColor?: string | null;
  inkColor?: string;
  rippleColor?: string;
  fontFamily?: string;
  interactive?: boolean;
  pointerWake?: boolean;
  respectReducedMotion?: boolean;
  maxDpr?: number;
  fps?: number;
  idleFps?: number;
  /** 180 by default; 0 keeps ambient animation running while visible. */
  idleAfter?: number;
  introDuration?: number;
  renderer?: 'auto' | 'webgl2' | 'canvas2d';
  /** Constructor option. Defaults to the host's document. */
  eventTarget?: EventTarget | null;
  calmCentre?: [number, number];
  calmRadii?: [number, number];
}
export interface RippleEvent { x: number; y: number; shape: 'ripple' | 'heart'; count: number; }
export interface RippleFrameEvent { x: number; y: number; at: number; shape?: 'ripple' | 'heart'; strength?: number; }
export interface RippleStats {
  version: string;
  renderer: 'webgl2' | 'canvas2d' | 'none';
  rendererName: string;
  phase: string;
  fps: number;
  /** CPU submission/drawing time, not a hardware GPU timer. */
  frameMs: number;
  columns: number;
  rows: number;
  dpr: number;
  width: number;
  height: number;
  activeRipples: number;
  totalClicks: number;
  time: number;
  fieldTime: number;
  paused: boolean;
  reducedMotion: boolean;
  seed: number;
  errors: string[];
}
export class DigitalRipples {
  static readonly version: string;
  static readonly presets: Readonly<Record<RipplePreset, Partial<DigitalRipplesOptions>>>;
  constructor(target: HTMLElement | string, options?: DigitalRipplesOptions);
  readonly host: HTMLElement;
  readonly ready: Promise<this>;
  readonly canvas?: HTMLCanvasElement;
  ripple(x: number, y: number, options?: { shape?: RippleShape; strength?: number }): RippleEvent | null;
  setOptions(options: DigitalRipplesOptions): this;
  setPreset(preset: RipplePreset): this;
  getOptions(): DigitalRipplesOptions;
  getStats(): RippleStats;
  pause(): this;
  resume(): this;
  clear(): this;
  renderAt(time: number, events?: RippleFrameEvent[]): this;
  destroy(): void;
}
export default DigitalRipples;
