# Demo audio

`demo.wav` is what the demo overlay plays — stereo, 16 kHz, about 64 seconds.

To swap it, either keep the filename or add your file and update the `src` of
`#demo-audio` in `index.html`. Nothing else needs to change: the transport
reads the length off the file, and the waveform is drawn from an analyser on
whatever is playing.

Two things worth knowing about how it loads:

- The element is `preload="metadata"`, so the page costs only the header.
  `src/main.ts` fetches the audio when the overlay opens, and plays it in the
  same breath. Anything much larger than this will be felt in that gap, which
  the transport covers with a "Starting…" label and, if the buffer later runs
  dry, "Buffering…".
- It is served from `public/`, so it ships at a stable path and is not
  content-hashed. A replacement of the same name will be cached by anyone who
  already heard the old one.
