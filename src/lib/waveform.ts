/**
 * WaveformRenderer — Canvas port of the Dorado Flutter `WaveformPainter`.
 * Fed frame by frame from the DemoPlayer's loop via `push`.
 */

const EMPTY = new Float32Array(0);
/** Half-width of the moving-average window, as in Flutter's `_smoothSamples`. */
const SMOOTHING = 3;
const STROKE_WIDTH = 2;

export class WaveformRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly color: string;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, color = '#FFD700') {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('WaveformRenderer: 2D canvas context unavailable');
    this.ctx = ctx;
    this.color = color;

    this.resize();
    window.addEventListener('resize', this.resize);
    this.draw(EMPTY);
  }

  /** Draw one frame of normalized (-1..1) samples. */
  push(samples: Float32Array) {
    this.draw(samples);
  }

  /** Settle back to a flat centred line. */
  stop() {
    this.draw(EMPTY);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.draw(EMPTY);
  };

  private draw(samples: Float32Array) {
    const { ctx } = this;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = STROKE_WIDTH * this.dpr;
    ctx.strokeStyle = this.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const smoothed = this.smoothSamples(samples);

    if (smoothed.length === 0) {
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < smoothed.length; i++) {
      const x = (i * width) / (smoothed.length - 1);
      const y = height / 2 - smoothed[i] * (height / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private smoothSamples(samples: Float32Array): Float32Array {
    const n = samples.length;
    if (n === 0) return samples;

    const smoothed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - SMOOTHING); j <= Math.min(n - 1, i + SMOOTHING); j++) {
        sum += samples[j];
        count++;
      }
      smoothed[i] = sum / count;
    }
    return smoothed;
  }
}