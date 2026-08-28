import './style.css';
import { DemoOverlay } from './lib/demo-overlay';
import { WaveformRenderer } from './lib/waveform';
import { DemoPlayer, formatTime, type DemoFrame } from './lib/player';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --- parallax ---
   Two offsets compose: the whole scene lags the page (--par), then each depth
   plane catches back up weighted by depth (0 = far air, 1 = the near ground).
   Sign matters — `offset` shrinks as the vista rises, so following it moves
   *with* the page; the scene lag is negated against it so the far air trails.

   Reads and writes run in separate passes: a getBoundingClientRect after a
   style write forces a synchronous layout flush.

   Nothing assumes the scene is an inline <svg> — a scene is whatever carries
   `.vista__scene`, a plane whatever carries `data-depth` inside it. */

/** Positioned directly, so it needs a style attribute. */
type Movable = HTMLElement | SVGElement;

interface Plane {
  el: Movable;
  /** 0 = far air, 1 = the ground you are standing on. */
  depth: number;
  /** Last transform written, so an unchanged frame writes nothing. */
  written: string;
}

interface Scene {
  el: Movable;
  frame: HTMLElement;
  planes: Plane[];
  /** Last `--par` written, same reason. */
  written: string;
}

function startParallax() {
  if (reduceMotion) return;

  const scenes: Scene[] = [];
  for (const el of document.querySelectorAll<Movable>('.vista__scene')) {
    const frame = el.parentElement;
    if (!frame) continue;
    const planes = Array.from(el.querySelectorAll<Movable>('[data-depth]')).map((node) => ({
      el: node,
      depth: Number(node.dataset.depth ?? 1),
      written: '',
    }));
    scenes.push({ el, frame, planes, written: '' });
  }
  if (scenes.length === 0) return;

  /** Scene lag, as a fraction of scroll. */
  const SCENE_LAG = 0.05;
  /**
   * Plane spread at a full viewport of travel. Above ~270 the hero's mid range
   * sinks behind the near one and the depth reads backwards.
   *
   * Written as px, which inside an inline SVG is one viewBox unit. Move the
   * scenes to external SVG files and planes become HTML elements, where a px is
   * a screen px — this will need re-deriving against the viewport.
   */
  const SPREAD = 200;

  const onScreen = new Set<Scene>();
  const byElement = new Map<Element, Scene>(scenes.map((scene) => [scene.el, scene]));

  // One rAF gate, so a burst of scroll or resize collapses into one frame.
  let ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      apply();
    });
  }

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const scene = byElement.get(entry.target);
        if (!scene) continue;
        if (entry.isIntersecting) onScreen.add(scene);
        else onScreen.delete(scene);
      }
      schedule();
    },
    { rootMargin: '15% 0px' },
  );
  scenes.forEach((scene) => watcher.observe(scene.el));

  interface Reading {
    scene: Scene;
    lag: number;
    spread: number;
  }

  const readings: Reading[] = [];

  function apply() {
    const viewport = window.innerHeight;
    const middle = viewport / 2;

    // Read pass: measure everything before writing anything.
    readings.length = 0;
    for (const scene of onScreen) {
      const box = scene.frame.getBoundingClientRect();
      // Positive below the viewport centre, negative once past it.
      const offset = box.top + box.height / 2 - middle;

      const limit = box.height * 0.13;
      readings.push({
        scene,
        lag: Math.max(-limit, Math.min(limit, -offset * SCENE_LAG)),
        spread: Math.max(-1, Math.min(1, offset / viewport)) * SPREAD,
      });
    }

    // Write pass. A plane is not its own compositor layer — touching one
    // invalidates the whole scene — so unchanged values are left alone.
    for (const { scene, lag, spread } of readings) {
      const par = `${lag.toFixed(1)}px`;
      if (par !== scene.written) {
        scene.el.style.setProperty('--par', par);
        scene.written = par;
      }

      for (const plane of scene.planes) {
        const transform = `translateY(${(spread * plane.depth).toFixed(2)}px)`;
        if (transform === plane.written) continue;
        plane.el.style.transform = transform;
        plane.written = transform;
      }
    }
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  apply();
}

/* --- reveals ---
   Content is visible by default; the class only takes it away, so if the script
   never runs the page is simply all there. */

function startReveals() {
  const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (groups.length === 0) return;

  if (reduceMotion) return;

  const items: HTMLElement[] = [];
  for (const group of groups) {
    const children = Array.from(group.children) as HTMLElement[];
    children.forEach((child, i) => {
      child.classList.add('is-held');
      // Capped so a long list never crawls in.
      child.style.setProperty('--hold', `${Math.min(i, 5) * 90}ms`);
      items.push(child);
    });
  }

  const watcher = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('is-held');
        observer.unobserve(entry.target); // one-way
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
  );

  items.forEach((item) => watcher.observe(item));
}

/* ------------------------------------------------------------------ form --- */

/** Double opt-in: this only sends the confirmation mail; its link subscribes. */
const SUBSCRIBE_URL = 'https://dorado.koenhagen.workers.dev/api/subscribe';

function wireForm() {
  const form = document.querySelector<HTMLFormElement>('#beta-form');
  const input = document.querySelector<HTMLInputElement>('#beta-email');
  const trap = document.querySelector<HTMLInputElement>('#beta-hp');
  const submit = document.querySelector<HTMLButtonElement>('#beta-form .signup__submit');
  const error = document.querySelector<HTMLParagraphElement>('#beta-error');
  const done = document.querySelector<HTMLParagraphElement>('#beta-done');
  if (!form || !input || !trap || !submit || !error || !done) return;

  const shown = Date.now();
  const resting = submit.textContent ?? 'Join the beta';
  let sending = false;

  const fail = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  };

  input.addEventListener('input', () => {
    error.hidden = true;
    input.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;

    const value = input.value.trim();
    if (!value) return fail('We need an address before we can send you the route.');
    if (!input.checkValidity()) {
      return fail(`“${value}” is not an address we can reach`);
    }

    sending = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    error.hidden = true;

    try {
      const response = await fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, hp: trap.value, t: shown }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        return fail(payload?.error ?? 'That address did not go through. Try again in a moment.');
      }

      form.hidden = true;
      done.hidden = false;
      done.setAttribute('tabindex', '-1');
      done.focus();
    } catch {
      fail('We could not reach the list. Check your connection and try again.');
    } finally {
      sending = false;
      submit.disabled = false;
      submit.textContent = resting;
    }
  });
}

/* ------------------------------------------------------------- the demo --- */

function wireDemo() {
  const overlayRoot = document.querySelector<HTMLElement>('#demo-overlay');
  const openers = Array.from(document.querySelectorAll<HTMLElement>('#demo-open'));
  const toggle = document.querySelector<HTMLButtonElement>('#demo-toggle');
  const label = document.querySelector<HTMLElement>('[data-play-label]');
  const now = document.querySelector<HTMLElement>('#demo-now');
  const meter = document.querySelector<HTMLElement>('#demo-meter');
  const after = document.querySelector<HTMLElement>('#demo-after');
  const again = document.querySelector<HTMLButtonElement>('#demo-again');
  const toBeta = document.querySelector<HTMLAnchorElement>('#demo-to-beta');
  const waveCanvas = document.querySelector<HTMLCanvasElement>('#demo-waveform');
  const audio = document.querySelector<HTMLAudioElement>('#demo-audio');
  if (!overlayRoot || !toggle || !label || !now || !meter || !after || !audio) return;

  // Built on first open: the overlay is `hidden` until then, so a canvas made
  // earlier would size itself to a zero-width box.
  let wave: WaveformRenderer | null = null;
  const ensureWave = () => {
    if (!wave && waveCanvas) {
      const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
      wave = new WaveformRenderer(waveCanvas, gold || '#e6b35c');
    }
    return wave;
  };

  const player = new DemoPlayer({
    audio,

    onFrame: (frame: DemoFrame) => {
      meter.style.setProperty('--fill', frame.progress.toFixed(4));

      wave?.push(frame.samples);

      now.textContent = frame.duration
        ? `${formatTime(frame.time)} / ${formatTime(frame.duration)}`
        : formatTime(frame.time);
    },

    onStateChange: (state) => {
      // Buffering still reads as running: only the readout admits to the stall.
      const live = state === 'playing' || state === 'buffering';
      toggle.setAttribute('aria-pressed', String(live));

      if (state === 'playing') {
        label.textContent = 'Pause';
        after.hidden = true;
      } else if (state === 'buffering') {
        label.textContent = 'Pause';
        now.textContent = 'Buffering…';
        wave?.stop();
      } else if (state === 'ended') {
        label.textContent = 'Play again';
        now.textContent = 'The jungle has gone quiet.';
        meter.style.setProperty('--fill', '1');
        wave?.stop();
        after.hidden = false;
        toBeta?.focus();
      } else if (state === 'paused') {
        label.textContent = 'Resume';
        now.textContent = 'Held.';
        wave?.stop();
      } else if (state === 'loading') {
        label.textContent = 'Starting…';
      } else {
        label.textContent = 'Play';
      }
    },
  });

  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    void player.toggle().catch(() => {
      now.textContent = 'This browser would not play the recording.';
    });
  });

  again?.addEventListener('click', () => {
    after.hidden = true;
    void player.play().catch(() => undefined);
  });

  // The markup only preloads metadata; opening the overlay fetches the audio.
  // Once only: `load()` resets the element and would cut off a reopen.
  let warmed = false;
  const warmAudio = () => {
    if (warmed) return;
    warmed = true;
    audio.preload = 'auto';
    audio.load();
  };

  const overlay = new DemoOverlay({
    root: overlayRoot,
    triggers: openers,
    closers: [
      document.querySelector<HTMLElement>('#demo-scrim'),
      document.querySelector<HTMLElement>('#demo-close'),
    ].filter((el): el is HTMLElement => el !== null),
    siblings: Array.from(document.querySelectorAll<HTMLElement>('.rim, main, .foot')),
    onOpen: () => {
      ensureWave();
      warmAudio();
      if (player.state === 'idle' || player.state === 'ended') {
        player.reset();
        after.hidden = true;
        wave?.stop();
        meter.style.setProperty('--fill', '0');
      }

      /* Autoplay and the AudioContext both need a user gesture; `show()` calls
         us synchronously from the click, so this is allowed. On refusal, fall
         back to the resting transport rather than stranding it on "Starting…".
         Closing mid-recording leaves the player paused, so reopening resumes. */
      void player.play().catch(() => player.reset());
    },
    onClose: () => player.pause(),
  });

  toBeta?.addEventListener('click', () => overlay.hide());
}

startParallax();
startReveals();
wireForm();
wireDemo();
