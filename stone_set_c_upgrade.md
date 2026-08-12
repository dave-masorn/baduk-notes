## Stone Set C — Black Stone Texture Upgrade


### Scope
Only `_getSlateTexture()` was modified — in both the test file and `annotation_v4.js`. Everything else (lighting, color, shape, white stones, `getStoneVariant`) is untouched.


---


### Before → After


The old function had **2 layers**. The new one has **4**:


| Layer | Status | What it does |
|---|---|---|
| Cloud blobs | **Adjusted** | 7→8 blobs; slightly bluer highlight color to match nachiguro's blue-grey cast |
| Fine speckle | Unchanged | Sub-pixel micro-grain dots |
| **Flow-field streamlines** | **New** | The key addition — see below |
| **Micro-flecks** | **New** | Tiny mineral glints, very subtle |


---


### The Key Addition: Flow-Field Streamlines


The breakthrough insight from the macro photo: the real texture is **not sparse cracks** — it's a **dense flowing network** of curved lines, like geological strata or a fingerprint whorl.


The field direction at any point `(px, py)` is:
```
flowDir = sin(rx·k·1.0 + ry·k·1.618 + phaseX)·π
        + sin(rx·k·2.414 - ry·k·0.866 + phaseY)·π·ampB
```


**28 streamlines** follow this field step-by-step. Because the angle changes continuously across space, lines naturally **curve, loop, and form enclosed regions** — that organic whorl/strata quality — without any hand-authored paths.


Per-stone variety comes from `phaseR/X/Y` derived from `cloudSeed` (via a separate RNG stream), so every stone has a unique grain orientation that stays stable across redraws.


---


### Micro-flecks
`fleckBrightness = 0.15 + rand() × 0.4` is rolled **once per stone**, making each stone's overall fleck level unique. Effective alpha per fleck: **0.006–0.044** — barely perceptible, never glittery.
