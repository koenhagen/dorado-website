/**
 * WaveformRenderer — a browser/Canvas port of the Dorado Flutter `WaveformPainter`.
 *
 * It mirrors the Flutter behavior:
 *  - samples are normalized to the range -1..1
 *  - a moving-average smoothing window is applied (same math as `_smoothSamples`)
 *  - the path is drawn centered vertically: y = height/2 - sample * height/2
 *  - when there are no samples it draws a flat line through the vertical center
 *
 * It can drive itself from a requestAnimationFrame loop (`start`), or be fed
 * frame by frame from a loop that already exists elsewhere (`push`) — the
 * DemoPlayer hands out time-domain samples on every frame, so the page uses
 * the second form.
 */

export interface WaveformOptions {
  /** Stroke colour. Defaults to Dorado gold (0xFFFFD700). */
  color?: string;
  /** Stroke width in CSS pixels. */
  strokeWidth?: number;
  /** Half-width of the moving-average window. */
  smoothingWindow?: number;
}

const EMPTY = new Float32Array(0);

export class WaveformRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly smoothingWindow: number;
  private readonly color: string;
  private readonly strokeWidth: number;

  /** Source of live time-domain samples, or null when idle or externally fed. */
  private sampleSource: (() => Float32Array) | null = null;
  private rafId: number | null = null;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, options: WaveformOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('WaveformRenderer: 2D canvas context unavailable');
    this.ctx = ctx;
    this.smoothingWindow = options.smoothingWindow ?? 3;
    this.color = options.color ?? '#FFD700';
    this.strokeWidth = options.strokeWidth ?? 2;

    this.resize();
    window.addEventListener('resize', this.resize);

    // Draw the initial idle (flat) state.
    this.draw(EMPTY);
  }

  /** Provide a callback returning normalized (-1..1) samples each frame, and start animating. */
  start(sampleSource: () => Float32Array) {
    this.sampleSource = sampleSource;
    if (this.rafId === null) {
      this.loop();
    }
  }

  /** Draw one frame from samples produced by someone else's animation loop. */
  push(samples: Float32Array) {
    this.draw(samples);
  }

  /** Stop animating and settle back to a flat centered line. */
  stop() {
    this.sampleSource = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.draw(EMPTY);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resize);
  }

  private loop = () => {
    const samples = this.sampleSource ? this.sampleSource() : EMPTY;
    this.draw(samples);
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Keep the backing store in sync with the CSS size and device pixel ratio. */
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.sampleSource === null) {
      this.draw(EMPTY);
    }
  };

  private draw(samples: Float32Array) {
    const { ctx } = this;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = this.strokeWidth * this.dpr;
    ctx.strokeStyle = this.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const smoothed = this.smoothSamples(samples);

    if (smoothed.length === 0) {
      // Flat line through the vertical center (mirrors the Flutter empty case).
      const y = height / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < smoothed.length; i++) {
      const x = (i * width) / (smoothed.length - 1);
      const y = height / 2 - smoothed[i] * (height / 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  /** Moving-average smoothing, identical in intent to Flutter's `_smoothSamples`. */
  private smoothSamples(samples: Float32Array): Float32Array {
    const n = samples.length;
    if (n === 0) return samples;

    const w = this.smoothingWindow;
    const smoothed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let j = i - w; j <= i + w; j++) {
        if (j >= 0 && j < n) {
          sum += samples[j];
          count++;
        }
      }
      smoothed[i] = sum / count;
    }
    return smoothed;
  }
}