// ============================================================
// GO STONE RENDERER v4 — pure Canvas 2D, no external image assets
// Calibrated against real photos of Kuroki Goishiten hamaguri (Snow /
// Blossom grade) and nachiguro slate stones.
//
//   WHITE = hamaguri (蛤 clamshell), per kurokigoishi.co.jp grading:
//     - "Snow grade": >80% grain coverage, exceptionally white,
//       delicate/dense/fine rings — the rarest grade (~5–10% of shells)
//     - "Blossom grade": wider, coarser grain than Snow, slightly
//       warmer tone — the common high-quality grade
//     - Reference photos show the grain as nearly-parallel diagonal
//       bands with only a gentle bow, NOT tight concentric rings —
//       that's what growth rings look like when the shell's hinge
//       point sits far outside the visible stone, not just past the
//       edge. This version reflects that.
//
//   BLACK = slate (那智黒 nachiguro), per Kuroki Goishiten's own
//     material description: "a beautiful jet-black stone that gives
//     off a greater and greater shine the more it is finely polished."
//     No grain pattern is described as a feature. Reference photos
//     confirm this: real slate stones are essentially smooth, matte-
//     glossy black spheres with a soft, broad, diffuse highlight —
//     NOT a tight glass-like glint, and with NO visible mineral
//     streaking. Stone-to-stone variation is in tone (neutral vs.
//     faint blue-green "ao" cast) and polish/brightness, not texture.
// ============================================================

const _stoneTextureCache = new Map();

function _mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Blends two colors, each either '#rrggbb' hex or 'rgb(r,g,b)' string —
// accepting both matters because _lerpColor's own output is 'rgb(...)',
// and chaining calls (color = _lerpColor(color, x, t)) is a common
// pattern here. Feeding an 'rgb(...)' string into a hex-only parser
// silently produces NaN -> coerced to 0 by bitwise ops -> black. That
// was a real bug in this file: valueShift's chained lerp calls were
// silently collapsing every slate stone toward pure black regardless
// of tint/value inputs.
function _parseColor(input) {
    if (input.startsWith('#')) {
        const v = parseInt(input.slice(1), 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    const m = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) throw new Error(`_parseColor: unrecognized color format "${input}"`);
    return [+m[1], +m[2], +m[3]];
}

function _lerpColor(colorA, colorB, t) {
    const [ar, ag, ab] = _parseColor(colorA);
    const [br, bg, bb] = _parseColor(colorB);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
}

/**
 * Hamaguri growth-ring texture. Draws long, gently-bowed bands around
 * an origin point placed FAR outside the stone — real shell growth
 * rings only look like tight concentric circles if you could see the
 * whole shell; on a single Go-stone-sized patch cut from that shell,
 * you only ever see a small arc of a very large circle, which reads
 * as nearly-parallel diagonal bands with a slight curve. That's the
 * key fix from the previous version (which used a near origin and
 * produced a tight fingerprint-like swirl real hamaguri don't have).
 *
 * @param {number} radius
 * @param {number} ringCount      - number of growth bands
 * @param {number} jitter         - 0–2, how irregular the bands are
 * @param {number} originAngle    - radians, direction the bands sweep
 * @param {number} originDistMult - origin distance as a multiple of
 *                                   radius. Bigger = straighter/flatter
 *                                   bands (Snow grade, fine+uniform).
 *                                   Smaller = more visible bow (Blossom
 *                                   grade, wider+bolder grain).
 */
function _getHamaguriTexture(radius, ringCount = 14, jitter = 1, originAngle = -2.3, originDistMult = 6) {
    const key = `hamaguri_${Math.round(radius)}_${ringCount}_${jitter.toFixed(2)}_${originAngle.toFixed(2)}_${originDistMult.toFixed(1)}`;
    if (_stoneTextureCache.has(key)) return _stoneTextureCache.get(key);

    const size = Math.ceil(radius * 2);
    const tex = document.createElement('canvas');
    tex.width = size;
    tex.height = size;
    const tctx = tex.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const rand = _mulberry32(2024);

    tctx.save();
    tctx.beginPath();
    tctx.arc(cx, cy, radius, 0, Math.PI * 2);
    tctx.clip();

    const originDist = radius * originDistMult;
    const ox = cx + Math.cos(originAngle) * originDist;
    const oy = cy + Math.sin(originAngle) * originDist;

    // With the origin this far away, the visible stone only ever
    // intersects a band roughly [originDist - radius, originDist + radius]
    // wide, so that's all the ring-radius range we need to cover.
    const minR = originDist - radius * 1.15;
    const maxR = originDist + radius * 1.15;

    for (let i = 0; i < ringCount; i++) {
        const t = i / ringCount;
        const ringR = minR + t * (maxR - minR);
        const isLight = i % 3 !== 0; // roughly 2:1 light:shadow bands
        const alpha = (isLight ? 0.05 + rand() * 0.06 : 0.06 + rand() * 0.08);
        tctx.strokeStyle = isLight
            ? `rgba(255,252,240,${alpha})`   // pale cream band
            : `rgba(150,124,80,${alpha})`;   // warm shadow band
        tctx.lineWidth = 0.6 + rand() * 1.1;

        // Jittered polyline rather than a perfect arc — small wobble
        // per point gives the hand-grown, slightly uneven look real
        // shell growth bands have, without looking like a tight swirl.
        const points = 40;
        tctx.beginPath();
        for (let p = 0; p <= points; p++) {
            const angle = (p / points) * Math.PI * 2;
            const wobble = Math.sin(angle * 5 + i * 1.7) * radius * 0.015 * jitter
                         + (rand() - 0.5) * radius * 0.01 * jitter;
            const r = ringR + wobble;
            const px = ox + Math.cos(angle) * r;
            const py = oy + Math.sin(angle) * r;
            if (p === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
        }
        tctx.stroke();
    }

    tctx.restore();
    _stoneTextureCache.set(key, tex);
    return tex;
}

/**
 * Slate surface texture — rebuilt from macro reference photo of real
 * nachiguro. The key observation from that photo: the surface marks are
 * NOT sparse random cracks. They are a DENSE, FLOWING NETWORK of many
 * curved lines — like geological strata, fingerprint whorls, or
 * wood-grain seen close up. Lines curve, loop, and form enclosed
 * regions; the overall effect reads as "surface grain", not "cracks".
 *
 * Implementation: sine-based flow field. A direction angle is defined
 * at every point (x, y) via two sine harmonics. Streamlines are seeded
 * across the stone and each follows the local field direction step by
 * step — naturally curving and sometimes looping back because the field
 * itself curves. The field is shifted per-stone via cloudSeed-derived
 * phase offsets so every stone has a unique but coherent grain pattern.
 *
 * Layers:
 *   1. Broad cloud blobs — mottled light/dark base variation.
 *   2. Fine speckle — micro-grain texture.
 *   3. Flow-field streamlines — the organic looping network.
 *   4. Bright micro-flecks — tiny specular glints visible in the photo.
 *
 * @param {number} radius
 * @param {number} cloudSeed - per-stone pattern variation seed
 */
function _getSlateTexture(radius, cloudSeed = 0) {
    const key = `slate_${Math.round(radius)}_${cloudSeed}`;
    if (_stoneTextureCache.has(key)) return _stoneTextureCache.get(key);

    const size = Math.ceil(radius * 2);
    const tex = document.createElement('canvas');
    tex.width = size;
    tex.height = size;
    const tctx = tex.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const rand = _mulberry32(9911 + cloudSeed);

    tctx.save();
    tctx.beginPath();
    tctx.arc(cx, cy, radius, 0, Math.PI * 2);
    tctx.clip();

    // ---- 1. Broad soft cloud blobs ----
    // Large, very-low-alpha radial patches — mottled cloudiness visible
    // in both the macro and overview photos of real nachiguro.
    const CLOUD_COUNT = 8;
    for (let i = 0; i < CLOUD_COUNT; i++) {
        const bx = cx + (rand() - 0.5) * radius * 1.6;
        const by = cy + (rand() - 0.5) * radius * 1.6;
        const br = radius * (0.3 + rand() * 0.5);
        const lighter = rand() > 0.4;
        const alpha = 0.04 + rand() * 0.055;
        const cloudGrad = tctx.createRadialGradient(bx, by, 0, bx, by, br);
        cloudGrad.addColorStop(0, lighter ? `rgba(190,200,215,${alpha})` : `rgba(0,0,0,${alpha})`);
        cloudGrad.addColorStop(1, 'rgba(0,0,0,0)');
        tctx.fillStyle = cloudGrad;
        tctx.beginPath();
        tctx.arc(cx, cy, radius, 0, Math.PI * 2);
        tctx.fill();
    }

    // ---- 2. Fine granular speckle ----
    const SPECKLE_COUNT = Math.min(700, Math.floor(radius * 9));
    for (let i = 0; i < SPECKLE_COUNT; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * radius * 0.97;
        const sx = cx + Math.cos(angle) * dist;
        const sy = cy + Math.sin(angle) * dist;
        const lighter = rand() > 0.5;
        tctx.fillStyle = lighter
            ? `rgba(190,195,198,${0.015 + rand() * 0.02})`
            : `rgba(0,0,0,${0.02 + rand() * 0.025})`;
        tctx.fillRect(sx, sy, 0.8, 0.8);
    }

    // ---- 3. Flow-field streamlines ----
    // The macro photo shows a dense organic network of curved lines —
    // NOT sparse cracks. This is the slate's internal grain structure
    // expressed as surface relief: many lines flowing in coherent but
    // organically varied directions, curving and looping like topographic
    // contours or a fingerprint whorl.
    //
    // Implementation: a 2-harmonic sine field defines a smooth direction
    // angle at every (x, y). Streamlines seed from distributed points and
    // each follows the local angle step by step — the smooth field
    // variation naturally causes curves and loops. Phase offsets derived
    // from cloudSeed rotate/shift the field so each stone has its own
    // distinct grain orientation while keeping the same flowing character.
    //
    // ADJUSTABLE:
    //   FLOW_LINE_COUNT  — more lines = denser, more visible grain.
    //   flowAlpha        — brighter/fainter individual lines.
    //   k (field freq)   — lower = longer/broader curves, higher = tighter loops.

    // Per-stone field phase derived from cloudSeed (pure math, no rand() calls
    // so the field itself is stable regardless of speckle/blob rand usage above).
    const phaseRandStream = _mulberry32(cloudSeed * 6271 + 1777);
    const phaseX  = phaseRandStream() * Math.PI * 2;
    const phaseY  = phaseRandStream() * Math.PI * 2;
    const phaseR  = phaseRandStream() * Math.PI * 2;       // overall rotation
    const ampB    = 0.3 + phaseRandStream() * 0.25;        // 2nd harmonic weight

    // Spatial frequency — controls loop/curve size relative to stone.
    // 2.0/radius = ~2 full cycles across the stone diameter → medium loops.
    const k = 2.0 / radius;

    // Direction field: smooth angle at point (px, py) relative to stone center.
    // Two sine harmonics at incommensurate ratios produce a non-repeating,
    // naturally complex field without needing a full noise library.
    const flowDir = (px, py) => {
        // Rotate coordinates for per-stone orientation variety.
        const rx = px * Math.cos(phaseR) - py * Math.sin(phaseR);
        const ry = px * Math.sin(phaseR) + py * Math.cos(phaseR);
        return Math.sin(rx * k * 1.0 + ry * k * 1.618 + phaseX) * Math.PI
             + Math.sin(rx * k * 2.414 - ry * k * 0.866 + phaseY) * Math.PI * ampB;
    };

    const FLOW_LINE_COUNT = 28;
    const flowStep = radius * 0.032;   // step size — smaller = smoother curves
    const flowAlpha = 0.11;            // per-line opacity
    const flowWidth = 0.5;             // line width in px

    tctx.strokeStyle = `rgba(148,162,185,${flowAlpha})`;
    tctx.lineWidth = flowWidth;
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';

    for (let fl = 0; fl < FLOW_LINE_COUNT; fl++) {
        // Seed points: distributed evenly in angle, random in radius.
        // This ensures coverage across the whole stone face, not just
        // center-biased clustering.
        const seedA = (fl / FLOW_LINE_COUNT) * Math.PI * 2 + rand() * 0.5;
        const seedD = Math.sqrt(rand()) * radius * 0.85;
        let fx = cx + Math.cos(seedA) * seedD;
        let fy = cy + Math.sin(seedA) * seedD;

        // Each line has a slightly randomized step count so line lengths vary.
        const maxSteps = 14 + Math.floor(rand() * 22); // 14–36 steps

        tctx.beginPath();
        tctx.moveTo(fx, fy);
        let drew = false;

        for (let s = 0; s < maxSteps; s++) {
            const angle = flowDir(fx - cx, fy - cy);
            const nfx = fx + Math.cos(angle) * flowStep;
            const nfy = fy + Math.sin(angle) * flowStep;

            // Stop if the next point would leave the stone disc.
            const dx = nfx - cx, dy = nfy - cy;
            if (dx * dx + dy * dy > (radius * 0.94) * (radius * 0.94)) break;

            tctx.lineTo(nfx, nfy);
            fx = nfx; fy = nfy;
            drew = true;
        }
        if (drew) tctx.stroke();
    }

    // ---- 4. Bright micro-flecks ----
    // Tiny bright specks visible in the macro photo — small mineral
    // inclusions or surface micro-facets catching the light.
    // Per-stone brightness multiplier keeps each stone unique and
    // ensures flecks stay very subtle overall (never "glittery").
    // ADJUSTABLE: raise fleckBrightness upper bound for more visible flecks.
    const FLECK_COUNT = Math.min(40, Math.floor(radius * 0.55));
    const fleckBrightness = 0.15 + rand() * 0.4; // per-stone: 0.15–0.55
    for (let i = 0; i < FLECK_COUNT; i++) {
        const fAngle = rand() * Math.PI * 2;
        const fDist = Math.sqrt(rand()) * radius * 0.9;
        const fx2 = cx + Math.cos(fAngle) * fDist;
        const fy2 = cy + Math.sin(fAngle) * fDist;
        const fleckAlpha = (0.04 + rand() * 0.08) * fleckBrightness; // 0.006–0.044
        tctx.fillStyle = `rgba(220,228,240,${fleckAlpha})`;
        tctx.fillRect(fx2, fy2, 0.9, 0.9);
    }

    tctx.restore();
    _stoneTextureCache.set(key, tex);
    return tex;
}

/**
 * Draws one Go stone with 3D shading + true-to-material texture.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx, cy   - center coordinates
 * @param {number} radius   - stone radius in px
 * @param {'B'|'W'} player  - 'B' = slate, anything else = hamaguri
 * @param {object} [options]
 * @param {number} [options.ringCount=14]          - hamaguri band count
 * @param {number} [options.ringJitter=1]          - hamaguri band irregularity
 * @param {number} [options.originAngle=-2.3]      - hamaguri band direction (radians)
 * @param {number} [options.originDistMult=6]      - hamaguri band curvature (bigger = straighter)
 * @param {number} [options.whiteness=0.3]         - 0 (Blossom, warm) – 1 (Snow, bright white)
 * @param {number} [options.cloudSeed=0]           - slate mottle-pattern variation seed
 * @param {number} [options.tintAmount=0.5]        - slate 0 (neutral "kuro") – 1 (blue-green "ao")
 * @param {number} [options.valueShift=0]          - slate -1 (darker) – 1 (lighter) overall value
 * @param {number} [options.convexity=1]           - slate roundness (edge AO + top-left lift) multiplier
 * @param {number} [options.specularStrength=1]    - highlight brightness multiplier
 */
function drawGoStone(ctx, cx, cy, radius, player, options = {}) {
    const ringCount = options.ringCount ?? 14;
    const ringJitter = options.ringJitter ?? 1;
    const originAngle = options.originAngle ?? -2.3;
    const originDistMult = options.originDistMult ?? 6;
    const whiteness = options.whiteness ?? 0.3;
    const cloudSeed = options.cloudSeed ?? 0;
    const tintAmount = options.tintAmount ?? 0.5;
    const valueShift = options.valueShift ?? 0;
    const convexity = options.convexity ?? 1;
    const specStrength = options.specularStrength ?? 1;

    ctx.save();

    // ---- Drop shadow ----
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = Math.max(3, radius * 0.28);
    ctx.shadowOffsetX = Math.max(2, radius * 0.14);
    ctx.shadowOffsetY = Math.max(2, radius * 0.18);

    if (player === 'B') {
        // ============ SLATE — matte, mottled, blue-navy black ============
        // Recolored against pixel samples taken directly from a real
        // nachiguro photo (avg ~rgb(59,73,109), highlights reaching
        // ~rgb(100,118,160)) — the earlier neutral grey-black palette
        // undersold how genuinely blue-navy real nachiguro reads, even
        // though it's marketed/perceived as "black."
        let coreColor = _lerpColor('#333f66', '#39456f', tintAmount);
        if (valueShift !== 0) {
            const lightenTarget = valueShift > 0 ? '#59678f' : '#0a0c14';
            coreColor = _lerpColor(coreColor, lightenTarget, Math.abs(valueShift) * 0.35);
        }
        // specStrength now only lifts the core a little — this is matte
        // stone, not glass, so keep the ceiling low even at full 0.5 cap.
        const brightCore = _lerpColor(coreColor, '#6f84ab', specStrength * 0.6);
        const rimColor = _lerpColor(coreColor, '#0c0e16', 0.4);

        const grad = ctx.createRadialGradient(
            cx - radius * 0.25, cy - radius * 0.3, radius * 0.1,
            cx, cy, radius * 1.15
        );
        grad.addColorStop(0.00, brightCore);
        grad.addColorStop(0.45, coreColor);
        grad.addColorStop(1.00, rimColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

    } else {
        // ============ HAMAGURI — ivory shell with warm translucent rim ============
        // whiteness 1 = Snow grade brightness, 0 = Blossom grade warmth.
        const midStop = _lerpColor('#efdfbb', '#f6eeda', whiteness);
        const edgeStop = _lerpColor('#dcc593', '#e6d4a8', whiteness);
        const grad = ctx.createRadialGradient(
            cx - radius * 0.3, cy - radius * 0.35, radius * 0.05,
            cx - radius * 0.05, cy - radius * 0.05, radius * 1.15
        );
        grad.addColorStop(0.00, '#fffdf6');
        grad.addColorStop(0.35, '#f8f0da');
        grad.addColorStop(0.7, midStop);
        grad.addColorStop(1.00, edgeStop);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowColor = 'transparent';

    // ---- Material texture ----
    if (player === 'B') {
        const tex = _getSlateTexture(radius, cloudSeed);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(tex, cx - radius, cy - radius);
        ctx.globalAlpha = 1.0;

        // ---- Set B parity highlight (professional integration) ----
        // Set B's black gradient (`#6b7280` peak, geometry centered up-left,
        // inner focus 0.05r, expanding to 1.2r offset toward (cx-0.1r,
        // cy-0.1r)) is the visual language the rest of this tool already
        // uses for "this corner catches light." Reusing that exact
        // geometry here — instead of inventing a different highlight
        // shape for Set C — keeps the two sets visually consistent to
        // anyone comparing them side by side.
        //
        // What's deliberately NOT copied is Set B's opacity: Set B paints
        // that gradient as a fully opaque fill, which is correct for a
        // glossy synthetic stone but wrong for hand-polished nachiguro —
        // real slate doesn't have a glass-like catch-light, it has a
        // duller sheen that lifts the corner's tone without ever
        // approaching a highlight "shape" you could point to. Painted at
        // low alpha as a glaze OVER the mottled texture and AO (rather
        // than baked into the base fill), it reads as "this corner is a
        // little brighter" rather than "there is a highlight here" —
        // which is the actual difference between a polished stone and a
        // glazed bead.
        //
        // strengthFactor ties the glaze to specularStrength (already
        // capped at 50% upstream) so it never exceeds the target peak/mid
        // values given (0.28 / 0.10) — it only ever comes in slightly
        // under them. That's intentional: no two hand-polished stones
        // take a light catch identically, so treating the given numbers
        // as a ceiling rather than a fixed constant is closer to how a
        // real finished set actually looks, stone to stone.
        const strengthFactor = 0.75 + specStrength * 0.5; // 0.75–1.0
        const peakAlpha = 0.28 * strengthFactor;
        const midAlpha = 0.10 * strengthFactor;

        const liftGrad = ctx.createRadialGradient(
            cx - radius * 0.25, cy - radius * 0.25, radius * 0.05,
            cx - radius * 0.1, cy - radius * 0.1, radius * 1.2
        );
        liftGrad.addColorStop(0.00, `rgba(190,200,210,${peakAlpha})`);
        liftGrad.addColorStop(0.35, `rgba(190,200,210,${midAlpha})`);
        liftGrad.addColorStop(1.00, 'rgba(190,200,210,0)');
        ctx.fillStyle = liftGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // ---- Edge ambient occlusion (drawn last, on top of the lift) ----
        // Keeping this after the lift means the corner glow still fades
        // out approaching the rim, same as a real polished edge would —
        // the lift doesn't win an argument with the edge shading.
        const aoGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(0.75, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(1, `rgba(0,0,0,${0.24 * convexity})`);
        ctx.fillStyle = aoGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const tex = _getHamaguriTexture(radius, ringCount, ringJitter, originAngle, originDistMult);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(tex, cx - radius, cy - radius);
        ctx.globalAlpha = 1.0;

        // Thin warm translucent band just inside the rim — the visual
        // cue of light passing through the thinnest part of the shell.
        const edgeGrad = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius);
        edgeGrad.addColorStop(0, 'rgba(200,160,90,0)');
        edgeGrad.addColorStop(0.75, 'rgba(200,160,90,0.12)');
        edgeGrad.addColorStop(1, 'rgba(160,120,60,0.22)');
        ctx.fillStyle = edgeGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Specular highlight (hamaguri only) ----
    // Black no longer gets a second overlay here — see the note above,
    // its single base gradient now carries the whole highlight, which
    // is what fixed the ring/halo artifact.
    if (player !== 'B') {
        const glintX = cx + radius * 0.1;
        const glintY = cy + radius * 0.02;
        const glintR = radius * 0.2;
        const glintGrad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, glintR);
        const peak = 0.75 * specStrength;
        glintGrad.addColorStop(0, `rgba(255,255,255,${peak})`);
        glintGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glintGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Thin rim stroke (hamaguri only) for edge definition ----
    if (player !== 'B') {
        ctx.strokeStyle = 'rgba(150,120,70,0.4)';
        ctx.lineWidth = Math.max(0.5, radius * 0.02);
        ctx.beginPath();
        ctx.arc(cx, cy, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Deterministically derives per-stone texture variant params from board
 * position, so each stone gets a distinct look that stays STABLE across
 * redraws (no reroll/flicker on hover, undo, export preview, etc.) —
 * same (row, col, player) always yields the same variant, and it is
 * keyed by POSITION, not by placement — capturing and replaying a stone
 * on the same point reproduces the same look rather than rolling a new
 * one.
 *
 * WHITE (hamaguri): rolls a grade first — "snow" (rare, per real ~5–10%
 * incidence) or "blossom" (common) — then derives ring density/jitter/
 * curvature/whiteness from that grade, matching Kuroki Goishiten's own
 * grading language (Snow = dense+delicate+brightest, Blossom = wider+
 * bolder+warmer).
 *
 * BLACK (slate): NO grade split (real nachiguro isn't marketed in
 * grain-pattern grades — it's graded on cut quality/size, not visible
 * texture). Randomness instead targets tone (tintAmount) and value
 * (valueShift) plus highlight softness, matching what actually varies
 * stone-to-stone in the reference photos.
 *
 * ADJUSTABLE: snowProbability controls how often the rare grade shows
 * up on your board — raise it if you want a flashier, less "authentic
 * rarity" set; lower it (or set near real-world ~0.075) for accuracy.
 */
function getStoneVariant(row, col, player) {
    const seed = (row * 19 + col) * 137 + (player === 'B' ? 911 : 313);
    const rand = _mulberry32(seed);

    if (player === 'B') {
        // ============ CHANGED: valueShift is now skewed dark ============
        // Previously: (rand() - 0.5) * 1.2 -> symmetric -0.6..0.6.
        // Now: darkBias% of stones roll -1..0 (darker), the rest roll
        // 0..1 (lighter) — majority negative, minority positive, per
        // request. ADJUSTABLE: darkBiasProbability controls the split
        // (currently 0.8 = 80% darker-leaning stones).
        const darkBiasProbability = 0.8;
        const valueShift = rand() < darkBiasProbability
            ? -rand()   // majority: -1 .. 0
            : rand();   // minority: 0 .. 1
        // ============ END CHANGE ============
        return {
            tintAmount: rand(),                     // 0–1, neutral <-> blue-green cast
            valueShift: valueShift,
            cloudSeed: Math.floor(rand() * 10000),   // distinct mottle pattern per stone
            specularStrength: rand() * 0.5,          // 0–0.5 HARD CAP (50%)
        };
    }

    // ---- White: roll grade first ----
    const snowProbability = 0.2; // ADJUSTABLE — real incidence is ~5–10%
    const isSnow = rand() < snowProbability;

    if (isSnow) {
        // Snow grade: dense, delicate, uniform, brightest.
        return {
            grade: 'snow',
            ringCount: 30 + Math.floor(rand() * 16),   // 30–46, dense
            ringJitter: 0.3 + rand() * 0.35,             // 0.3–0.65, uniform/delicate
            originAngle: rand() * Math.PI * 2,
            originDistMult: 7 + rand() * 3,              // 7–10, flatter/straighter bands
            whiteness: 0.75 + rand() * 0.25,             // 0.75–1.0, brightest
            specularStrength: rand() * 0.5,
        };
    }
    // Blossom grade: wider, coarser, slightly warmer, a touch more bow.
    return {
        grade: 'blossom',
        ringCount: 8 + Math.floor(rand() * 9),       // 8–17, wide/sparse
        ringJitter: 0.7 + rand() * 0.8,               // 0.7–1.5, more organic
        originAngle: rand() * Math.PI * 2,
        originDistMult: 3.5 + rand() * 2.5,           // 3.5–6, more visible bow
        whiteness: 0.1 + rand() * 0.55,               // 0.1–0.65, warmer
        specularStrength: rand() * 0.5,
    };
}

// ============================================================
// Integration into your existing stoneSet branching structure:
// ============================================================
//
// const useGradient  = (style && style.stoneSet === 'A' && cell.player);
// const useGradientB = (style && style.stoneSet === 'B' && cell.player);
// const useGradientC = (style && style.stoneSet === 'C' && cell.player);
// if (useGradient || useGradientB || useGradientC) {
//     targetCtx.save();
//     if (useGradientC) {
//         // row/col are whatever loop variables drawCellContent() already
//         // has when it calls this — same ones used to compute cx/cy.
//         const variant = getStoneVariant(row, col, cell.player);
//         drawGoStone(targetCtx, cx, cy, currentStoneRadius, cell.player, variant);
//     } else if (useGradientB) {
//         // ...existing Set B code...
//     } else if (cell.player === 'B') {
//         // Set A Black
//     } else {
//         // Set A White
//     }
//     targetCtx.restore();
// }
//
// Note: drawGoStone() sets its own shadow internally (shadowColor/Blur/
// Offset), so you don't need to repeat the shadow setup lines above the
// if-block for the Set C path — it's self-contained the same way Set B's
// gradient block is.
