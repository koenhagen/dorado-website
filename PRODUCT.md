# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are **reluctant and on-off runners** — people who find running
boring and repeatedly fail to keep the habit going. They are not chasing a PB
or a training plan; they are looking for a reason to get out the door at all.
They typically run alone, from home, on familiar local routes, with a phone and
headphones and nothing else.

The situation in which they meet Dorado is one of low motivation: they have
started running before, stalled, and are open to something that makes the
activity itself enjoyable rather than something to endure.

## Product Purpose

Dorado turns a normal run into an immersive audio adventure so that running
becomes something the user *wants* to do rather than something they have to
discipline themselves into.

Success is behavioural, not athletic: the user runs more often, runs longer,
and keeps coming back — because the experience is entertaining, not because
they were pushed.

## Positioning

Dorado is **pure entertainment for your run**, not a run tracker, music player,
or training scheduler. It is designed to sit alongside the apps runners already
use rather than replace them.

Its distinguishing mechanism is a **non-linear, event-driven audio world**:
there are stories and characters, but the story is not told in a fixed
sequence. The runner's **pace and location** determine how it progresses, and
the experience is delivered mostly as **events occurring around them** in
spatial audio rather than as a linear narration. The world reacts to the run;
the run is not just a backdrop for a podcast.

A second deliberate position: **no fancy gear required.** Dorado is explicitly
not built for smartwatches or Garmins. A phone and earphones are the whole
requirement, so anyone with a phone can take part.

## Operating Context

- Used outdoors, mid-run, with headphones in — hands mostly unavailable and
  eyes mostly on the road. Audio is the primary channel.
- Runs happen on the user's own familiar routes; the product supplies the
  change, not the location.
- Spatial/binaural audio means headphones are effectively required for the
  intended experience, and the site already tells visitors this.
- Dorado runs **together with Spotify and Strava** — a runner can play music
  from Spotify and record the run with Strava while Dorado is running. This is
  already possible in the demo.
- The marketing site is the pre-launch surface: its job is to convey the
  experience and collect beta signups.
- Confirmed 2026-08-23: it ships at **https://dorado.run/** — the domain is
  baked into the canonical URL, the social tags, robots.txt and sitemap.xml.

## Capabilities and Constraints

- Confirmed: phone-only, headphones-based spatial audio experience; pace- and
  location-driven event progression; concurrent use with Spotify and Strava.
- Confirmed 2026-07-29: **iOS and Android, both from launch.** Site copy may
  state this plainly.
- Deliberately out of scope: smartwatch/Garmin support, run tracking, music
  playback, training plans.
- Site stack: Vite + TypeScript, hand-written CSS (custom-property tokens at
  the top of `src/style.css`), static, no framework, no runtime dependencies.
  Fonts are self-hosted in `src/fonts/`; nothing is fetched from a third party.
- One page only, at the repo root — the seven design directions and the chooser
  that indexed them were retired on 2026-08-23.
- The site includes an audio demo in a modal overlay: `src/lib/player.ts` plays
  `public/audio/demo-placeholder.wav` through a Web Audio analyser, and
  `src/lib/waveform.ts` draws the gold trace from it.
- **Undecided:** launch date; pricing and business model — in particular
  whether the beta is free, so no page may say it is; whether Nike Run Club is a
  confirmed compatibility claim or an aspiration — treat as unconfirmed until
  the user says otherwise. It is no longer named anywhere in site copy.

## Brand Commitments

- Name: **Dorado.**
- Voice in existing copy: warm, plain-spoken, encouraging; sells escape and
  enjoyment rather than performance metrics.
- **The alpaca mascot is not binding.** It may be kept, redrawn, or dropped
  entirely; no future work should treat it as a fixed identity element.
- No other locked identity constraints have been established.

## Evidence on Hand

- **A working demo exists** — a real, runnable Dorado experience that can be
  captured and shown (audio, screens, or footage). It has not yet been put on
  the site.
- `public/audio/demo-placeholder.wav` is a **generated placeholder**, not real
  Dorado audio. The real spatial demo track still has to be dropped in.
- `assets/alpaca.png` — current mascot image (non-binding).
- `assets/Spotify_logo_with_text.svg`, `assets/Strava_Logo.svg` — used as
  monotone masks for the "works with" statement.
- **Pre-launch: no users, downloads, testimonials, press, reviews, benchmarks,
  or metrics exist.** None of these may be fabricated or implied.
- The beta signup form is **front-end only** — no backend, list, or email
  provider is connected (`src/main.ts` logs and shows a local confirmation).

## Product Principles

1. **The experience must be felt, not described.** Dorado's value is auditory;
   any surface that only explains it in words has failed at its main job.
2. **Motivation over performance.** Speak to someone who finds running boring,
   never to someone optimising splits.
3. **Nothing extra required.** Phone and headphones. Every claim of simplicity
   is a real product decision, and must stay true.
4. **A companion, not a replacement.** Dorado sits alongside Spotify, Strava
   and the rest of a runner's kit; never position it as competing with them.
5. **Pre-launch honesty.** No invented proof. Anticipation is the only social
   currency available, and it has to be earned by the experience itself.

## Accessibility & Inclusion

No product-specific requirement has been established beyond the obvious: the
core experience is audio-first and headphone-dependent, so any web surface that
relies on audio to communicate must carry an equivalent non-audio path.