/**
 * Dorado`
 *
 * The world is three full-bleed vistas with aerial perspective. The only
 * instrument on the page is the gold waveform inside the demo overlay: the
 * live shape of the mix, straight off the analyser.
 */

import './style.css';
import { DemoOverlay } from './lib/demo-overlay';
import { WaveformRenderer } from './lib/waveform';
import { DemoPlayer, formatTime, type DemoFrame } from './lib/player';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------- parallax ---
   Depth, done the way it actually works: the far air barely shifts, the ground
   at your feet keeps up with the page, and everything between is spaced out in
   proportion. Two offsets compose.

   1. The whole scene lags the page slightly (--par, in CSS pixels). This is the
      window moving, and it applies to the sky as well.
   2. Each depth plane inside the scene then catches back up, weighted by
      depth: depth 0 stays with the drifting scene and is the reference, depth
      1 tracks the page hardest and rides up over everything behind it.

   Sign matters and is easy to get backwards. `offset` shrinks as the vista
   rises up the viewport, so a translate that follows `offset` moves *with* the
   page — that is the near ground. The scene lag in (1) is negated against it
   instead, so the far air trails. Get this the other way round and the far air
   does all the travelling while the ground sits still, which reads as the
   ridge lines squashing together rather than as depth.

   Edge safety: (1) is clamped inside the 14% overshoot the CSS gives each
   scene. (2) is bounded too, but the geometry is what really protects it —
   every plane is a full-width mass filled well past the bottom of the frame,
   and the plane in front of it covers that bottom regardless, so a drifting
   plane only ever moves its own ridge line.

   Only scenes on screen are measured, and none of it runs under reduced
   motion. */

interface Plane {
  el: SVGElement;
  /** 0 = far air, 1 = the ground you are standing on. */
  depth: number;
}

interface Scene {
  el: SVGElement;
  frame: HTMLElement;
  planes: Plane[];
}

function startParallax() {
  if (reduceMotion) return;

  const scenes: Scene[] = [];
  for (const el of document.querySelectorAll<SVGElement>('.vista__scene')) {
    const frame = el.parentElement;
    if (!frame) continue;
    const planes = Array.from(el.querySelectorAll<SVGElement>('[data-depth]')).map((node) => ({
      el: node,
      depth: Number(node.dataset.depth ?? 1),
    }));
    scenes.push({ el, frame, planes });
  }
  if (scenes.length === 0) return;

  /** How much the whole scene lags the page, as a fraction of scroll. */
  const SCENE_LAG = 0.05;
  /**
   * How far apart the planes pull, in viewBox units, at a full viewport of
   * travel. Bounded by the artwork, not by taste: the tightest pair of ridge
   * lines in any scene is the hero's mid range at y=614 and near floor at
   * y=690, 76 units apart with a depth difference of 0.28. Anything above
   * ~270 lets the mid range sink behind the near one and the depth reads
   * backwards. 200 keeps a clear margin.
   */
  const SPREAD = 200;

  const onScreen = new Set<Scene>();
  const byElement = new Map<Element, Scene>(scenes.map((scene) => [scene.el, scene]));

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const scene = byElement.get(entry.target);
        if (!scene) continue;
        if (entry.isIntersecting) onScreen.add(scene);
        else onScreen.delete(scene);
      }
      apply();
    },
    { rootMargin: '15% 0px' },
  );
  scenes.forEach((scene) => watcher.observe(scene.el));

  let ticking = false;

  function apply() {
    const viewport = window.innerHeight;
    const middle = viewport / 2;

    for (const scene of onScreen) {
      const box = scene.frame.getBoundingClientRect();
      // Positive while the vista is still below the viewport centre, shrinking
      // to zero as it centres and going negative once it has passed above.
      const offset = box.top + box.height / 2 - middle;

      const limit = box.height * 0.13;
      const lag = Math.max(-limit, Math.min(limit, -offset * SCENE_LAG));
      scene.el.style.setProperty('--par', `${lag.toFixed(1)}px`);

      const spread = Math.max(-1, Math.min(1, offset / viewport)) * SPREAD;
      for (const plane of scene.planes) {
        // Inside SVG a CSS px is one user unit, so this is 900-unit space.
        plane.el.style.transform = `translateY(${(spread * plane.depth).toFixed(2)}px)`;
      }
    }
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    },
    { passive: true },
  );
  window.addEventListener('resize', apply);
  apply();
}

/* --------------------------------------------------------------- reveals ---
   Everything below the hero arrives as you reach it: one rise, staggered
   within a group so a row of four reads left to right instead of snapping in
   as a block. Same easing and distance as the hero's entrance, so the page has
   one motion rather than a collection of them.

   Content is visible by default and the class only takes it away — so if the
   script never runs, or motion is reduced, the page is simply all there. */

function startReveals() {
  const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (groups.length === 0) return;

  if (reduceMotion) return;

  const items: HTMLElement[] = [];
  for (const group of groups) {
    const children = Array.from(group.children) as HTMLElement[];
    children.forEach((child, i) => {
      child.classList.add('is-held');
      // 90ms apart, capped so a long list never crawls in.
      child.style.setProperty('--hold', `${Math.min(i, 5) * 90}ms`);
      items.push(child);
    });
  }

  const watcher = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('is-held');
        // One-way: nothing re-hides on the way back up.
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
  );

  items.forEach((item) => watcher.observe(item));
}

/* ------------------------------------------------------------------ form --- */

/** The beta list. Double opt-in: this call only sends the confirmation mail,
 *  and the link in that mail is what actually subscribes the address. */
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

  /* Built on first open, never before: the overlay is `hidden` until then, so
     a canvas made any earlier would size itself to a zero-width box. */
  let wave: WaveformRenderer | null = null;
  const ensureWave = () => {
    if (!wave && waveCanvas) {
      wave = new WaveformRenderer(waveCanvas, {
        color: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#e6b35c',
      });
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
      document.body.dataset.playing = String(state === 'playing');
      toggle.setAttribute('aria-pressed', String(state === 'playing'));

      if (state === 'playing') {
        label.textContent = 'Pause';
        after.hidden = true;
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
      if (player.state === 'idle' || player.state === 'ended') {
        player.reset();
        after.hidden = true;
        wave?.stop();
        meter.style.setProperty('--fill', '0');
      }
    },
    onClose: () => player.pause(),
  });

  toBeta?.addEventListener('click', () => overlay.hide());
}

startParallax();
startReveals();
wireForm();
wireDemo();
