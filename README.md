# NeuroDino

**© 2026 Ayan Kumar. All rights reserved.**

A fly connectome playing the **original Chromium Dino game** — in your browser.

An 80-cell circuit measured from the adult male fly CNS (MaleCNS v1.0) drives the authentic Chromium Dino through a small trained neural readout. You can watch the decisions, the computed circuit activity, and the game side-by-side, train the agent from random weights locally, and reproduce the published benchmark on your own machine.

---

## How it works

The whole system is a pipeline from game state to keyboard keys:

```text
8 game observations → 80 fixed MaleCNS cells → 16 descending cells → trained 16–12–3 readout → 3 keys (Run / Jump / Duck)
```

1. **Observation encoder.** Eight engineered features describe the game state: obstacle proximity, width, height, altitude, speed, player height, vertical velocity, and ground contact. These are plain numbers computed from the game, not pixels.

2. **Measured circuit.** The 80 cells and their 1,296 directed connections (26,029 synaptic contacts) come from the real MaleCNS v1.0 connectome — they are fixed and never trained. Each observation drives a small group of visual cells; activity then spreads through the measured, signed connections (excitation/inhibition from neurotransmitter annotations) with leaky tanh dynamics, ending at 16 descending cells.

3. **Trained readout.** The only learned part is a tiny network — 16 inputs, 12 tanh hidden units, 3 outputs, **243 parameters** total. It maps the circuit's activity to Run, Jump or Duck.

4. **The game itself.** The physics, sprites, obstacles and collisions are the **unmodified Chromium Dino source** (pinned to Chromium 98), wrapped in a thin adapter that supplies a deterministic clock and randomness.

**Learning** uses the cross-entropy method (CEM), a simple neuroevolution scheme: 64 candidate readouts per generation, keep the 8 best, resample around them, repeat for 80 generations (~15,680 short episodes). Training runs headless in a Web Worker while the visible game uses the current champion — so you can literally watch it get better.

**Why the circuit matters:** with the trained readout but the circuit silenced, the agent crashes almost immediately. The behavior genuinely depends on the measured wiring — not just on the tiny readout memorizing inputs.

---

## Run it

Requires Node 22.18+.

```sh
npm ci
npm run dev
```

Then open the printed local URL. The app loads the published checkpoint from `public/benchmarks/model.json`; a checkpoint you trained in the browser is cached in `localStorage` and takes precedence.

## Controls

| Action | Keys |
|--------|------|
| Jump | Space / Up |
| Short hop | Release after minimum height |
| Duck / fast fall | Down / S (hold) |

Manual input takes over instantly; switch back in the Controller dropdown (Trained agent / Rule baseline / Manual). Automatic modes restart after a collision; manual play waits for Restart. Pause freezes the game.

## Train & benchmark

Everything runs locally and deterministically (seeded):

```sh
npm run train -- 20260912 80        # full reproducible training run
npm run benchmark                   # evaluate checkpoint on 100 held-out courses
npm test                            # deterministic-learning + physics parity tests
npm run check:assets                # verify pinned data/sprite hashes
npm run build                       # typecheck + production build
```

Training overwrites the published checkpoint/log. To keep them, pass an output directory:

```sh
npm run train -- 20260913 80 public/benchmarks/replicates/20260913
npm run benchmark:replicates
```

Reference run: ~7.6 minutes on a Mac mini; speed varies by machine. Ordinary gameplay always uses frozen weights — only training/evaluation jobs do rollouts.

## Results

Published checkpoint: **99/100** completed 180-second held-out courses (mean survival **179.37 s**).

| Controller | Completed / 100 | Mean survival |
| --- | ---: | ---: |
| Circuit + trained readout | **99** | 179.37 s |
| Same readout, circuit silenced | 0 | 4.51 s |
| Untrained readout | 0 | 4.49 s |

This demonstrates learned control and dependence on circuit activity — it does **not** claim that biological wiring beats an equally sized artificial network.

## Rebuild the data (optional)

The measured-connectome graph in `public/data/connectome` is pre-built. To rebuild it from the raw public tables (~1.1 GB download, not bundled):

```sh
mkdir -p /tmp/neurodino-data
base=https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome
curl -fL "$base/body-annotations-male-cns-v1.0-minconf-0.5.feather" -o /tmp/neurodino-data/annotations.feather
curl -fL "$base/connectome-weights-male-cns-v1.0-minconf-0.5.feather" -o /tmp/neurodino-data/edges.feather
curl -fL "$base/body-neurotransmitters-male-cns-v1.0.feather" -o /tmp/neurodino-data/neurotransmitters.feather
uv run --with pyarrow --with numpy python scripts/build-connectome.py /tmp/neurodino-data
npm run build:chromium
npm run check:assets
```

## Deployment

Static Vite application — build and deploy `dist` with any static host, e.g.:

```sh
npm run build
wrangler pages deploy dist --branch main
```

---

## What is real vs. modeled

**Measured / original:** Chromium game code and sprites · MaleCNS v1.0 cell identities, coordinates, neurotransmitter annotations and all selected connections · Flybody anatomical meshes.

**Engineered:** the bounded 80-cell subgraph selection · the game-to-cell input mapping · the simplified leaky tanh dynamics · the artificial trained readout. Computed "activity" is a dimensionless model state — not measured spikes or membrane voltage. The remaining ~124k-cell atlas is anatomical context only. No living fly, muscles, or synaptic plasticity are simulated.

## Credits

Required third-party licenses are preserved in this repository:

- **Chromium Authors** — original Dino code & artwork (BSD-3-Clause), vendored under `vendor/chromium` and `public/vendor/chromium` with their license.
- **FlyEM / HHMI Janelia & MaleCNS collaborators** — measured connectome data (CC BY 4.0), see `public/data/connectome/NOTICE.md`.
- **Turaga Lab / Flybody** — fly anatomy assets (Apache-2.0), see `public/data/flybody/LICENSE`.
- **Mert Cobanov** — project started from [fly-connectome-template](https://github.com/cobanov/fly-connectome-template) by [Mert Cobanov](https://github.com/cobanov), under the license in [LICENSE](LICENSE).

All original application code, documentation, training pipeline and experiment design © **Ayan Kumar**. Third-party licenses remain separate and unaffected. Independent project — not affiliated with Google Chrome.
