/**
 * DemoPlayer — plays the recorded demo and hands out what the page draws.
 *
 * Signal chain:  <audio> -> MediaElementSource -> AnalyserNode -> destination
 *
 * The graph is built on first play: browsers will not start an AudioContext
 * without a user gesture, and createMediaElementSource is once per element.
 */

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'ended';

export interface DemoFrame {
  /** Seconds played. */
  time: number;
  /** Total length, or 0 before metadata has loaded. */
  duration: number;
  /** 0..1 through the recording. */
  progress: number;
  /** Time-domain samples, -1..1 — the waveform's input. */
  samples: Float32Array;
}

export interface DemoPlayerOptions {
  audio: HTMLAudioElement;
  /** Called once per animation frame while playing. */
  onFrame?: (frame: DemoFrame) => void;
  onStateChange?: (state: PlaybackState) => void;
}

export class DemoPlayer {
  state: PlaybackState = 'idle';

  private readonly audio: HTMLAudioElement;
  private readonly options: DemoPlayerOptions;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(0);
  private rafId: number | null = null;

  constructor(options: DemoPlayerOptions) {
    this.options = options;
    this.audio = options.audio;

    // The recording streams, so state follows `playing` (sound is coming out)
    // rather than `play` (the element was unpaused, possibly with no data yet).
    this.audio.addEventListener('playing', () => {
      this.setState('playing');
      this.startLoop();
    });

    // A dry buffer mid-stream fires `waiting`, never `pause`. Stopping the loop
    // freezes the clock and meter where the audio ran out.
    this.audio.addEventListener('waiting', () => {
      if (this.state !== 'playing') return;
      this.stopLoop();
      this.setState('buffering');
    });

    this.audio.addEventListener('pause', () => {
      // `pause` also fires as the element ends; `ended` has already settled it.
      if (this.state === 'ended') return;
      this.stopLoop();
      this.setState('paused');
    });

    this.audio.addEventListener('ended', () => {
      this.stopLoop();
      this.setState('ended');
    });
  }

  async play() {
    if (this.state !== 'playing') this.setState('loading');
    this.ensureGraph();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    if (this.state === 'ended') this.audio.currentTime = 0;
    await this.audio.play();
  }

  pause() {
    if (!this.audio.paused) this.audio.pause();
  }

  async toggle() {
    if (this.audio.paused) await this.play();
    else this.pause();
  }

  /** Back to the start, silent — what an overlay wants when it reopens. */
  reset() {
    this.pause();
    this.audio.currentTime = 0;
    this.setState('idle');
  }

  private ensureGraph() {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(this.audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.analyser = analyser;
    this.timeData = new Float32Array(analyser.fftSize);
  }

  private setState(state: PlaybackState) {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private startLoop() {
    if (this.rafId !== null) return;
    const tick = () => {
      this.options.onFrame?.(this.readFrame());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop() {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readFrame(): DemoFrame {
    const samples = this.timeData;
    if (this.analyser) this.analyser.getFloatTimeDomainData(samples);

    const time = this.audio.currentTime;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;

    return {
      time,
      duration,
      progress: duration > 0 ? Math.min(1, time / duration) : 0,
      samples,
    };
  }
}

/** m:ss, for the transport readout. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}