import './style.css';
import { DemoOverlay } from './lib/demo-overlay';
import { WaveformRenderer } from './lib/waveform';
import { DemoPlayer, formatTime, type DemoFrame } from './lib/player';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --- parallax ---
   Each depth plane rises as its vista is scrolled through, weighted by depth
   (0 = far air, 1 = the near ground), so the near ground outruns the page and
   the far air trails it. Planes only ever rise: the art is cut off at the top
   of its canvas, so lowering a plane would open a gap above it, while below
   there is ground to spare (see `.vista__scene .plane` in style.css).

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
    scenes.push({ el, frame, planes });
  }
  if (scenes.length === 0) return;

  /**
   * How far the near ground rises over the whole of its vista, as a share of
   * the scene's height: a fixed distance that reads on a phone is lost in a
   * desktop scene three or four times as tall. Each plane reaches 30% below
   * its scene, so this must stay under that.
   */
  const SPREAD = 0.25;

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
    spread: number;
  }

  const readings: Reading[] = [];

  function apply() {
    const viewport = window.innerHeight;

    // Read pass: measure everything before writing anything.
    readings.length = 0;
    for (const scene of onScreen) {
      const box = scene.frame.getBoundingClientRect();
      // 0 as the vista's top enters from below, 1 as its bottom leaves above.
      const travel = (viewport - box.top) / (box.height + viewport);
      readings.push({
        scene,
        spread: -Math.max(0, Math.min(1, travel)) * SPREAD * scene.el.getBoundingClientRect().height,
      });
    }

    // Write pass. A plane is not its own compositor layer — touching one
    // invalidates the whole scene — so unchanged values are left alone.
    for (const { scene, spread } of readings) {
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

/* --- spacing ---
   The art fixes how tall each stretch is, and the copy is spread through that
   height so the space between consecutive blocks is the same all the way down:
   from the hero's first screen to "Lace up", on through each section, with
   half a gap left under the last one. The gap depends on how tall the copy
   is, which CSS cannot know, so it is measured here and written as margins.

   Where the copy is longer than the art (a phone) there is no room to spread
   into; the stretches grow with the copy instead, and every gap is opened up
   to match the widest one the page already has. */

function spreadCopy() {
  const stretches = Array.from(document.querySelectorAll<HTMLElement>('.stretch'));
  const sections = stretches.flatMap((stretch) =>
    Array.from(stretch.querySelectorAll<HTMLElement>(':scope > section')),
  );
  if (sections.length < 2) return;

  function apply() {
    // Measure the natural layout first.
    sections.forEach((section) => (section.style.marginTop = ''));

    const top = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
    const bottom = (el: Element) => el.getBoundingClientRect().bottom + window.scrollY;
    const end = bottom(stretches[stretches.length - 1]);

    // The hero holds its first screen; everything after it is spread.
    const [hero, ...rest] = sections;
    const blocks = rest.map((section) => {
      const copy = section.querySelector('.vista__stage, .wrap') ?? section;
      return {
        section,
        stretch: section.parentElement as HTMLElement,
        above: top(copy) - top(section),
        copy: bottom(copy) - top(copy),
        below: bottom(section) - bottom(copy),
      };
    });

    const last = blocks[blocks.length - 1];
    const copyTotal = blocks.reduce((sum, block) => sum + block.copy, 0);
    const room = end - bottom(hero) - copyTotal - last.below;
    let gap = Math.floor(room / (blocks.length + 0.5));

    // Each stretch's top, before any margins: the art sets their heights.
    const stretchTop = new Map(stretches.map((stretch) => [stretch, top(stretch)]));

    const gaps = () =>
      blocks.map((block, i) => {
        const before = i === 0 ? bottom(hero) : top(blocks[i - 1].section) + blocks[i - 1].above + blocks[i - 1].copy;
        return top(block.section) + block.above - before;
      });
    // Opening one gap can be absorbed by a stretch that had art to spare below
    // its copy, so measure again and top up until they all match.
    const fallback = () => {
      const added = blocks.map(() => 0);
      for (let pass = 0; pass < 4; pass++) {
        const now = gaps();
        const widest = Math.max(...now);
        if (now.every((gap) => widest - gap < 1)) return;
        blocks.forEach((block, i) => {
          added[i] += widest - now[i];
          block.section.style.marginTop = `${added[i]}px`;
        });
      }
    };

    /** The margins for a gap, or how much wider it must be for a block to fit. */
    const layout = (gap: number) => {
      const margins: number[] = [];
      let copyBottom = bottom(hero);
      let cursor = copyBottom;
      let current = hero.parentElement as HTMLElement;
      // How far stretches growing around their copy have pushed the rest down.
      let pushed = 0;
      for (const [i, block] of blocks.entries()) {
        if (block.stretch !== current) {
          // A stretch grows to hold its own copy, carrying the rest of the page
          // down with it, so the gap can stay the same all the way.
          pushed = Math.max(pushed, cursor - stretchTop.get(block.stretch)!);
          current = block.stretch;
          cursor = stretchTop.get(current)! + pushed;
        }
        const sectionTop = copyBottom + gap - block.above;
        const margin = sectionTop - cursor;
        // Too early to start inside its stretch. Every gap before it widens to
        // bring it down, which is why the shortfall is shared between them.
        if (margin < 0) return { raise: Math.ceil(-margin / (i + 1)) };
        margins.push(margin);
        cursor = sectionTop + block.above + block.copy + block.below;
        copyBottom = sectionTop + block.above + block.copy;
      }
      return cursor > end + pushed ? { raise: 0 } : { raise: 0, margins };
    };

    for (let pass = 0; pass < 8; pass++) {
      const { raise, margins } = layout(gap);
      if (margins) {
        blocks.forEach((block, i) => (block.section.style.marginTop = `${margins[i]}px`));
        return;
      }
      if (!raise) break;
      gap += raise;
    }
    fallback();
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  apply();
  document.fonts.ready.then(schedule);
  window.addEventListener('resize', schedule);
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

/* --- anchor scrolling ---
   `scroll-behavior: smooth` has no speed setting, so clicks on in-page links
   are animated here, at twice the time Chrome's own smooth scroll takes. That
   CSS still serves a page opened directly on a #hash. Reduced motion is left
   to the browser, which jumps. */
function slowAnchors() {
  if (reduceMotion) return;

  let frame = 0;
  const stop = () => cancelAnimationFrame(frame);

  // The visitor's own scrolling wins over the animation.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });

  document.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = link?.getAttribute('href');
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (!hash || !target) return;
    event.preventDefault();

    const from = window.scrollY;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const end = target.getBoundingClientRect().top + from - margin;
    const to = Math.min(end, document.documentElement.scrollHeight - window.innerHeight);
    const distance = to - from;
    const duration = 1100 + Math.abs(distance) * 0.245;
    const start = performance.now();

    stop();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      window.scrollTo({ top: from + distance * eased, behavior: 'instant' });
      if (t < 1) frame = requestAnimationFrame(step);
      // Already in place, so this only records the hash and moves focus there.
      else location.hash = hash;
    };
    frame = requestAnimationFrame(step);
  });
}

spreadCopy();
startParallax();
startReveals();
wireForm();
wireDemo();
slowAnchors();
