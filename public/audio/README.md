# Demo audio (placeholder)

`demo-placeholder.wav` is a generated stand-in — 12 seconds, mono — so the
player and waveform work end to end. It is what the demo overlay plays.

Replace it with the real Dorado immersive/spatial-audio demo. Either:

- keep the filename `demo-placeholder.wav`, or
- add your file and update the `src` of `#demo-audio` in `index.html`.

Nothing else needs to change: the transport reads the length off the file, and
the waveform is drawn from an analyser on whatever is playing.

For a spatial demo, a stereo/binaural file is ideal — the site already tells
visitors to use headphones.
