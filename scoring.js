/* ==========================================================================
   MANUAL SCORING MODAL ENGINE (#scoring) - GOSCORER & RE-ARRANGE BUCKETS
   ========================================================================== */

_scoringPersistData = null;
// The full persisted snapshot captured at the last "Save Board". Once a Save exists this (and
// ONLY this) is what survives modal close / refresh — unsaved post-Save edits (playground
// re-arranges, Reset Board/Score) are ephemeral display work that never leaks into persistence,
// so reopening always lands on the last Saved Board in the frozen 'Board Saved ✓' state.
_lastSavedSession = null;

window.scoringState = {
    active: false,
    board: Array.from({length: 19}, () => Array.from({length: 19}, () => 0)),
    markedDead: Array.from({length: 19}, () => Array.from({length: 19}, () => false)),
    deadStonesInfo: Array.from({length: 19}, () => Array.from({length: 19}, () => null)),
    manualTerritory: Array.from({length: 19}, () => Array.from({length: 19}, () => 0)),
    bucketBlack: [],
    bucketWhite: [],
    rearrangeBlack: [],
    rearrangeWhite: [],
    deadWhite: [],
    deadBlack: [],
    ruleMode: 'japanese',
    interactionMode: 'mark',
    showTerritory: true,
    showTerritoryCounts: false,
    showDead: true,
    showCoords: true,
    komi: DEFAULT_KOMI,
    pendingClick: null,
    // Replace-fill bookkeeping: coordinates that hold a stone placed by a Replacing fill,
    // keyed `"r,c"` → { type: 'dead'|'cap', color: 1|2 }. Clicking such a stone in Replace
    // mode reverses the fill (board → empty, prisoner returned to its pool).
    replacedStoneMap: {},
    blackCaptures: 0,
    whiteCaptures: 0,
    frozen: false,
    locked: false,
    lockedSnapshot: null,
    lockBoundaryIndex: 0
};

let scoringHistory = [];
let scoringFuture = [];

function getScoringSnapshot() {
    return {
        board: scoringState.board.map(row => [...row]),
        markedDead: scoringState.markedDead.map(row => [...row]),
        deadStonesInfo: scoringState.deadStonesInfo.map(row => [...row]),
        manualTerritory: scoringState.manualTerritory.map(row => [...row]),
        bucketBlack: [...scoringState.bucketBlack],
        bucketWhite: [...scoringState.bucketWhite],
        rearrangeBlack: [...scoringState.rearrangeBlack],
        rearrangeWhite: [...scoringState.rearrangeWhite],
        deadWhite: [...scoringState.deadWhite],
        deadBlack: [...scoringState.deadBlack],
        blackCaptures: scoringState.blackCaptures || 0,
        whiteCaptures: scoringState.whiteCaptures || 0,
        replacedStoneMap: { ...scoringState.replacedStoneMap }
    };
}

function saveScoringStateForUndo() {
    if (scoringState.frozen) return;
    scoringHistory.push(getScoringSnapshot());
    if (scoringHistory.length > 50) scoringHistory.shift();
    scoringFuture = [];
    updateUndoRedoButtonsUI();
    _scoringDirty = true;
    updateScoringSaveButton();
}

function restoreScoringSnapshot(snap) {
    if (!snap) return;
    scoringState.board = snap.board.map(row => [...row]);
    scoringState.markedDead = snap.markedDead.map(row => [...row]);
    scoringState.deadStonesInfo = snap.deadStonesInfo ? snap.deadStonesInfo.map(row => [...row]) : Array.from({length: 19}, () => Array.from({length: 19}, () => null));
    scoringState.manualTerritory = snap.manualTerritory ? snap.manualTerritory.map(row => [...row]) : Array.from({length: 19}, () => Array.from({length: 19}, () => 0));
    scoringState.bucketBlack = [...(snap.bucketBlack || [])];
    scoringState.bucketWhite = [...(snap.bucketWhite || [])];
    scoringState.rearrangeBlack = [...(snap.rearrangeBlack || [])];
    scoringState.rearrangeWhite = [...(snap.rearrangeWhite || [])];
    scoringState.deadWhite = [...(snap.deadWhite || [])];
    scoringState.deadBlack = [...(snap.deadBlack || [])];
    scoringState.blackCaptures = snap.blackCaptures !== undefined ? snap.blackCaptures : (scoringState.blackCaptures || 0);
    scoringState.whiteCaptures = snap.whiteCaptures !== undefined ? snap.whiteCaptures : (scoringState.whiteCaptures || 0);
    scoringState.replacedStoneMap = snap.replacedStoneMap ? { ...snap.replacedStoneMap } : {};
    updateScoringUI();
    drawBoard();
}

function undoScoring() {
    if (scoringState.frozen) return;
    // While LOCKED, undo traverses only the post-lock (cosmetic) counting work and stops at
    // the locked resolution — it can never reach back to a pre-lock board (lock = commit).
    const boundary = (scoringState.locked && scoringState.lockBoundaryIndex != null)
        ? scoringState.lockBoundaryIndex : 0;
    if (scoringHistory.length <= boundary) return;
    const currentSnap = getScoringSnapshot();
    scoringFuture.push(currentSnap);
    const prevSnap = scoringHistory.pop();
    restoreScoringSnapshot(prevSnap);
    updateUndoRedoButtonsUI();
    _scoringDirty = true;
    updateScoringSaveButton();
}

function redoScoring() {
    if (scoringState.frozen || scoringFuture.length === 0) return;
    const currentSnap = getScoringSnapshot();
    scoringHistory.push(currentSnap);
    const nextSnap = scoringFuture.pop();
    restoreScoringSnapshot(nextSnap);
    updateUndoRedoButtonsUI();
    _scoringDirty = true;
    updateScoringSaveButton();
}

function updateUndoRedoButtonsUI() {
    // While LOCKED, undo is capped at the locked resolution (the boundary kept at lock): the
    // retained pre-lock history must not make the button look undoable past the commit point.
    const boundary = (scoringState.locked && scoringState.lockBoundaryIndex != null) ? scoringState.lockBoundaryIndex : 0;
    const canUndo = scoringHistory.length > boundary;
    const btnUndo = document.getElementById('btn-scoring-undo');
    const btnRedo = document.getElementById('btn-scoring-redo');
    if (btnUndo) {
        btnUndo.disabled = !canUndo;
        btnUndo.style.opacity = canUndo ? '1' : '0.4';
        btnUndo.style.cursor = canUndo ? 'pointer' : 'not-allowed';
    }
    if (btnRedo) {
        btnRedo.disabled = scoringFuture.length === 0;
        btnRedo.style.opacity = scoringFuture.length > 0 ? '1' : '0.4';
        btnRedo.style.cursor = scoringFuture.length > 0 ? 'pointer' : 'not-allowed';
    }
}

// ── Lock engine: "Saved/Locked" resolution commit (real Japanese professional scoring) ──
// Mark Dead Stones + Mark Territories are the mandatory first stage. Locking commits them:
// Replace/Re-arrange unlock, and the SGF Properties (DD/MA/TB/TW) freeze to the locked
// values. Editing a locked mark/territory (or Unlocking) resets every counting action made
// AFTER the lock, restoring the board to the exact locked resolution — never to pristine.
function buildLockedSnapshot() {
    return { ...getScoringSnapshot(), ruleMode: scoringState.ruleMode, komi: scoringState.komi };
}

// Capture the LIVE board state — the post-lock "playground" (replaces/re-arranges + the
// dead/cap/re-arrange bucket stacks + capture counters) — for an explicit Save Board. This is
// a display-layer snapshot kept in memory only: the frozen score and SGF Properties keep
// reading the committed lockedSnapshot, and nothing here is baked into the SGF.
function captureLiveBoardSnapshot() {
    return {
        board: scoringState.board.map(r => [...r]),
        deadWhite: [...scoringState.deadWhite],
        deadBlack: [...scoringState.deadBlack],
        rearrangeBlack: [...scoringState.rearrangeBlack],
        rearrangeWhite: [...scoringState.rearrangeWhite],
        blackCaptures: scoringState.blackCaptures || 0,
        whiteCaptures: scoringState.whiteCaptures || 0,
        replacedStoneMap: { ...scoringState.replacedStoneMap }
    };
}

// Write the COMMITTED DD/MA/TB/TW resolution into the terminal SGF node. Called by Lock Score
// (step 1 of the two-step Save). The props come from computeSgfPropertyBars(), which reads the
// lockedSnapshot while locked, so the playground board is never baked into the SGF. Also
// refreshes rec.workingSgf so downloaded files carry the resolution.
function writeScoringPropsToSgf() {
    const sgfProps = computeSgfPropertyBars();
    const moveCount = state.sgfMoves ? state.sgfMoves.length : 0;
    if (moveCount > 0 && sgfProps) {
        const lastMove = state.sgfMoves[moveCount - 1];
        if (lastMove) {
            if (!lastMove.unknownProps) lastMove.unknownProps = {};
            // Overwrite any prior scoring properties on this node; mirror the four properties
            // onto the terminal move's DIRECT fields (same shape as loadSGF) so the Estimation
            // modal Run gate finds the markup immediately, with no reload needed.
            const assign = (key, arr) => {
                if (arr && arr.length > 0) {
                    lastMove.unknownProps[key] = arr.slice();
                    lastMove[key] = arr.slice();
                } else {
                    delete lastMove.unknownProps[key];
                    delete lastMove[key];
                }
            };
            assign('DD', sgfProps.dd);
            assign('MA', sgfProps.ma);
            assign('TB', sgfProps.tb);
            assign('TW', sgfProps.tw);
            // Mark SGF as dirty so next export includes these properties
            state.isSgfDirty = true;
        }
    }

    if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            if (typeof generateCurrentSgfString === 'function') {
                rec.workingSgf = generateCurrentSgfString();
            }
            StudyRecordDB.saveRecord(rec);
        }
    }

    // Show "saved" badge on SGF property bars panel (the resolution is now committed).
    const badge = document.getElementById('sgf-prop-bars-save-badge');
    if (badge) badge.style.display = '';
}

function applyScoringLock() {
    if (scoringState.frozen || scoringState.locked) return;
    scoringState.lockedSnapshot = buildLockedSnapshot();
    scoringState.locked = true;
    // The lock is a COMMIT point: the pre-lock resolution (marks + territory + buckets +
    // captures) is frozen in lockedSnapshot, so the counting phase's undo must never reach
    // back before it. Pre-lock history is RETAINED behind a boundary (unlock restores it so
    // Undo can walk the marks back to the pristine board); while locked, Undo only traverses
    // post-lock work and stops at the boundary.
    scoringState.lockBoundaryIndex = scoringHistory.length;
    scoringFuture = [];
    // Step 1 of the two-step Save: Lock Score commits the resolution to the SGF.
    writeScoringPropsToSgf();
    updateUndoRedoButtonsUI();
    updateScoringUI();
    updateScoringSaveButton();
    drawBoard();
}

// How much post-lock counting work an unlock would discard (for the confirmation copy).
function countPostLockActions() {
    const snap = scoringState.lockedSnapshot;
    if (!snap || !snap.board) return { placed: 0, removed: 0, caps: 0, terr: 0, total: 0 };
    let placed = 0, removed = 0, terr = 0;
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const live = scoringState.board[r][c];
            const locked = snap.board[r][c] || 0;
            if (live !== 0 && locked === 0) placed++;
            else if (live === 0 && locked !== 0) removed++;
            if (scoringState.manualTerritory[r][c] !== (snap.manualTerritory ? snap.manualTerritory[r][c] || 0 : 0)) terr++;
        }
    }
    const caps = Math.abs((scoringState.blackCaptures || 0) - (snap.blackCaptures || 0))
        + Math.abs((scoringState.whiteCaptures || 0) - (snap.whiteCaptures || 0));
    return { placed, removed, caps, terr, total: placed + removed + caps + terr };
}

// Unlock restores the locked resolution (marks + territory + captures + buckets) and drops
// everything done after the lock; the pre-lock marking history behind the boundary survives.
function applyUnlockReset() {
    const snap = scoringState.lockedSnapshot;
    // Retain the pre-lock marking history that was kept behind the lock boundary: after
    // unlock, Undo walks the marks back to the pristine board (Reset → Unlock → Undo×N).
    const keepHistory = (scoringState.lockBoundaryIndex != null) ? scoringState.lockBoundaryIndex : 0;
    if (snap && snap.board) restoreScoringSnapshot(snap);
    scoringState.locked = false;
    scoringState.lockedSnapshot = null;
    scoringState.lockBoundaryIndex = 0;
    // Unlock restores the pre-lock board: replaced stones are gone, so their reversal tracking
    // is stale and must drop with them.
    scoringState.replacedStoneMap = {};
    // The saved Board playground no longer matches the restored pre-Lock board — invalidate it.
    _savedBoardSnapshot = null;
    if (scoringState.interactionMode === 'replace' || scoringState.interactionMode === 'rearrange') {
        scoringState.interactionMode = 'mark';
        const elModeSelect = document.getElementById('scoring-interaction-mode');
        if (elModeSelect) elModeSelect.value = 'mark';
    }
    scoringHistory = scoringHistory.slice(0, keepHistory);
    scoringFuture = [];
    updateUndoRedoButtonsUI();
    updateScoringUI();
    updateScoringSaveButton();
    drawBoard();
}

function toggleScoringLock() {
    if (scoringState.frozen) return;
    if (scoringState.locked) {
        const counts = countPostLockActions();
        if (counts.total > 0) showUnlockDialog();
        else applyUnlockReset();
    } else {
        applyScoringLock();
    }
}

// The unlock confirmation dialog. Shown when Unlocking would discard post-lock counting work
// (which fills/re-arranges created as a cosmetic ritual). Confirming restores the locked
// resolution and returns to the Mark Dead + Mark Territories stage.
function showUnlockDialog() {
    const dialog = document.getElementById('scoring-unlock-confirm-dialog');
    if (!dialog) { applyUnlockReset(); return; }
    const counts = countPostLockActions();
    const msg = document.getElementById('scoring-unlock-confirm-msg');
    if (msg) {
        if (counts.total === 0) {
            msg.textContent = 'Start D&T? No counting changes were made after locking.';
        } else {
            msg.textContent = `Start D&T? This returns to the pre-Lock stage and discards the counting phase after the lock: `
                + `${counts.placed} stone(s) placed, ${counts.removed} stone(s) removed, `
                + `${counts.caps} capture adjustment(s), ${counts.terr} territory change(s). `
                + `The locked marks & territory are kept.`;
        }
    }
    dialog.style.display = 'flex';
}

function confirmScoringUnlock() {
    const dialog = document.getElementById('scoring-unlock-confirm-dialog');
    if (dialog) dialog.style.display = 'none';
    applyUnlockReset();
}

function cancelScoringUnlock() {
    const dialog = document.getElementById('scoring-unlock-confirm-dialog');
    if (dialog) dialog.style.display = 'none';
}

// Global Mac / Ctrl Keyboard Shortcut Listener for #scoring modal
window.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.stopPropagation();
            if (scoringState.frozen) return;
            if (e.shiftKey) {
                redoScoring();
            } else {
                undoScoring();
            }
        } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            e.stopPropagation();
            if (scoringState.frozen) return;
            redoScoring();
        }
    }
}, true);

function initScoringModal() {
    const btnClose = document.getElementById('btn-close-scoring-modal');
    if (btnClose) {
        btnClose.addEventListener('click', requestCloseScoringModal);
    }
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) requestCloseScoringModal();
        });
    }
    const btnConfirmClose = document.getElementById('btn-scoring-confirm-close');
    if (btnConfirmClose) {
        btnConfirmClose.addEventListener('click', confirmScoringClose);
    }
    const btnCancelClose = document.getElementById('btn-scoring-cancel-close');
    if (btnCancelClose) {
        btnCancelClose.addEventListener('click', cancelScoringClose);
    }

    const btnUndo = document.getElementById('btn-scoring-undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', undoScoring);
    }

    const btnRedo = document.getElementById('btn-scoring-redo');
    if (btnRedo) {
        btnRedo.addEventListener('click', redoScoring);
    }

    const ruleSelect = document.getElementById('scoring-rule-mode');
    if (ruleSelect) {
        ruleSelect.addEventListener('change', (e) => {
            // LOCKED = the computation is DONE; rule mode is part of that computation.
            if (scoringState.locked) { ruleSelect.value = scoringState.ruleMode; return; }
            scoringState.ruleMode = e.target.value;
            updateScoringUI();
            drawBoard();
        });
    }

    const modeSelect = document.getElementById('scoring-interaction-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            scoringState.interactionMode = e.target.value;
            updateScoringUI();
        });
    }

    const optTerr = document.getElementById('scoring-opt-territory');
    if (optTerr) {
        optTerr.addEventListener('change', (e) => {
            scoringState.showTerritory = e.target.checked;
            drawBoard();
        });
    }
    const optTerrCounts = document.getElementById('scoring-opt-territory-counts');
    if (optTerrCounts) {
        optTerrCounts.addEventListener('change', (e) => {
            scoringState.showTerritoryCounts = e.target.checked;
            // Every w/# toggle-ON replays the pop-in: bump every existing badge's start time so
            // the very next draw starts the ease-out-back scale over, even when no count or extent
            // changed. (Turning the toggle off draws nothing; fresh badges on a first-ever ON click
            // create their own animation entries.)
            if (e.target.checked) {
                const nowT = performance.now();
                for (const a of territoryBoxAnims.values()) a.t0 = nowT;
            }
            drawBoard();
        });
    }
    const optDead = document.getElementById('scoring-opt-dead');
    if (optDead) {
        optDead.addEventListener('change', (e) => {
            scoringState.showDead = e.target.checked;
            drawBoard();
        });
    }
    const optCoords = document.getElementById('scoring-opt-coords');
    if (optCoords) {
        optCoords.addEventListener('change', (e) => {
            scoringState.showCoords = e.target.checked;
            drawBoard();
        });
    }

    const komiVal = document.getElementById('scoring-komi-val');
    if (komiVal) {
        komiVal.addEventListener('change', (e) => {
            // LOCKED = the computation is DONE; komi is part of that computation.
            if (scoringState.locked) { komiVal.value = scoringState.komi; return; }
            scoringState.komi = parseFloat(e.target.value) || 0;
            updateScoringUI();
            drawBoard();
        });
    }
    const btnKomiMinus = document.getElementById('btn-scoring-komi-dec');
    if (btnKomiMinus) {
        btnKomiMinus.addEventListener('click', () => {
            if (scoringState.locked) return;
            scoringState.komi = Math.max(-100, scoringState.komi - 0.5);
            if (komiVal) komiVal.value = scoringState.komi;
            updateScoringUI();
            drawBoard();
        });
    }
    const btnKomiPlus = document.getElementById('btn-scoring-komi-inc');
    if (btnKomiPlus) {
        btnKomiPlus.addEventListener('click', () => {
            if (scoringState.locked) return;
            scoringState.komi = scoringState.komi + 0.5;
            if (komiVal) komiVal.value = scoringState.komi;
            updateScoringUI();
            drawBoard();
        });
    }

    const btnClearBuckets = document.getElementById('btn-scoring-clear-buckets');
    if (btnClearBuckets) {
        btnClearBuckets.addEventListener('click', () => {
            // Clears the Re-arrange transfer buckets. While LOCKED this is cosmetic (the tray
            // mirrors the counting ritual); the frozen score reads lockedSnapshot, so it holds.
            if (scoringState.frozen) return;
            saveScoringStateForUndo();
            scoringState.bucketBlack = [];
            scoringState.bucketWhite = [];
            updateScoringUI();
            drawBoard();
        });
    }

    const btnReset = document.getElementById('btn-scoring-reset');
    const dialogReset = document.getElementById('scoring-reset-confirm-dialog');
    const btnConfirmReset = document.getElementById('btn-scoring-confirm-reset');
    const btnCancelReset = document.getElementById('btn-scoring-cancel-reset');

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (scoringState.frozen) return;
            if (dialogReset) {
                // Reset copy reflects the actual target: while LOCKED, Reset restores ONLY the
                // post-D&T committed resolution (the state the locked score was computed from);
                // unlocked, it rebuilds the untouched SGF terminal (every stone, no marks).
                const msg = document.getElementById('scoring-reset-confirm-msg');
                const title = document.getElementById('scoring-reset-confirm-title');
                if (msg) {
                    msg.textContent = scoringState.locked
                        ? 'Reset Playground will: Return to the locked dead-stones & territory resolution — the locked Score is kept, post-lock counting edits are discarded.'
                        : 'Reset D&T Scoring will: Clear all marked dead stones & territory — the board returns to the initial state of the last game move.';
                }
                if (title) {
                    title.textContent = scoringState.locked ? 'Reset Playground Board?' : 'Reset D&T Scoring?';
                }
                if (btnConfirmReset) {
                    btnConfirmReset.textContent = scoringState.locked ? 'Reset Board' : 'Reset D&T';
                }
                dialogReset.style.display = 'flex';
            } else {
                resetScoringBoardFromState({ pristine: true });
            }
        });
    }

    if (btnConfirmReset) {
        btnConfirmReset.addEventListener('click', () => {
            if (scoringState.frozen) return;
            saveScoringStateForUndo();
            resetScoringBoardFromState({ pristine: true });
            if (dialogReset) dialogReset.style.display = 'none';
        });
    }

    if (btnCancelReset) {
        btnCancelReset.addEventListener('click', () => {
            if (dialogReset) dialogReset.style.display = 'none';
        });
    }

    const btnSaveScoring = document.getElementById('btn-scoring-save');
    if (btnSaveScoring) {
        btnSaveScoring.addEventListener('click', saveScoringBoard);
    }

    // ── Lock / Unlock resolution (prerequisite-stage commit) ──────────────
    const btnLock = document.getElementById('btn-scoring-lock');
    if (btnLock) {
        btnLock.addEventListener('click', toggleScoringLock);
    }
    const btnConfirmUnlock = document.getElementById('btn-scoring-confirm-unlock');
    if (btnConfirmUnlock) {
        btnConfirmUnlock.addEventListener('click', confirmScoringUnlock);
    }
    const btnCancelUnlock = document.getElementById('btn-scoring-cancel-unlock');
    if (btnCancelUnlock) {
        btnCancelUnlock.addEventListener('click', cancelScoringUnlock);
    }

    // ── Placement dialog helpers ──────────────────────────────────────────
    const closePlacementDialog = () => {
        const dialog = document.getElementById('scoring-color-picker-dialog');
        if (dialog) dialog.style.display = 'none';
        scoringState.pendingClick = null;
        // Reset to step 1 for next time
        const s1 = document.getElementById('scoring-picker-step1');
        const s2 = document.getElementById('scoring-picker-step2');
        if (s1) s1.style.display = '';
        if (s2) s2.style.display = 'none';
    };

    // Show step-2: sub-type options for a chosen color (1=black, 2=white)
    const showPickerStep2 = (color) => {
        const s1 = document.getElementById('scoring-picker-step1');
        const s2 = document.getElementById('scoring-picker-step2');
        const title = document.getElementById('scoring-picker-step2-title');
        const opts = document.getElementById('scoring-picker-step2-options');
        if (!s2 || !opts) return;

        s1.style.display = 'none';
        s2.style.display = '';

        const icon = color === 1 ? '⚫' : '⚪';
        const label = color === 1 ? 'Black' : 'White';
        if (title) title.textContent = `Place ${icon} ${label} — choose type`;

        // Build available sub-types for this color
        // Black stone sources: rearrangeBlack, deadBlack, whiteCaptures (black stones White captured)
        // White stone sources: rearrangeWhite, deadWhite, blackCaptures (white stones Black captured)
        const sources = [];
        if (color === 1) {
            const rn = scoringState.rearrangeBlack.length;
            const dn = scoringState.deadBlack.length;
            const cn = scoringState.whiteCaptures || 0;
            if (rn > 0) sources.push({ label: `Re-arrange (${rn})`, type: 'rearrange' });
            if (dn > 0) sources.push({ label: `Dead (${dn})`, type: 'dead' });
            if (cn > 0) sources.push({ label: `Cap. (${cn})`, type: 'cap' });
        } else {
            const rn = scoringState.rearrangeWhite.length;
            const dn = scoringState.deadWhite.length;
            const cn = scoringState.blackCaptures || 0;
            if (rn > 0) sources.push({ label: `Re-arrange (${rn})`, type: 'rearrange' });
            if (dn > 0) sources.push({ label: `Dead (${dn})`, type: 'dead' });
            if (cn > 0) sources.push({ label: `Cap. (${cn})`, type: 'cap' });
        }

        opts.innerHTML = '';
        sources.forEach(src => {
            const btn = document.createElement('button');
            btn.textContent = src.label;
            btn.style.cssText = 'width:100%; background:#133a31; color:#ecfdf5; border:1px solid rgba(16,185,129,0.35); padding:7px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; font-weight:600; text-align:left;';
            btn.onmouseover = () => { btn.style.background = '#1a4d3f'; };
            btn.onmouseout  = () => { btn.style.background = '#133a31'; };
            btn.addEventListener('click', () => {
                if (!scoringState.pendingClick) return;
                saveScoringStateForUndo();
                const { r, c } = scoringState.pendingClick;
                scoringState.board[r][c] = color;

                // The source pile shrinks WITH the placement so the tray mirrors the counting
                // ritual; while LOCKED that is cosmetic — the frozen score reads lockedSnapshot.
                if (color === 1) {
                    if (src.type === 'rearrange') {
                        scoringState.rearrangeBlack.pop();
                        scoringState.bucketBlack.pop();
                    } else if (src.type === 'dead') {
                        scoringState.deadBlack.pop();
                        scoringState.bucketWhite.pop();
                    } else if (src.type === 'cap') {
                        scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
                    }
                } else {
                    if (src.type === 'rearrange') {
                        scoringState.rearrangeWhite.pop();
                        scoringState.bucketWhite.pop();
                    } else if (src.type === 'dead') {
                        scoringState.deadWhite.pop();
                        scoringState.bucketBlack.pop();
                    } else if (src.type === 'cap') {
                        scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
                    }
                }

                closePlacementDialog();
                updateScoringUI();
                drawBoard();
            });
            opts.appendChild(btn);
        });

        // If only one source, auto-click it
        if (sources.length === 1) {
            opts.querySelector('button').click();
        }
    };
    // Place a stone using mode-determined type — no dialog needed for type
    // Re-arrange mode → pull from rearrange sub-stack
    // Mark Dead mode  → pull from dead sub-stack
    // Fallback order if primary sub-stack is empty: dead→rearrange→cap
    const placeScoringStoneByMode = (color, r, c) => {
        if (scoringState.interactionMode === 'mark-territory') {
            scoringState.manualTerritory[r][c] = color;
            return;
        }
        scoringState.board[r][c] = color;
        // The source pile shrinks WITH the placement so the tray mirrors the counting ritual;
        // while LOCKED that is cosmetic — the frozen score reads lockedSnapshot.
        // Dead marks NEVER clear when a stone is placed on the point (marks are the immutable
        // resolution — the dead X keeps showing over the placed stone when "Show dead stones"
        // is checked, and the SGF Properties DD/MA counts stay intact).
        const mode = scoringState.interactionMode;
        if (color === 1) { // placing black stone
            if (mode === 'rearrange') {
                // re-Arrange places ONLY from the Re-arrange pile — never Dead or Caps.
                if (scoringState.rearrangeBlack.length > 0) {
                    scoringState.rearrangeBlack.pop();
                    scoringState.bucketBlack.pop();
                }
            } else if (mode === 'mark' && scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                scoringState.bucketWhite.pop();
            } else if (mode === 'replace' && scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                const idx = scoringState.bucketWhite.indexOf('B');
                if (idx !== -1) scoringState.bucketWhite.splice(idx, 1);
                scoringState.replacedStoneMap[`${r},${c}`] = { type: 'dead', color: 1 };
            } else if (mode === 'replace' && (scoringState.whiteCaptures || 0) > 0) {
                scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
                scoringState.replacedStoneMap[`${r},${c}`] = { type: 'cap', color: 1 };
            } else if (scoringState.rearrangeBlack.length > 0) {
                scoringState.rearrangeBlack.pop();
                scoringState.bucketBlack.pop();
            } else if (scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                scoringState.bucketWhite.pop();
            } else {
                scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
            }
        } else { // placing white stone
            if (mode === 'rearrange') {
                // re-Arrange places ONLY from the Re-arrange pile — never Dead or Caps.
                if (scoringState.rearrangeWhite.length > 0) {
                    scoringState.rearrangeWhite.pop();
                    scoringState.bucketWhite.pop();
                }
            } else if (mode === 'mark' && scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                scoringState.bucketBlack.pop();
            } else if (mode === 'replace' && scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                const idx = scoringState.bucketBlack.indexOf('W');
                if (idx !== -1) scoringState.bucketBlack.splice(idx, 1);
                scoringState.replacedStoneMap[`${r},${c}`] = { type: 'dead', color: 2 };
            } else if (mode === 'replace' && (scoringState.blackCaptures || 0) > 0) {
                scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
                scoringState.replacedStoneMap[`${r},${c}`] = { type: 'cap', color: 2 };
            } else if (scoringState.rearrangeWhite.length > 0) {
                scoringState.rearrangeWhite.pop();
                scoringState.bucketWhite.pop();
            } else if (scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                scoringState.bucketBlack.pop();
            } else {
                scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
            }
        }
    };
    const btnPlaceBlack = document.getElementById('btn-place-black-stone');
    if (btnPlaceBlack) {
        btnPlaceBlack.addEventListener('click', () => {
            if (!scoringState.pendingClick) return;
            saveScoringStateForUndo();
            const { r, c } = scoringState.pendingClick;
            placeScoringStoneByMode(1, r, c);
            closePlacementDialog();
            updateScoringUI();
            drawBoard();
        });
    }

    const btnPlaceWhite = document.getElementById('btn-place-white-stone');
    if (btnPlaceWhite) {
        btnPlaceWhite.addEventListener('click', () => {
            if (!scoringState.pendingClick) return;
            saveScoringStateForUndo();
            const { r, c } = scoringState.pendingClick;
            placeScoringStoneByMode(2, r, c);
            closePlacementDialog();
            updateScoringUI();
            drawBoard();
        });
    }

    const btnPickerBack = document.getElementById('btn-picker-back');
    if (btnPickerBack) {
        btnPickerBack.addEventListener('click', () => {
            const s1 = document.getElementById('scoring-picker-step1');
            const s2 = document.getElementById('scoring-picker-step2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
        });
    }

    const btnPickerCancel = document.getElementById('btn-picker-cancel');
    if (btnPickerCancel) {
        btnPickerCancel.addEventListener('click', closePlacementDialog);
    }

    // Board click handler for go-board-canvas-scoring
    const scoringCanvas = document.getElementById('go-board-canvas-scoring');
    if (scoringCanvas) {
        scoringCanvas.removeEventListener('click', handleScoringBoardClick);
        scoringCanvas.addEventListener('click', handleScoringBoardClick);
    }

    // Edit button in scoring modal — un-freezes for changes
    const editScoringBtn = document.getElementById('btn-scoring-edit');
    if (editScoringBtn) {
        editScoringBtn.addEventListener('click', () => {
            if (scoringState.frozen) {
                setScoringFrozen(false);
                _scoringDirty = true;
                updateScoringSaveButton();
            }
        });
    }

    // Endgame Scoring shortcut in replayer panel
    const endgameScoringEl = document.getElementById('endgame-scoring-shortcut');
    if (endgameScoringEl) {
        endgameScoringEl.addEventListener('click', () => {
            let savedData = _scoringPersistData || null;
            // Fall back to the study record's saved scoring state so a fresh page load
            // (where _scoringPersistData is empty) still restores the latest result.
            if (!savedData && state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
                const rec = StudyRecordDB.getRecord(state.activeStudyId);
                if (rec && rec.scoringData) {
                    savedData = rec.scoringData;
                }
            }
            openScoringModal(savedData);
        });
    }
}

function resetScoringBoardFromState(options) {
    // Any reset discards the Save Board playground: the board no longer matches the captured
    // post-lock fills, and the persisted snapshot must not keep a stale savedBoard.
    _savedBoardSnapshot = null;
    // pristine = the "Reset Board" action: rebuild the untouched SGF terminal EXACTLY like
    // opening the same file on goscorer's test page — every stone present, no dead/territory
    // marks, only the game's own in-game captures and komi. Non-pristine (first modal open)
    // keeps the record's own markup as the dead-stone seed (never a heuristic).
    const pristine = !!(options && options.pristine);
    // Reset Board while LOCKED restores ONLY the post-D&T committed resolution — the exact
    // state the locked score was computed from — never the cosmetic post-lock board and never
    // pristine. Post-lock counting edits are discarded and the lock stays engaged, so the user
    // can then Unlock → Undo×N to walk the marks back to a fully clean board.
    if (pristine && scoringState.locked && scoringState.lockedSnapshot) {
        restoreScoringSnapshot(scoringState.lockedSnapshot);
        const boundary = (scoringState.lockBoundaryIndex != null) ? scoringState.lockBoundaryIndex : 0;
        scoringHistory = scoringHistory.slice(0, boundary);
        scoringFuture = [];
        updateUndoRedoButtonsUI();
        persistScoringSessionData();
        return;
    }
    scoringState.board = Array.from({length: 19}, () => Array.from({length: 19}, () => 0));
    scoringState.markedDead = Array.from({length: 19}, () => Array.from({length: 19}, () => false));
    scoringState.deadStonesInfo = Array.from({length: 19}, () => Array.from({length: 19}, () => null));
    scoringState.manualTerritory = Array.from({length: 19}, () => Array.from({length: 19}, () => 0));
    scoringState.bucketBlack = [];
    scoringState.bucketWhite = [];
    scoringState.rearrangeBlack = [];
    scoringState.rearrangeWhite = [];
    scoringState.deadWhite = [];
    scoringState.deadBlack = [];
    scoringState.pendingClick = null;
    scoringState.replacedStoneMap = {};
    scoringHistory = [];
    scoringFuture = [];
    updateUndoRedoButtonsUI();

    const toNumeric = (cell) => {
        if (cell && (cell.player === 'B' || cell.player === 'black' || cell.player === 1)) return 1;
        if (cell && (cell.player === 'W' || cell.player === 'white' || cell.player === 2)) return 2;
        return 0;
    };

    // Reset Board (pristine): the terminal is REPLAYED from the SGF (all moves), independent
    // of where the user is in the move tree — exactly what goscorer's test page draws after
    // loading the file. Non-pristine (first open) reads the main app's current position.
    let pristineCaptures = null;
    if (pristine) {
        const terminal = replayToTerminal();
        const termBoard = terminal.board;
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                scoringState.board[r][c] = (termBoard[r] && termBoard[r][c]) ? toNumeric(termBoard[r][c]) : 0;
            }
        }
        pristineCaptures = terminal.captures;
    } else if (state.board) {
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                scoringState.board[r][c] = toNumeric(state.board[r][c]);
            }
        }
    }

    // Untouched-position snapshot: kept as the reference for the original loaded board and for
    // legacy-session parity. It is NOT read for territory, captures, or the result — those come
    // from the live display board (scoringState.board) so re-arrange/replace edits move the
    // score everywhere consistently. The dead-stone heuristic that once read this snapshot on
    // first entry has been removed: no auto-seeding — dead stones are only ever the record's
    // own markup or the user's manual marks.
    scoringState.baseBoard = scoringState.board.map(r => [...r]);

    // 1. Captured stones extraction — pristine reset takes the SGF replay's own in-game
    //    captures (what goscorer computes from the file); non-pristine reads the live state.
    let bCaps = 0;
    let wCaps = 0;
    if (pristine && pristineCaptures) {
        bCaps = pristineCaptures.B;
        wCaps = pristineCaptures.W;
    } else if (state.captures && (typeof state.captures.B === 'number' || typeof state.captures.W === 'number')) {
        bCaps = typeof state.captures.B === 'number' ? state.captures.B : 0;
        wCaps = typeof state.captures.W === 'number' ? state.captures.W : 0;
    } else if (state.inGameCaptures) {
        bCaps = typeof state.inGameCaptures.B === 'number' ? state.inGameCaptures.B : 0;
        wCaps = typeof state.inGameCaptures.W === 'number' ? state.inGameCaptures.W : 0;
    }

    if (bCaps === 0 && wCaps === 0 && state.sgfMoves && state.sgfMoves.length > 0) {
        let targetIdx = typeof state.currentMoveIndex === 'number' ? state.currentMoveIndex : state.sgfMoves.length - 1;
        let tempB = 0;
        let tempW = 0;
        for (let i = 0; i <= targetIdx && i < state.sgfMoves.length; i++) {
            const m = state.sgfMoves[i];
            if (m && m.captures) {
                const capCount = Array.isArray(m.captures) ? m.captures.length : (typeof m.captures === 'number' ? m.captures : (m.captures.count || 0));
                if (m.player === 'B') tempB += capCount;
                else if (m.player === 'W') tempW += capCount;
            }
        }
        bCaps = tempB;
        wCaps = tempW;
    }

    scoringState.blackCaptures = bCaps;
    scoringState.whiteCaptures = wCaps;
    scoringState.baseCaptures = { B: bCaps, W: wCaps };

    // 2. Komi extraction from SGF metadata — shared SSOT resolver, so the modal's session
    //    and the blue-panel Run snapshot can never disagree on komi (a game with KM[0] is
    //    scored with komi 0 everywhere; only a missing/unparsable value falls back to
    //    DEFAULT_KOMI).
    const parsedKomi = extractSgfKomi();

    scoringState.komi = parsedKomi;
    const elKomiInput = document.getElementById('scoring-komi-val');
    if (elKomiInput) elKomiInput.value = scoringState.komi;

    const elKomiDefaultTag = document.getElementById('scoring-komi-default-tag');
    if (elKomiDefaultTag) {
        elKomiDefaultTag.textContent = `${parsedKomi} (default)`;
    }

    // Seed dead-stone marks from the game's endgame markup (DD/MA/TB/TW) so a fresh scoring
    // session starts from the game's resolved Life & Death marks instead of an empty board.
    // Algorithmic and game-agnostic: the first markup-bearing node found anywhere in the
    // loaded record (findEndgameMarkup) drives the seed. DD/MA mark dead stones directly;
    // TB/TW mark territory, so opponent stones inside those bounds are treated as dead.
    // This is FIRST-ENTRY behavior ONLY: a pristine Reset leaves the board untouched, exactly
    // like the freshly opened SGF (goscorer parity), so both the markup seed and the dead-stone
    // heuristic are skipped there.
    const markupMove = pristine ? null : findEndgameMarkup();
    if (markupMove && scoringState.board.length) {
        const bw = scoringState.board[0].length || 19;
        const bh = scoringState.board.length || 19;
        const applyMark = (list, isTerritory, oppVal) => {
            if (!list) return;
            SgfEngine.expandPointList(list, bw, bh).forEach(pt => {
                const v = scoringState.board[pt.r] && scoringState.board[pt.r][pt.c];
                if (!v) return;
                // Canonical set is markedDead: the same stone can appear in DD/MA AND inside
                // TB/TW bounds (an opponent stone enclosed by declared territory), so a point
                // already marked dead must not be pushed into the dead/bucket stacks again —
                // otherwise the bucket counts (deadWhite.length etc.) double-count it.
                if (scoringState.markedDead[pt.r][pt.c]) return;
                if (!isTerritory || v === oppVal) {
                    scoringState.markedDead[pt.r][pt.c] = true;
                    // Recorded marks behave EXACTLY like manually clicked marks: lift the stone
                    // off the display board (X renders on the empty intersection, stone lives in
                    // its bucket), keep the stone's color in deadStonesInfo and populate the
                    // dead/bucket stacks so the computing formula and replace/rearrange
                    // availability see them. baseBoard keeps the canonical position untouched.
                    scoringState.deadStonesInfo[pt.r][pt.c] = v;
                    if (scoringState.board[pt.r] && scoringState.board[pt.r][pt.c] !== undefined) scoringState.board[pt.r][pt.c] = 0;
                    if (v === 1) {
                        scoringState.deadBlack.push('B');
                        scoringState.bucketWhite.push('B');
                    } else if (v === 2) {
                        scoringState.deadWhite.push('W');
                        scoringState.bucketBlack.push('W');
                    }
                }
            });
        };
        applyMark(markupMove.DD, false);
        applyMark(markupMove.MA, false);
        applyMark(markupMove.TB, true, 2);
        applyMark(markupMove.TW, true, 1);

        // Mirror the territory side too: seed manualTerritory from the resolved TB/TW so the
        // fresh session shows the recorded territory explicitly (never silently auto-derived).
        // Only empty, non-dead intersections are claimed.
        const applyTerritory = (list, terrColor) => {
            if (!list) return;
            SgfEngine.expandPointList(list, bw, bh).forEach(pt => {
                const v = scoringState.board[pt.r] && scoringState.board[pt.r][pt.c];
                if (v !== 0) return;
                if (scoringState.markedDead[pt.r][pt.c]) return;
                scoringState.manualTerritory[pt.r][pt.c] = terrColor;
            });
        };
        applyTerritory(markupMove.TB, 1);
        applyTerritory(markupMove.TW, 2);
    }

    // Dead-stone seeding policy — always, by default: when the loaded record carries no endgame
    // markup (DD/MA/TB/TW), the modal opens with ZERO auto-marked dead stones — the board shows
    // exactly the position as played. Only territory is allowed to auto-derive (GoScorer derives
    // it from whatever dead marks exist). Dead stones are recorded exclusively from the user's
    // manual marks when they hit Save (which writes DD/MA/TB/TW + the session snapshot).

    // Keep the canonical window reference in sync: the modal draws from window.scoringState,
    // and every mutation targets the same object in production (harmless no-op there), while
    // embedders/tests that inject a separate stub stay consistent.
    window.scoringState = scoringState;

    // Lock state: a pristine Reset clears the resolution entirely. A first-entry non-pristine
    // open PRE-ENGAGES the lock when the loaded record carries its own endgame markup
    // (DD/MA/TB/TW) — the file's resolved Life & Death/territory is treated as already
    // committed, so Replacing/Re-arranging are available immediately. Records with no markup
    // open unlocked: the user must resolve dead stones + territory and click Lock first.
    if (!pristine && markupMove && (markupMove.DD || markupMove.MA || markupMove.TB || markupMove.TW)) {
        scoringState.locked = true;
        scoringState.lockedSnapshot = buildLockedSnapshot();
    } else {
        scoringState.locked = false;
        scoringState.lockedSnapshot = null;
    }

    // User-initiated resets (pristine) drop the resolution from the persisted record too, so a
    // reopened modal never resurrects the Reset Board / Reset Score state the user just cleared.
    if (pristine) persistScoringSessionData();

    updateScoringSaveButton();
    updateScoringUI();
    drawBoard();
}

// Persist the current session to in-page memory AND the study record, so a reset that clears
// the savedBoard playground (and/or the resolution) is durable across modal closes and page
// reloads. Mirrors the shape buildScoringSessionSnapshot produces for Save Board.
function persistScoringSessionData() {
    // Persistence rule: once a Save Board exists, the persisted session is ALWAYS the last saved
    // state — a Reset Board / Reset Score clears only the live display and stays discardable
    // until the next Save Board finalizes it. Only before any Save exists does a reset write the
    // live (pristine) session to persistence, so a reopen doesn't resurrect the cleared state.
    if (_scoringHasSaved && _lastSavedSession) {
        _scoringPersistData = _lastSavedSession;
        return;
    }
    _scoringPersistData = buildScoringSessionSnapshot();
    if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            rec.scoringData = buildScoringSessionSnapshot();
            StudyRecordDB.saveRecord(rec);
        }
    }
}

// Number of stones of the given color currently marked dead (1 = Black, 2 = White).
// Dead-stone accounting in the formulas comes from the MARKS (markedDead/deadStonesInfo) —
// the game's true Life & Death set — so recorded/auto/manual marks all count as one, and
// Replacing a dead stone (which pops a bucket for placement) never changes the count.
function countMarkedDeadStones(ss, colorVal) {
    let n = 0;
    const md = ss.markedDead;
    const info = ss.deadStonesInfo;
    if (!md || !info) return n;
    for (let r = 0; r < 19; r++) {
        const mdRow = md[r];
        const infoRow = info[r];
        if (!mdRow || !infoRow) continue;
        for (let c = 0; c < 19; c++) {
            if (mdRow[c] && infoRow[c] === colorVal) n++;
        }
    }
    return n;
}

// SSOT scoring summary: computes territory / dead / caps / komi totals from a snapshot-shaped
// object — the live scoringState OR a lockedSnapshot. When the resolution is LOCKED the score
// read-out (formula + totals + result badge) must reflect the committed locked snapshot, never
// the cosmetic post-lock board, so the counting phase (replace / re-arrange) can never move the
// displayed score. Territory comes from the canonical session→props converter (manual territory
// overrides GoScorer; occupied cells are never territory), dead from the MARKS, prisoners from
// the capture counters — the exact arithmetic the per-color formula renders next to the badge.
function computeScoringSummary(ss) {
    const ruleMode = ss.ruleMode || 'japanese';
    const props = computeScoringPropsFromSession(ss);
    const raw = props ? props.rawCounts : null;
    const bTerr = raw ? raw.tb : 0;
    const wTerr = raw ? raw.tw : 0;
    const bDead = countMarkedDeadStones(ss, 2);
    const wDead = countMarkedDeadStones(ss, 1);
    const bCaps = ss.blackCaptures || 0;
    const wCaps = ss.whiteCaptures || 0;
    const komi = (ss.komi != null) ? ss.komi : 0;
    let bTotal, wTotal;
    if (ruleMode === 'japanese') {
        bTotal = bTerr + bDead + bCaps;
        wTotal = wTerr + wDead + wCaps + komi;
    } else {
        bTotal = bTerr + bDead;
        wTotal = wTerr + wDead + komi;
    }
    return { ruleMode, bTerr, wTerr, bDead, wDead, bCaps, wCaps, komi, bTotal, wTotal };
}

// Territory/area totals come from computeScoringSummary → computeScoringPropsFromSession,
// which applies the same occupied-cell guard and manualTerritory override that GoScorer's raw
// per-cell scores are reduced with. (The dedicated helper below is removed: its only callers —
// the section-8 formula and RESULT badge — now share that single SSOT.)
function openScoringModal(savedData) {
    scoringState.active = true;
    _scoringDirty = false;
    _scoringHasSaved = false;

    // Algorithmic restore: when the modal is opened without explicit saved data (e.g. from
    // the Estimation panel's "Open Manual Scoring Modal" button), restore the most recent
    // persisted scoring session first, then the study record's saved scoring state — so the
    // reopened modal always reflects the latest marked/saved dead stones instead of stale ones.
    if (!savedData) {
        if (_scoringPersistData) {
            savedData = _scoringPersistData;
        } else if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
            const rec = StudyRecordDB.getRecord(state.activeStudyId);
            if (rec && rec.scoringData) {
                savedData = rec.scoringData;
            }
        }
    }

    // Names
    const bName = (state.gameInfo && (state.gameInfo.PB || state.gameInfo.pb)) || (state.sgfMetadata && state.sgfMetadata.pb) || 'Black';
    const wName = (state.gameInfo && (state.gameInfo.PW || state.gameInfo.pw)) || (state.sgfMetadata && state.sgfMetadata.pw) || 'White';
    const elBName = document.getElementById('scoring-black-name');
    const elWName = document.getElementById('scoring-white-name');
    if (elBName) elBName.textContent = bName;
    if (elWName) elWName.textContent = wName;
    const elBRank = document.getElementById('scoring-black-rank');
    const elWRank = document.getElementById('scoring-white-rank');
    if (elBRank) elBRank.textContent = state.sgfMetadata.br || '-';
    if (elWRank) elWRank.textContent = state.sgfMetadata.wr || '-';

    // Result read-out: derived from the SGF's RE value; 'n/a' when the record defines none.
    const elResultDefaultTag = document.getElementById('scoring-result-default-tag');
    if (elResultDefaultTag) {
        const reVal = (state.sgfMetadata && state.sgfMetadata.re) || (state.gameInfo && (state.gameInfo.re || state.gameInfo.RE)) || '';
        elResultDefaultTag.textContent = `${reVal.trim() || 'n/a'} (default)`;
    }

    // Komi default read-out: the SGF-derived komi is the "(default)" every session compares
    // against. Set on EVERY open (restore AND first-entry), mirroring the result tag — the
    // restore path never ran resetScoringBoardFromState, so a reopened modal after a saved
    // D&T session would otherwise keep the static HTML placeholder ("0 (default)") instead of
    // the real SGF komi. extractSgfKomi() is the SSOT resolver, so KM[0] games render "0
    // (default)" correctly and the editable komi input stays whatever the session carries.
    const elKomiDefaultTag = document.getElementById('scoring-komi-default-tag');
    if (elKomiDefaultTag) {
        elKomiDefaultTag.textContent = `${extractSgfKomi()} (default)`;
    }

    if (savedData) {
        restoreScoringFromSavedData(savedData);
        // Persistence rule: once a Save Board exists, the persisted session is the last SAVED
        // state, and the modal ALWAYS reopens frozen in the 'Board Saved ✓' presentation — never
        // in an editable state, and never carrying a stale dirty flag from an unsaved edit. Only
        // before any Save exists (the very first time) does the modal open in the normal
        // first-entry flow (fresh open stays frozen, Edit-first).
        const hasSaved = !!(savedData._scoringHasSaved || savedData.savedBoard);
        if (savedData._scoringDirty != null) {
            _scoringDirty = hasSaved ? false : savedData._scoringDirty;
            _scoringHasSaved = hasSaved;
            updateScoringSaveButton();
        }
        // Restored saved sessions become the in-memory last-saved reference for this page load
        // (fresh loads pull rec.scoringData), so later unsaved edits are discarded against it.
        if (hasSaved) _lastSavedSession = savedData;
        setScoringFrozen(hasSaved || savedData.frozen !== false);
    } else {
        let initialRule = ((state.gameInfo && (state.gameInfo.rules || state.gameInfo.RU)) || (state.sgfMetadata && state.sgfMetadata.ru) || 'japanese').toLowerCase();
        if (initialRule.includes('chinese') || initialRule.includes('area')) {
            scoringState.ruleMode = 'chinese';
        } else {
            scoringState.ruleMode = 'japanese';
        }
        const elRuleSelect = document.getElementById('scoring-rule-mode');
        if (elRuleSelect) elRuleSelect.value = scoringState.ruleMode;

        // Open frozen: scoring board starts read-only with the Edit button visible,
        // so the user must click Edit before making any changes.
        setScoringFrozen(true);

        resetScoringBoardFromState();
    }

    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }

    // Canvas size initialization matching active scoring style board size
    const scoringSize = (state.scoringBoardStyle && state.scoringBoardStyle.board && state.scoringBoardStyle.board.size) || 600;
    updateBoardWrapperSize('#go-board-canvas-scoring', scoringSize);

    updateScoringSaveButton();
    updateScoringUI();
    drawBoard();
}

// ── SSOT: one builder defines the persisted scoring-session snapshot shape ──
// The SAME snapshot is written to _scoringPersistData (in-page memory) and to
// rec.scoringData (the per-REC persistent snapshot in the web/localStorage).
// Every field the modal needs to reconstruct the EXACT last-edited board —
// lifted dead stones, manual territory, rearrange/replace buckets, captures,
// komi, rule/interaction mode, frozen state, dirty flags — is captured here.
function buildScoringSessionSnapshot() {
    // While LOCKED the persisted session is the COMMITTED resolution (lockedSnapshot), not the
    // cosmetic post-lock board: the saved board/marks/territory/captures must be EXACTLY the
    // state the locked score was computed from, so Saved DD/MA/TB/TW, the blue-panel Run and
    // the reopened modal all agree with the frozen read-out. Post-lock edits are a display aid
    // and are intentionally not persisted.
    const src = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState;
    return {
        board: src.board.map(r => [...r]),
        // The post-lock "playground" board captured by Save Board (step 2). Kept in memory only:
        // it is NOT the source of the frozen score, SGF Properties, or Run — those read
        // src/lockedSnapshot. On reopen it decides exactly what the modal displays.
        savedBoard: _savedBoardSnapshot ? {
            board: _savedBoardSnapshot.board.map(r => [...r]),
            deadWhite: [..._savedBoardSnapshot.deadWhite],
            deadBlack: [..._savedBoardSnapshot.deadBlack],
            rearrangeBlack: [..._savedBoardSnapshot.rearrangeBlack],
            rearrangeWhite: [..._savedBoardSnapshot.rearrangeWhite],
            blackCaptures: _savedBoardSnapshot.blackCaptures,
            whiteCaptures: _savedBoardSnapshot.whiteCaptures,
            replacedStoneMap: _savedBoardSnapshot.replacedStoneMap ? { ..._savedBoardSnapshot.replacedStoneMap } : {}
        } : undefined,
        baseBoard: scoringState.baseBoard ? scoringState.baseBoard.map(r => [...r]) : undefined,
        baseCaptures: scoringState.baseCaptures ? { B: scoringState.baseCaptures.B, W: scoringState.baseCaptures.W } : undefined,
        markedDead: src.markedDead.map(r => [...r]),
        deadStonesInfo: src.deadStonesInfo.map(r => [...r]),
        manualTerritory: src.manualTerritory.map(r => [...r]),
        bucketBlack: [...src.bucketBlack],
        bucketWhite: [...src.bucketWhite],
        rearrangeBlack: [...src.rearrangeBlack],
        rearrangeWhite: [...src.rearrangeWhite],
        deadWhite: [...src.deadWhite],
        deadBlack: [...src.deadBlack],
        ruleMode: scoringState.ruleMode,
        interactionMode: scoringState.interactionMode,
        komi: scoringState.komi,
        blackCaptures: src.blackCaptures,
        whiteCaptures: src.whiteCaptures,
        frozen: scoringState.frozen,
        locked: scoringState.locked,
        lockedSnapshot: scoringState.lockedSnapshot ? copySnapshotShape(scoringState.lockedSnapshot) : undefined,
        _scoringDirty: _scoringDirty,
        _scoringHasSaved: _scoringHasSaved
    };
}

// Deep-copy one snapshot-shaped object (the locked-resolution commit point) so a persisted
// session never shares mutable arrays with the live scoring state.
function copySnapshotShape(snap) {
    return {
        board: snap.board.map(r => [...r]),
        markedDead: snap.markedDead.map(r => [...r]),
        deadStonesInfo: snap.deadStonesInfo.map(r => [...r]),
        manualTerritory: snap.manualTerritory.map(r => [...r]),
        bucketBlack: [...snap.bucketBlack],
        bucketWhite: [...snap.bucketWhite],
        rearrangeBlack: [...snap.rearrangeBlack],
        rearrangeWhite: [...snap.rearrangeWhite],
        deadWhite: [...snap.deadWhite],
        deadBlack: [...snap.deadBlack],
        blackCaptures: snap.blackCaptures,
        whiteCaptures: snap.whiteCaptures,
        replacedStoneMap: snap.replacedStoneMap ? { ...snap.replacedStoneMap } : {},
        ruleMode: snap.ruleMode,
        komi: snap.komi
    };
}

function closeScoringModal() {
    if (scoringState.active) {
        // Persistence rule: once a Save Board exists, the persisted session is ALWAYS the last
        // saved state — unsaved post-Save edits (playground re-arranges, Reset Board/Score) are
        // discardable display work and must not survive close/reopen or a refresh. Only before
        // any Save exists (the first-time flow) does close persist the live session in memory.
        _scoringPersistData = (_scoringHasSaved && _lastSavedSession) ? _lastSavedSession : buildScoringSessionSnapshot();
    }
    scoringState.active = false;
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    const dialog = document.getElementById('scoring-color-picker-dialog');
    if (dialog) dialog.style.display = 'none';
    const closeDialog = document.getElementById('scoring-close-confirm-dialog');
    if (closeDialog) closeDialog.style.display = 'none';
}

// User-initiated close (the ✕ button, clicking the backdrop outside the panel). When the
// scoring board carries unsaved changes (_scoringDirty) the close is intercepted with the
// close-without-saving confirm dialog — mirroring the beforeunload warning, since a close
// discards the unsaved edits and the reopen restores the last Saved Board.
function requestCloseScoringModal() {
    if (scoringState.active && _scoringDirty) {
        const dialog = document.getElementById('scoring-close-confirm-dialog');
        const msg = document.getElementById('scoring-close-confirm-msg');
        if (dialog && msg) {
            msg.textContent = _scoringHasSaved
                ? 'You have unsaved changes on the scoring board. Closing will discard them and restore the last Saved Board on reopen — press Save Board to keep them first.'
                : 'You have unsaved changes on the scoring board. Close without saving?';
            dialog.style.display = 'flex';
            return;
        }
    }
    closeScoringModal();
}

function confirmScoringClose() {
    const dialog = document.getElementById('scoring-close-confirm-dialog');
    if (dialog) dialog.style.display = 'none';
    closeScoringModal();
}

function cancelScoringClose() {
    const dialog = document.getElementById('scoring-close-confirm-dialog');
    if (dialog) dialog.style.display = 'none';
}

function setScoringFrozen(frozen) {
    scoringState.frozen = frozen;
    const overlay = document.getElementById('scoring-frozen-overlay');
    if (overlay) overlay.style.display = frozen ? 'block' : 'none';
    if (typeof updateScoringUI === 'function') updateScoringUI();
}

function updateScoringSaveButton() {
    const btn = document.getElementById('btn-scoring-save');
    const editBtn = document.getElementById('btn-scoring-edit');
    if (!btn) return;

    // FROZEN (post "Save Board"): the board is committed to memory — show the saved badge.
    if (scoringState.frozen) {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.textContent = 'Board Saved ✓';
        btn.style.background = 'rgba(16, 185, 129, 0.5)';
        btn.style.color = '#6ee7b7';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.7)';
        btn.title = 'Scoring board saved — click to save again';
        if (editBtn) {
            editBtn.style.display = '';
            editBtn.style.background = 'rgba(107, 114, 128, 0.2)';
            editBtn.style.color = '#9ca3af';
            editBtn.style.borderColor = 'rgba(107, 114, 128, 0.3)';
            editBtn.disabled = false;
            editBtn.style.cursor = 'pointer';
        }
        return;
    }

    // PRE-D&T (unlocked): the two-step Save is gated behind Lock Score — grayed out.
    if (!scoringState.locked) {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
        btn.textContent = 'Save Board';
        btn.style.background = 'rgba(107, 114, 128, 0.2)';
        btn.style.color = '#9ca3af';
        btn.style.borderColor = 'rgba(107, 114, 128, 0.3)';
        btn.title = 'Lock the Score first to enable Save Board';
        if (editBtn) editBtn.style.display = 'none';
        return;
    }

    // POST-D&T (locked): Save Board captures the board state to memory.
    btn.disabled = false;
    btn.style.cursor = 'pointer';
    btn.textContent = 'Save Board';
    btn.style.background = 'rgba(16, 185, 129, 0.25)';
    btn.style.color = '#34d399';
    btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    btn.title = 'Save the board state to memory (the resolution is locked in the SGF)';
    if (editBtn) {
        editBtn.style.display = _scoringHasSaved ? '' : 'none';
        if (_scoringHasSaved) {
            editBtn.style.background = 'rgba(251, 191, 36, 0.25)';
            editBtn.style.color = '#fbbf24';
            editBtn.style.borderColor = 'rgba(251, 191, 36, 0.4)';
            editBtn.disabled = false;
            editBtn.style.cursor = 'pointer';
        }
    }
}
function saveScoringBoard() {
    const btn = document.getElementById('btn-scoring-save');
    if (!btn) return;

    // ── Step 2 of the two-step Save: capture the BOARD state to memory ────
    // The committed resolution was already written to the SGF by Lock Score (step 1). Save
    // Board captures the LIVE board state — the post-lock "playground" (replaces/re-arranges +
    // bucket stacks + capture counters) — into memory so reopening restores the board exactly
    // as saved. The playground is deliberately NOT baked into the SGF: the SGF keeps the
    // committed resolution, and the frozen score keeps reading lockedSnapshot.
    _savedBoardSnapshot = captureLiveBoardSnapshot();

    // Save always finalizes the session state (saved flags, frozen) regardless of whether a
    // study record exists; the record block then snapshots the exact last-edited board.
    _scoringDirty = false;
    _scoringHasSaved = true;
    setScoringFrozen(true);

    // The last saved session: the exact snapshot (committed resolution + savedBoard playground +
    // frozen/clean flags) captured at Save Board time. This is the persistence source of truth:
    // until the next Save Board, every modal close / refresh restores THIS state and discards
    // any unsaved post-Save edits (Reset Board/Score, playground re-arranges).
    _lastSavedSession = buildScoringSessionSnapshot();

    if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            // Persist the per-REC snapshot: the committed resolution (board/marks/territory/
            // captures from lockedSnapshot while locked — the source the blue-panel Run reads)
            // PLUS the savedBoard playground the modal displays on reopen. DD/MA/TB/TW are
            // derived from the committed fields by the shared converter.
            rec.scoringData = _lastSavedSession;
            StudyRecordDB.saveRecord(rec);
        }
    }

    updateScoringSaveButton();
}

function restoreScoringFromSavedData(data) {
    // A "savedBoard" playground (Save Board, step 2) is the post-lock board captured to memory:
    // when present, the modal DISPLAYS it exactly as saved, while the committed resolution
    // (marks / territory / buckets carried by lockedSnapshot) stays the source of the frozen
    // score, the SGF Properties and the blue-panel Run. The playground is never baked into the
    // SGF, so restoring it must not move any committed number.
    const playground = data.savedBoard;
    scoringState.markedDead = data.markedDead.map(r => [...r]);
    scoringState.deadStonesInfo = data.deadStonesInfo ? data.deadStonesInfo.map(r => [...r]) : Array.from({length: 19}, () => Array.from({length: 19}, () => null));
    scoringState.manualTerritory = data.manualTerritory ? data.manualTerritory.map(r => [...r]) : Array.from({length: 19}, () => Array.from({length: 19}, () => 0));
    // Legacy migration: sessions saved before manualTerritory was persisted carried no
    // territory marks and silently fell back to auto-derived territory. If this snapshot has
    // no manual territory but the loaded SGF tree records TB/TW, recover the saved territory
    // so the reopened modal (and every downstream consumer) respects it.
    {
        const norm = normalizeScoringSession({
            board: data.board,
            markedDead: scoringState.markedDead,
            manualTerritory: scoringState.manualTerritory,
            ruleMode: scoringState.ruleMode
        });
        if (norm && norm.manualTerritory && norm.manualTerritory !== scoringState.manualTerritory) {
            scoringState.manualTerritory = norm.manualTerritory;
        }
    }
    scoringState.bucketBlack = [...(data.bucketBlack || [])];
    scoringState.bucketWhite = [...(data.bucketWhite || [])];
    scoringState.rearrangeBlack = [...(data.rearrangeBlack || [])];
    scoringState.rearrangeWhite = [...(data.rearrangeWhite || [])];
    if (playground) {
        // Playground restore: the exact board + bucket/capture counters captured by Save Board.
        // The dead-stack rebuild-from-marks and stone-lift self-heal below are SKIPPED — they
        // operate on the committed marks and would undo the fills the user saved.
        scoringState.board = playground.board.map(r => [...r]);
        scoringState.deadWhite = [...(playground.deadWhite || [])];
        scoringState.deadBlack = [...(playground.deadBlack || [])];
        scoringState.rearrangeBlack = [...(playground.rearrangeBlack || [])];
        scoringState.rearrangeWhite = [...(playground.rearrangeWhite || [])];
        scoringState.blackCaptures = playground.blackCaptures || 0;
        scoringState.whiteCaptures = playground.whiteCaptures || 0;
        scoringState.replacedStoneMap = playground.replacedStoneMap ? { ...playground.replacedStoneMap } : {};
    } else {
        scoringState.board = data.board.map(r => [...r]);
        // Rebuild the dead stacks from the MARKS (canonical set) instead of trusting the persisted
        // arrays: sessions saved before the seeding dedupe fix could carry double-pushed entries
        // (a stone present in DD/MA AND inside TB/TW bounds), which inflated deadWhite/deadBlack and
        // the Black/White "Dead:" bucket pills. Rebuilding from markedDead/deadStonesInfo makes the
        // buckets mirror the marks exactly and self-heals stale persisted counts.
        scoringState.deadWhite = [];
        scoringState.deadBlack = [];
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (scoringState.markedDead[r][c]) {
                    if (scoringState.deadStonesInfo[r][c] === 1) scoringState.deadBlack.push('B');
                    else if (scoringState.deadStonesInfo[r][c] === 2) scoringState.deadWhite.push('W');
                }
            }
        }
        // Self-heal sessions saved before dead marks were lifted: the seeds wrote markedDead but
        // left the stone ON the display board (an X drawn over a still-rendered stone), while
        // manual marks lift it to an empty intersection. The marks are canonical — any stone
        // sitting at a markedDead position was meant to be lifted, so lift it now. baseBoard is
        // already the untouched game position, so the final result never moves.
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (scoringState.markedDead[r][c] && scoringState.board[r][c] !== 0) {
                    scoringState.board[r][c] = 0;
                }
            }
        }
        scoringState.blackCaptures = data.blackCaptures || 0;
        scoringState.whiteCaptures = data.whiteCaptures || 0;
        scoringState.replacedStoneMap = {};
    }
    // Reflect the restored playground in the module-level capture (Save Board) slot so any later
    // snapshot (modal close, save again) keeps carrying the savedBoard the user saw.
    _savedBoardSnapshot = playground ? {
        board: playground.board.map(r => [...r]),
        deadWhite: [...(playground.deadWhite || [])],
        deadBlack: [...(playground.deadBlack || [])],
        rearrangeBlack: [...(playground.rearrangeBlack || [])],
        rearrangeWhite: [...(playground.rearrangeWhite || [])],
        blackCaptures: playground.blackCaptures || 0,
        whiteCaptures: playground.whiteCaptures || 0,
        replacedStoneMap: playground.replacedStoneMap ? { ...playground.replacedStoneMap } : {}
    } : null;
    scoringState.ruleMode = data.ruleMode || 'japanese';
    scoringState.interactionMode = data.interactionMode || 'mark';
    // Lock state: restores the resolution commit + its snapshot from the saved session.
    // Legacy sessions without these fields open unlocked (the user locks when ready).
    scoringState.locked = !!(data.locked);
    scoringState.lockedSnapshot = data.lockedSnapshot || null;
    // Legacy locked resolutions saved before komi was part of the snapshot carry no komi; the
    // frozen score read-out reads it from the snapshot, so backfill it from the resolved komi
    // to keep the committed formula rendering "+ 6.5 (komi)" instead of "+ 0 (komi)".
    if (scoringState.lockedSnapshot && scoringState.lockedSnapshot.komi == null) {
        scoringState.lockedSnapshot.komi = (data.komi != null) ? data.komi : extractSgfKomi();
    }
    // Legacy sessions saved without a komi field fall back to the SGF's real komi (via the
    // SSOT resolver) — never a hardcoded default — so a KM[0] game stays 0 here too.
    scoringState.komi = data.komi != null ? data.komi : extractSgfKomi();
    const elKomiInput = document.getElementById('scoring-komi-val');
    if (elKomiInput) elKomiInput.value = scoringState.komi;
    // Untouched-position snapshot for parity with the original loaded board (the dead-stone
    // heuristic that once read it on first entry is removed). The score, saved markup and
    // blue-panel Run all read the live display board + live captures, so legacy sessions
    // simply carry no baseBoard without any behavior change.
    scoringState.baseBoard = data.baseBoard ? data.baseBoard.map(r => [...r]) : null;
    scoringState.baseCaptures = data.baseCaptures
        ? { B: data.baseCaptures.B, W: data.baseCaptures.W }
        : { B: scoringState.blackCaptures, W: scoringState.whiteCaptures };

    scoringState.active = true;
    scoringState.pendingClick = null;
    scoringHistory = [];
    scoringFuture = [];
    updateUndoRedoButtonsUI();

    // Keep the canonical window reference in sync (see resetScoringBoardFromState).
    window.scoringState = scoringState;

    _scoringHasSaved = true;
    const elRuleSelect = document.getElementById('scoring-rule-mode');
    if (elRuleSelect) elRuleSelect.value = scoringState.ruleMode;
    const elModeSelect = document.getElementById('scoring-interaction-mode');
    if (elModeSelect) elModeSelect.value = scoringState.interactionMode;

    updateScoringSaveButton();
    updateScoringUI();
    drawBoard();
}

window.openScoringModal = openScoringModal;
window.closeScoringModal = closeScoringModal;
window.requestCloseScoringModal = requestCloseScoringModal;

function updateScoringUI() {
    const subtitle = document.getElementById('scoring-subtitle');
    const help = document.getElementById('scoring-mode-help');
    
    const ruleTxt = scoringState.ruleMode === 'japanese' ? 'Territory scoring (Japanese-like)' : 'Area scoring (Chinese-like)';
    const modeTxt = scoringState.interactionMode === 'mark' ? 'Mark Dead Stones' : scoringState.interactionMode === 'replace' ? 'Replacing Dead Stones' : scoringState.interactionMode === 'rearrange' ? 're-Arranging Stones' : 'Mark Territories';
    if (subtitle) subtitle.textContent = `${ruleTxt} • ${modeTxt}`;

    if (help) {
        if (scoringState.interactionMode === 'mark') {
            help.textContent = 'Click stones on board to toggle marking dead/alive.';
        } else if (scoringState.interactionMode === 'rearrange') {
            help.textContent = 'Click stone to collect into bucket. Click empty point to place collected stone.';
        } else if (scoringState.interactionMode === 'replace') {
            help.textContent = 'Click empty territory to place opponent prisoner stone there (deducts their territory points).';
        } else if (scoringState.interactionMode === 'mark-territory') {
            help.textContent = 'Click empty intersection to assign territory to a color. Click again to unassign.';
        }
    }

    // ── Save D&T / Start D&T button + Interaction Mode gating ─────────────
    // Replace & Re-arrange are counting-aid modes gated behind the resolution lock
    // (Mark Dead Stones + Mark Territories committed). Disabled-and-visible with a hint.
    const btnLock = document.getElementById('btn-scoring-lock');
    if (btnLock) {
        if (scoringState.frozen) {
            btnLock.style.display = 'none';
        } else {
            btnLock.style.display = '';
            if (scoringState.locked) {
                btnLock.textContent = 'Start D&T';
                btnLock.title = 'Start D&T over — reset the counting phase done after locking';
            } else {
                btnLock.textContent = 'Save D&T';
                btnLock.title = 'Commit dead stones & territory to the SGF';
            }
        }
    }

    // The Reset button shares one slot, gated by the lock stage (pre-D&T "Reset Score",
    // post-D&T "Reset Board") — same gate pattern as the Lock/Save pairing.
    const btnReset = document.getElementById('btn-scoring-reset');
    if (btnReset) {
        btnReset.textContent = scoringState.locked ? 'Reset Board' : 'Reset Score';
        btnReset.title = scoringState.locked
            ? 'Reset the board back to the locked dead-stones & territory resolution (the locked Score is kept)'
            : 'Reset the Score — clear all marked dead stones & territory back to the initial state of the last game move';
    }

    const elModeSelect = document.getElementById('scoring-interaction-mode');
    if (elModeSelect) {
        const locked = scoringState.locked;
        // SYMMETRIC stage gating: the counting tools (Replace/Re-arrange) are available only
        // after the resolution is Locked, and the resolution tools (Mark Dead Stones / Mark
        // Territories) are available only while it is NOT locked — each renders disabled-but-
        // visible (with a hint) outside its stage, exactly like the other side.
        for (let i = 0; i < elModeSelect.options.length; i++) {
            const opt = elModeSelect.options[i];
            if (opt.value === 'replace' || opt.value === 'rearrange') {
                opt.disabled = !locked;
            }
            if (opt.value === 'mark' || opt.value === 'mark-territory') {
                opt.disabled = locked;
            }
        }
        // Force the current mode into the stage available under the current lock state.
        if (!locked && (scoringState.interactionMode === 'replace' || scoringState.interactionMode === 'rearrange')) {
            scoringState.interactionMode = 'mark';
        }
        if (locked && (scoringState.interactionMode === 'mark' || scoringState.interactionMode === 'mark-territory')) {
            scoringState.interactionMode = 'replace';
        }
        elModeSelect.value = scoringState.interactionMode;
    }
    const elLockHint = document.getElementById('scoring-lock-hint');
    if (elLockHint) {
        elLockHint.style.display = 'none';
    }

    // Buckets display total counts matching sum of Re-arrange + Dead + Cap.
    // LOCKED: the tray is a COSMETIC mirror of the counting ritual — post-lock fills consume
    // stones from the Dead/Caps piles and feed the Re-arrange pile exactly like the board edit
    // they accompany. The frozen score never reads it (it computes from lockedSnapshot), so the
    // tray is a display aid only; the real Dead/Caps read-out lives in the locked score.
    const traySource = scoringState;
    const bRe = traySource.rearrangeBlack ? traySource.rearrangeBlack.length : 0;
    const bDe = traySource.deadWhite ? traySource.deadWhite.length : 0;
    const bCa = traySource.blackCaptures || 0;
    const bTotalCount = bRe + bDe + bCa;

    const wRe = traySource.rearrangeWhite ? traySource.rearrangeWhite.length : 0;
    const wDe = traySource.deadBlack ? traySource.deadBlack.length : 0;
    const wCa = traySource.whiteCaptures || 0;
    const wTotalCount = wRe + wDe + wCa;

    const elBCount = document.getElementById('scoring-bucket-b-count');
    const elWCount = document.getElementById('scoring-bucket-w-count');
    if (elBCount) elBCount.textContent = bTotalCount;
    if (elWCount) elWCount.textContent = wTotalCount;

    const renderStonePill = (count, isWhite) => {
        if (count <= 0) return `<span style="color: #6b7280; font-style: italic; font-size: 0.65rem;">0</span>`;
        // Single stone icon + count — clear and readable
        const bg = isWhite
            ? 'radial-gradient(circle at 38% 35%, #ffffff, #d4d4d4)'
            : 'radial-gradient(circle at 38% 35%, #4b5563, #111827)';
        const border = isWhite ? '1px solid #9ca3af' : '1px solid #6b7280';
        const shadow = isWhite
            ? '0 1px 3px rgba(0,0,0,0.5)'
            : '0 1px 3px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.08)';
        return `<div style="display: flex; align-items: center; gap: 4px;">
            <span style="display:inline-block; width:11px; height:11px; border-radius:50%; background:${bg}; border:${border}; box-shadow:${shadow}; flex-shrink:0;"></span>
            <span style="font-weight: 700; color: #34d399; font-size: 0.68rem;">× ${count}</span>
        </div>`;
    };

    const elBList = document.getElementById('scoring-bucket-b-list');
    if (elBList) {
        elBList.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 0.68rem; color: #9ca3af; width: 100%; margin-top: 3px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Re-arrange:</span>
                    ${renderStonePill(bRe, false)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Dead:</span>
                    ${renderStonePill(bDe, true)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Cap.:</span>
                    ${renderStonePill(bCa, true)}
                </div>
            </div>
        `;
    }

    const elWList = document.getElementById('scoring-bucket-w-list');
    if (elWList) {
        elWList.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 0.68rem; color: #9ca3af; width: 100%; margin-top: 3px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Re-arrange:</span>
                    ${renderStonePill(wRe, true)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Dead:</span>
                    ${renderStonePill(wDe, false)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Cap.:</span>
                    ${renderStonePill(wCa, false)}
                </div>
            </div>
        `;
    }

    // --- SGF Property Bars: refresh the 4-column display ---
    updateSgfPropBarsUI();
}

/**
 * Compute DD, MA, TB, TW coordinate arrays from the current scoringState.
 *
 * DD  = dead-stone positions (intersections where markedDead is true, to grey-out)
 * MA  = same set as DD (the convention: DD+MA together flags dead stones)
 * TB  = empty intersections that are Black's territory
 * TW  = empty intersections that are White's territory
 *
 * Returns { dd: string[], ma: string[], tb: string[], tw: string[] }
 * where each element is an SGF point like "cc" or "qq".
 */
function computeSgfPropertyBars() {
    // SSOT: delegate to the single canonical session→props converter. While LOCKED the bars
    // (and the SGF save path that calls this) must reflect the COMMITTED resolution, never the
    // cosmetic post-lock board — the same source the bars widget and the frozen score read.
    const session = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState;
    return computeScoringPropsFromSession(session);
}

/**
 * Render the DD/MA/TB/TW values in the 4-column bar widget in the scoring modal sidebar.
 * Called from updateScoringUI() after every board change.
 */
function updateSgfPropBarsUI() {
    // When the resolution is LOCKED the bars freeze to the committed (locked) values: the
    // counting phase (replace/re-arrange) is a display aid and must not move the committed
    // DD/MA/TB/TW read-out. Unlocked, the bars follow the live session.
    const session = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState;
    const props = computeScoringPropsFromSession(session);

    const lockBadge = document.getElementById('sgf-prop-lock-badge');
    if (lockBadge) lockBadge.style.display = scoringState.locked ? '' : 'none';

    const renderBar = (countElId, listElId, points, totalPts, accentColor) => {
        const countEl = document.getElementById(countElId);
        const listEl  = document.getElementById(listElId);
        if (!countEl || !listEl) return;

        const n = totalPts != null ? totalPts : points.length;
        countEl.textContent = n > 0 ? `${n} pt${n !== 1 ? 's' : ''}` : '\u2014';
        countEl.style.color = n > 0 ? accentColor : '#6b7280';

        if (n === 0 || points.length === 0) {
            listEl.innerHTML = '<span style="color:#4b5563;font-style:italic;">\u2014</span>';
            return;
        }

        listEl.innerHTML = points
            .map(pt => `<span style="color:${accentColor};display:inline-block;">[${pt}]</span>`)
            .join('');
    };

    renderBar('sgf-prop-dd-count', 'sgf-prop-dd-list', props.dd, props.rawCounts ? props.rawCounts.dd : props.dd.length, '#fca5a5');
    renderBar('sgf-prop-ma-count', 'sgf-prop-ma-list', props.ma, props.rawCounts ? props.rawCounts.ma : props.ma.length, '#fde68a');
    renderBar('sgf-prop-tb-count', 'sgf-prop-tb-list', props.tb, props.rawCounts ? props.rawCounts.tb : props.tb.length, '#d1d5db');
    renderBar('sgf-prop-tw-count', 'sgf-prop-tw-list', props.tw, props.rawCounts ? props.rawCounts.tw : props.tw.length, '#f9fafb');
}

/**
 * Toggle or force set the SGF Properties panel visibility and OUTWARD expansion of the scoring modal.
 * When open: #scoring-modal expands OUTWARDLY to 1230px, #sgf-prop-sidenav grows to 240px.
 * When closed: #scoring-modal shrinks to 980px, #sgf-prop-sidenav shrinks to 0px.
 */
function toggleSgfPropertiesPanel(forceState) {
    const modal = document.getElementById('scoring-modal');
    const sidenav = document.getElementById('sgf-prop-sidenav');
    const btnOpen = document.getElementById('btn-open-sgf-sidenav');
    if (!modal || !sidenav) return;

    const isOpen = typeof forceState === 'boolean'
        ? forceState
        : (sidenav.style.width === '0px' || sidenav.style.opacity === '0');

    if (isOpen) {
        // Expand modal OUTWARDLY to fit the 240px SGF Properties panel without shrinking the board
        modal.style.width = 'min(1230px, 96vw)';
        modal.classList.add('sgf-expanded');

        sidenav.style.width = '240px';
        sidenav.style.opacity = '1';
        sidenav.style.pointerEvents = 'auto';
        sidenav.style.borderLeftWidth = '1px';

        if (btnOpen) btnOpen.style.opacity = '0';
    } else {
        // Shrink modal back to standard width
        modal.style.width = 'min(980px, 96vw)';
        modal.classList.remove('sgf-expanded');

        sidenav.style.width = '0px';
        sidenav.style.opacity = '0';
        sidenav.style.pointerEvents = 'none';
        sidenav.style.borderLeftWidth = '0px';

        if (btnOpen) btnOpen.style.opacity = '1';
    }

    if (typeof updateScoringUI === 'function') {
        setTimeout(updateScoringUI, 260);
    }
}

// VACATED-TERRITORY: while LOCKED a re-arranged (lifted) stone's vacated point draws its own
// territory marker when it sits INSIDE its own marked territory — an empty point bounded by its
// color's territory is territory, so lifting such a stone must reveal the square underneath (the
// counting ritual moves stones, it never erases territory). The frozen overlay scores the vacated
// point as 0 (it was OCCUPIED at lock), so BFS the live-empty region from each vacated point over
// the COMMITTED resolution: if every cell in the region is color X's territory (or a lifted X
// stone / transparent dead X point), the hole is X. A vacated point that connects to dame or enemy
// territory gets nothing, and a hole fully enclosed by X STONES (not X territory) also gets
// nothing. Returns a 19x19 grid: 0 = not a vacated point, >0 = revealed territory color, -1 =
// vacated point with NO square. Shared by the territory overlay and the Replace-mode placement
// check so the two can never diverge.
function computeVacatedTerritory(src, liveBoard, locScores, areaScores) {
    const vacatedTerritory = Array.from({ length: 19 }, () => Array(19).fill(0));
    if (!(scoringState.showTerritory && window.GoScorer && (locScores || areaScores) && scoringState.locked && scoringState.lockedSnapshot)) {
        return vacatedTerritory;
    }
    const terrBoard = src.board;
    const terrMarkedDead = src.markedDead;
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            if (terrBoard[r][c] === 0) continue;         // not occupied at lock
            if (liveBoard[r][c] !== 0) continue;         // stone still there (not lifted)
            if (terrMarkedDead[r][c]) continue;          // dead X is not a re-arrange pickup
            const color = terrBoard[r][c];
            const seen = Array.from({ length: 19 }, () => Array(19).fill(false));
            const queue = [[r, c]];
            seen[r][c] = true;
            let ok = true, hasEmpty = false;
            for (let qi = 0; qi < queue.length && ok; qi++) {
                const [y, x] = queue[qi];
                let terrVal;
                if (terrMarkedDead[y][x]) {
                    terrVal = locScores ? locScores[y][x].isTerritoryFor : areaScores[y][x];
                } else if (terrBoard[y][x] === 0) {
                    hasEmpty = true;
                    terrVal = locScores ? locScores[y][x].isTerritoryFor : areaScores[y][x];
                } else {
                    terrVal = terrBoard[y][x];
                }
                if (terrVal !== color) { ok = false; break; }
                const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (let d = 0; d < 4; d++) {
                    const ny = y + dirs[d][0], nx = x + dirs[d][1];
                    if (ny < 0 || nx < 0 || ny >= 19 || nx >= 19) continue;
                    if (seen[ny][nx] || liveBoard[ny][nx] !== 0) continue;
                    seen[ny][nx] = true;
                    queue.push([ny, nx]);
                }
            }
            if (ok && hasEmpty) vacatedTerritory[r][c] = color;
            else vacatedTerritory[r][c] = -1;
        }
    }
    return vacatedTerritory;
}

// The territory color the overlay DISPLAYS at a point — the Replace-mode placement truth.
// ALL and ONLY the intersections marked as territory accept a prisoner, and each accepts only
// the stone of ITS marked color. Explicit manual marks win over the auto-derived score; while
// LOCKED both come from the committed lockedSnapshot (exactly like the overlay), and a
// re-arranged/lifted point inside its own territory keeps reading as that territory. Dame/seki
// reads 0 and stays unplaceable.
function scoringTerritoryColorForPoint(r, c) {
    const src = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState;
    const manual = src.manualTerritory || scoringState.manualTerritory;
    if (manual && manual[r] && manual[r][c] > 0) return manual[r][c];

    const deadInfo = src.deadStonesInfo || scoringState.deadStonesInfo;
    const stonesWithDead = src.board.map((row, ri) =>
        row.map((val, ci) => {
            if (src.markedDead && src.markedDead[ri] && src.markedDead[ri][ci] && val === 0) {
                return (deadInfo && deadInfo[ri] && deadInfo[ri][ci]) || 0;
            }
            return val;
        })
    );
    let locScores = null;
    let areaScores = null;
    if (window.GoScorer) {
        try {
            if (scoringState.ruleMode === 'japanese') {
                locScores = window.GoScorer.territoryScoring(stonesWithDead, src.markedDead, false);
            } else {
                areaScores = window.GoScorer.areaScoring(stonesWithDead, src.markedDead);
            }
        } catch (e) { console.error("GoScorer error:", e); }
    }

    // Vacated lifted-stone points mirror the overlay: a revealed square is placeable, a
    // squareless vacated point (adjacent to dame / enclosed by stones) is not.
    if (scoringState.showTerritory && window.GoScorer && (locScores || areaScores) && scoringState.locked && scoringState.lockedSnapshot) {
        const vacated = computeVacatedTerritory(src, scoringState.board, locScores, areaScores)[r][c];
        if (vacated > 0) return vacated;
        if (vacated < 0) return 0;
    }

    if (scoringState.ruleMode === 'japanese' && locScores && locScores[r] && locScores[r][c]) {
        return locScores[r][c].isTerritoryFor || 0;
    }
    if (scoringState.ruleMode === 'chinese' && areaScores && areaScores[r] && areaScores[r][c]) {
        return areaScores[r][c] || 0;
    }
    return 0;
}

function handleScoringBoardClick(e) {
    if (scoringState.frozen) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 600;
    const clickY = ((e.clientY - rect.top) / rect.height) * 600;

    const PADDING = 36;
    const CELL_SIZE = (600 - 2 * PADDING) / 18;

    const col = Math.round((clickX - PADDING) / CELL_SIZE);
    const row = Math.round((clickY - PADDING) / CELL_SIZE);

    if (row < 0 || row >= 19 || col < 0 || col >= 19) return;

    // The Lock stage is symmetric and exclusive: while LOCKED only the counting modes
    // (Replace/Re-arrange) are reachable — the Mark Dead / Mark Territories options are
    // disabled in the Interaction Mode select, so editing the resolution requires pressing
    // Unlock Resolution first (updateScoringUI enforces the mode stage). No lock-break
    // click path exists here anymore.
    if (scoringState.interactionMode === 'mark') {
        const val = scoringState.board[row][col];
        const isDeadMarked = scoringState.markedDead[row][col];

        if (val !== 0 && !isDeadMarked) {
            saveScoringStateForUndo();
            const colorToToggle = val;
            const visited = Array.from({length: 19}, () => Array.from({length: 19}, () => false));
            const stack = [[row, col]];
            visited[row][col] = true;

            while (stack.length > 0) {
                const [r, c] = stack.pop();
                scoringState.deadStonesInfo[r][c] = colorToToggle;
                scoringState.markedDead[r][c] = true;
                scoringState.board[r][c] = 0;

                if (colorToToggle === 1) {
                    scoringState.deadBlack.push('B');
                    scoringState.bucketWhite.push('B');
                } else if (colorToToggle === 2) {
                    scoringState.deadWhite.push('W');
                    scoringState.bucketBlack.push('W');
                }

                const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dr, dc] of dirs) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19 && !visited[nr][nc]) {
                        if (scoringState.board[nr][nc] === colorToToggle && !scoringState.markedDead[nr][nc]) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                        }
                    }
                }
            }
            updateScoringUI();
            drawBoard();
        } else if (isDeadMarked) {
            saveScoringStateForUndo();
            const colorToRestore = scoringState.deadStonesInfo[row][col] || 1;
            const visited = Array.from({length: 19}, () => Array.from({length: 19}, () => false));
            const stack = [[row, col]];
            visited[row][col] = true;

            while (stack.length > 0) {
                const [r, c] = stack.pop();
                scoringState.board[r][c] = colorToRestore;
                scoringState.markedDead[r][c] = false;
                scoringState.deadStonesInfo[r][c] = null;

                if (colorToRestore === 1) {
                    const idx = scoringState.deadBlack.indexOf('B');
                    if (idx !== -1) scoringState.deadBlack.splice(idx, 1);
                    const bIdx = scoringState.bucketWhite.indexOf('B');
                    if (bIdx !== -1) scoringState.bucketWhite.splice(bIdx, 1);
                } else if (colorToRestore === 2) {
                    const idx = scoringState.deadWhite.indexOf('W');
                    if (idx !== -1) scoringState.deadWhite.splice(idx, 1);
                    const wIdx = scoringState.bucketBlack.indexOf('W');
                    if (wIdx !== -1) scoringState.bucketBlack.splice(wIdx, 1);
                }

                const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dr, dc] of dirs) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19 && !visited[nr][nc]) {
                        if (scoringState.markedDead[nr][nc] && scoringState.deadStonesInfo[nr][nc] === colorToRestore) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                        }
                    }
                }
            }
            updateScoringUI();
            drawBoard();
        }
    } else if (scoringState.interactionMode === 'replace') {
        const currentVal = scoringState.board[row][col];
        const key = `${row},${col}`;
        // A stone already on the point can only be a REVERSED-fill target: clicking a stone that
        // a Replacing fill placed removes it from the board and returns the prisoner to its pool
        // (the Dead pile or the Caps counter it came from). Stones that were never replaced are
        // left untouched.
        if (currentVal !== 0) {
            const entry = scoringState.replacedStoneMap[key];
            if (!entry) return;
            saveScoringStateForUndo();
            scoringState.board[row][col] = 0;
            delete scoringState.replacedStoneMap[key];
            if (entry.color === 1) {
                if (entry.type === 'dead') {
                    scoringState.deadBlack.push('B');
                    scoringState.bucketWhite.push('B');
                } else {
                    scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) + 1);
                }
            } else {
                if (entry.type === 'dead') {
                    scoringState.deadWhite.push('W');
                    scoringState.bucketBlack.push('W');
                } else {
                    scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) + 1);
                }
            }
            updateScoringUI();
            drawBoard();
            return;
        }
        // A dead-marked cell behaves EXACTLY like any other territory point here: the dead
        // stone was lifted, so the intersection reads as territory (the freed point) and a
        // prisoner of that territory's color may be placed on it. The placement truth is the
        // DISPLAYED territory resolution — ALL and ONLY the intersections the overlay marks as
        // territory, each with ONLY the stone of its marked color. scoringTerritoryColorForPoint
        // reads the same committed source + precedence the overlay uses (explicit manual marks
        // win; frozen lockedSnapshot while locked; vacated lifted-stone points inside their own
        // territory stay placeable). Only intersections whose territory is NOT defined (dame /
        // seki) read 0 and are prohibited below.
        const terrColor = scoringTerritoryColorForPoint(row, col);
        if (terrColor === 0) {
            // Dame / seki — territory not defined for this intersection. The physical count
            // never fills neutral ground (a dame fill would cost only the prisoner's side and
            // drift the margin), so a replace on it is PROHIBITED.
            return;
        }
        // Fill requires a prisoner of the territory's color; without one there is nothing to place.
        if (terrColor === 1 && !(scoringState.deadBlack.length > 0 || (scoringState.whiteCaptures || 0) > 0)) return;
        if (terrColor === 2 && !(scoringState.deadWhite.length > 0 || (scoringState.blackCaptures || 0) > 0)) return;
        saveScoringStateForUndo();
        scoringState.board[row][col] = terrColor;
        // The dead mark on this fill point is PRESERVED — marks never clear. The dead X stays
        // visible over the placed prisoner when "Show dead stones" is checked, and the SGF
        // Properties DD/MA counts stay intact. The dead stone remains a prisoner via the mark
        // (not the capture counter). The prisoner accounting consumes ONE pool per fill: the
        // dead pile first (the stone returns from the board), the capture counter only once the
        // dead pile is empty — so Dead and Cap. stay separate pools and the tray drains one
        // stone per placement. While LOCKED it is purely cosmetic — the displayed score reads
        // lockedSnapshot, never this. The fill is recorded in replacedStoneMap so clicking the
        // placed stone later reverses it.
        if (terrColor === 1) {
            if (scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                const idx = scoringState.bucketWhite.indexOf('B');
                if (idx !== -1) scoringState.bucketWhite.splice(idx, 1);
                scoringState.replacedStoneMap[key] = { type: 'dead', color: 1 };
            } else {
                scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
                scoringState.replacedStoneMap[key] = { type: 'cap', color: 1 };
            }
        } else {
            if (scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                const idx = scoringState.bucketBlack.indexOf('W');
                if (idx !== -1) scoringState.bucketBlack.splice(idx, 1);
                scoringState.replacedStoneMap[key] = { type: 'dead', color: 2 };
            } else {
                scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
                scoringState.replacedStoneMap[key] = { type: 'cap', color: 2 };
            }
        }
        updateScoringUI();
        drawBoard();
    } else if (scoringState.interactionMode === 'rearrange') {
        const currentVal = scoringState.board[row][col];
        if (currentVal === 1) {
            saveScoringStateForUndo();
            scoringState.board[row][col] = 0;
            // Dead marks NEVER clear on a re-arrange pickup — marks are the immutable
            // resolution, so the dead X stays over the now-empty point. The pickup feeds the
            // Re-arrange pile so the tray mirrors the ritual; while LOCKED that is a cosmetic
            // display aid only — the frozen score reads lockedSnapshot, never this.
            delete scoringState.replacedStoneMap[`${row},${col}`];
            scoringState.rearrangeBlack.push('B');
            scoringState.bucketBlack.push('B');
            updateScoringUI();
            drawBoard();
        } else if (currentVal === 2) {
            saveScoringStateForUndo();
            scoringState.board[row][col] = 0;
            delete scoringState.replacedStoneMap[`${row},${col}`];
            scoringState.rearrangeWhite.push('W');
            scoringState.bucketWhite.push('W');
            updateScoringUI();
            drawBoard();
        } else if (currentVal === 0) {
            // re-Arrange places ONLY from the Re-arrange piles — never Dead or Caps.
            const bPrim = scoringState.rearrangeBlack ? scoringState.rearrangeBlack.length : 0;
            const wPrim = scoringState.rearrangeWhite ? scoringState.rearrangeWhite.length : 0;

            // With both Re-arrange piles empty there is nothing to place: the click is a no-op.
            if (bPrim === 0 && wPrim === 0) return;

            // Only one color has re-arrange stones → auto-place, no dialog
            if (bPrim > 0 && wPrim === 0) {
                saveScoringStateForUndo();
                scoringState.board[row][col] = 1;
                scoringState.rearrangeBlack.pop();
                scoringState.bucketBlack.pop();
                updateScoringUI(); drawBoard(); return;
            }
            if (wPrim > 0 && bPrim === 0) {
                saveScoringStateForUndo();
                scoringState.board[row][col] = 2;
                scoringState.rearrangeWhite.pop();
                scoringState.bucketWhite.pop();
                updateScoringUI(); drawBoard(); return;
            }

            // Both colors have re-arrange stones → ask color only (no sub-type step)
            scoringState.pendingClick = { r: row, c: col };
            const dialog = document.getElementById('scoring-color-picker-dialog');
            if (!dialog) return;
            const canvasViewport = document.getElementById('scoring-board-viewport');
            const vRect = canvasViewport ? canvasViewport.getBoundingClientRect() : rect;
            dialog.style.left = `${Math.min(vRect.width - 260, Math.max(10, clickX - 120))}px`;
            dialog.style.top  = `${Math.min(vRect.height - 160, Math.max(10, clickY - 40))}px`;
            const s1 = document.getElementById('scoring-picker-step1');
            const s2 = document.getElementById('scoring-picker-step2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
            // Both buttons visible (both have stones)
            const btnB = document.getElementById('btn-place-black-stone');
            const btnW = document.getElementById('btn-place-white-stone');
            if (btnB) btnB.style.display = '';
            if (btnW) btnW.style.display = '';
            dialog.style.display = 'block';
        }
    } else if (scoringState.interactionMode === 'mark-territory') {
        const currentVal = scoringState.board[row][col];
        if (currentVal !== 0) return;
        // Toggle existing manual territory
        if (scoringState.manualTerritory[row][col] > 0) {
            saveScoringStateForUndo();
            scoringState.manualTerritory[row][col] = 0;
            updateScoringUI();
            drawBoard();
            return;
        }
        // Determine territory color: use GoScorer if possible, otherwise show picker
        const stonesWithDead = scoringState.board.map((r, ri) =>
            r.map((val, ci) => {
                if (scoringState.markedDead[ri][ci] && val === 0) {
                    return scoringState.deadStonesInfo[ri][ci] || 0;
                }
                return val;
            })
        );
        let terrColor = 0;
        if (window.GoScorer) {
            if (scoringState.ruleMode === 'japanese') {
                try {
                    const locScores = window.GoScorer.territoryScoring(stonesWithDead, scoringState.markedDead, false);
                    if (locScores && locScores[row] && locScores[row][col]) {
                        terrColor = locScores[row][col].isTerritoryFor || 0;
                    }
                } catch(e) { console.error("GoScorer error:", e); }
            } else {
                try {
                    const areaScores = window.GoScorer.areaScoring(stonesWithDead, scoringState.markedDead);
                    if (areaScores) {
                        terrColor = areaScores[row][col] || 0;
                    }
                } catch(e) { console.error("GoScorer error:", e); }
            }
        }
        if (terrColor === 1 || terrColor === 2) {
            saveScoringStateForUndo();
            scoringState.manualTerritory[row][col] = terrColor;
            updateScoringUI();
            drawBoard();
        } else {
            // Ambiguous — show color picker
            scoringState.pendingClick = { r: row, c: col };
            const dialog = document.getElementById('scoring-color-picker-dialog');
            if (!dialog) return;
            const canvasViewport = document.getElementById('scoring-board-viewport');
            const vRect = canvasViewport ? canvasViewport.getBoundingClientRect() : rect;
            dialog.style.left = `${Math.min(vRect.width - 260, Math.max(10, clickX - 120))}px`;
            dialog.style.top  = `${Math.min(vRect.height - 160, Math.max(10, clickY - 40))}px`;
            const s1 = document.getElementById('scoring-picker-step1');
            const s2 = document.getElementById('scoring-picker-step2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
            const btnB = document.getElementById('btn-place-black-stone');
            const btnW = document.getElementById('btn-place-white-stone');
            if (btnB) btnB.style.display = '';
            if (btnW) btnW.style.display = '';
            dialog.style.display = 'block';
        }
    }
}

// Territory-counter badge pop-in animation: each w/# count label draws a rounded box that
// pops in (scale 0 → 1, ease-out-back) once, keyed by group centroid + count, so a fresh draw
// or a changed count re-animates while steady redraws leave the boxes settled.
const territoryBoxAnims = new Map();

// Rounded rectangle path with INDEPENDENT per-corner radii. Does NOT beginPath: callers that
// merge cells into one shape call beginPath() once, add each cell's subpath, then fill() once —
// the nonzero winding rule fills the union with no seams between abutting cells. A radius of 0
// yields a sharp corner (arcTo with radius 0 draws straight through the corner point).
function roundedRectPathCorners(ctx, x, y, w, h, rTL, rTR, rBR, rBL) {
    const clamp = (r) => Math.max(0, Math.min(r, w / 2, h / 2));
    rTL = clamp(rTL); rTR = clamp(rTR); rBR = clamp(rBR); rBL = clamp(rBL);
    ctx.moveTo(x + rTL, y);
    ctx.arcTo(x + w, y, x + w, y + h, rTR);
    ctx.arcTo(x + w, y + h, x, y + h, rBR);
    ctx.arcTo(x, y + h, x, y, rBL);
    ctx.arcTo(x, y, x + w, y, rTL);
    ctx.closePath();
}

// Single-radius rounded rectangle (all four corners the same); starts a fresh path.
function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    roundedRectPathCorners(ctx, x, y, w, h, r, r, r, r);
}

function renderScoringBoardToCtx(ctx) {
    if (typeof window.scoringState === 'undefined' || !window.scoringState) return;
    const scoringState = window.scoringState;
    const PADDING = 36;
    const CANVAS_SIZE = 600;
    const CELL_SIZE = (CANVAS_SIZE - 2 * PADDING) / 18;

    const style = state.scoringBoardStyle || state.initialBoardStyle || DEFAULT_INITIAL_BOARD_STYLE;
    const size = (style.board && style.board.size) || 600;
    const scaleFactor = size / 600;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr * scaleFactor, 0, 0, dpr * scaleFactor, 0, 0);

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 1. Board Background
    const boardColor = (style.board && style.board.color) ? style.board.color : '#DCB35C';
    ctx.fillStyle = boardColor;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 2. Grid lines
    const lineCol = (style.grid && style.grid.lineColor) ? style.grid.lineColor : '#1c1917';
    const lineSz = (style.grid && typeof style.grid.lineSize === 'number') ? style.grid.lineSize : 1;
    ctx.lineWidth = lineSz;
    ctx.strokeStyle = lineCol;
    for (let i = 0; i < 19; i++) {
        const offset = PADDING + i * CELL_SIZE;
        // Horizontal
        ctx.beginPath();
        ctx.moveTo(PADDING, offset);
        ctx.lineTo(CANVAS_SIZE - PADDING, offset);
        ctx.stroke();
        // Vertical
        ctx.beginPath();
        ctx.moveTo(offset, PADDING);
        ctx.lineTo(offset, CANVAS_SIZE - PADDING);
        ctx.stroke();
    }

    // Outer boundary line
    const boundCol = (style.grid && style.grid.boundaryColor) ? style.grid.boundaryColor : '#1c1917';
    const boundSz = (style.grid && typeof style.grid.boundarySize === 'number') ? style.grid.boundarySize : 1.5;
    ctx.lineWidth = boundSz;
    ctx.strokeStyle = boundCol;
    ctx.strokeRect(PADDING, PADDING, CANVAS_SIZE - 2 * PADDING, CANVAS_SIZE - 2 * PADDING);

    // 3. Star points (hoshi)
    const hoshiCoords = [3, 9, 15];
    const hoshiCol = (style.grid && style.grid.hoshiColor) ? style.grid.hoshiColor : '#1c1917';
    const hoshiSz = (style.grid && typeof style.grid.hoshiSize === 'number') ? style.grid.hoshiSize : 3.5;
    ctx.fillStyle = hoshiCol;
    for (const r of hoshiCoords) {
        for (const c of hoshiCoords) {
            const cx = PADDING + c * CELL_SIZE;
            const cy = PADDING + r * CELL_SIZE;
            ctx.beginPath();
            ctx.arc(cx, cy, hoshiSz, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    // 4. Coordinates (if checked)
    if (scoringState.showCoords) {
        const coordCol = (style.coord && style.coord.primary && style.coord.primary.color) ? style.coord.primary.color : '#44403c';
        const coordSz = (style.coord && style.coord.primary && style.coord.primary.size) ? style.coord.primary.size : 11;
        ctx.font = `500 ${coordSz}px system-ui, sans-serif`;
        ctx.fillStyle = coordCol;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelMargin = PADDING / 2;
        for (let i = 0; i < 19; i++) {
            const pos = PADDING + i * CELL_SIZE;
            const colLabel = COLS[i];
            const rowLabel = (19 - i).toString();
            // Top/Bottom
            ctx.fillText(colLabel, pos, labelMargin);
            ctx.fillText(colLabel, pos, CANVAS_SIZE - labelMargin);
            // Left/Right
            ctx.fillText(rowLabel, labelMargin, pos);
            ctx.fillText(rowLabel, CANVAS_SIZE - labelMargin, pos);
        }
    }

    // 5. Goscorer Territory / Area Calculation
    // IMPORTANT: goscorer requires dead stones to REMAIN in the stones array.
    // It uses markedDead as a transparency flag internally during flood-fill.
    // We must NOT pass a board where dead positions are already 0.
    //
    // TERRITORY FREEZE: while LOCKED the territory/area overlay is computed from the
    // COMMITTED lockedSnapshot (board + markedDead), never from the live playground
    // board — post-lock re-arranges/replaces are a cosmetic display ritual and must
    // never move the marked D&T position/area, exactly like the frozen score. Build
    // stonesWithDead: restore original colors at markedDead positions.
    const terrSrc = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState;
    const terrBoard = terrSrc.board;
    const terrMarkedDead = terrSrc.markedDead;
    const terrDeadStonesInfo = terrSrc.deadStonesInfo || scoringState.deadStonesInfo;
    const stonesWithDead = terrBoard.map((row, r) =>
        row.map((val, c) => {
            if (terrMarkedDead[r][c] && val === 0) {
                // Restore original color from deadStonesInfo
                return terrDeadStonesInfo[r][c] || 0;
            }
            return val;
        })
    );

    let locScores = null;
    let areaScores = null;

    if (window.GoScorer) {
        if (scoringState.ruleMode === 'japanese') {
            try {
                locScores = window.GoScorer.territoryScoring(stonesWithDead, terrMarkedDead, false);
            } catch(err) {
                console.error("GoScorer territory error:", err);
            }
        } else {
            try {
                areaScores = window.GoScorer.areaScoring(stonesWithDead, terrMarkedDead);
            } catch(err) {
                console.error("GoScorer area error:", err);
            }
        }
    }

    // VACATED-TERRITORY: while LOCKED a re-arranged (lifted) stone's vacated point draws its
    // own territory marker when it sits INSIDE its own marked territory — an empty point
    // bounded by its color's territory is territory, so lifting such a stone must reveal the
    // square underneath (the counting ritual moves stones, it never erases territory).
    // computeVacatedTerritory is shared with the Replace-mode placement check.
    const vacatedTerritory = computeVacatedTerritory(terrSrc, scoringState.board, locScores, areaScores);


    // Pass 1: Draw Board Mask (BM layer) for all cells
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const val = scoringState.board[r][c];
            const cx = PADDING + c * CELL_SIZE;
            const cy = PADDING + r * CELL_SIZE;

            if (val === 1) {
                drawCellContent(ctx, { player: 'B', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c, 'bm');
            } else if (val === 2) {
                drawCellContent(ctx, { player: 'W', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c, 'bm');
            }
        }
    }

    // Pass 2: Draw Stones, Shadows & Annotations for all cells
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const val = scoringState.board[r][c];
            const cx = PADDING + c * CELL_SIZE;
            const cy = PADDING + r * CELL_SIZE;

            if (val === 1) {
                drawCellContent(ctx, { player: 'B', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c, 'stone');
            } else if (val === 2) {
                drawCellContent(ctx, { player: 'W', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c, 'stone');
            }

            // Dead stone marker overlay on empty intersection (lifted dead stone)
            if (scoringState.markedDead[r][c] && scoringState.showDead) {
                ctx.save();
                ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(cx, cy, CELL_SIZE * 0.38, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();

                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
                ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // 7. Render Territory Squares on Empty Intersections
    const renderTerritoryRect = (r, c, terrColorVal) => {
        if (scoringState.board[r][c] !== 0) return;
        const cx = PADDING + c * CELL_SIZE;
        const cy = PADDING + r * CELL_SIZE;
        if (terrColorVal === 1) { // Black territory square
            ctx.save();
            ctx.fillStyle = 'rgba(17, 24, 39, 0.7)';
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1;
            const sz = CELL_SIZE * 0.45;
            ctx.fillRect(cx - sz/2, cy - sz/2, sz, sz);
            ctx.strokeRect(cx - sz/2, cy - sz/2, sz, sz);
            ctx.restore();
        } else if (terrColorVal === 2) { // White territory square
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            const sz = CELL_SIZE * 0.45;
            ctx.fillRect(cx - sz/2, cy - sz/2, sz, sz);
            ctx.strokeRect(cx - sz/2, cy - sz/2, sz, sz);
            ctx.restore();
        }
    };
    if (scoringState.showTerritory) {
        // Manual territory is also frozen while LOCKED (reads terrSrc like the algorithm
        // above), so post-lock playground edits can never move a marked territory point.
        const terrManualTerritory = terrSrc.manualTerritory || scoringState.manualTerritory;
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (terrManualTerritory[r][c] > 0) {
                    renderTerritoryRect(r, c, terrManualTerritory[r][c]);
                    continue;
                }
                if (scoringState.board[r][c] === 0) {
                    let terrColor = null; // 1 = Black, 2 = White
                    const vacated = vacatedTerritory[r][c];
                    if (vacated !== 0) {
                        // A re-arranged (lifted) stone's point: its own territory marker ONLY
                        // when the vacated point sits inside its own marked territory (see the
                        // VACATED-TERRITORY pass above) — never a blind area-score override.
                        terrColor = vacated > 0 ? vacated : null;
                    } else if (scoringState.ruleMode === 'japanese' && locScores) {
                        terrColor = locScores[r][c].isTerritoryFor;
                    } else if (scoringState.ruleMode === 'chinese' && areaScores) {
                        terrColor = areaScores[r][c];
                    }

                    renderTerritoryRect(r, c, terrColor);
                }
            }
        }

        // TERRITORY GROUP COUNTS ("w/#"): show each 4-connected territory group's point count at
        // its centroid. Groups are built from the exact display-truth grid (manual marks win,
        // lockedSnapshot source while locked, vacated lifted points included), so the count can
        // never disagree with the squares actually drawn. Centroid = mean member coordinate:
        // odd-sized groups center on a stone point, even-sized groups on the grid-line crossing.
        // Text size scales with group size; text color reflects the territory color.
        if (scoringState.showTerritoryCounts) {
            const seenKeys = new Set();
            const terrGrid = Array.from({ length: 19 }, () => Array(19).fill(0));
            for (let r = 0; r < 19; r++) {
                for (let c = 0; c < 19; c++) {
                    if (scoringState.board[r][c] !== 0) continue;
                    if (terrManualTerritory[r][c] > 0) { terrGrid[r][c] = terrManualTerritory[r][c]; continue; }
                    const vacated = vacatedTerritory[r][c];
                    if (vacated !== 0) { terrGrid[r][c] = vacated > 0 ? vacated : 0; continue; }
                    if (scoringState.ruleMode === 'japanese' && locScores) {
                        terrGrid[r][c] = locScores[r][c].isTerritoryFor || 0;
                    } else if (scoringState.ruleMode === 'chinese' && areaScores) {
                        terrGrid[r][c] = areaScores[r][c] || 0;
                    }
                }
            }
            const groupSeen = Array.from({ length: 19 }, () => Array(19).fill(false));
            for (let r = 0; r < 19; r++) {
                for (let c = 0; c < 19; c++) {
                    const color = terrGrid[r][c];
                    if (color === 0 || groupSeen[r][c]) continue;
                    const members = [[r, c]];
                    groupSeen[r][c] = true;
                    for (let mi = 0; mi < members.length; mi++) {
                        const [y, x] = members[mi];
                        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                        for (let d = 0; d < 4; d++) {
                            const ny = y + dirs[d][0], nx = x + dirs[d][1];
                            if (ny < 0 || nx < 0 || ny >= 19 || nx >= 19) continue;
                            if (groupSeen[ny][nx] || terrGrid[ny][nx] !== color) continue;
                            groupSeen[ny][nx] = true;
                            members.push([ny, nx]);
                        }
                    }
                    const count = members.length;
                    let fr = 0, fc = 0;
                    let frMin = 19, frMax = -1, fcMin = 19, fcMax = -1;
                    for (const [y, x] of members) {
                        fr += y; fc += x;
                        if (y < frMin) frMin = y;
                        if (y > frMax) frMax = y;
                        if (x < fcMin) fcMin = x;
                        if (x > fcMax) fcMax = x;
                    }
                    fr /= count; fc /= count;
                    const cx = PADDING + fc * CELL_SIZE;
                    const cy = PADDING + fr * CELL_SIZE;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const fontPx = Math.min(CELL_SIZE * 0.9, 9 + count * 1.4);
                    // Figtree-SemiBold digits (the registered 400-weight 'Figtree' face IS
                    // Figtree-SemiBold.ttf); while an EDITING state is active (NOT frozen — the
                    // Replace/re-Arrange counting modes, and the Edit-unfrozen post-Save view)
                    // the digits switch to the matching italic (Figtree-SemiBoldItalic.ttf) as a
                    // visual cue that the counts are still adapting; once "Board Saved ✓" freezes
                    // the session the digits return to REGULAR. The `!frozen` guard matters
                    // because after Save the lock keeps `interactionMode` forced to 'replace' —
                    // frozen is the only reliable "not editing" signal. No `bold` keyword: the
                    // single registered face already carries the semi-bold weight, so `bold`
                    // would only trigger a faux-bold on top of it.
                    const countsEditing = !scoringState.frozen && (scoringState.interactionMode === 'replace' || scoringState.interactionMode === 'rearrange');
                    ctx.font = `${countsEditing ? 'italic ' : ''}${fontPx}px 'Figtree', sans-serif`;
                    // Pure font text — no border, no shadow, no halo (explicitly clear any shadow
                    // a prior draw op left on the context). Black territories ink in the warm
                    // yellow, White territories in the deep blue, both chosen to sit on their
                    // territory-square fill.
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    const label = String(count);
                    // Adaptive rounded badge behind the count: ONE MERGED BOX PER TERRITORY AREA —
                    // every member square is a CELL-sized cell centered on its grid intersection,
                    // and all cells join into a single path (one fill, nonzero winding) so the box
                    // is a continuous crossword-block shape: corners are ROUNDED only at exposed
                    // outer corners (where BOTH the orthogonal neighbor and the next cell along the
                    // edge are outside the group), a cell with all four orthogonal neighbors in the
                    // group is a plain SQUARE, and corners along straight edges stay square — no
                    // seams, no empty bounding-box padding. Filled 40%-translucent with the
                    // territory color (black box on black territory, white box on white territory).
                    // The box pops in with a smooth ease-out-back scale (pivoting about the group's
                    // intersection midpoint) on its first draw, on a count change, when the group's
                    // extent changes, or on every w/# toggle-ON — and the draw schedules follow-up
                    // redraws so the pop completes even when no other redraw is triggered.
                    const boxCX = PADDING + (fcMin + fcMax) / 2 * CELL_SIZE;
                    const boxCY = PADDING + (frMin + frMax) / 2 * CELL_SIZE;
                    const key = `${Math.round(fr * 10)},${Math.round(fc * 10)}`;
                    seenKeys.add(key);
                    let anim = territoryBoxAnims.get(key);
                    if (!anim || anim.count !== count || anim.frMin !== frMin || anim.frMax !== frMax || anim.fcMin !== fcMin || anim.fcMax !== fcMax) {
                        anim = { count, t0: performance.now(), frMin, frMax, fcMin, fcMax };
                        territoryBoxAnims.set(key, anim);
                    }
                    const t = Math.min(1, (performance.now() - anim.t0) / 350);
                    const easeBack = t === 1 ? 1 : 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
                    const boxScale = Math.max(0.05, easeBack);
                    const cellPx = CELL_SIZE * boxScale;
                    const sqHalf = cellPx / 2;
                    const sqRad = Math.min(CELL_SIZE * 0.45, CELL_SIZE / 2) * boxScale;
                    const inGroup = (rr, cc) => rr >= 0 && cc >= 0 && rr < 19 && cc < 19 && terrGrid[rr][cc] === color;
                    ctx.beginPath();
                    for (const [my, mx] of members) {
                        const sqCX = boxCX + (PADDING + mx * CELL_SIZE - boxCX) * boxScale;
                        const sqCY = boxCY + (PADDING + my * CELL_SIZE - boxCY) * boxScale;
                        const x = sqCX - sqHalf, y = sqCY - sqHalf;
                        const rTL = (!inGroup(my - 1, mx) && !inGroup(my, mx - 1)) ? sqRad : 0;
                        const rTR = (!inGroup(my - 1, mx) && !inGroup(my, mx + 1)) ? sqRad : 0;
                        const rBR = (!inGroup(my + 1, mx) && !inGroup(my, mx + 1)) ? sqRad : 0;
                        const rBL = (!inGroup(my + 1, mx) && !inGroup(my, mx - 1)) ? sqRad : 0;
                        roundedRectPathCorners(ctx, x, y, cellPx, cellPx, rTL, rTR, rBR, rBL);
                    }
                    ctx.fillStyle = color === 1 ? 'rgba(17, 24, 39, 0.4)' : 'rgba(255, 255, 255, 0.4)';
                    ctx.fill();
                    ctx.fillStyle = color === 1 ? '#FCD102' : '#101389';
                    ctx.fillText(label, cx, cy);
                    ctx.restore();
                }
            }
            for (const key of territoryBoxAnims.keys()) {
                if (!seenKeys.has(key)) territoryBoxAnims.delete(key);
            }
            // Drive the pop-in to completion: the first draw of a fresh badge starts at a tiny
            // scale (boxScale 0.05), so without follow-up frames the badge would stay invisible
            // until the next unrelated redraw. While any entry is still animating, schedule a
            // full redraw so the ease-out-back pop plays out on its own. The loop self-terminates:
            // once every entry reaches t = 1 no further frame is scheduled. Test harnesses may
            // disable it (__tcDisableTerritoryAnim) to keep draws deterministic.
            if (!window.__tcDisableTerritoryAnim) {
                const nowT = performance.now();
                for (const a of territoryBoxAnims.values()) {
                    if ((nowT - a.t0) / 350 < 1) {
                        requestAnimationFrame(() => window.drawBoard());
                        break;
                    }
                }
            }
        }
    }

    // 8. Update Score Breakdown Display
    // LOCKED = the score computation is DONE. The formula + totals freeze to the committed
    // locked resolution; post-lock counting edits (replace / re-arrange) are a cosmetic display
    // aid and can never move the displayed score. Everything below reads a single SSOT summary:
    // live scoringState when unlocked, lockedSnapshot when locked.
    const summary = computeScoringSummary((scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState);

    const elBF = document.getElementById('scoring-black-formula');
    const elBT = document.getElementById('scoring-black-total');
    const elWF = document.getElementById('scoring-white-formula');
    const elWT = document.getElementById('scoring-white-total');

    if (summary.ruleMode === 'japanese') {
        if (elBF) elBF.textContent = `${summary.bTerr} (territory) + ${summary.bDead} (dead) + ${summary.bCaps} (caps)`;
        if (elBT) elBT.textContent = `= ${summary.bTotal}`;
        if (elWF) elWF.textContent = `${summary.wTerr} (territory) + ${summary.wDead} (dead) + ${summary.wCaps} (caps) + ${summary.komi} (komi)`;
        if (elWT) elWT.textContent = `= ${summary.wTotal}`;
    } else {
        if (elBF) elBF.textContent = `${summary.bTerr} (area) + ${summary.bDead} (dead prisoners)`;
        if (elBT) elBT.textContent = `= ${summary.bTotal}`;
        if (elWF) elWF.textContent = `${summary.wTerr} (area) + ${summary.wDead} (dead prisoners) + ${summary.komi} (komi)`;
        if (elWT) elWT.textContent = `= ${summary.wTotal}`;
    }

    // ── RESULT — always equal to the Computing formula above ─────────────
    // The result badge reads the SAME SSOT summary as the per-color formula rendered right
    // next to it, so the two displays can never show arithmetic that doesn't add up. Locked
    // sessions freeze both to the committed resolution (the computation is DONE at lock);
    // unlocked sessions follow the live board/marks/captures, where Re-arranging / Replacing
    // legitimately moves the result — that is the point of editing the board, and every saved
    // consumer (rec.scoringData, the blue panel Run, exported DD/MA/TB/TW) reads the same
    // live session. baseBoard/baseCaptures are kept only as the untouched-position reference
    // for the original loaded board; they no longer drive the score.
    const elResult = document.getElementById('scoring-result-display');
    if (elResult) {
        const diff = summary.bTotal - summary.wTotal;
        let text;
        if (diff > 0) text = `B+${Number.isInteger(diff) ? diff : diff.toFixed(1)}`;
        else if (diff < 0) text = `W+${Number.isInteger(-diff) ? -diff : (-diff).toFixed(1)}`;
        else text = 'Draw';
        elResult.textContent = text;
    }
    
    ctx.restore();
}

// Auto-initialize scoring modal (deferred — not needed for first paint)
const _deferredScoringInit = () => {
    initScoringModal();
};
if (document.readyState === 'loading') {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_deferredScoringInit, { timeout: 300 });
    } else {
        document.addEventListener('DOMContentLoaded', _deferredScoringInit);
    }
} else {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_deferredScoringInit, { timeout: 300 });
    } else {
        setTimeout(_deferredScoringInit, 0);
    }
}

