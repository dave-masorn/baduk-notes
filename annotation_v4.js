/**
 * Go Board Diagram Annotator - annotation_v4.js
 * Implements interactive board editing, annotations, free drag-to-crop selection,
 * and high-resolution PNG diagram captures with coordinate rendering.
 */


const stoneSound = new Audio('_sfx/碁石を打つ.mp3');
const removeSound = new Audio('_sfx/undo.wav');
const fwd5Sound = new Audio('_sfx/branch_7.wav');

const fontStyle = document.createElement('style');
fontStyle.innerHTML = `
@font-face {
    font-family: 'AnthropicSansLight';
    src: url('f0nts/anthropic_sans_text_Light.ttf');
    font-display: swap;
}
#meta-b-rank, #meta-w-rank {
    font-family: 'AnthropicSansLight', sans-serif !important;
}
`;
document.head.appendChild(fontStyle);

// Application State
var customPanelState = {
    visible: false,
    hasDragged: false,
    position: { x: 20, y: 120 }
};

const state = {
    activeStudyId: null,
    pendingStudySgf: null,
    // Initial Board Style Settings
    initialBoardStyle: {
        stoneSet: null,
        blackStone: {
            useColor: true,
            bg: '#111827',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#ffffff',
            fgSize: 11,
            br: '#ffffff',
            brSize: 0,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        whiteStone: {
            useColor: true,
            bg: '#f3f4f6',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#111827',
            fgSize: 11,
            br: '#111827',
            brSize: 1,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        board: {
            useColor: true,
            color: '#dcb35c',
            imgSrc: '',
            imgRepeat: false, imgZoom: 1.0,
            size: 600
        },
        border: {
            color: '#dcb35c',
            size: 100
        },
        grid: {
            lineColor: '#1c1917',
            lineSize: 1,
            hoshiColor: '#1c1917',
            hoshiSize: 3,
            boundaryColor: '#1c1917',
            boundarySize: 1.5
        },
        coord: {
            show: true,
            primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
            secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
        }
    },
    // Study Board Style Settings
    studyBoardStyle: {
        stoneSet: null,
        blackStone: {
            useColor: true,
            bg: '#111827',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#ffffff',
            fgSize: 11,
            br: '#ffffff',
            brSize: 0,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        whiteStone: {
            useColor: true,
            bg: '#f3f4f6',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#111827',
            fgSize: 11,
            br: '#111827',
            brSize: 1,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        board: {
            useColor: true,
            color: '#dcb35c',
            imgSrc: '',
            imgRepeat: false, imgZoom: 1.0,
            size: 600
        },
        border: {
            color: '#dcb35c',
            size: 100
        },
        grid: {
            lineColor: '#1c1917',
            lineSize: 1,
            hoshiColor: '#1c1917',
            hoshiSize: 3,
            boundaryColor: '#1c1917',
            boundarySize: 1.5
        },
        coord: {
            show: true,
            primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
            secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
        },
        hint: {
            color: '#ff3b30',
            size: 0.25,
            alpha: 0.5
        }
    },
    // Export Board Style Settings
    exportBoardStyle: {
        stoneSet: null,
        blackStone: {
            useColor: true,
            bg: '#111827',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#ffffff',
            fgSize: 11,
            br: '#ffffff',
            brSize: 0,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        whiteStone: {
            useColor: true,
            bg: '#f3f4f6',
            imgSrc: '',
            bgSize: 0.45,
            fg: '#111827',
            fgSize: 11,
            br: '#111827',
            brSize: 1,
            brRadius: 0,
            brBlur: 0,
            bmSize: 15
        },
        board: {
            useColor: true,
            color: '#dcb35c',
            imgSrc: '',
            imgRepeat: false, imgZoom: 1.0,
            size: 600
        },
        border: {
            color: '#dcb35c',
            size: 100
        },
        grid: {
            lineColor: '#1c1917',
            lineSize: 1,
            hoshiColor: '#1c1917',
            hoshiSize: 3,
            boundaryColor: '#1c1917',
            boundarySize: 1.5
        },
        coord: {
            show: true,
            primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
            secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
        }
    },
    // Scoring Board Style Settings
    scoringBoardStyle: null,

    // 19x19 board cells: each element is null, or { player: 'B'|'W'|null, annotation: 'triangle'|'square'|'circle'|'cross'|'red-circle'|null, label: string|null }
    board: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
        player: null,
        annotation: null,
        label: null
    }))),
    
    // Standard hoshi points
    hoshiPoints: Array.from({ length: 19 }, (_, r) => 
        Array.from({ length: 19 }, (_, c) => 
            [3, 9, 15].includes(r) && [3, 9, 15].includes(c)
        )
    ),

    // Active tool state
    activeTool: null, // 'crop', 'stone-b', 'stone-w', 'mark-triangle', 'mark-square', 'mark-circle', 'mark-cross', 'mark-red-circle', 'label-letter', 'label-number', 'hoshi', 'clear'
    cropLocked: false,
    playMode: false,
    playTurn: 'B',
    customLetter: 'A',
    customNumber: 1,
    customText: 'Text',
    annotLastStone: null, // {r, c, player} — last stone placed via annotation tools on empty board
    
    // Move Numbers Display State
    displayMoveNumbers: false,
    moveNumberMode: 'full', // 'full' | 'lastN'
    lastNMoves: 2,
    showNextMoveHint: false,
    showMoveCoord: false,
    moveNumberCountback: false,
    showMoveMarker: false,
    moveMarkerColor: '#ff3b30',
    gameEndPopupShown: false,
    captureAnim: { active: false, startTime: 0, duration: 400, stones: [] },
    
    playSeq: {
        number: 1,
        currentColor: 'B'
    },

    // Focus crop bounds (0-18 indices)
    crop: {
        colStart: 0,
        colEnd: 18,
        rowStart: 0,
        rowEnd: 18
    },

    // Mouse drag state
    drag: {
        mode: null,      // 'resize', 'move', 'draw', null
        handle: null,    // 1: Top-Left, 2: Top-Right, 3: Bottom-Left, 4: Bottom-Right
        startCell: null, // { r, c }
        initialCrop: null // copy of crop bounds
    },

    // Diagram Text Export Settings
    exportText: {
        includeTitle: false,
        titleType: 'auto', // 'auto', 'black-move', 'white-move', 'free'
        titleFree: '',
        includeComment: false,
        commentType: 'auto', // 'auto', 'free'
        comment: '',
        includeLegends: false,
        includeFlipNote: false,
        showGuidingLines: false,
        paddingX: 20,
        paddingY: 20,
        paddingZL: 20,
        paddingZR: 20,
        diaSize: 100,
        boardColor: '#DCB35C',
        borderSize: 100,
        borderColor: '#DCB35C',
        layoutMode: 'v',
        commentSide: 'right',
        commentWidth: 300,
        paddingZL2: 20,
        paddingZR2: 20,
        gridSize: 1.0,
        gridColor: '#000000',
        hoshiSize: 2.0,
        hoshiColor: '#000000'
    },
    studyText: {
        paddingY: 20,
        paddingX: 20,
        paddingZL: 20,
        paddingZR: 20,
        diaSize: 140,
        boardColor: '#dcb35c',
        borderSize: 100,
        borderColor: '#dcb35c',
        gridSize: 1,
        gridColor: '#000000',
        hoshiSize: 2,
        hoshiColor: '#000000'
    },

    legend: {
        active: {},
        meanings: {},
        groupNumbers: true,
        groupLetters: true
    },

    // SGF Replayer State
    sgfMoves: [],
    currentMoveIndex: -1,
    baselineBoard: null,
    captures: null,
    prefixCaptures: null,
    autoPlayTimer: null,
    isSgfDirty: false,
    sgfMetadata: {},
    baselineComment: '',
    sgfTree: null,
    boardWidth: 19,
    boardHeight: 19,
    plColor: null,
    
    // What-If Mode
    whatIfMode: false,
    whatIfStone: null,

    // Ref-Area selection mode (block-based, 18×18 grid)
    refAreaMode: false,
    refAreaCells: [],
    refAreaHoverCell: null,
    refAreaInsertPos: -1,

    // Ref-Point selection mode (intersection-based, raw coords)
    refPointMode: false,
    refPointCells: [],
    refPointInsertPos: -1
};
window.state = state;

// Sound Effects
const sfxAnnot = new Audio('_sfx/annot.wav');
const sfxAnnotUndo = new Audio('_sfx/annot_undo.wav');
sfxAnnot.load();
sfxAnnotUndo.load();

// ---------------------------------------------------------------------------
// Audio unlock — modern browsers (Chrome, Safari, Firefox) block
// HTMLAudioElement.play() until the page receives a user-activation gesture;
// once a site loses its media-engagement status (or after a browser update)
// sounds can silently stop even though the files still load fine. On the first
// interaction we pre-play each SFX muted and immediately pause it, satisfying
// the autoplay policy so every later play() (stone placement, undo,
// annotation, board flip, replayer) is permitted for the rest of the session.
// ---------------------------------------------------------------------------
const sfxGlobalPool = [stoneSound, removeSound, fwd5Sound, sfxAnnot, sfxAnnotUndo];
(function unlockSfxOnFirstGesture() {
    let unlocked = false;
    const unlock = () => {
        if (unlocked) return;
        unlocked = true;
        for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
            window.removeEventListener(evt, unlock, true);
        }
        for (const audio of sfxGlobalPool) {
            try {
                audio.muted = true;
                const p = audio.play();
                if (p && typeof p.then === 'function') {
                    p.then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; })
                     .catch(() => { audio.muted = false; });
                } else {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.muted = false;
                }
            } catch (e) { /* ignore individual unlock failures */ }
        }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
})();

// History management state
let undoStack = [];
let redoStack = [];

function saveHistoryState(actionName = null) {
    const snapshot = {
        action: actionName,
        board: JSON.parse(JSON.stringify(state.board)),
        crop: JSON.parse(JSON.stringify(state.crop)),
        hoshiPoints: JSON.parse(JSON.stringify(state.hoshiPoints)),
        customLetter: state.customLetter,
        customNumber: state.customNumber,
        playSeq: JSON.parse(JSON.stringify(state.playSeq)),
        exportText: JSON.parse(JSON.stringify(state.exportText)),
        legend: JSON.parse(JSON.stringify(state.legend)),
        playMode: state.playMode,
        playTurn: state.playTurn,
        sgfMoves: JSON.parse(JSON.stringify(state.sgfMoves || [])),
        allSgfMoves: JSON.parse(JSON.stringify(state.allSgfMoves || [])),
        currentMoveIndex: state.currentMoveIndex,
        isSgfDirty: state.isSgfDirty,
        baselineAnnotations: JSON.parse(JSON.stringify(state.baselineAnnotations || []))
    };
    undoStack.push(snapshot);
    if (undoStack.length > 50) {
        undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
}

function restoreState(snapshot) {
    state.board = JSON.parse(JSON.stringify(snapshot.board));
    state.crop = JSON.parse(JSON.stringify(snapshot.crop));
    state.hoshiPoints = JSON.parse(JSON.stringify(snapshot.hoshiPoints));
    state.customLetter = snapshot.customLetter;
    state.customNumber = snapshot.customNumber;
    state.playSeq = snapshot.playSeq ? JSON.parse(JSON.stringify(snapshot.playSeq)) : { number: 1, currentColor: 'B' };
    state.exportText = JSON.parse(JSON.stringify(snapshot.exportText));
    if (snapshot.legend) {
        state.legend = JSON.parse(JSON.stringify(snapshot.legend));
    } else {
        state.legend = { active: {}, meanings: {}, groupNumbers: true, groupLetters: true };
    }
    state.playMode = !!snapshot.playMode;
    state.playTurn = snapshot.playTurn || 'B';

    if (Array.isArray(snapshot.sgfMoves)) {
        state.sgfMoves = JSON.parse(JSON.stringify(snapshot.sgfMoves));
        state.allSgfMoves = Array.isArray(snapshot.allSgfMoves)
            ? JSON.parse(JSON.stringify(snapshot.allSgfMoves))
            : state.sgfMoves.slice();
        state.currentMoveIndex = snapshot.currentMoveIndex != null ? snapshot.currentMoveIndex : -1;
        state.isSgfDirty = !!snapshot.isSgfDirty;
        state.baselineAnnotations = JSON.parse(JSON.stringify(snapshot.baselineAnnotations || []));
        updateReplayerKpiDisplay();
        if (window.updateSaveRecGameButton) window.updateSaveRecGameButton();
    }

    if (elements.customLetterInput) {
        elements.customLetterInput.value = state.customLetter;
    }
    if (elements.toolLetterPreview) {
        elements.toolLetterPreview.textContent = state.customLetter.toLowerCase();
    }
    if (elements.customNumberInput) {
        elements.customNumberInput.value = state.customNumber;
    }
    if (window.updateResetBtnVisibility) window.updateResetBtnVisibility();
    if (elements.customTextInput) {
        elements.customTextInput.value = state.customText;
    }
    if (elements.toolNumberPreview) {
        elements.toolNumberPreview.textContent = state.customNumber;
    }
    if (elements.customPlayInput) {
        elements.customPlayInput.value = state.playSeq.number;
    }
    if (elements.diagIncludeText) {
        elements.diagIncludeText.checked = state.exportText.includeText;
    }
    if (elements.diagTitleType) {
        elements.diagTitleType.value = state.exportText.titleType;
    }
    if (elements.diagTitleFreeContainer) {
        elements.diagTitleFreeContainer.classList.toggle('hidden', state.exportText.titleType !== 'free');
    }
    if (elements.diagTitleFree) {
        elements.diagTitleFree.value = state.exportText.titleFree;
    }
    if (elements.diagComment) {
        elements.diagComment.value = state.exportText.comment;
    }

    const togglePlayMode = document.getElementById('toggle-play-mode');
    const playModeInfo = document.getElementById('play-mode-info');
    if (togglePlayMode) {
        togglePlayMode.checked = state.playMode;
    }
    if (playModeInfo) {
        if (state.playMode) {
            playModeInfo.innerHTML = `
                <p>🎮 <strong>Play Mode is Active:</strong> You can now play moves on the board interactively. Clicking on intersections will place stones alternatingly, similar to a real Go game.</p>
                <p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--accent-indigo); font-weight: 500;">💡 Play Mode overrides active edit tools.</p>
            `;
        } else {
            playModeInfo.innerHTML = `
                <p>🎮 <strong>Play Mode is Off:</strong> You are currently in <strong>Edit/Annotation Mode</strong>. Click on cells to draw stones, labels, and markers as annotations.</p>
            `;
        }
    }

    drawBoard();
    updateCropBadge();
    updateReplicationCode();
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    const previousState = undoStack.pop();
    const currentState = {
        action: previousState.action,
        board: JSON.parse(JSON.stringify(state.board)),
        crop: JSON.parse(JSON.stringify(state.crop)),
        hoshiPoints: JSON.parse(JSON.stringify(state.hoshiPoints)),
        customLetter: state.customLetter,
        customNumber: state.customNumber,
        playSeq: JSON.parse(JSON.stringify(state.playSeq)),
        exportText: JSON.parse(JSON.stringify(state.exportText)),
        legend: JSON.parse(JSON.stringify(state.legend)),
        playMode: state.playMode,
        playTurn: state.playTurn,
        sgfMoves: JSON.parse(JSON.stringify(state.sgfMoves || [])),
        allSgfMoves: JSON.parse(JSON.stringify(state.allSgfMoves || [])),
        currentMoveIndex: state.currentMoveIndex,
        isSgfDirty: state.isSgfDirty,
        baselineAnnotations: JSON.parse(JSON.stringify(state.baselineAnnotations || []))
    };
    redoStack.push(currentState);
    restoreState(previousState);

    if (previousState.action && 
        previousState.action !== 'stone-b' && 
        previousState.action !== 'stone-w' && 
        previousState.action !== 'crop' && 
        previousState.action !== 'clear') {
        sfxAnnotUndo.currentTime = 0;
        sfxAnnotUndo.play().catch(e => console.error('Undo audio play failed:', e));
    }
}

function redo() {
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    const currentState = {
        action: nextState.action,
        board: JSON.parse(JSON.stringify(state.board)),
        crop: JSON.parse(JSON.stringify(state.crop)),
        hoshiPoints: JSON.parse(JSON.stringify(state.hoshiPoints)),
        customLetter: state.customLetter,
        customNumber: state.customNumber,
        playSeq: JSON.parse(JSON.stringify(state.playSeq)),
        exportText: JSON.parse(JSON.stringify(state.exportText)),
        legend: JSON.parse(JSON.stringify(state.legend)),
        playMode: state.playMode,
        playTurn: state.playTurn,
        sgfMoves: JSON.parse(JSON.stringify(state.sgfMoves || [])),
        allSgfMoves: JSON.parse(JSON.stringify(state.allSgfMoves || [])),
        currentMoveIndex: state.currentMoveIndex,
        isSgfDirty: state.isSgfDirty,
        baselineAnnotations: JSON.parse(JSON.stringify(state.baselineAnnotations || []))
    };
    undoStack.push(currentState);
    restoreState(nextState);
}

function updateUndoRedoButtons() {
    if (elements.btnUndo) {
        elements.btnUndo.disabled = undoStack.length === 0;
    }
    if (elements.btnRedo) {
        elements.btnRedo.disabled = redoStack.length === 0;
    }
}


// Coordinate column labels (skipping I)
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

// DOM Elements
const elements = {
    canvasInitial: document.getElementById('go-board-canvas-initial'),
    canvasStudy: document.getElementById('go-board-canvas-study'),
    canvasScoring: document.getElementById('go-board-canvas-scoring'),
    toolBtns: document.querySelectorAll('.tool-btn[data-tool]'),
    customLetterContainer: document.getElementById('custom-letter-container'),
    customLetterInput: document.getElementById('custom-letter-input'),
    resetLetterBtn: document.getElementById('reset-letter-btn'),
    customNumberContainer: document.getElementById('custom-number-container'),
    customNumberInput: document.getElementById('custom-number-input'),
    resetNumberBtn: document.getElementById('reset-number-btn'),
    customTextContainer: document.getElementById('custom-text-container'),
    customTextInput: document.getElementById('custom-text-input'),
    customPlayContainer: document.getElementById('custom-play-container'),
    customPlayInput: document.getElementById('custom-play-input'),
    toolLetterPreview: document.getElementById('tool-letter-preview'),
    toolNumberPreview: document.getElementById('tool-number-preview'),
    btnClearAll: document.getElementById('btn-clear-all'),
    btnResetCrop: document.getElementById('btn-reset-crop'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnCapture: document.getElementById('btn-start-export'),
    cropDimensionsBadge: document.getElementById('crop-dimensions-badge'),
    
    // Diagram Text DOM Elements
    diagIncludeText: document.getElementById('diag-include-text'),
    diagTitleType: document.getElementById('diag-title-type'),
    diagTitleFreeContainer: document.getElementById('diag-title-free-container'),
    diagTitleFree: document.getElementById('diag-title-free'),
    diagComment: document.getElementById('diag-comment'),
    sourceManual: document.getElementById('source-manual'),
    sourceSgf: document.getElementById('source-sgf'),
    sgfAutoTextContainer: document.getElementById('sgf-auto-text-container'),
    sgfAutoTitle: document.getElementById('sgf-auto-title'),
    sgfAutoComment: document.getElementById('sgf-auto-comment'),

    // Replication Code DOM Elements
    repIncludeText: document.getElementById('rep-include-text'),
    repCodeOutput: document.getElementById('rep-code-output'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    btnSaveCode: document.getElementById('btn-save-code'),
    repCodeInput: document.getElementById('rep-code-input'),
    btnLoadCode: document.getElementById('btn-load-code'),
    btnRepPasteClipboard: document.getElementById('btn-rep-paste-clipboard'),
    btnRepLoadSample: document.getElementById('btn-rep-load-sample'),
    
    // SGF Importer Elements
    btnExploreKifu: document.getElementById('btn-explore-kifu'),
    sgfFileInput: document.getElementById('sgf-file-input'),
    kifuDirInput: document.getElementById('kifu-dir-input'),
    kifuModalOverlay: document.getElementById('kifu-modal-overlay'),
    kifuModal: document.getElementById('kifu-modal'),
    kifuSearchInput: document.getElementById('kifu-search-input'),
    kifuStatusBar: document.getElementById('kifu-status-bar'),
    kifuTableBody: document.getElementById('kifu-table-body'),
    btnCloseKifu: document.getElementById('btn-close-kifu'),
    sgfPasteArea: document.getElementById('sgf-paste-area'),
    btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
    btnFlipPov: document.getElementById('btn-flip-pov'),
    btnLoadSample: document.getElementById('btn-load-sample'),
    tabUpload: document.getElementById('tab-upload'),
    tabPaste: document.getElementById('tab-paste'),
    uploadSection: document.getElementById('input-upload-section'),
    pasteSection: document.getElementById('input-paste-section'),
    dropZone: document.getElementById('drop-zone'),
    fileInfo: document.getElementById('file-info'),
    selectedFileName: document.getElementById('selected-file-name'),
    btnRemoveFile: document.getElementById('remove-file-btn'),
    
    // Filter & Meta Elements
    rangeInput: document.getElementById('range-input'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    btnRangeAll: document.getElementById('btn-range-all'),
    btnRangeOpening: document.getElementById('btn-range-opening'),
    btnRangeMidgame: document.getElementById('btn-range-midgame'),
    btnRangeEndgame: document.getElementById('btn-range-endgame'),
    gameMetaPanel: document.getElementById('game-meta-panel'),
    
    sgfExportContainer: document.getElementById('sgf-export-container'),
    btnExportSgf: document.getElementById('btn-export-sgf'),
    btnWhatIf: document.getElementById('btn-what-if'),
    
    // Replayer Elements
    btnReplayFirst: document.getElementById('btn-replay-first'),
    btnReplayBack5: document.getElementById('btn-replay-back5'),
    btnReplayPrev: document.getElementById('btn-replay-prev'),
    btnReplayNext: document.getElementById('btn-replay-next'),
    btnReplayFwd5: document.getElementById('btn-replay-fwd5'),
    btnReplayLast: document.getElementById('btn-replay-last'),
    
    // Move Numbers Display Elements
    toggleMoveNumbers: document.getElementById('toggle-move-numbers'),
    moveNumbersOptions: document.getElementById('move-numbers-options'),
    moveNumberModeRadios: document.getElementsByName('move-number-mode'),
    inputLastNMoves: document.getElementById('input-last-n-moves'),
    nextMoveHintContainer: document.getElementById('next-move-hint-container'),
    toggleNextMoveHint: document.getElementById('toggle-next-move-hint'),
    toggleMoveCoord: document.getElementById('toggle-move-coord'),
    ibCoordMoveMarker: document.getElementById('ib-coord-move-marker'),
    ibCoordMoveMarkerColor: document.getElementById('ib-coord-move-marker-color'),
    
    replayerMoveKpi: document.getElementById('replayer-move-kpi'),
    btnAutoplay: document.getElementById('btn-autoplay'),
    autoplayCustomSec: document.getElementById('autoplay-custom-sec'),
    autoplaySpeedBtns: document.querySelectorAll('.autoplay-speed-btn'),
    btnPhaseFuseki: document.getElementById('btn-phase-fuseki'),
    btnPhaseChuban: document.getElementById('btn-phase-chuban'),
    btnPhaseYose: document.getElementById('btn-phase-yose'),
    
    // SGF Editing Elements
    sgfExportContainer: document.getElementById('sgf-export-container'),
    btnExportSgf: document.getElementById('btn-export-sgf'),
    btnRefArea: document.getElementById('btn-ref-area'),
    btnRefPoint: document.getElementById('btn-ref-point'),
    btnSgfCommentEdit: document.getElementById('btn-sgf-comment-edit'),
    btnSgfCommentSave: document.getElementById('btn-sgf-comment-save'),
    sgfCommentDisplay: document.getElementById('sgf-comment-display'),
    sgfCommentInput: document.getElementById('sgf-comment-input'),
    sgfCommentResizeHandle: document.getElementById('sgf-comment-resize-handle'),
    sgfCommentDropdown: document.getElementById('sgf-comment-dropdown'),
    
    // Extracted Moves Elements
    sgfExtractedWrapper: document.getElementById('sgf-extracted-wrapper'),
    outputTextArea: document.getElementById('output-text-area'),
    btnCopyOutput: document.getElementById('btn-copy-output'),
    sgfTextArea: document.getElementById('sgf-text-area'),
    btnCopySgf: document.getElementById('btn-copy-sgf'),
    
    // Variation Elements
    btnVarPrev: document.getElementById('btn-var-prev'),
    btnVarNext: document.getElementById('btn-var-next'),
    variationLabel: document.getElementById('variation-label'),
    
    // Annotation Editor Elements
    annotEditor: document.getElementById('sgf-annot-editor'),
    annotMove: document.getElementById('annot-move'),
    annotNode: document.getElementById('annot-node')
};

// Canvas 2D Context

// Geometry Layout Constants for the Interactive screen board
const PADDING = 36; // Padding on 4 sides for coordinate labels
const CANVAS_SIZE = 600; // Fixed backbuffer size
const GRID_SIZE = CANVAS_SIZE - 2 * PADDING;
const CELL_SIZE = GRID_SIZE / 18;

function setupGameInfoEdit() {
    const btnEdit = document.getElementById('btn-game-info-edit');
    const btnSave = document.getElementById('btn-game-info-save');
    const fields = ['gn', 'ev', 'pb', 'pw', 're', 'km', 'dt', 'pc', 'comment'];
    
    if (!btnEdit || !btnSave) return;
    
    btnEdit.addEventListener('click', () => {
        btnEdit.style.display = 'none';
        btnSave.style.display = 'inline-flex';
        
        fields.forEach(f => {
            const displayEl = document.getElementById(`info-${f}-display`);
            const inputEl = document.getElementById(`info-${f}-input`);
            if (displayEl && inputEl) {
                displayEl.style.display = 'none';
                inputEl.style.display = 'block';
                // Populate input with current metadata value
                const val = (f === 'comment') 
                    ? (state.baselineComment || state.sgfMetadata.gc || '')
                    : (state.sgfMetadata[f] || '');
                inputEl.value = val;
            }
        });
    });
    
    btnSave.addEventListener('click', () => {
        btnSave.style.display = 'none';
        btnEdit.style.display = 'inline-flex';
        
        fields.forEach(f => {
            const displayEl = document.getElementById(`info-${f}-display`);
            const inputEl = document.getElementById(`info-${f}-input`);
            if (displayEl && inputEl) {
                inputEl.style.display = 'none';
                displayEl.style.display = 'inline';
                
                const newVal = inputEl.value;
                if (f === 'comment') {
                    // Save to root comment (baselineComment) as per plan
                    state.baselineComment = newVal;
                    // Also update GC if we want, but baselineComment takes precedence
                } else {
                    state.sgfMetadata[f] = newVal;
                }
                
                // Update display
                const formatVal = (val) => (val && val.trim() !== '' && val.trim().toLowerCase() !== 'none') ? val : '<span style="color: #9ca3af; font-style: italic;">n/a</span>';
                displayEl.innerHTML = formatVal(newVal);
            }
        });
        
        // Trigger SGF dirty to show export button
        state.isSgfDirty = true; state.popupShownForCurrentChange = false;
        if (typeof updateSaveRecGameButton === 'function') updateSaveRecGameButton();
        if (elements.sgfExportContainer) {
            elements.sgfExportContainer.style.display = 'flex';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
        }
        if (typeof checkSgfChangeAndShowPopup === 'function') {
            checkSgfChangeAndShowPopup();
        }
    });
}
function numberToWords(num) {
    const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    if (num === 0) return 'zero';
    if (num < 0) return 'minus ' + numberToWords(Math.abs(num));
    
    let words = '';
    const integerPart = Math.floor(num);
    const fractionalPart = num - integerPart;
    
    if (integerPart > 0) {
        if (integerPart < 20) {
            words += units[integerPart];
        } else if (integerPart < 100) {
            words += tens[Math.floor(integerPart / 10)];
            if (integerPart % 10 > 0) words += '-' + units[integerPart % 10];
        } else if (integerPart < 1000) {
            words += units[Math.floor(integerPart / 100)] + ' hundred';
            if (integerPart % 100 > 0) words += ' and ' + numberToWords(integerPart % 100);
        } else {
            words += integerPart; // Fallback for large numbers
        }
    }
    
    if (fractionalPart === 0.5) {
        if (integerPart === 0) {
            words += 'half';
        } else {
            words += ' and a half';
        }
    } else if (fractionalPart > 0) {
        words += ' point ' + fractionalPart.toString().substring(2);
    }
    
    return words;
}

function generateAutoSgfText() {
    const symB = '(B)';
    const symW = '(W)';

    if (!state.sgfMoves || state.sgfMoves.length === 0) {
        if (elements.sgfAutoTitle) elements.sgfAutoTitle.innerHTML = `{black / white} ${symB} / ${symW} to Play`;
        if (elements.sgfAutoComment) elements.sgfAutoComment.innerHTML = 'This diagram shows a sequence from {game_of_title}, played between {black} (Black) and {white} (White) on {date} at {place}. The game used {rule} rules with a {komi}-point komi. The final result was {result} ({winner} won by {win_method}).<br><br>Note: {note}';
        if (elements.sgfAutoTextContainer) {
            elements.sgfAutoTextContainer.style.opacity = '0.5';
            elements.sgfAutoTextContainer.style.pointerEvents = 'none';
        }
        return;
    }

    // Determine next player to play (absolute-index-aware)
    let nextPlayer = 'B';
    if (state.allSgfMoves && state.allSgfMoves.length > 0) {
        const absStart = (state.filterStart || 1) - 1;
        const absIdx = state.currentMoveIndex >= 0 ? absStart + state.currentMoveIndex : -1;
        const nextAbsIdx = absIdx + 1;
        if (nextAbsIdx >= 0 && nextAbsIdx < state.allSgfMoves.length) {
            nextPlayer = state.allSgfMoves[nextAbsIdx].player;
        } else if (absIdx >= 0 && absIdx < state.allSgfMoves.length) {
            nextPlayer = state.allSgfMoves[absIdx].player === 'B' ? 'W' : 'B';
        } else if (state.allSgfMoves.length > 0) {
            nextPlayer = state.allSgfMoves[absStart >= 0 ? absStart : 0].player;
        }
    }
    
    let blackName = state.sgfMetadata.pb || 'Black';
    let whiteName = state.sgfMetadata.pw || 'White';
    let playerName = nextPlayer === 'B' ? blackName : whiteName;
    
    const playerSymbol = nextPlayer === 'B' ? symB : symW;
    const autoTitle = `${playerName} ${playerSymbol} to Play`;
    
    // Format Date
    let formattedDate = state.sgfMetadata.dt || 'unknown date';
    if (/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
        const d = new Date(formattedDate);
        formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    }
    
    // Parse Result
    let resultStr = state.sgfMetadata.re || 'unknown result';
    let marginOrResignation = resultStr;
    let winnerName = resultStr.startsWith('B') ? blackName : (resultStr.startsWith('W') ? whiteName : 'Unknown');
    let loserName = resultStr.startsWith('B') ? whiteName : (resultStr.startsWith('W') ? blackName : 'Unknown');
    
    const reUpper = resultStr.toUpperCase();
    if (reUpper.includes('+R') || reUpper.includes('+RESIGN')) {
        marginOrResignation = `resignation of ${loserName}`;
    } else {
        const match = resultStr.match(/[BW]\+([\d\.]+)/i);
        if (match) {
            const num = parseFloat(match[1]);
            if (num === 0.5) {
                marginOrResignation = 'a razor-thin margin of half a point';
            } else {
                marginOrResignation = `${numberToWords(num)} points`;
            }
        }
    }
    
    const game = state.sgfMetadata.gn || '';
    const title = state.sgfMetadata.ev || '';
    const blk_ply_nm = state.sgfMetadata.pb || '';
    const wht_ply_nm = state.sgfMetadata.pw || '';
    const date = state.sgfMetadata.dt ? formattedDate : '';
    const place = state.sgfMetadata.pc || '';
    const rule = state.sgfMetadata.ru || '';
    const komi = state.sgfMetadata.km || '';
    const result = state.sgfMetadata.re || '';

    // 1. THE CLEANING FUNCTION
    // This forces every messy SGF variable to be neat before we use it.
    function clean_text(raw_string) {
        if (!raw_string) return "";
        
        // Replace double or triple spaces with just one space
        let cleaned = raw_string.replace(/\s+/g, ' ');
        
        // Delete any space sitting right before a comma or period
        cleaned = cleaned.replace(/\s+([.,])/g, '$1');
        
        // Cut off any leftover spaces at the very beginning or end
        return cleaned.trim();
    }

    // 2. CLEAN ALL SGF VARIABLES FIRST
    let c_game = clean_text(game);
    let c_title = clean_text(title);
    let c_blk = clean_text(blk_ply_nm);
    let c_wht = clean_text(wht_ply_nm);
    let c_date = clean_text(date);
    let c_place = clean_text(place);
    let c_rule = clean_text(rule);
    let c_komi = clean_text(komi);
    let c_result = clean_text(result);

    // 3. BUILD THE SENTENCE PARTS
    // [A] EVENT
    let event = (c_game ? c_game + " of " : "") + c_title;
    let event_clause = event ? "from " + event : "from an unrecorded game";

    // [B] PLAYERS
    let p1 = c_blk || "an unknown player";
    let p2 = c_wht || "an unknown player";
    let player_clause = "played between " + p1 + " (B) and " + p2 + " (W)";

    // [C] DATE AND PLACE
    let context = [];
    if (c_date) context.push("on " + c_date);
    if (c_place) context.push("at " + c_place);
    let context_clause = context.length > 0 ? " " + context.join(", ") : "";

    // [D] SETTINGS
    let settings = [];
    if (c_rule) settings.push(c_rule + " rules");
    if (c_komi) settings.push("Komi: " + c_komi);
    let settings_clause = settings.length > 0 ? " Played under " + settings.join(", ") + "." : "";

    // [E] RESULT
    let result_clause = "";
    if (c_result) {
        let winner = (c_result.toUpperCase().startsWith("B")) ? c_blk : (c_result.toUpperCase().startsWith("W") ? c_wht : "");
        let details = "";
        const match = c_result.match(/^[BW]\+(.*)$/i);
        if (match) details = match[1];
        
        let method = "";
        if (details) {
            method = (details.toUpperCase() === "R" || details.toUpperCase() === "RESIGN") ? "resignation" : (details.toUpperCase() === "T" || details.toUpperCase() === "TIME" ? "time" : details + " points");
        }
        let explanation = winner ? " (" + winner + " won by " + method + ")" : "";
        result_clause = " Result: " + c_result + explanation + ".";
    }

    // 4. FINAL ASSEMBLY
    // Combine all parts and run one final sweep to ensure flawless punctuation spacing.
    let comment = ("This diagram shows a sequence " + event_clause + ", " + player_clause + context_clause + "." + settings_clause + result_clause).replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();

    const rootNote = state.sgfMetadata.gc || state.baselineComment;
    if (rootNote) {
        comment += `<br><br>Note: ${rootNote.trim().replace(/\n/g, '<br>')}`;
    }
    
    if (elements.sgfAutoTitle) {
        elements.sgfAutoTitle.innerHTML = autoTitle;
    }
    if (elements.sgfAutoComment) elements.sgfAutoComment.innerHTML = comment;
    if (elements.sgfAutoTextContainer) {
        if (state.exportText.source !== 'sgf') {
            elements.sgfAutoTextContainer.style.opacity = '0.5';
        } else {
            elements.sgfAutoTextContainer.style.opacity = '1';
        }
        elements.sgfAutoTextContainer.style.pointerEvents = 'auto';
    }
}
function updateSourceSelection() {
    const manualContainer = elements.sourceManual ? elements.sourceManual.closest('.toolbar-section') : null;
    const sgfContainer = elements.sgfAutoTextContainer;

    if (state.exportText.source === 'manual') {
        if (manualContainer) {
            manualContainer.style.opacity = '1';
            manualContainer.style.pointerEvents = 'auto';
        }
        if (sgfContainer && state.sgfMoves && state.sgfMoves.length > 0) {
            sgfContainer.style.opacity = '0.5';
            sgfContainer.style.pointerEvents = 'auto';
        }
    } else {
        if (manualContainer) {
            manualContainer.style.opacity = '0.5';
            manualContainer.style.pointerEvents = 'auto';
        }
        if (sgfContainer) {
            sgfContainer.style.opacity = '1';
            sgfContainer.style.pointerEvents = 'auto';
        }
    }
}

function createEmptyBoardGrid() {
    return Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
        player: null,
        annotation: null,
        label: null
    })));
}

function initBlankGame() {
    state.board = createEmptyBoardGrid();
    state.baselineBoard = createEmptyBoardGrid();
    state.setupBoard = null;
    state.allSgfMoves = [];
    state.sgfMoves = [];
    state.currentMoveIndex = -1;
    state.isSgfDirty = false;
    state.popupShownForCurrentChange = false;
    state.baselineComment = '';
    state.baselineAnnotations = [];
    state.baselineUnknownProps = null;
    state.sgfMetadata = {};
    state.sgfRootProps = null;
    state.sgfTree = null;
    state.rawSgf = null;
    state.plColor = null;
    state.variationData = { branchPoints: [], currentBranchPath: [0] };
    state.annotLastStone = null;
    if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'none';
    if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
}

// Rebuild the grid for the position after `index` moves, from baselineBoard + replay rules.
function buildPositionUpTo(index) {
    const grid = JSON.parse(JSON.stringify(state.baselineBoard || createEmptyBoardGrid()));
    for (let i = 0; i <= index; i++) {
        const m = state.sgfMoves[i];
        if (!m || m.isPass) continue;
        if (m.r >= 0 && m.r < 19 && m.c >= 0 && m.c < 19 && !grid[m.r][m.c].player) {
            playStoneWithCaptures(grid, m.r, m.c, m.player);
        }
    }
    return grid;
}

function boardsEqual(a, b) {
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            if ((a[r][c].player || null) !== (b[r][c].player || null)) return false;
        }
    }
    return true;
}

function groupHasLiberty(board, r, c, color) {
    const visited = Array.from({ length: 19 }, () => Array(19).fill(false));
    const stack = [[r, c]];
    visited[r][c] = true;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (stack.length) {
        const [cr, cc] = stack.pop();
        for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr > 18 || nc < 0 || nc > 18) continue;
            if (!board[nr][nc].player) return true;
            if (board[nr][nc].player === color && !visited[nr][nc]) {
                visited[nr][nc] = true;
                stack.push([nr, nc]);
            }
        }
    }
    return false;
}

// Record a real SGF move (B[]/W[]) at (r,c) as a child of the current position.
// Returns the move object on success, or null if the point is illegal/occupied.
function recordMoveAt(r, c, color, toolName) {
    if (r < 0 || r > 18 || c < 0 || c > 18) return null;
    if (color !== 'B' && color !== 'W') return null;

    const positionBefore = buildPositionUpTo(state.currentMoveIndex);
    if (positionBefore[r][c].player) return null; // occupied

    // Validate on a throwaway copy: apply captures, reject suicide, reject ko recapture.
    const tempBoard = JSON.parse(JSON.stringify(positionBefore));
    playStoneWithCaptures(tempBoard, r, c, color);
    if (tempBoard[r][c].player !== color) return null; // suicide

    if (state.currentMoveIndex >= 0) {
        const positionTwoAgo = buildPositionUpTo(state.currentMoveIndex - 1);
        if (boardsEqual(tempBoard, positionTwoAgo)) return null; // simple ko
    }

    saveHistoryState(toolName);

    // Branch: truncate any later moves
    state.sgfMoves.splice(state.currentMoveIndex + 1);
    state.allSgfMoves.splice(state.currentMoveIndex + 1);

    // For Play Black / Play White, keep the move numbering the user set in the play-number
    // input (GoWrite-style); otherwise number positionally from the move list.
    let playedNumber = null;
    if (toolName === 'play-b' || toolName === 'play-w') {
        playedNumber = state.playSeq.number;
    }
    const nextMoveNumber = state.sgfMoves.length + 1;
    const move = {
        player: color,
        r: r,
        c: c,
        isPass: false,
        comment: '',
        annotations: [],
        unknownProps: null,
        moveNumber: playedNumber != null ? playedNumber : nextMoveNumber,
        nodeName: '',
        moveAnnotation: null,
        nodeAnnotation: null,
        territory: null
    };
    state.sgfMoves.push(move);
    state.allSgfMoves.push(move);
    state.currentMoveIndex = state.sgfMoves.length - 1;
    state.isSgfDirty = true;
    state.popupShownForCurrentChange = false;

    if (toolName === 'play-b' || toolName === 'play-w') {
        state.playSeq.currentColor = color === 'B' ? 'W' : 'B';
        state.playSeq.number = playedNumber + 1;
        if (elements.customPlayInput) elements.customPlayInput.value = state.playSeq.number;
    }

    const replayerSec = document.getElementById('replayer-section');
    if (replayerSec && replayerSec.style.display === 'none') replayerSec.style.display = 'block';
    if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'flex';
    if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';

    // Rebuild the display without triggering the "file changed" popup.
    state.isSgfDirty = false;
    goToMove(state.currentMoveIndex);
    state.isSgfDirty = true;

    if (typeof window.updateSaveRecGameButton === 'function') window.updateSaveRecGameButton();
    return move;
}

// Delete the last recorded move (used when clicking the last stone again in play mode).
function removeLastMove() {
    if (state.currentMoveIndex < 0 || !state.sgfMoves.length) return false;
    const m = state.sgfMoves[state.currentMoveIndex];
    if (m.isPass) return false;

    saveHistoryState('remove-move');
    state.sgfMoves.pop();
    state.allSgfMoves.pop();
    state.currentMoveIndex = state.sgfMoves.length - 1;
    state.isSgfDirty = true;
    state.popupShownForCurrentChange = false;

    state.isSgfDirty = false;
    goToMove(state.currentMoveIndex);
    state.isSgfDirty = true;

    if (typeof window.updateSaveRecGameButton === 'function') window.updateSaveRecGameButton();
    return true;
}

function replayToTerminal() {
    const grid = state.setupBoard
        ? JSON.parse(JSON.stringify(state.setupBoard))
        : createEmptyBoardGrid();
    let bCaps = 0, wCaps = 0;
    const moves = (state.allSgfMoves && state.allSgfMoves.length) ? state.allSgfMoves : (state.sgfMoves || []);
    for (const m of moves) {
        if (!m || m.isPass) continue;
        if (m.r >= 0 && m.r < 19 && m.c >= 0 && m.c < 19) {
            const cap = playStoneWithCaptures(grid, m.r, m.c, m.player);
            if (m.player === 'B') bCaps += cap.count; else wCaps += cap.count;
        }
    }
    return { board: grid, captures: { B: bCaps, W: wCaps }, moveCount: moves.length };
}

function updateReplayerKpiDisplay() {
    if (!elements.replayerMoveKpi) return;
    const index = state.currentMoveIndex;
    const totalAll = state.allSgfMoves ? state.allSgfMoves.length : 0;
    const isFiltered = totalAll > 0 && totalAll !== state.sgfMoves.length;
    const absIdx = (state.filterStart || 1) - 1 + index;
    if (isFiltered) {
        const endMove = (state.filterEnd && state.filterEnd !== Infinity) ? state.filterEnd : totalAll;
        elements.replayerMoveKpi.textContent = `${absIdx + 1} / ${endMove}`;
    } else {
        elements.replayerMoveKpi.textContent = `${absIdx + 1} / ${totalAll}`;
    }
}

function init() {
    if (!elements.canvasInitial) elements.canvasInitial = document.getElementById('go-board-canvas-initial');
    if (!elements.canvasStudy) elements.canvasStudy = document.getElementById('go-board-canvas-study');
    if (!elements.canvasScoring) elements.canvasScoring = document.getElementById('go-board-canvas-scoring');

    // High DPI / Retina display support
    const dpr = window.devicePixelRatio || 1;
    [elements.canvasInitial, elements.canvasStudy, elements.canvasScoring].forEach(c => {
        if (c) {
            c.width = CANVAS_SIZE * dpr;
            c.height = CANVAS_SIZE * dpr;
            const ctx = c.getContext('2d');
            ctx.scale(dpr, dpr);
        }
    });
    setupEventListeners();
    setupGameInfoEdit();
    initBlankGame();
    drawBoard();
    updateCropBadge();
    updateReplicationCode();
    
    if (document.fonts) {
        Promise.all([
            document.fonts.load("12px 'iGoRodinPro'"),
            document.fonts.load("12px 'Figtree'"),
            document.fonts.load("italic 12px 'Figtree'")
        ]).then(() => {
            drawBoard();
        });
    }
    
    // Initialize floating tool palette
    initFloatingToolbar();
}

// Event Listeners Setup
function setupEventListeners() {
    // Diagram Exporter Toggle
    const toggleDiagramExporter = document.getElementById('toggle-diagram-exporter');
    if (toggleDiagramExporter) {
        toggleDiagramExporter.addEventListener('change', (e) => {
            const content = document.getElementById('diagram-exporter-content');
            if (content) {
                content.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    // Toolbar buttons selection
    elements.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const isActive = btn.classList.contains('active');
            
            elements.toolBtns.forEach(b => b.classList.remove('active'));
            
            if (isActive) {
                state.activeTool = null;
            } else {
                btn.classList.add('active');
                state.activeTool = btn.getAttribute('data-tool');
                
                // Pre-select Tengen if activating Focus Area from a full board
                if (state.activeTool === 'crop' && state.crop.colStart === 0 && state.crop.colEnd === 18 && state.crop.rowStart === 0 && state.crop.rowEnd === 18) {
                    saveHistoryState();
                    state.crop = { colStart: 9, colEnd: 9, rowStart: 9, rowEnd: 9 };
                    updateCropBadge();
                    updateReplicationCode();
                }
            }
            
            const tool = state.activeTool;
            
            // Toggle label option input forms
            elements.customLetterContainer.classList.toggle('hidden', tool !== 'label-letter');
            elements.customNumberContainer.classList.toggle('hidden', tool !== 'label-number');
            elements.customTextContainer.classList.toggle('hidden', tool !== 'label-text');
            elements.customPlayContainer.classList.toggle('hidden', tool !== 'play-b' && tool !== 'play-w');
            
            if (tool === 'play-b') {
                state.playSeq.currentColor = 'B';
                state.playSeq.number = parseInt(elements.customPlayInput.value, 10) || 1;
            } else if (tool === 'play-w') {
                state.playSeq.currentColor = 'W';
                state.playSeq.number = parseInt(elements.customPlayInput.value, 10) || 1;
            }

            // Auto-enable "show move numbers" while a play tool is active (GoWrite-style
            // numbers on played stones), restoring the prior setting when switching away.
            if (tool === 'play-b' || tool === 'play-w') {
                state._prevDisplayMoveNumbers = state.displayMoveNumbers;
                state.displayMoveNumbers = true;
            } else if (state._prevDisplayMoveNumbers !== undefined) {
                state.displayMoveNumbers = state._prevDisplayMoveNumbers;
                state._prevDisplayMoveNumbers = undefined;
            }
            if (elements.toggleMoveNumbers) elements.toggleMoveNumbers.checked = state.displayMoveNumbers;
            if (elements.moveNumbersOptions) {
                elements.moveNumbersOptions.style.display = state.displayMoveNumbers ? 'flex' : 'none';
            }
            
            drawBoard();
        });
    });

    const btnCropLock = document.getElementById('btn-crop-lock');
    if (btnCropLock) {
        btnCropLock.addEventListener('click', (e) => {
            e.stopPropagation();
            state.cropLocked = !state.cropLocked;
            document.getElementById('icon-crop-unlocked').style.display = state.cropLocked ? 'none' : 'block';
            document.getElementById('icon-crop-locked').style.display = state.cropLocked ? 'block' : 'none';
            btnCropLock.style.backgroundColor = state.cropLocked ? '#fef3c7' : '';
            btnCropLock.style.borderColor = state.cropLocked ? '#f59e0b' : '';
            drawBoard();
        });
    }

    // Custom label text inputs
    elements.customLetterInput.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '') || 'A';
        state.customLetter = val.charAt(0);
        elements.customLetterInput.value = state.customLetter;
        elements.toolLetterPreview.textContent = state.customLetter.toLowerCase();
        window.updateResetBtnVisibility();
    });

    elements.customNumberInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 99) val = 99;
        state.customNumber = val;
        elements.toolNumberPreview.textContent = state.customNumber;
        window.updateResetBtnVisibility();
    });

    // Reset value buttons
    window.updateResetBtnVisibility = function() {
        if (elements.resetLetterBtn) elements.resetLetterBtn.style.display = state.customLetter !== 'A' ? 'inline' : 'none';
        if (elements.resetNumberBtn) elements.resetNumberBtn.style.display = state.customNumber !== 1 ? 'inline' : 'none';
    };
    if (elements.resetLetterBtn) {
        elements.resetLetterBtn.addEventListener('click', function() {
            state.customLetter = 'A';
            elements.customLetterInput.value = 'A';
            if (elements.toolLetterPreview) elements.toolLetterPreview.textContent = 'a';
            window.updateResetBtnVisibility();
        });
    }
    if (elements.resetNumberBtn) {
        elements.resetNumberBtn.addEventListener('click', function() {
            state.customNumber = 1;
            elements.customNumberInput.value = 1;
            if (elements.toolNumberPreview) elements.toolNumberPreview.textContent = '1';
            window.updateResetBtnVisibility();
        });
    }
    window.updateResetBtnVisibility();
    elements.customTextInput.addEventListener('input', (e) => {
        state.customText = e.target.value.substring(0, 8);
        elements.customTextInput.value = state.customText;
    });

    elements.customPlayInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        state.playSeq.number = val;
        if (state.activeTool === 'play-b') state.playSeq.currentColor = 'B';
        if (state.activeTool === 'play-w') state.playSeq.currentColor = 'W';
    });

    // Reset Crop Selection
    elements.btnResetCrop.addEventListener('click', () => {
        saveHistoryState();
        state.crop = { colStart: 9, colEnd: 9, rowStart: 9, rowEnd: 9 };
        drawBoard();
        updateCropBadge();
        updateReplicationCode();
    });

    // Clear All Annotations
    elements.btnClearAll.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire board and annotations?')) {
            saveHistoryState();
            state.board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
                player: null,
                annotation: null,
                label: null
            })));
            
            // Clear Diagram Text State
            state.exportText.titleType = 'none';
            state.exportText.titleFree = '';
            state.exportText.comment = '';
            state.legend = { active: {}, meanings: {}, groupNumbers: true, groupLetters: true };

            // Update Diagram Text DOM Elements
            if (elements.diagTitleType) elements.diagTitleType.value = 'none';
            if (elements.diagTitleFree) elements.diagTitleFree.value = '';
            if (elements.diagTitleFreeContainer) elements.diagTitleFreeContainer.classList.add('hidden');
            if (elements.diagComment) elements.diagComment.value = '';

            drawBoard();
            updateReplicationCode();
        }
    });

    // Capture Diagram PNG
    if (elements.btnCapture) elements.btnCapture.addEventListener('click', openExportModal);
    
    // Wire export modal buttons
    const btnCloseExport = document.getElementById('btn-close-export');
    if (btnCloseExport) {
        btnCloseExport.addEventListener('click', () => {
            document.getElementById('export-modal-overlay').classList.add('hidden');
            if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
        });
    }
    
    const exportOverlay = document.getElementById('export-modal-overlay');
    if (exportOverlay) {
        exportOverlay.addEventListener('click', (e) => {
            if (e.target === exportOverlay) {
                exportOverlay.classList.add('hidden');
                if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
            }
        });
    }
    
    const btnSaveFinalPng = document.getElementById('btn-save-final-png');
    if (btnSaveFinalPng) {
        btnSaveFinalPng.addEventListener('click', () => {
            if (currentExportDataUrl && currentExportFilename) {
                triggerBrowserImageDownload(currentExportDataUrl, currentExportFilename);
                document.getElementById('export-modal-overlay').classList.add('hidden');
                if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
            }
        });
    }

    // Mouse Interaction on the Interactive Canvas
    [elements.canvasInitial, elements.canvasStudy].forEach(c => {
        if (c) {
            c.addEventListener('mousedown', handleMouseDown);
            c.addEventListener('mousemove', handleMouseMove);
            c.addEventListener('mouseleave', () => {
                if (state.hoverPoint) {
                    state.hoverPoint = null;
                    drawBoard();
                }
            });
        }
    });

    // Wheel navigation on initial board canvas (same as footer tree)
    let _boardWheelAcc = 0;
    let _boardWheelLastTime = 0;
    if (elements.canvasInitial) {
        elements.canvasInitial.addEventListener('wheel', function(e) {
            e.preventDefault();
            if (typeof goToMove !== 'function' || typeof state === 'undefined' || !state) return;
            var count = (state.sgfMoves || []).length;
            if (!count) return;

            var now = performance.now();
            if (now - _boardWheelLastTime < 120) return;

            if ((e.deltaY > 0 && _boardWheelAcc < 0) || (e.deltaY < 0 && _boardWheelAcc > 0)) {
                _boardWheelAcc = 0;
            }
            _boardWheelAcc += e.deltaY;
            var threshold = 40;
            var cur = state.currentMoveIndex;
            if (Math.abs(_boardWheelAcc) >= threshold) {
                var steps = _boardWheelAcc > 0 ? 1 : -1;
                _boardWheelAcc = 0;
                _boardWheelLastTime = now;
                goToMove(Math.max(-1, Math.min(count - 1, cur + steps)));
            }
        }, { passive: false });
    }

    window.addEventListener('mouseup', handleMouseUp);

    // Copy Code Button
    if (elements.btnCopyCode && elements.repCodeOutput) {
        elements.btnCopyCode.addEventListener('click', () => {
            const codeText = elements.repCodeOutput.value;
            if (!codeText) return;
            navigator.clipboard.writeText(codeText)
                .then(() => {
                    const prevText = elements.btnCopyCode.innerHTML;
                    elements.btnCopyCode.innerHTML = 'Copied!';
                    setTimeout(() => {
                        elements.btnCopyCode.innerHTML = prevText;
                    }, 1500);
                })
                .catch(err => {
                    console.error('Failed to copy code: ', err);
                    alert('Could not copy code. Please select and copy manually.');
                });
        });
    }

    // Save Code Button (.txt file)
    if (elements.btnSaveCode && elements.repCodeOutput) {
        elements.btnSaveCode.addEventListener('click', () => {
            const codeText = elements.repCodeOutput.value;
            if (!codeText) return;

            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            const filename = `annotation_${timestamp}.txt`;

            const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // Load Code Button
    if (elements.btnLoadCode) {
        elements.btnLoadCode.addEventListener('click', () => {
            if (elements.btnLoadCode) elements.btnLoadCode.blur(); // Prevent Enter key loop
            const codeText = elements.repCodeInput.value;
            if (!codeText) {
                alert('Please paste board code first.');
                return;
            }
            deserializeState(codeText);
        });
    }

    if (elements.btnRepPasteClipboard) {
        elements.btnRepPasteClipboard.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                elements.repCodeInput.value = text;
            } catch (err) {
                console.error('Failed to read clipboard contents: ', err);
                alert('Could not paste from clipboard. Please paste manually into the text area.');
            }
        });
    }

    if (elements.btnRepLoadSample) {
        elements.btnRepLoadSample.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.txt,.json';
            fileInput.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    elements.repCodeInput.value = ev.target.result;
                };
                reader.readAsText(file);
            };
            fileInput.click();
        });
    }
    
    // SGF Importer Tabs
    if (elements.tabUpload && elements.tabPaste) {
        elements.tabUpload.addEventListener('click', () => {
            elements.tabUpload.classList.add('active');
            elements.tabPaste.classList.remove('active');
            elements.uploadSection.classList.add('active');
            elements.pasteSection.classList.remove('active');
        });
        elements.tabPaste.addEventListener('click', () => {
            elements.tabPaste.classList.add('active');
            elements.tabUpload.classList.remove('active');
            elements.pasteSection.classList.add('active');
            elements.uploadSection.classList.remove('active');
        });
    }

    // Drag & Drop Zone
    if (elements.dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => {
                elements.dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => {
                elements.dropZone.classList.remove('dragover');
            }, false);
        });

        elements.dropZone.addEventListener('drop', async (e) => {
            const dt = e.dataTransfer;
            if (dt.items && dt.items.length > 0) {
                const item = dt.items[0];
                if (item.kind === 'file') {
                    let fileHandle = null;
                    if (item.getAsFileSystemHandle) {
                        try { fileHandle = await item.getAsFileSystemHandle(); } catch(err){}
                    }
                    const file = item.getAsFile();
                    if (file) handleFileSelect(file, fileHandle);
                }
            } else if (dt.files && dt.files.length) {
                handleFileSelect(dt.files[0]);
            }
        }, false);
    }
    
    const btnBrowse = document.querySelector('.file-label-btn');
    if (btnBrowse && window.showOpenFilePicker) {
        btnBrowse.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'SGF File',
                        accept: {'application/x-go-sgf': ['.sgf', '.txt']},
                    }],
                    multiple: false
                });
                const file = await fileHandle.getFile();
                handleFileSelect(file, fileHandle);
            } catch (err) {
                // AbortError is thrown when user cancels the picker, ignore it
            }
        });
    }

    // File Input
    if (elements.sgfFileInput) {
        elements.sgfFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function closeKifuModal() {
        if (elements.kifuModalOverlay) {
            elements.kifuModalOverlay.style.display = 'none';
            elements.kifuModalOverlay.classList.add('hidden');
        }
    }

    // Kifu Modal Drop Zone — wired dynamically after each render
    function wireKifuDropZone() {
        const dz = document.getElementById('kifu-drop-zone');
        const fi = document.getElementById('kifu-file-input');
        if (!dz) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });
        ['dragenter', 'dragover'].forEach(evt => {
            dz.addEventListener(evt, () => dz.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(evt => {
            dz.addEventListener(evt, () => dz.classList.remove('dragover'), false);
        });
        dz.addEventListener('drop', async (e) => {
            const dt = e.dataTransfer;
            let file = null;
            let fileHandle = null;
            if (dt.items && dt.items.length > 0) {
                const item = dt.items[0];
                if (item.kind === 'file') {
                    if (item.getAsFileSystemHandle) {
                        try { fileHandle = await item.getAsFileSystemHandle(); } catch(err){}
                    }
                    file = item.getAsFile();
                }
            } else if (dt.files && dt.files.length) {
                file = dt.files[0];
            }
            if (file) {
                closeKifuModal();
                handleFileSelect(file, fileHandle);
            }
        }, false);
        if (fi) {
            fi.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    closeKifuModal();
                    handleFileSelect(e.target.files[0]);
                }
            });
        }
    }
    wireKifuDropZone();
    
    // ==========================================================================
    // Study Record Local Persistence Database Engine
    // ==========================================================================
    const STUDY_STORAGE_KEY = 'baduk_notes_study_sessions_v1';

    function formatStudyAccessTime(date = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }

    function showWorkingStudyToast(message) {
        let toast = document.getElementById('working-study-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'working-study-toast';
            toast.className = 'working-study-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#34d399" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
            <span>${message}</span>
        `;
        toast.style.display = 'flex';
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.style.display = 'none';
        }, 2800);
    }

    function autoSaveActiveStudySettings() {
        if (state.activeStudyId && !state.isSgfLoading && typeof StudyRecordDB !== 'undefined' && typeof captureCurrentAppSettings === 'function') {
            const rec = StudyRecordDB.getRecord(state.activeStudyId);
            if (rec) {
                if (state.currentMoveIndex !== undefined && state.currentMoveIndex >= -1) {
                    rec.currentMoveIndex = state.currentMoveIndex;
                }
                rec.settings = captureCurrentAppSettings();
            rec.lastAccess = typeof window.formatStudyAccessTime === 'function' ? window.formatStudyAccessTime() : new Date().toLocaleString();
                if (typeof SgfEngine !== 'undefined' && typeof SgfEngine.writeSgf === 'function' && state.sgfTree) {
                    try {
                        const updated = SgfEngine.writeSgf(state.sgfTree);
                        if (updated) {
                            rec.workingSgf = (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') 
                                ? SgfSanitizer.sanitize(updated) || updated 
                                : updated;
                        }
                    } catch (e) {}
                }
                StudyRecordDB.saveRecord(rec);
            }
        }
    }

    function updateSaveRecGameButton() {
        const btn = document.getElementById('btn-save-rec-game');
        const badge = document.getElementById('btn-save-rec-badge');
        if (!btn) return;
        if (state.activeStudyId) {
            btn.classList.add('visible');
            if (state.isSgfDirty) {
                btn.classList.add('dirty');
            } else {
                btn.classList.remove('dirty');
            }
            const rec = StudyRecordDB.getRecord(state.activeStudyId);
            if (rec && badge) {
                badge.textContent = rec.recNo ? `Rec_${rec.recNo}` : '';
            }
            const subtitle = document.getElementById('btn-save-rec-subtitle');
            if (subtitle) {
                const moveNum = (state.currentMoveIndex !== undefined && state.currentMoveIndex >= 0) ? state.currentMoveIndex + 1 : 0;
                subtitle.textContent = `Move ${moveNum} · ${rec ? rec.fileNm || '' : ''}`;
            }
        } else {
            btn.classList.remove('visible');
            btn.classList.remove('dirty');
        }
    }

    const btnSaveRecGame = document.getElementById('btn-save-rec-game');
    if (btnSaveRecGame) {
        btnSaveRecGame.addEventListener('click', () => {
            if (!state.activeStudyId) return;
            autoSaveActiveStudySettings();
            state.isSgfDirty = false;
            state.popupShownForCurrentChange = false;
            updateSaveRecGameButton();
            showWorkingStudyToast('Rec Game Saved');
        });
    }

    window.updateSaveRecGameButton = updateSaveRecGameButton;

    function captureCurrentAppSettings() {
        let moveNumMode = state.moveNumberMode || 'full';
        if (elements.moveNumberModeRadios) {
            for (const radio of elements.moveNumberModeRadios) {
                if (radio.checked) {
                    moveNumMode = radio.value;
                    break;
                }
            }
        }

        const countbackEl = document.getElementById('toggle-countback');
        const isFlipped = !!(state.isFlippedPov || state.isPovFlipped || state.boardFlipped);

        return {
            initialBoardStyle: state.initialBoardStyle ? JSON.parse(JSON.stringify(state.initialBoardStyle)) : null,
            studyBoardStyle: state.studyBoardStyle ? JSON.parse(JSON.stringify(state.studyBoardStyle)) : null,
            exportBoardStyle: state.exportBoardStyle ? JSON.parse(JSON.stringify(state.exportBoardStyle)) : null,
            replayer: {
                showMoveNumbers: elements.toggleMoveNumbers ? elements.toggleMoveNumbers.checked : false,
                moveNumberMode: moveNumMode,
                asCoord: elements.toggleMoveCoord ? elements.toggleMoveCoord.checked : false,
                lastNMoves: elements.inputLastNMoves ? elements.inputLastNMoves.value : '2',
                countback: countbackEl ? countbackEl.checked : false,
                nextMoveHint: elements.toggleNextMoveHint ? elements.toggleNextMoveHint.checked : false,
                isFlippedPov: isFlipped
            }
        };
    }

    function applyAppSettings(settings) {
        if (!settings) return;

        // 1. Restore floating panel style settings
        if (settings.initialBoardStyle) {
            state.initialBoardStyle = JSON.parse(JSON.stringify(settings.initialBoardStyle));
            localStorage.setItem('baduk_initial_board_style', JSON.stringify(state.initialBoardStyle));
        }
        if (settings.studyBoardStyle) {
            state.studyBoardStyle = JSON.parse(JSON.stringify(settings.studyBoardStyle));
            localStorage.setItem('baduk_study_board_style', JSON.stringify(state.studyBoardStyle));
        }
        if (settings.exportBoardStyle) {
            state.exportBoardStyle = JSON.parse(JSON.stringify(settings.exportBoardStyle));
            localStorage.setItem('baduk_export_board_style', JSON.stringify(state.exportBoardStyle));
        }

        if (typeof updateCustomPanelUI === 'function') {
            try { updateCustomPanelUI(); } catch (e) {}
        }

        // 2. Restore SGF replayer options
        if (settings.replayer) {
            const rep = settings.replayer;
            
            // Explicitly set state variables
            state.displayMoveNumbers = !!rep.showMoveNumbers;
            if (rep.moveNumberMode) state.moveNumberMode = rep.moveNumberMode;
            if (rep.asCoord !== undefined) state.showMoveCoord = !!rep.asCoord;
            if (rep.lastNMoves !== undefined) {
                let val = parseInt(rep.lastNMoves, 10);
                state.lastNMoves = isNaN(val) || val < 1 ? 2 : val;
            }
            if (rep.countback !== undefined) state.moveNumberCountback = !!rep.countback;
            if (rep.nextMoveHint !== undefined) state.showNextMoveHint = !!rep.nextMoveHint;

            if (rep.isFlippedPov !== undefined) {
                state.isFlippedPov = !!rep.isFlippedPov;
                state.isPovFlipped = !!rep.isFlippedPov;
                state.boardFlipped = !!rep.isFlippedPov;
            }

            // Sync DOM UI controls
            if (elements.toggleMoveNumbers) {
                elements.toggleMoveNumbers.checked = !!rep.showMoveNumbers;
            }

            if (elements.moveNumbersOptions) {
                elements.moveNumbersOptions.style.display = rep.showMoveNumbers ? 'flex' : 'none';
            }

            if (elements.moveNumberModeRadios) {
                for (const radio of elements.moveNumberModeRadios) {
                    radio.checked = (radio.value === rep.moveNumberMode);
                }
            }

            if (elements.nextMoveHintContainer) {
                elements.nextMoveHintContainer.style.display = 'block';
            }

            if (elements.toggleMoveCoord) {
                elements.toggleMoveCoord.checked = !!rep.asCoord;
            }

            if (elements.inputLastNMoves && rep.lastNMoves !== undefined) {
                elements.inputLastNMoves.value = rep.lastNMoves;
            }

            const countbackEl = document.getElementById('toggle-countback');
            if (countbackEl) {
                countbackEl.checked = !!rep.countback;
            }

            if (elements.toggleNextMoveHint) {
                elements.toggleNextMoveHint.checked = !!rep.nextMoveHint;
            }

            const flipBtn = document.getElementById('btn-flip-pov');
            if (flipBtn) {
                flipBtn.style.background = state.isFlippedPov ? 'rgb(139, 26, 26)' : 'rgba(139, 26, 26, 0.1)';
                flipBtn.style.color = state.isFlippedPov ? 'rgb(248, 245, 238)' : 'rgb(139, 26, 26)';
            }
        }

        if (typeof drawBoard === 'function') {
            drawBoard();
        }
    }

    const StudyRecordDB = {
        getAllRecords() {
            try {
                const raw = localStorage.getItem(STUDY_STORAGE_KEY);
                if (!raw) return [];
                const list = JSON.parse(raw);
                return Array.isArray(list) ? list : [];
            } catch (e) {
                console.error('Failed to load study records:', e);
                return [];
            }
        },

        saveRecord(record) {
            try {
                const records = this.getAllRecords();
                const idx = records.findIndex(r => r.id === record.id);
                if (idx >= 0) {
                    records[idx] = { ...records[idx], ...record };
                } else {
                    records.unshift(record);
                }
                localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(records));
                console.log(`[StudyRecordDB] saveRecord -> ID: ${record.id}, recNo: ${record.recNo}, currentMoveIndex: ${record.currentMoveIndex}`);
                return true;
            } catch (e) {
                console.error('Failed to save study record:', e);
                return false;
            }
        },

        getRecord(id) {
            const records = this.getAllRecords();
            return records.find(r => r.id === id) || null;
        },

        deleteRecord(id) {
            try {
                let records = this.getAllRecords();
                records = records.filter(r => r.id !== id);
                localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(records));
                return true;
            } catch (e) {
                console.error('Failed to delete study record:', e);
                return false;
            }
        },

        generateNextRecNo() {
            const records = this.getAllRecords();
            let maxNum = 0;
            records.forEach(r => {
                if (r.recNo) {
                    const num = parseInt(r.recNo, 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            });
            const nextNum = maxNum + 1;
            return String(nextNum).padStart(3, '0');
        }
    };
    window.StudyRecordDB = StudyRecordDB;
    window.formatStudyAccessTime = formatStudyAccessTime;
    function renderResumeStudyTable(query = '') {
        query = query.toLowerCase().trim();
        let records = StudyRecordDB.getAllRecords();
        if (query) {
            records = records.filter(r => 
                (r.fileNm && r.fileNm.toLowerCase().includes(query)) ||
                (r.blk && r.blk.toLowerCase().includes(query)) ||
                (r.wht && r.wht.toLowerCase().includes(query)) ||
                (r.recNo && r.recNo.includes(query))
            );
        }

        const badge = document.getElementById('study-count-badge');
        if (badge) badge.textContent = `${records.length} RECORDED`;

        const btnBadge = document.getElementById('btn-study-count-badge');
        if (btnBadge) {
            const allRecs = StudyRecordDB.getAllRecords();
            btnBadge.textContent = `${allRecs.length} RECORDED`;
        }

        const titleEl = document.getElementById('kifu-section-title-text');
        if (titleEl) {
            titleEl.textContent = `Tracked Go Study Sessions (${records.length} Games)`;
        }

        const tbody = elements.kifuTableBody;
        if (!tbody) return;

        if (records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding: 0; border: none;">
                        <div class="kifu-empty">
                            <svg class="kifu-empty-icon" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <!-- Shadow on floor -->
                                <ellipse cx="60" cy="84" rx="36" ry="6" fill="#EDEDEC" />
                                
                                <!-- Bottom book (Brown #7C4118) -->
                                <g transform="rotate(3, 60, 70)">
                                    <!-- Pages block -->
                                    <path d="M26 62 h68 v12 h-68 z" fill="#FFFFFF" />
                                    <path d="M26 74 h68 v1 h-68 z" fill="#FAF7EF" />
                                    <path d="M94 62 v12" stroke="#EDEDEC" stroke-width="1" />
                                    <!-- Spine & covers -->
                                    <path d="M25 60 C23 60 23 76 25 76" stroke="#7C4118" stroke-width="2.5" fill="none" />
                                    <path d="M26 60 h68 v2.2 h-68 z" fill="#7C4118" />
                                    <path d="M26 74 h68 v2.2 h-68 z" fill="#7C4118" />
                                    <path d="M25 60 h1.5 v16.2 h-1.5 z" fill="#5A2E10" />
                                </g>
                                
                                <!-- Middle book (Gold #DCB35C) -->
                                <g transform="rotate(-4, 60, 50)">
                                    <!-- Pages block -->
                                    <path d="M28 42 h68 v12 h-68 z" fill="#FFFFFF" />
                                    <path d="M28 54 h68 v1 h-68 z" fill="#FAF7EF" />
                                    <path d="M96 42 v12" stroke="#EDEDEC" stroke-width="1" />
                                    <!-- Spine & covers -->
                                    <path d="M27 40 C25 40 25 56 27 56" stroke="#DCB35C" stroke-width="2.5" fill="none" />
                                    <path d="M28 40 h68 v2.2 h-68 z" fill="#DCB35C" />
                                    <path d="M28 54 h68 v2.2 h-68 z" fill="#DCB35C" />
                                    <path d="M27 40 h1.5 v16.2 h-1.5 z" fill="#B28C38" />
                                </g>
                                
                                <!-- Top book (Teal #304E55) -->
                                <g transform="rotate(2, 60, 30)">
                                    <!-- Pages block -->
                                    <path d="M30 22 h68 v12 h-68 z" fill="#FFFFFF" />
                                    <path d="M30 34 h68 v1 h-68 z" fill="#FAF7EF" />
                                    <path d="M98 22 v12" stroke="#EDEDEC" stroke-width="1" />
                                    <!-- Spine & covers -->
                                    <path d="M29 20 C27 20 27 36 29 36" stroke="#304E55" stroke-width="2.5" fill="none" />
                                    <path d="M30 20 h68 v2.2 h-68 z" fill="#304E55" />
                                    <path d="M30 34 h68 v2.2 h-68 z" fill="#304E55" />
                                    <path d="M29 20 h1.5 v16.2 h-1.5 z" fill="#1E3237" />
                                </g>
                            </svg>
                            <p class="kifu-empty-title">No Study Sessions Recorded Yet</p>
                            <p class="kifu-empty-desc">Drop or upload an SGF file into baduk-notes,<br>and click “Record Game to Study Sessions”<br>to track your progress and resume anytime!</p>
                        </div>
                    </td>
                </tr>
            `;
            wireKifuDropZone();
            return;
        }

        let html = '';
        records.forEach(rec => {
            const maxMoves = rec.totalMoves > 0 ? rec.totalMoves : 1;
            const currentPos = Math.max(0, (rec.currentMoveIndex !== undefined ? rec.currentMoveIndex : 0));
            const effectiveTotal = (state.activeStudyId === rec.id && state.allSgfMoves && state.allSgfMoves.length > 0)
                ? state.allSgfMoves.length
                : maxMoves;
            const percent = Math.min(100, Math.round(((currentPos + 1) / effectiveTotal) * 100));
            const isActive = state.activeStudyId === rec.id;

            const statusClass = isActive ? 'kifu-status-active' : 'kifu-status-idle';
            const statusLabel = isActive ? 'Active' : 'Idle';

            html += `
                <tr class="kifu-row ${isActive ? 'active' : ''}" data-id="${rec.id}">
                    <td class="kifu-td kifu-td-rec">${rec.recNo || '001'}</td>
                    <td class="kifu-td kifu-td-filename" title="${rec.fileNm}">${rec.fileNm}</td>
                    <td class="kifu-td"><span class="kifu-dot-black"></span>${rec.blk}</td>
                    <td class="kifu-td"><span class="kifu-dot-white"></span>${rec.wht}</td>
                    <td class="kifu-td kifu-td-date">${(rec.lastAccess || '').replace(' | ', ' ')}</td>
                    <td class="kifu-td" style="text-align: center;">
                        <div class="kifu-progress">
                            <div class="kifu-progress-bar"><div class="kifu-progress-fill" style="width: ${percent}%;"></div></div>
                            <span class="kifu-progress-pct">${percent}%</span>
                        </div>
                    </td>
                    <td class="kifu-td" style="text-align: center; white-space: nowrap;">
                        <button class="kifu-btn kifu-btn-resume btn-resume-row" data-id="${rec.id}">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Resume
                        </button>
                        <button class="kifu-btn kifu-btn-export btn-export-row" data-id="${rec.id}" title="Export SGF">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                        <button class="kifu-btn kifu-btn-code btn-code-row" data-id="${rec.id}" title="View SGF Code"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g id="SVGRepo_bgCarrier"><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M8.50226 5.38707C8.81015 5.10997 8.8351 4.63576 8.55801 4.32787C8.28092 4.01999 7.8067 3.99503 7.49882 4.27213L5.76133 5.83587C5.02499 6.49853 4.41418 7.04822 3.99477 7.54679C3.55374 8.07104 3.24023 8.6343 3.24023 9.3296C3.24023 10.0249 3.55374 10.5882 3.99477 11.1124C4.41418 11.611 5.02498 12.1607 5.76132 12.8233L7.49882 14.3871C7.8067 14.6642 8.28092 14.6392 8.55801 14.3313C8.8351 14.0234 8.81015 13.5492 8.50226 13.2721L6.80579 11.7453C6.01792 11.0362 5.48672 10.5558 5.14262 10.1468C4.81237 9.7542 4.74023 9.52502 4.74023 9.3296C4.74023 9.13417 4.81237 8.90499 5.14262 8.51241C5.48672 8.10338 6.01792 7.62298 6.80579 6.91389L8.50226 5.38707Z" fill="#1C274C"></path> <path d="M15.443 10.4983C15.7201 10.1904 16.1943 10.1654 16.5022 10.4425L18.2397 12.0063C18.976 12.6689 19.5868 13.2186 20.0063 13.7172C20.4473 14.2415 20.7608 14.8047 20.7608 15.5C20.7608 16.1953 20.4473 16.7586 20.0063 17.2828C19.5868 17.7814 18.976 18.3311 18.2397 18.9937L16.5022 20.5575C16.1943 20.8346 15.7201 20.8096 15.443 20.5017C15.1659 20.1938 15.1909 19.7196 15.4988 19.4425L17.1952 17.9157C17.9831 17.2066 18.5143 16.7262 18.8584 16.3172C19.1887 15.9246 19.2608 15.6954 19.2608 15.5C19.2608 15.3046 19.1887 15.0754 18.8584 14.6828C18.5143 14.2738 17.9831 13.7934 17.1952 13.0843L15.4988 11.5575C15.1909 11.2804 15.1659 10.8062 15.443 10.4983Z" fill="#1C274C"></path> <path opacity="0.5" d="M14.1797 4.27511C14.58 4.38151 14.8182 4.79228 14.7118 5.19259L10.725 20.1926C10.6186 20.5929 10.2078 20.8312 9.80753 20.7248C9.40722 20.6184 9.16895 20.2076 9.27535 19.8073L13.2622 4.80729C13.3686 4.40697 13.7793 4.16871 14.1797 4.27511Z" fill="#1C274C"></path> </g></g></svg></button>
                        <button class="kifu-btn kifu-btn-scoring btn-scoring-row" data-id="${rec.id}" title="${rec.scoringData ? 'Resume Scoring' : 'Start Scoring'}">
                            ${rec.scoringData
                                ? `<svg width="12" height="12" viewBox="0 0 32 32" fill="#029cf5" xmlns="http://www.w3.org/2000/svg"><defs><style>.btn-score-bg{fill:none}</style></defs><rect x="20" y="18" width="2" height="2"/><rect x="28" y="16" width="2" height="2"/><rect x="14" y="6" width="2" height="2"/><path d="M16,22H12V16a2.0023,2.0023,0,0,0-2-2H4a2.0023,2.0023,0,0,0-2,2v6a2.0023,2.0023,0,0,0,2,2h6v4a2.0023,2.0023,0,0,0,2,2h4a2.0023,2.0023,0,0,0,2-2V24A2.0023,2.0023,0,0,0,16,22ZM4,22V16h6v6Zm8,6V24h4v4Z"/><path d="M28,30H24a2.0021,2.0021,0,0,1-2-2V24a2.0021,2.0021,0,0,1,2-2h4a2.0021,2.0021,0,0,1,2,2v4A2.0021,2.0021,0,0,1,28,30Zm-4-6v4h4V24Z"/><path d="M28,2H22a2.0023,2.0023,0,0,0-2,2v6H18a2.0023,2.0023,0,0,0-2,2v2a2.0023,2.0023,0,0,0,2,2h2a2.0023,2.0023,0,0,0,2-2V12h6a2.0023,2.0023,0,0,0,2-2V4A2.0023,2.0023,0,0,0,28,2ZM18,14V12h2v2Zm4-4V4h6v6Z"/><path d="M8,10H4A2.0021,2.0021,0,0,1,2,8V4A2.0021,2.0021,0,0,1,4,2H8a2.0021,2.0021,0,0,1,2,2V8A2.0021,2.0021,0,0,1,8,10ZM4,4V8H8V4Z"/><rect class="btn-score-bg" width="32" height="32"/></svg>`
                                : `<svg width="12" height="12" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="opacity:0.3"><defs><style>.btn-score-bg{fill:none}</style></defs><rect x="20" y="18" width="2" height="2"/><rect x="28" y="16" width="2" height="2"/><rect x="14" y="6" width="2" height="2"/><path d="M16,22H12V16a2.0023,2.0023,0,0,0-2-2H4a2.0023,2.0023,0,0,0-2,2v6a2.0023,2.0023,0,0,0,2,2h6v4a2.0023,2.0023,0,0,0,2,2h4a2.0023,2.0023,0,0,0,2-2V24A2.0023,2.0023,0,0,0,16,22ZM4,22V16h6v6Zm8,6V24h4v4Z"/><path d="M28,30H24a2.0021,2.0021,0,0,1-2-2V24a2.0021,2.0021,0,0,1,2-2h4a2.0021,2.0021,0,0,1,2,2v4A2.0021,2.0021,0,0,1,28,30Zm-4-6v4h4V24Z"/><path d="M28,2H22a2.0023,2.0023,0,0,0-2,2v6H18a2.0023,2.0023,0,0,0-2,2v2a2.0023,2.0023,0,0,0,2,2h2a2.0023,2.0023,0,0,0,2-2V12h6a2.0023,2.0023,0,0,0,2-2V4A2.0023,2.0023,0,0,0,28,2ZM18,14V12h2v2Zm4-4V4h6v6Z"/><path d="M8,10H4A2.0021,2.0021,0,0,1,2,8V4A2.0021,2.0021,0,0,1,4,2H8a2.0021,2.0021,0,0,1,2,2V8A2.0021,2.0021,0,0,1,8,10ZM4,4V8H8V4Z"/><rect class="btn-score-bg" width="32" height="32"/></svg>`}
                        </button>
                        <button class="kifu-btn kifu-btn-delete btn-delete-row" data-id="${rec.id}" title="Delete Session">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        tbody.querySelectorAll('.kifu-row').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.getAttribute('data-id');
                resumeStudySession(id);
            });
        });

        tbody.querySelectorAll('.btn-resume-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                resumeStudySession(id);
            });
        });

        tbody.querySelectorAll('.btn-export-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                exportStudySessionSgf(id);
            });
        });

        tbody.querySelectorAll('.btn-code-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                openSgfCodeViewerModal(id);
            });
        });

        tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const rec = StudyRecordDB.getRecord(id);
                if (rec && confirm(`Delete study session ${rec.recNo} (${rec.fileNm})?`)) {
                    StudyRecordDB.deleteRecord(id);
                    if (state.activeStudyId === id) state.activeStudyId = null;
                    renderResumeStudyTable(elements.kifuSearchInput ? elements.kifuSearchInput.value : '');
                }
            });
        });

        tbody.querySelectorAll('.btn-scoring-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                elements.kifuModalOverlay.style.display = 'none';
                elements.kifuModalOverlay.classList.add('hidden');
                resumeStudySession(id, true);
            });
        });
    }

    function exportStudySessionSgf(id) {
        const rec = StudyRecordDB.getRecord(id);
        if (!rec || !rec.workingSgf) {
            alert('No SGF data found for this study session.');
            return;
        }
        let baseName = rec.fileNm || 'game.sgf';
        if (baseName.toLowerCase().endsWith('.sgf')) {
            baseName = baseName.slice(0, -4);
        }
        const exportFilename = `${baseName}—${rec.recNo}.sgf`;
        let cleanSgf = rec.workingSgf;

        // SSOT sync: the saved scoring session is the canonical source for DD/MA/TB/TW. When
        // the stored workingSgf is missing any of the session-derived scoring props (legacy
        // records, or saves predating manualTerritory persistence), inject the canonical values
        // into the terminal node so the downloaded file always matches the session.
        if (rec.scoringData) {
            const props = computeSgfPropsFromScoringData(rec.scoringData);
            if (props && !hasAllSgfScoringProps(cleanSgf, props)) {
                cleanSgf = injectSgfScoringPropsIntoTerminalNode(cleanSgf, props);
            }
        }

        if (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') {
            cleanSgf = SgfSanitizer.sanitize(cleanSgf) || cleanSgf;
        } else if (typeof SgfEngine !== 'undefined' && typeof SgfEngine.sanitize === 'function') {
            cleanSgf = SgfEngine.sanitize(cleanSgf) || cleanSgf;
        }
        const blob = new Blob([cleanSgf], { type: 'application/x-go-sgf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showWorkingStudyToast(`Exported ${exportFilename}`);
    }

    let _activeCodeViewerRecordId = null;
    let _sgfCodeWordWrapOn = false;
    let _sgfCodeCommentsOn = true;
    let _isEditingSgfCode = false;
    let _sgfCodeOriginalText = '';

    function updateSgfEditorUIState(isEditing, isDirty) {
        const btnEdit = document.getElementById('btn-edit-sgf-code');
        const btnDiscard = document.getElementById('btn-discard-sgf-code');
        const historyCtrls = document.getElementById('sgf-editor-history-controls');
        const dirtyBadge = document.getElementById('sgf-code-dirty-badge');
        const contentEl = document.getElementById('sgf-code-text-content');

        if (dirtyBadge) {
            dirtyBadge.style.display = isDirty ? 'inline-flex' : 'none';
        }

        // In view mode the highlighted layer is the scroll container (pointer-events auto);
        // in edit mode the textarea takes over scrolling (content layer stays inert).
        if (contentEl) contentEl.style.pointerEvents = isEditing ? 'none' : 'auto';

        if (isEditing) {
            if (btnEdit) {
                btnEdit.textContent = 'Save Changes';
                btnEdit.style.background = '#10b981';
                btnEdit.style.color = '#ffffff';
            }
            if (btnDiscard) btnDiscard.style.display = 'inline-block';
            if (historyCtrls) historyCtrls.style.display = 'flex';
        } else {
            if (btnEdit) {
                btnEdit.textContent = 'Edit';
                btnEdit.style.background = 'rgba(16,185,129,0.18)';
                btnEdit.style.color = '#34d399';
            }
            if (btnDiscard) btnDiscard.style.display = 'none';
            if (historyCtrls) historyCtrls.style.display = 'none';
        }

        const btnComments = document.getElementById('btn-toggle-sgf-comments');
        if (btnComments) {
            if (isEditing) {
                btnComments.style.opacity = '0.4';
                btnComments.style.pointerEvents = 'none';
                btnComments.title = 'Comments shown while editing';
            } else {
                btnComments.style.opacity = '1';
                btnComments.style.pointerEvents = 'auto';
                applySgfCommentsButtonState();
            }
        }
    }

    function openSgfCodeViewerModal(id) {
        _activeCodeViewerRecordId = id;
        _isEditingSgfCode = false;

        const rec = StudyRecordDB.getRecord(id);
        if (!rec || !rec.workingSgf) {
            alert('No SGF data found for this study session.');
            return;
        }

        let cleanSgf = rec.workingSgf;

        // SSOT sync: the saved scoring session is the canonical source for DD/MA/TB/TW. When
        // the stored workingSgf is missing any of the session-derived scoring props (legacy
        // records, or saves predating manualTerritory persistence), inject the canonical values
        // into the terminal node so the code viewer always matches the session.
        if (rec.scoringData) {
            const props = computeSgfPropsFromScoringData(rec.scoringData);
            if (props && !hasAllSgfScoringProps(cleanSgf, props)) {
                cleanSgf = injectSgfScoringPropsIntoTerminalNode(cleanSgf, props);
            }
        }

        if (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') {
            cleanSgf = SgfSanitizer.sanitize(cleanSgf) || cleanSgf;
        } else if (typeof SgfEngine !== 'undefined' && typeof SgfEngine.sanitize === 'function') {
            cleanSgf = SgfEngine.sanitize(cleanSgf) || cleanSgf;
        }

        _sgfCodeOriginalText = cleanSgf;

        const lineNumsEl = document.getElementById('sgf-code-line-numbers');
        const contentEl  = document.getElementById('sgf-code-text-content');
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const overlay    = document.getElementById('sgf-code-modal-overlay');

        renderSgfCodeDisplay(0, 0);

        if (textareaEl) {
            textareaEl.value = cleanSgf;
            textareaEl.style.display = 'none';
        }

        updateSgfEditorUIState(false, false);

        // Attach scroll sync listeners
        if (contentEl) {
            contentEl.onscroll = () => {
                if (lineNumsEl) lineNumsEl.scrollTop = contentEl.scrollTop;
            };
        }
        if (textareaEl) {
            textareaEl.onscroll = () => {
                if (contentEl) {
                    contentEl.scrollTop = textareaEl.scrollTop;
                    contentEl.scrollLeft = textareaEl.scrollLeft;
                }
                if (lineNumsEl) lineNumsEl.scrollTop = textareaEl.scrollTop;
            };
            textareaEl.oninput = () => {
                handleSgfTextareaInput();
            };
        }

        // Apply word wrap status
        applyWordWrapStyle();

        // Setup Copy Code button
        const btnCopy = document.getElementById('btn-copy-sgf-code');
        if (btnCopy) {
            btnCopy.onclick = () => {
                const currentText = getSgfDisplayText();
                navigator.clipboard.writeText(currentText).then(() => {
                    const oldText = btnCopy.textContent;
                    btnCopy.textContent = 'Copied!';
                    btnCopy.style.background = 'rgba(16,185,129,0.35)';
                    setTimeout(() => {
                        btnCopy.textContent = oldText;
                        btnCopy.style.background = 'rgba(255,255,255,0.06)';
                    }, 1500);
                });
            };
        }

        // The goban color palettes apply to a board, which is not present in this modal; make them unavailable
        if (typeof customPanelState !== 'undefined') customPanelState.visible = false;
        if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
        const paletteFab = document.getElementById('fab-toggle-floating');
        if (paletteFab) paletteFab.style.display = 'none';

        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';
        }

        setTimeout(() => syncLineNumberHeights(), 50);
    }

    function handleSgfTextareaInput() {
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const contentEl  = document.getElementById('sgf-code-text-content');
        const lineNumsEl = document.getElementById('sgf-code-line-numbers');
        if (!textareaEl) return;

        const val = textareaEl.value;
        const highlighted = highlightSgfCode(val);

        if (contentEl) {
            contentEl.innerHTML = highlighted.codeHtml;
            contentEl.scrollTop = textareaEl.scrollTop;
            contentEl.scrollLeft = textareaEl.scrollLeft;
        }
        if (lineNumsEl) {
            lineNumsEl.innerHTML = highlighted.lineNumbersHtml;
            lineNumsEl.scrollTop = textareaEl.scrollTop;
        }

        const isDirty = val !== _sgfCodeOriginalText;
        const dirtyBadge = document.getElementById('sgf-code-dirty-badge');
        if (dirtyBadge) dirtyBadge.style.display = isDirty ? 'inline-flex' : 'none';

        syncLineNumberHeights();
    }

    function closeSgfCodeViewerModal() {
        const overlay = document.getElementById('sgf-code-modal-overlay');
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.add('hidden');
        }
        if (textareaEl) textareaEl.style.display = 'none';
        _isEditingSgfCode = false;
        updateSgfEditorUIState(false, false);

        const paletteFab = document.getElementById('fab-toggle-floating');
        if (paletteFab) paletteFab.style.display = '';
    }

    function applyWordWrapStyle() {
        const contentEl  = document.getElementById('sgf-code-text-content');
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const btnWrap    = document.getElementById('btn-toggle-sgf-word-wrap');

        const ICON_WRAP_ON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M3 12h15a3 3 0 1 1 0 6h-4"></path><polyline points="16 16 14 18 16 20"></polyline><path d="M3 18h9"></path></svg>';
        const ICON_WRAP_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>';

        if (_sgfCodeWordWrapOn) {
            if (contentEl) {
                contentEl.style.whiteSpace = 'pre-wrap';
                contentEl.style.wordBreak = 'break-all';
                contentEl.style.overflowX = 'hidden';
            }
            if (textareaEl) {
                textareaEl.style.whiteSpace = 'pre-wrap';
                textareaEl.style.wordBreak = 'break-all';
                textareaEl.style.overflowX = 'hidden';
            }
            if (btnWrap) {
                btnWrap.style.background = 'rgba(16,185,129,0.3)';
                btnWrap.innerHTML = ICON_WRAP_ON;
                btnWrap.title = 'Word Wrap: ON — click to turn off';
            }
        } else {
            if (contentEl) {
                contentEl.style.whiteSpace = 'pre';
                contentEl.style.wordBreak = 'normal';
                contentEl.style.overflowX = 'auto';
            }
            if (textareaEl) {
                textareaEl.style.whiteSpace = 'pre';
                textareaEl.style.wordBreak = 'normal';
                textareaEl.style.overflowX = 'auto';
            }
            if (btnWrap) {
                btnWrap.style.background = 'rgba(255,255,255,0.06)';
                btnWrap.innerHTML = ICON_WRAP_OFF;
                btnWrap.title = 'Word Wrap: OFF — click to turn on';
            }
        }

        syncLineNumberHeights();
    }

    function toggleSgfCodeWordWrap() {
        _sgfCodeWordWrapOn = !_sgfCodeWordWrapOn;
        window._sgfWordWrapOn = _sgfCodeWordWrapOn;
        applyWordWrapStyle();
    }

    function stripSgfComments(raw) {
        if (!raw || typeof raw !== 'string') return raw;
        const n = raw.length;
        let out = '';
        let i = 0;
        while (i < n) {
            let j = i;
            while (j < n && /[A-Za-z]/.test(raw[j])) j++;
            const prop = raw.slice(i, j);
            if (prop && raw[j] === '[') {
                if (prop === 'C') {
                    let k = j + 1;
                    while (k < n) {
                        if (raw[k] === '\\') { k += 2; continue; }
                        if (raw[k] === ']') break;
                        k++;
                    }
                    if (k < n) {
                        out += 'C[]';
                        i = k + 1;
                        continue;
                    }
                } else {
                    let k = j + 1;
                    while (k < n) {
                        if (raw[k] === '\\') { k += 2; continue; }
                        if (raw[k] === ']') break;
                        k++;
                    }
                    if (k < n) {
                        out += raw.slice(i, k + 1);
                        i = k + 1;
                        continue;
                    }
                    out += prop + '[';
                    i = j + 1;
                    continue;
                }
            }
            if (j > i) {
                out += prop;
                i = j;
                continue;
            }
            out += raw[i];
            i++;
        }
        return out;
    }

    function getSgfDisplayText() {
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const base = (_isEditingSgfCode && textareaEl) ? textareaEl.value : _sgfCodeOriginalText;
        return _sgfCodeCommentsOn ? base : stripSgfComments(base);
    }

    function renderSgfCodeDisplay(scrollTop, scrollLeft) {
        const text = getSgfDisplayText();
        const highlighted = highlightSgfCode(text);
        const lineNumsEl = document.getElementById('sgf-code-line-numbers');
        const contentEl  = document.getElementById('sgf-code-text-content');
        if (lineNumsEl) lineNumsEl.innerHTML = highlighted.lineNumbersHtml;
        if (contentEl) {
            contentEl.innerHTML = highlighted.codeHtml;
            contentEl.style.display = 'block';
            if (scrollTop !== undefined) contentEl.scrollTop = scrollTop;
            if (scrollLeft !== undefined) contentEl.scrollLeft = scrollLeft;
        }
        syncLineNumberHeights();
    }

    function applySgfCommentsButtonState() {
        const btn = document.getElementById('btn-toggle-sgf-comments');
        if (!btn) return;
        const ICON_COMMENTS_ON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        const ICON_COMMENTS_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="3" y1="3" x2="21" y2="21"></line></svg>';
        if (_sgfCodeCommentsOn) {
            btn.style.background = 'rgba(16,185,129,0.3)';
            btn.innerHTML = ICON_COMMENTS_ON;
            btn.title = 'Comments: ON - click to hide';
        } else {
            btn.style.background = 'rgba(255,255,255,0.06)';
            btn.innerHTML = ICON_COMMENTS_OFF;
            btn.title = 'Comments: OFF - click to show';
        }
    }

    function toggleSgfComments() {
        _sgfCodeCommentsOn = !_sgfCodeCommentsOn;
        window._sgfCommentsOn = _sgfCodeCommentsOn;
        applySgfCommentsButtonState();
        if (!_isEditingSgfCode) {
            renderSgfCodeDisplay();
        }
    }

    function syncLineNumberHeights() {
        const contentEl = document.getElementById('sgf-code-text-content');
        if (!contentEl) return;

        const lineEls = contentEl.querySelectorAll('.sgf-code-line');
        const numEls  = document.querySelectorAll('#sgf-code-line-numbers .sgf-line-num');

        lineEls.forEach((lineEl, idx) => {
            if (numEls[idx]) {
                if (_sgfCodeWordWrapOn) {
                    const h = lineEl.getBoundingClientRect().height;
                    numEls[idx].style.height = `${h}px`;
                    numEls[idx].style.lineHeight = `${h}px`;
                } else {
                    numEls[idx].style.height = '1.6em';
                    numEls[idx].style.lineHeight = '1.6em';
                }
            }
        });
    }

    function toggleSgfCodeEditMode() {
        if (!_activeCodeViewerRecordId) return;

        const contentEl  = document.getElementById('sgf-code-text-content');
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const btnEdit    = document.getElementById('btn-edit-sgf-code');
        const rec        = StudyRecordDB.getRecord(_activeCodeViewerRecordId);

        if (!_isEditingSgfCode) {
            // Enter Edit Mode
            _isEditingSgfCode = true;
            if (contentEl) contentEl.style.display = 'block'; // Keep highlighted layer visible underneath!
            if (textareaEl) {
                textareaEl.style.display = 'block';
                textareaEl.style.color = 'transparent';
                textareaEl.style.caretColor = '#34d399';
                textareaEl.focus();
                if (contentEl) {
                    // Carry over the view-mode scroll position so editing starts where the user was looking
                    textareaEl.scrollTop = contentEl.scrollTop;
                    textareaEl.scrollLeft = contentEl.scrollLeft;
                }
            }
            handleSgfTextareaInput();
            const isDirty = textareaEl ? (textareaEl.value !== _sgfCodeOriginalText) : false;
            updateSgfEditorUIState(true, isDirty);
        } else {
            // Save Changes Mode
            if (!rec || !textareaEl) return;
            const newSgfText = textareaEl.value;

            // Save inside rec.workingSgf and persist to IndexedDB
            rec.workingSgf = newSgfText;
            StudyRecordDB.saveRecord(rec);
            _sgfCodeOriginalText = newSgfText;

            // If this is the currently active study session in memory, update memory state
            if (state && state.activeStudyId === rec.id) {
                state.rawSgf = newSgfText;
                if (typeof parseSgf === 'function') {
                    state.sgfTree = parseSgf(newSgfText);
                }
            }

            // Re-render highlighted view
            renderSgfCodeDisplay(0, 0);
            textareaEl.style.display = 'none';

            _isEditingSgfCode = false;
            updateSgfEditorUIState(false, false);

            if (btnEdit) {
                btnEdit.textContent = 'Saved!';
                btnEdit.style.background = 'rgba(16,185,129,0.35)';
                btnEdit.style.color = '#34d399';
                setTimeout(() => {
                    btnEdit.textContent = 'Edit';
                    btnEdit.style.background = 'rgba(16,185,129,0.18)';
                }, 1500);
            }

            showWorkingStudyToast('Saved changes to SGF record!');
            syncLineNumberHeights();
        }
    }

    function discardSgfCodeChanges() {
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        const contentEl = document.getElementById('sgf-code-text-content');

        if (textareaEl) {
            textareaEl.value = _sgfCodeOriginalText;
            textareaEl.style.display = 'none';
        }

        renderSgfCodeDisplay(0, 0);

        _isEditingSgfCode = false;
        updateSgfEditorUIState(false, false);
        syncLineNumberHeights();
        showWorkingStudyToast('Discarded unsaved changes');
    }

    function undoSgfCodeEdit() {
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        if (textareaEl) {
            textareaEl.focus();
            document.execCommand('undo');
            handleSgfTextareaInput();
        }
    }

    function redoSgfCodeEdit() {
        const textareaEl = document.getElementById('sgf-code-editor-textarea');
        if (textareaEl) {
            textareaEl.focus();
            document.execCommand('redo');
            handleSgfTextareaInput();
        }
    }

    function highlightSgfCode(rawSgf) {
        if (!rawSgf || typeof rawSgf !== 'string') return { lineNumbersHtml: '1', codeHtml: '' };

        const lines = rawSgf.split(/\r?\n/);
        const lineCount = lines.length;

        let lineNumbersHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            lineNumbersHtml += `<div class="sgf-line-num" data-line="${i}" style="text-align: right; padding-right: 10px; color: #4b5563; font-family: 'GoogleSansCode', 'GoogleSansCodeProp', 'Courier New', monospace; user-select: none; box-sizing: border-box; line-height: 1.6em;">${i}</div>`;
        }

        let inComment = false;
        let inValue = false;
        let escaped = false;

        let highlightedLinesHtml = lines.map((line, lineIdx) => {
            let result = '';
            let i = 0;

            while (i < line.length) {
                const ch = line[i];

                if (escaped) {
                    escaped = false;
                    const escColor = inComment ? '#ffffff' : '#e5c07b';
                    result += `<span style="color: ${escColor};">${ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
                    i++;
                    continue;
                }

                if (inValue) {
                    if (ch === '\\') {
                        escaped = true;
                        const slashColor = inComment ? '#ffffff' : '#e5c07b';
                        result += `<span style="color: ${slashColor};">\\</span>`;
                        i++;
                        continue;
                    }
                    if (ch === ']') {
                        inValue = false;
                        inComment = false;
                        result += `<span style="color: #9ca3af;">]</span>`;
                        i++;
                        continue;
                    }

                    let strVal = '';
                    while (i < line.length && line[i] !== ']' && line[i] !== '\\') {
                        strVal += line[i];
                        i++;
                    }
                    const safeStr = strVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    // CRITICAL SPEC REQUIREMENT: Whatever is INSIDE comment (C[...]) MUST be in WHITE text (#ffffff)
                    const valColor = inComment ? '#ffffff' : '#fde68a';
                    result += `<span style="color: ${valColor}; font-weight: 400;">${safeStr}</span>`;
                    continue;
                }

                if (/\s/.test(ch)) {
                    result += ch;
                    i++;
                    continue;
                }

                if (ch === '(' || ch === ')') {
                    result += `<span style="color: #34d399; font-weight: 700;">${ch}</span>`;
                    i++;
                    continue;
                }

                if (ch === ';') {
                    result += `<span style="color: #34d399; font-weight: 700;">;</span>`;
                    i++;
                    continue;
                }

                if (/[A-Za-z]/.test(ch)) {
                    let prop = '';
                    while (i < line.length && /[A-Za-z]/.test(line[i])) {
                        prop += line[i];
                        i++;
                    }
                    if (i < line.length && line[i] === '[') {
                        if (prop === 'C' || prop === 'GC') {
                            inComment = true;
                        }
                    }
                    result += `<span style="color: #34d399; font-weight: 700;">${prop}</span>`;
                    continue;
                }

                if (ch === '[') {
                    inValue = true;
                    result += `<span style="color: #9ca3af;">[</span>`;
                    i++;
                    continue;
                }

                const safeChar = ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                result += safeChar;
                i++;
            }

            return `<div class="sgf-code-line" data-line="${lineIdx + 1}" style="font-family: 'GoogleSansCode', 'GoogleSansCodeProp', 'Courier New', monospace; box-sizing: border-box; min-height: 1.6em; line-height: 1.6em;">${result || '&nbsp;'}</div>`;
        }).join('');

        return { lineNumbersHtml, codeHtml: highlightedLinesHtml };
    }

    window.openSgfCodeViewerModal  = openSgfCodeViewerModal;
    window.closeSgfCodeViewerModal = closeSgfCodeViewerModal;
    window.toggleSgfCodeWordWrap   = toggleSgfCodeWordWrap;
    window.toggleSgfComments       = toggleSgfComments;
    window.toggleSgfCodeEditMode   = toggleSgfCodeEditMode;
    window.discardSgfCodeChanges   = discardSgfCodeChanges;
    window.undoSgfCodeEdit          = undoSgfCodeEdit;
    window.redoSgfCodeEdit          = redoSgfCodeEdit;
    window.highlightSgfCode         = highlightSgfCode;

    // Click overlay background (exclusive of the modal) to exit the SGF code viewer
    const sgfCodeOverlay = document.getElementById('sgf-code-modal-overlay');
    if (sgfCodeOverlay) {
        sgfCodeOverlay.addEventListener('click', (e) => {
            if (e.target === sgfCodeOverlay) closeSgfCodeViewerModal();
        });
    }

    function hasAllSgfScoringProps(sgfStr, props) {
        if (!props) return true;
        return (!props.dd || !props.dd.length || sgfStr.includes('DD[')) &&
               (!props.ma || !props.ma.length || sgfStr.includes('MA[')) &&
               (!props.tb || !props.tb.length || sgfStr.includes('TB[')) &&
               (!props.tw || !props.tw.length || sgfStr.includes('TW['));
    }

    function injectSgfScoringPropsIntoTerminalNode(sgfStr, props) {
        if (!props) return sgfStr;
        const compFn = (typeof SgfEngine !== 'undefined' && SgfEngine.compressGoPoints) ? SgfEngine.compressGoPoints : (p => p || []);
        const dd = compFn(props.dd);
        const ma = compFn(props.ma);
        const tb = compFn(props.tb);
        const tw = compFn(props.tw);

        let propLines = [];
        if (dd.length) propLines.push('DD' + dd.map(p => `[${p}]`).join(''));
        if (ma.length) propLines.push('MA' + ma.map(p => `[${p}]`).join(''));
        if (tb.length) propLines.push('TB' + tb.map(p => `[${p}]`).join(''));
        if (tw.length) propLines.push('TW' + tw.map(p => `[${p}]`).join(''));

        if (propLines.length === 0) return sgfStr;

        const propStr = '\n\n' + propLines.join('\n');

        const lastParen = sgfStr.lastIndexOf(')');
        if (lastParen !== -1) {
            return sgfStr.substring(0, lastParen).trimEnd() + propStr + '\n\n)';
        }
        return sgfStr + propStr;
    }

    function generateCurrentSgfString() {
        const szVal = (state.boardWidth === state.boardHeight)
            ? String(state.boardWidth)
            : state.boardWidth + ':' + state.boardHeight;

        const rootProps = {
            GM: ['1'],
            FF: ['4'],
            CA: ['UTF-8'],
            SZ: [szVal],
            AP: ['Go Diagram Annotator:4.0']
        };

        if (state.sgfMetadata.pb) rootProps.PB = [state.sgfMetadata.pb];
        if (state.sgfMetadata.pw) rootProps.PW = [state.sgfMetadata.pw];
        if (state.sgfMetadata.br) rootProps.BR = [state.sgfMetadata.br];
        if (state.sgfMetadata.wr) rootProps.WR = [state.sgfMetadata.wr];
        if (state.sgfMetadata.re) rootProps.RE = [state.sgfMetadata.re];
        if (state.sgfMetadata.dt) rootProps.DT = [state.sgfMetadata.dt];
        if (state.sgfMetadata.ev) rootProps.EV = [state.sgfMetadata.ev];
        if (state.sgfMetadata.pc) rootProps.PC = [state.sgfMetadata.pc];
        if (state.sgfMetadata.gn) rootProps.GN = [state.sgfMetadata.gn];
        if (state.sgfMetadata.km) rootProps.KM = [state.sgfMetadata.km];
        if (state.sgfMetadata.ru) rootProps.RU = [state.sgfMetadata.ru];
        if (state.sgfMetadata.ha) rootProps.HA = [state.sgfMetadata.ha];
        if (state.sgfMetadata.tm) rootProps.TM = [state.sgfMetadata.tm];
        if (state.sgfMetadata.ot) rootProps.OT = [state.sgfMetadata.ot];
        if (state.sgfMetadata.so) rootProps.SO = [state.sgfMetadata.so];
        if (state.sgfMetadata.an) rootProps.AN = [state.sgfMetadata.an];
        if (state.sgfMetadata.cp) rootProps.CP = [state.sgfMetadata.cp];
        if (state.sgfMetadata.us) rootProps.US = [state.sgfMetadata.us];

        if (state.baselineComment) {
            rootProps.C = [state.baselineComment];
        } else if (state.sgfMetadata.gc) {
            rootProps.GC = [state.sgfMetadata.gc];
        }

    const setupBoard = state.setupBoard || state.baselineBoard || createEmptyBoardGrid();
        if (setupBoard) {
            const ab = [], aw = [];
            for (let r = 0; r < 19; r++) {
                for (let c = 0; c < 19; c++) {
                    const pt = SgfEngine.formatGoPoint(c, r);
                    if (!pt || !setupBoard[r] || !setupBoard[r][c]) continue;
                    if (setupBoard[r][c].player === 'B') ab.push(pt);
                    if (setupBoard[r][c].player === 'W') aw.push(pt);
                }
            }
            if (ab.length > 0) rootProps.AB = ab;
            if (aw.length > 0) rootProps.AW = aw;
        }
        if (state.plColor) rootProps.PL = [state.plColor];

        Object.assign(rootProps, SgfEngine.annotationsToProperties(state.baselineAnnotations));
        if (state.baselineUnknownProps) {
            Object.assign(rootProps, JSON.parse(JSON.stringify(state.baselineUnknownProps)));
        }

        const mainLineProps = [rootProps];

        if (state.sgfMoves) {
            state.sgfMoves.forEach(m => {
                let nodeProps = {};
                if (m.isPass) {
                    nodeProps[m.player] = [''];
                } else {
                    const coord = SgfEngine.formatGoPoint(m.c, m.r);
                    if (coord) nodeProps[m.player] = [coord];
                }
                if (m.comment) nodeProps.C = [m.comment];
                if (m.nodeName) nodeProps.N = [m.nodeName];
                if (m.moveNumber != null) nodeProps.MN = [String(m.moveNumber)];

                if (m.moveAnnotation) {
                    if (m.moveAnnotation.type === 'TE') nodeProps.TE = [m.moveAnnotation.value || '1'];
                    else if (m.moveAnnotation.type === 'BM') nodeProps.BM = [m.moveAnnotation.value || '1'];
                    else if (m.moveAnnotation.type === 'DO') nodeProps.DO = [''];
                    else if (m.moveAnnotation.type === 'IT') nodeProps.IT = [''];
                }

                if (m.nodeAnnotation) {
                    if (m.nodeAnnotation.type === 'GB') nodeProps.GB = [m.nodeAnnotation.value || '1'];
                    else if (m.nodeAnnotation.type === 'GW') nodeProps.GW = [m.nodeAnnotation.value || '1'];
                    else if (m.nodeAnnotation.type === 'DM') nodeProps.DM = [m.nodeAnnotation.value || '1'];
                    else if (m.nodeAnnotation.type === 'UC') nodeProps.UC = [m.nodeAnnotation.value || '1'];
                }

                Object.assign(nodeProps, SgfEngine.annotationsToProperties(m.annotations));
                if (m.unknownProps) {
                    nodeProps = SgfEngine.mergeUnknownProperties(nodeProps, m.unknownProps);
                }
                mainLineProps.push(nodeProps);
            });
        }

        let tree;
        if (state.sgfTree && state.isSgfDirty) {
            tree = SgfEngine.cloneTree(state.sgfTree);
            const branchPath = state.variationData?.currentBranchPath || [0];
            SgfEngine.replaceBranchNodes(tree, branchPath, mainLineProps);
        } else if (state.sgfTree && !state.isSgfDirty) {
            tree = state.sgfTree;
        } else {
            tree = { nodes: mainLineProps.map(p => ({ properties: JSON.parse(JSON.stringify(p)), children: [] })), children: [] };
        }

        let sgf = SgfEngine.writeSgf(tree);
        if (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') {
            sgf = SgfSanitizer.sanitize(sgf) || sgf;
        }
        return sgf;
    }

    function resumeStudySession(id, openScoringAfter) {
        const rec = StudyRecordDB.getRecord(id);
        if (!rec || !rec.workingSgf) {
            alert('Study record not found.');
            return;
        }

        if (elements.kifuModalOverlay) {
            elements.kifuModalOverlay.style.display = 'none';
            elements.kifuModalOverlay.classList.add('hidden');
        }

        const savedTargetIndex = rec.currentMoveIndex !== undefined ? rec.currentMoveIndex : 0;
        const savedSettings = rec.settings;
        console.log(`[StudyRecordDB] resumeStudySession(${id}) -> Loaded savedTargetIndex: ${savedTargetIndex} (Move ${savedTargetIndex >= 0 ? savedTargetIndex + 1 : 0})`);

        state.activeStudyId = rec.id;
        rec.lastAccess = formatStudyAccessTime();

        if (elements.dropZone) elements.dropZone.classList.add('hidden');
        if (elements.fileInfo) elements.fileInfo.classList.add('active');
        if (elements.selectedFileName) {
            elements.selectedFileName.textContent = `[Rec ${rec.recNo}] ${rec.fileNm}`;
            elements.selectedFileName.title = rec.fileNm;
        }

        state.isSgfLoading = true;
        loadSGF(rec.workingSgf);
        state.isSgfLoading = false;

        // Update totalMoves with actual parsed move count after loadSGF
        if (state.allSgfMoves && state.allSgfMoves.length > 0) {
            rec.totalMoves = state.allSgfMoves.length;
        }

        // Ensure saved move index is preserved after initial loadSGF
        rec.currentMoveIndex = savedTargetIndex;
        StudyRecordDB.saveRecord(rec);

        // Suppress "Game Ended" popup when resuming for scoring
        if (openScoringAfter && rec.scoringData) {
            state._scoringResume = true;
        }

        // Synchronously jump to savedTargetIndex
        if (typeof goToMove === 'function') {
            goToMove(savedTargetIndex);
        }

        if (savedSettings) {
            applyAppSettings(savedSettings);
        }

        const displayMoveNum = savedTargetIndex >= 0 ? (savedTargetIndex + 1) : 0;
        showWorkingStudyToast(`Resumed Study Rec_${rec.recNo} at Move ${displayMoveNum}`);
        updateSaveRecGameButton();

        if (openScoringAfter && rec.scoringData) {
            if (typeof openScoringModal === 'function') {
                openScoringModal(rec.scoringData);
            }
        }
    }

    // Button click to open "Resume your Study" overlay
    if (elements.btnExploreKifu) {
        renderResumeStudyTable();
        elements.btnExploreKifu.addEventListener('click', (e) => {
            e.preventDefault();
            if (elements.kifuModalOverlay) {
                elements.kifuModalOverlay.style.display = 'flex';
                elements.kifuModalOverlay.classList.remove('hidden');
                renderResumeStudyTable(elements.kifuSearchInput ? elements.kifuSearchInput.value : '');
            }
        });
    }

    if (elements.btnCloseKifu) {
        elements.btnCloseKifu.addEventListener('click', () => {
            elements.kifuModalOverlay.style.display = 'none';
            elements.kifuModalOverlay.classList.add('hidden');
        });
    }

    if (elements.kifuModalOverlay) {
        elements.kifuModalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.kifuModalOverlay) {
                elements.kifuModalOverlay.style.display = 'none';
                elements.kifuModalOverlay.classList.add('hidden');
            }
        });
    }

    if (elements.kifuSearchInput) {
        elements.kifuSearchInput.addEventListener('input', (e) => {
            renderResumeStudyTable(e.target.value);
        });
    }

    // Prompt Dialog Logic
    const promptOverlay = document.getElementById('study-record-prompt-overlay');
    const btnPromptYes = document.getElementById('btn-prompt-record-yes');
    const btnPromptNo = document.getElementById('btn-prompt-record-no');

    if (promptOverlay) {
        promptOverlay.addEventListener('click', (e) => {
            if (e.target === promptOverlay) {
                promptOverlay.style.display = 'none';
                promptOverlay.classList.add('hidden');
            }
        });
    }

    function openStudyPrompt(sgfString, fileName, fileHandle = null) {
        state.pendingStudySgf = { sgfString, fileName, fileHandle };
        const promptFileName = document.getElementById('prompt-file-name');
        if (promptFileName) promptFileName.textContent = fileName;
        if (promptOverlay) {
            promptOverlay.style.display = 'flex';
            promptOverlay.classList.remove('hidden');
        }
    }

    if (btnPromptYes) {
        btnPromptYes.addEventListener('click', () => {
            if (!state.pendingStudySgf) return;
            const pending = state.pendingStudySgf;
            if (promptOverlay) {
                promptOverlay.style.display = 'none';
                promptOverlay.classList.add('hidden');
            }

            let pb = 'Black';
            let pw = 'White';
            let totalMoves = 0;
            try {
                const pbMatch = pending.sgfString.match(/PB\[([^\]]*)\]/);
                if (pbMatch && pbMatch[1]) pb = pbMatch[1];
                const pwMatch = pending.sgfString.match(/PW\[([^\]]*)\]/);
                if (pwMatch && pwMatch[1]) pw = pwMatch[1];

                if (window.SgfEngine && typeof SgfEngine.parseSgf === 'function') {
                    const parsed = SgfEngine.parseSgf(pending.sgfString);
                    if (parsed && parsed.rootNode) {
                        let curr = parsed.rootNode;
                        while (curr && curr.children && curr.children.length > 0) {
                            totalMoves++;
                            curr = curr.children[0];
                        }
                    }
                }
            } catch (err) {
                console.error('Error parsing SGF metadata for record:', err);
            }

            const newRec = {
                id: 'study_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                recNo: StudyRecordDB.generateNextRecNo(),
                fileNm: pending.fileName,
                blk: pb,
                wht: pw,
                lastAccess: formatStudyAccessTime(),
                currentMoveIndex: 0,
                totalMoves: totalMoves > 0 ? totalMoves : 1,
                rawSgf: pending.sgfString,
                workingSgf: (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') ? SgfSanitizer.sanitize(pending.sgfString) || pending.sgfString : pending.sgfString,
                settings: captureCurrentAppSettings()
            };

            StudyRecordDB.saveRecord(newRec);
            state.activeStudyId = newRec.id;

            if (elements.dropZone) elements.dropZone.classList.add('hidden');
            if (elements.fileInfo) elements.fileInfo.classList.add('active');
            if (elements.selectedFileName) {
                elements.selectedFileName.textContent = `[Rec ${newRec.recNo}] ${newRec.fileNm}`;
                elements.selectedFileName.title = newRec.fileNm;
            }

            loadSGF(pending.sgfString);

            // Update totalMoves with actual parsed move count after loadSGF
            const updatedRec = StudyRecordDB.getRecord(newRec.id);
            if (updatedRec && state.allSgfMoves && state.allSgfMoves.length > 0) {
                updatedRec.totalMoves = state.allSgfMoves.length;
                StudyRecordDB.saveRecord(updatedRec);
            }

            state.pendingStudySgf = null;
            state.fileHandle = null;
            updateSaveRecGameButton();
            showWorkingStudyToast(`Recorded to Study Sessions (Rec_${newRec.recNo})`);
        });
    }

    if (btnPromptNo) {
        btnPromptNo.addEventListener('click', () => {
            if (!state.pendingStudySgf) return;
            const pending = state.pendingStudySgf;
            if (promptOverlay) {
                promptOverlay.style.display = 'none';
                promptOverlay.classList.add('hidden');
            }

            state.activeStudyId = null;
            updateSaveRecGameButton();

            if (elements.dropZone) elements.dropZone.classList.add('hidden');
            if (elements.fileInfo) elements.fileInfo.classList.add('active');
            if (elements.selectedFileName) {
                elements.selectedFileName.textContent = pending.fileName;
                elements.selectedFileName.title = pending.fileName;
            }

            loadSGF(pending.sgfString);
            state.fileHandle = pending.fileHandle;
            state.pendingStudySgf = null;
        });
    }

    function handleFileSelect(file, fileHandle = null) {
        if (!file.name.toLowerCase().endsWith('.sgf') && !file.name.toLowerCase().endsWith('.txt')) {
            alert('Please select an SGF file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            openStudyPrompt(e.target.result, file.name, fileHandle);
        };
        reader.readAsText(file);
    }

    // Remove File
    if (elements.btnRemoveFile) {
        elements.btnRemoveFile.addEventListener('click', () => {
            elements.sgfFileInput.value = '';
            elements.dropZone.classList.remove('hidden');
            elements.fileInfo.classList.remove('active');
            elements.selectedFileName.textContent = '';
            state.rawSgf = '';
            state.fileHandle = null;
            
            // Reset board
            state.allSgfMoves = [];
            state.sgfMoves = [];
            state.setupBoard = null;
            state.annotLastStone = null;
            state.board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
                player: null, annotation: null, label: null
            })));
            state.baselineBoard = JSON.parse(JSON.stringify(state.board));
            state.currentMoveIndex = -1;
            state.baselineComment = '';
            if (elements.gameMetaPanel) elements.gameMetaPanel.style.display = 'none';
            drawBoard();
            renderExtractedMoves();
        });
    }

    // Flip Board
    const flipButtons = document.querySelectorAll('#btn-flip-pov, #study-flipper-container');
    flipButtons.forEach(btn => {
        const flipBtn = document.getElementById('btn-flip-pov');
        if (flipBtn) {
            flipBtn.style.background = 'rgba(139, 26, 26, 0.1)';
            flipBtn.style.color = 'rgb(139, 26, 26)';
        }
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const flipAudio = new Audio('_sfx/brd_flip.mp3');
            flipAudio.play().catch(e => console.log('Audio play failed:', e));
            flipBoard180();
            if (flipBtn) {
                flipBtn.style.background = state.isPovFlipped ? 'rgb(139, 26, 26)' : 'rgba(139, 26, 26, 0.1)';
                flipBtn.style.color = state.isPovFlipped ? 'rgb(248, 245, 238)' : 'rgb(139, 26, 26)';
            }
            autoSaveActiveStudySettings();
        });
    });

    // Paste SGF
    if (elements.btnPasteClipboard) {
        elements.btnPasteClipboard.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                elements.sgfPasteArea.value = text;
                if (text.trim()) {
                    loadSGF(text);
                }
            } catch (err) {
                console.error('Failed to read clipboard contents: ', err);
                alert('Could not paste from clipboard. Please paste manually into the text area.');
            }
        });
    }

    if (elements.sgfPasteArea) {
        elements.sgfPasteArea.addEventListener('input', () => {
            const text = elements.sgfPasteArea.value.trim();
            if (text) {
                loadSGF(text);
            }
        });
    }

    if (elements.btnLoadSample) {
        elements.btnLoadSample.addEventListener('click', () => {
            const sampleSgf = "(;SZ[19]KM[6.5]PB[Black]PW[White]RE[B+R]DT[2024-01-01];B[pd];W[dp];B[pq];W[dd];B[qk];W[nc];B[pf];W[pb];B[qc];W[kc];B[fq];W[cn];B[jp];W[qn];B[qp];W[pj];B[qj];W[pi];B[qh];W[pm];B[ok];W[nk];B[nj];W[oj];B[nl];W[mk];B[ml];W[ll];B[ol];W[mj];B[ni];W[mi];B[nh];W[mh])";
            elements.sgfPasteArea.value = sampleSgf;
            loadSGF(sampleSgf);
        });
    }

    // Range Inputs
    if (elements.rangeInput) {
        elements.rangeInput.addEventListener('change', () => {
            applyFilters();
        });
        elements.rangeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
            }
        });
    }

    // Presets
    if (elements.presetBtns) {
        elements.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.presetBtns.forEach(b => b.classList.remove('active'));
                const range = btn.getAttribute('data-range');
                elements.rangeInput.value = range;
                btn.classList.add('active');
                applyFilters();
            });
        });
    }

    // Move Numbers Display Listeners
    if (elements.toggleMoveNumbers) {
        elements.toggleMoveNumbers.addEventListener('change', (e) => {
            state.displayMoveNumbers = e.target.checked;
            if (elements.moveNumbersOptions) {
                elements.moveNumbersOptions.style.display = state.displayMoveNumbers ? 'flex' : 'none';
            }
            drawBoard();
            autoSaveActiveStudySettings();
        });
    }

    if (elements.moveNumberModeRadios) {
        elements.moveNumberModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.moveNumberMode = e.target.value;
                    if (elements.nextMoveHintContainer) {
                        elements.nextMoveHintContainer.style.display = 'block';
                    }
                    if (state.displayMoveNumbers) {
                        drawBoard();
                        if (typeof updateExportPreview === 'function') updateExportPreview();
                    }
                    autoSaveActiveStudySettings();
                }
            });
        });
    }

    if (elements.inputLastNMoves) {
        elements.inputLastNMoves.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            state.lastNMoves = val;
            if (state.displayMoveNumbers && state.moveNumberMode === 'lastN') {
                drawBoard();
                if (typeof updateExportPreview === 'function') updateExportPreview();
            }
            autoSaveActiveStudySettings();
        });
        
        elements.inputLastNMoves.addEventListener('click', (e) => {
            const radio = document.querySelector('input[name="move-number-mode"][value="lastN"]');
            if (radio && !radio.checked) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
        });
    }

    if (elements.toggleNextMoveHint) {
        elements.toggleNextMoveHint.addEventListener('change', (e) => {
            state.showNextMoveHint = e.target.checked;
            if (state.displayMoveNumbers) {
                drawBoard();
                if (typeof updateExportPreview === 'function') updateExportPreview();
            }
            autoSaveActiveStudySettings();
        });
    }

    const toggleCountback = document.getElementById('toggle-countback');
    if (toggleCountback) {
        toggleCountback.addEventListener('change', (e) => {
            state.moveNumberCountback = e.target.checked;
            if (state.displayMoveNumbers && state.moveNumberMode === 'lastN') {
                drawBoard();
                if (typeof updateExportPreview === 'function') updateExportPreview();
            }
            autoSaveActiveStudySettings();
        });
    }

    if (elements.toggleMoveCoord) {
        elements.toggleMoveCoord.addEventListener('change', (e) => {
            state.showMoveCoord = e.target.checked;
            if (state.displayMoveNumbers) {
                drawBoard();
                if (typeof updateExportPreview === 'function') updateExportPreview();
            }
            autoSaveActiveStudySettings();
        });
    }


    // Replayer Buttons
    if (elements.btnReplayFirst) elements.btnReplayFirst.addEventListener('click', () => goToMove(-1));
    if (elements.btnReplayBack5) elements.btnReplayBack5.addEventListener('click', () => goToMove(state.currentMoveIndex - 5));
    if (elements.btnReplayPrev) elements.btnReplayPrev.addEventListener('click', () => goToMove(state.currentMoveIndex - 1));
    if (elements.btnReplayNext) elements.btnReplayNext.addEventListener('click', () => goToMove(state.currentMoveIndex + 1));
    if (elements.btnReplayFwd5) elements.btnReplayFwd5.addEventListener('click', () => { goToMove(state.currentMoveIndex + 5); fwd5Sound.currentTime = 0; fwd5Sound.play().catch(e => console.error(e)); });
    if (elements.btnReplayLast) elements.btnReplayLast.addEventListener('click', () => goToMove(state.sgfMoves.length - 1));
    
    if (elements.btnAutoplay) elements.btnAutoplay.addEventListener('click', toggleAutoPlay);

    // Variation buttons
    if (elements.btnVarPrev) elements.btnVarPrev.addEventListener('click', () => navigateVariation(-1));
    if (elements.btnVarNext) elements.btnVarNext.addEventListener('click', () => navigateVariation(1));
    
    if (elements.btnWhatIf) elements.btnWhatIf.addEventListener('click', toggleWhatIfMode);

    function toggleWhatIfMode(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        state.whatIfMode = !state.whatIfMode;
        state.whatIfStone = null;
        if (elements.btnWhatIf) {
            if (state.whatIfMode) {
                elements.btnWhatIf.style.backgroundColor = 'rgb(139, 26, 26)';
                elements.btnWhatIf.style.borderColor = 'rgb(139, 26, 26)';
                elements.btnWhatIf.style.color = 'rgb(248, 245, 238)';
            } else {
                elements.btnWhatIf.style.backgroundColor = 'rgba(139, 26, 26, 0.1)';
                elements.btnWhatIf.style.borderColor = 'rgb(139, 26, 26)';
                elements.btnWhatIf.style.color = 'rgb(139, 26, 26)';
            }
        }
        drawBoard();
    }

    function updateSpeedHighlight() {
        const val = parseFloat(elements.autoplayCustomSec.value);
        let btnMatch = false;
        
        elements.autoplaySpeedBtns.forEach(b => {
            const bVal = parseFloat(b.dataset.sec);
            if (bVal === val) {
                b.style.backgroundColor = 'rgba(5, 150, 105, 0.1)';
                b.style.color = 'var(--success)';
                b.style.borderColor = 'var(--success)';
                btnMatch = true;
            } else {
                b.style.backgroundColor = '';
                b.style.color = '';
                b.style.borderColor = '';
            }
        });
        
        if (!btnMatch && !isNaN(val)) {
            elements.autoplayCustomSec.style.backgroundColor = 'rgba(5, 150, 105, 0.1)';
            elements.autoplayCustomSec.style.color = 'var(--success)';
            elements.autoplayCustomSec.style.borderColor = 'var(--success)';
        } else {
            elements.autoplayCustomSec.style.backgroundColor = '';
            elements.autoplayCustomSec.style.color = '';
            elements.autoplayCustomSec.style.borderColor = '';
        }
    }

    if (elements.autoplaySpeedBtns) {
        elements.autoplaySpeedBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sec = parseFloat(e.target.dataset.sec);
                if (elements.autoplayCustomSec) {
                    elements.autoplayCustomSec.value = sec;
                    updateSpeedHighlight();
                }
                if (state.autoPlayTimer) {
                    toggleAutoPlay();
                    toggleAutoPlay();
                }
            });
        });
    }
    
    if (elements.autoplayCustomSec) {
        elements.autoplayCustomSec.addEventListener('input', updateSpeedHighlight);
        elements.autoplayCustomSec.addEventListener('change', () => {
            updateSpeedHighlight();
            if (state.autoPlayTimer) {
                toggleAutoPlay();
                toggleAutoPlay();
            }
        });
    }

    // SGF Editing Events
    window.addEventListener('beforeunload', (e) => {
        // Rec/Study mode: warn about unsaved changes, do NOT auto-save
        if (state.activeStudyId && state.isSgfDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes on this Rec Game. Please click "Save / Update Rec Game" first to save your progress before refreshing.';
            return e.returnValue;
        }
        // File mode: warn if dirty
        if (state.isSgfDirty) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });

    function colorBorderForAnnot(annotType) {
        const annotColors = { TE: '#22c55e', BM: '#ef4444', DO: '#a855f7', IT: '#3b82f6', GB: '#111827', GW: '#f3f4f6', DM: '#9ca3af', UC: '#f59e0b' };
        const moveVal = elements.annotMove ? elements.annotMove.value : '';
        const nodeVal = elements.annotNode ? elements.annotNode.value : '';
        const chosen = moveVal || nodeVal;
        const color = annotColors[chosen] || 'var(--border-card)';
        elements.sgfCommentInput.style.borderColor = color;
        elements.sgfCommentInput.style.borderWidth = moveVal || nodeVal ? '2px' : '1px';
    }

    if (elements.annotMove) {
        elements.annotMove.addEventListener('change', colorBorderForAnnot);
    }
    if (elements.annotNode) {
        elements.annotNode.addEventListener('change', colorBorderForAnnot);
    }

    // Ref-Area toggle (inserts cell(A1, A2, ...) into textarea at cursor position)
    if (elements.btnRefArea) {
        elements.btnRefArea.addEventListener('click', () => {
            const ta = elements.sgfCommentInput;
            if (!ta || ta.style.display !== 'block') return;

            state.refAreaMode = !state.refAreaMode;
            if (state.refAreaMode) {
                state.refAreaCells = [];
                state.refAreaHoverCell = null;
                // Record cursor position (no { insertion)
                state.refAreaInsertPos = ta.selectionStart || ta.value.length;
                ta.selectionStart = ta.selectionEnd = state.refAreaInsertPos;
                elements.btnRefArea.style.backgroundColor = 'rgba(67, 130, 119, 0.18)';
                elements.btnRefArea.style.borderColor = 'rgb(67, 130, 119)';
                elements.btnRefArea.style.color = 'rgb(67, 130, 119)';
                elements.btnRefArea.style.fontWeight = '600';
            } else {
                // Toggle OFF: clean up
                state.refAreaCells = [];
                state.refAreaInsertPos = -1;
                elements.btnRefArea.style.backgroundColor = '';
                elements.btnRefArea.style.borderColor = '';
                elements.btnRefArea.style.color = '';
                elements.btnRefArea.style.fontWeight = '';
                state.refAreaHoverCell = null;
            }
            drawBoard();
        });
    }

    // Ref-Point toggle (inserts coord like C11 into textarea at cursor position)
    if (elements.btnRefPoint) {
        elements.btnRefPoint.addEventListener('click', () => {
            const ta = elements.sgfCommentInput;
            if (!ta || ta.style.display !== 'block') return;

            state.refPointMode = !state.refPointMode;
            if (state.refPointMode) {
                state.refPointCells = [];
                // Insert cursor position marker
                const pos = ta.selectionStart || ta.value.length;
                state.refPointInsertPos = pos;
                ta.selectionStart = ta.selectionEnd = pos;
                elements.btnRefPoint.style.backgroundColor = 'rgba(67, 130, 119, 0.18)';
                elements.btnRefPoint.style.borderColor = 'rgb(67, 130, 119)';
                elements.btnRefPoint.style.color = 'rgb(67, 130, 119)';
                elements.btnRefPoint.style.fontWeight = '600';
            } else {
                // Toggle OFF: clean up
                state.refPointCells = [];
                state.refPointInsertPos = -1;
                elements.btnRefPoint.style.backgroundColor = '';
                elements.btnRefPoint.style.borderColor = '';
                elements.btnRefPoint.style.color = '';
                elements.btnRefPoint.style.fontWeight = '';
            }
            drawBoard();
        });
    }

    if (elements.btnSgfCommentEdit) {
        elements.btnSgfCommentEdit.addEventListener('click', () => {
            if (state.currentMoveIndex >= -1 && state.currentMoveIndex < state.sgfMoves.length) {
                elements.sgfCommentDisplay.style.display = 'none';
                elements.sgfCommentInput.style.display = 'block';
                if (elements.sgfCommentResizeHandle) elements.sgfCommentResizeHandle.style.display = 'flex';
                elements.btnSgfCommentEdit.style.display = 'none';
                elements.btnSgfCommentSave.style.display = 'flex';
                if (elements.annotEditor) elements.annotEditor.style.display = 'flex';
                if (elements.btnRefArea) elements.btnRefArea.disabled = false;
                if (elements.btnRefPoint) elements.btnRefPoint.disabled = false;
                
                const currentComment = state.currentMoveIndex >= 0 ? 
                    (state.sgfMoves[state.currentMoveIndex].comment || '') : 
                    (state.baselineComment || '');
                elements.sgfCommentInput.value = currentComment;

                if (state.currentMoveIndex >= 0) {
                    const m = state.sgfMoves[state.currentMoveIndex];
                    if (elements.annotMove) elements.annotMove.value = m.moveAnnotation ? m.moveAnnotation.type : '';
                    if (elements.annotNode) elements.annotNode.value = m.nodeAnnotation ? m.nodeAnnotation.type : '';
                } else {
                    if (elements.annotMove) elements.annotMove.value = '';
                    if (elements.annotNode) elements.annotNode.value = '';
                }

                colorBorderForAnnot();
                elements.sgfCommentInput.focus();
            }
        });
    }

    if (elements.btnSgfCommentSave) {
        elements.btnSgfCommentSave.addEventListener('click', () => {
            if (state.currentMoveIndex >= -1 && state.currentMoveIndex < state.sgfMoves.length) {
                const newComment = elements.sgfCommentInput.value.trim();
                const moveAnnotVal = elements.annotMove ? elements.annotMove.value : '';
                const nodeAnnotVal = elements.annotNode ? elements.annotNode.value : '';
                
                if (state.currentMoveIndex >= 0) {
                    const m = state.sgfMoves[state.currentMoveIndex];
                    m.comment = newComment;
                    m.moveAnnotation = moveAnnotVal ? { type: moveAnnotVal, value: null } : null;
                    m.nodeAnnotation = nodeAnnotVal ? { type: nodeAnnotVal, value: null } : null;

                    // Sync back to SGF tree properties so game-tree node colors update
                    if (m.sgfNode) {
                        if (newComment) {
                            m.sgfNode.C = [newComment];
                        } else {
                            delete m.sgfNode.C;
                        }
                        // Clear all move annotation props, then set the active one
                        delete m.sgfNode.TE; delete m.sgfNode.BM; delete m.sgfNode.DO; delete m.sgfNode.IT;
                        if (m.moveAnnotation) {
                            if (m.moveAnnotation.type === 'TE') m.sgfNode.TE = [m.moveAnnotation.value || '1'];
                            else if (m.moveAnnotation.type === 'BM') m.sgfNode.BM = [m.moveAnnotation.value || '1'];
                            else if (m.moveAnnotation.type === 'DO') m.sgfNode.DO = ['1'];
                            else if (m.moveAnnotation.type === 'IT') m.sgfNode.IT = ['1'];
                        }
                        // Clear all node annotation props, then set the active one
                        delete m.sgfNode.GB; delete m.sgfNode.GW; delete m.sgfNode.DM; delete m.sgfNode.UC;
                        if (m.nodeAnnotation) {
                            if (m.nodeAnnotation.type === 'GB') m.sgfNode.GB = [m.nodeAnnotation.value || '1'];
                            else if (m.nodeAnnotation.type === 'GW') m.sgfNode.GW = [m.nodeAnnotation.value || '1'];
                            else if (m.nodeAnnotation.type === 'DM') m.sgfNode.DM = [m.nodeAnnotation.value || '1'];
                            else if (m.nodeAnnotation.type === 'UC') m.sgfNode.UC = [m.nodeAnnotation.value || '1'];
                        }
                    }
                } else {
                    state.baselineComment = newComment;
                    // Sync baseline comment removal to SGF tree root node
                    if (state.sgfTree && state.sgfTree.rootNode) {
                        if (newComment) {
                            state.sgfTree.rootNode.C = [newComment];
                        } else {
                            delete state.sgfTree.rootNode.C;
                        }
                    }
                }
                
                state.isSgfDirty = true; state.popupShownForCurrentChange = false;
                updateSaveRecGameButton();
                if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'flex';
                if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
                
                elements.sgfCommentInput.style.borderColor = 'var(--border-card)';
                elements.sgfCommentInput.style.borderWidth = '1px';
                if (elements.annotEditor) elements.annotEditor.style.display = 'none';
                if (elements.btnRefArea) {
                    elements.btnRefArea.disabled = true;
                    if (state.refAreaMode) {
                        state.refAreaMode = false;
                        state.refAreaCells = [];
                        state.refAreaHoverCell = null;
                        elements.btnRefArea.style.backgroundColor = '';
                        elements.btnRefArea.style.borderColor = '';
                        elements.btnRefArea.style.color = '';
                        elements.btnRefArea.style.fontWeight = '';
                    }
                }
                if (elements.btnRefPoint) {
                    elements.btnRefPoint.disabled = true;
                    if (state.refPointMode) {
                        state.refPointMode = false;
                        state.refPointCells = [];
                        state.refPointInsertPos = -1;
                        elements.btnRefPoint.style.backgroundColor = '';
                        elements.btnRefPoint.style.borderColor = '';
                        elements.btnRefPoint.style.color = '';
                        elements.btnRefPoint.style.fontWeight = '';
                    }
                }

                updateCommentUI();
                drawBoard();
                populateCommentDropdown();
                if (typeof refreshGameTree === 'function') refreshGameTree();
                
                if (typeof checkSgfChangeAndShowPopup === 'function') {
                    checkSgfChangeAndShowPopup();
                }
            }
        });
    }

    // Comment textarea bottom-center resize handle
    if (elements.sgfCommentResizeHandle && elements.sgfCommentInput) {
        let isResizing = false;
        let startY, startHeight;
        const handle = elements.sgfCommentResizeHandle;
        const textarea = elements.sgfCommentInput;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textarea.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const diff = e.clientY - startY;
            textarea.style.height = Math.max(60, startHeight + diff) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    if (elements.sgfCommentDropdown) {
        elements.sgfCommentDropdown.addEventListener('change', (e) => {
            if (e.target.value !== "") {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx)) {
                    goToMove(idx);
                }
            }
        });
    }

    // Comment coordinate hover highlighting
    if (elements.sgfCommentDisplay) {
        elements.sgfCommentDisplay.addEventListener('mouseover', function(e) {
            const target = e.target;
            if (target.classList && target.classList.contains('comment-quarter')) {
                if (target.classList.contains('comment-sub-quarter')) {
                    // Sub-quadrant highlight — support both old and new data attribute formats
                    const subQuadrantsAttr = target.getAttribute('data-sub-quadrants');
                    if (subQuadrantsAttr) {
                        _commentHighlightedCells = [];
                        _commentQuarterHighlighted = [];
                        const entries = subQuadrantsAttr.split(';');
                        for (const entry of entries) {
                            const parts = entry.split(':');
                            if (parts.length === 2) {
                                const parent = parseInt(parts[0], 10);
                                const subs = parts[1].split(',').map(n => parseInt(n, 10));
                                if (!isNaN(parent)) _commentQuarterHighlighted.push({ qrt: parent, subs });
                            }
                        }
                        const qrtStr = target.getAttribute('data-quarters');
                        if (qrtStr) {
                            for (const n of qrtStr.split(',').map(s => parseInt(s, 10))) {
                                if (!isNaN(n)) _commentQuarterHighlighted.push(n);
                            }
                        }
                        const hoshiStr = target.getAttribute('data-hoshis');
                        const hoshiRectStr = target.getAttribute('data-hoshi-rects');
                        _commentHoshiHighlighted = hoshiStr ? hoshiStr.split(',').map(n => parseInt(n, 10)) : null;
                        _commentHoshiRectHighlighted = hoshiRectStr ? hoshiRectStr.split(',').map(n => parseInt(n, 10)) : null;
                        drawBoard();
                    } else {
                        const parentQrt = parseInt(target.getAttribute('data-parent-qrt'), 10);
                        const subQrtsStr = target.getAttribute('data-sub-qrts');
                        if (!isNaN(parentQrt) && subQrtsStr) {
                            const subQrts = subQrtsStr.split(',').map(n => parseInt(n, 10));
                            drawSubQuarterHighlight(parentQrt, subQrts);
                        }
                    }
                } else {
                    const qrtStr = target.getAttribute('data-quarters');
                    const hoshiStr = target.getAttribute('data-hoshis');
                    const hoshiRectStr = target.getAttribute('data-hoshi-rects');
                    if (qrtStr || hoshiStr || hoshiRectStr) {
                        _commentHighlightedCells = [];
                        _commentQuarterHighlighted = qrtStr ? qrtStr.split(',').map(n => parseInt(n, 10)) : null;
                        _commentHoshiHighlighted = hoshiStr ? hoshiStr.split(',').map(n => parseInt(n, 10)) : null;
                        _commentHoshiRectHighlighted = hoshiRectStr ? hoshiRectStr.split(',').map(n => parseInt(n, 10)) : null;
                        drawBoard();
                    }
                }
            }
            if (target.classList && target.classList.contains('comment-hoshi') && !target.classList.contains('comment-quarter')) {
                const hoshiStr = target.getAttribute('data-hoshis');
                const hoshiRectStr = target.getAttribute('data-hoshi-rects');
                if (hoshiStr || hoshiRectStr) {
                    _commentHighlightedCells = [];
                    _commentQuarterHighlighted = null;
                    _commentHoshiHighlighted = hoshiStr ? hoshiStr.split(',').map(n => parseInt(n, 10)) : null;
                    _commentHoshiRectHighlighted = hoshiRectStr ? hoshiRectStr.split(',').map(n => parseInt(n, 10)) : null;
                    drawBoard();
                }
            }
            if (target.classList && target.classList.contains('comment-coord')) {
                if (target.classList.contains('comment-here')) {
                    if (typeof state !== 'undefined' && state && state.sgfMoves && state.currentMoveIndex >= 0) {
                        const move = state.sgfMoves[state.currentMoveIndex];
                        if (move && move.r >= 0 && move.r < 19 && move.c >= 0 && move.c < 19) {
                            let targetR = move.r;
                            let targetC = move.c;
                            drawCommentCoordHighlights([{ r: targetR, c: targetC }]);
                        }
                    }
                } else if (target.hasAttribute('data-coords')) {
                    const coordsStr = target.getAttribute('data-coords');
                    if (coordsStr) {
                        const coords = coordsStr.split(',');
                        const indicesList = [];
                        for (const c of coords) {
                            let cleanC = c;
                            let isRed = false;
                            if (c.startsWith('!')) {
                                cleanC = c.substring(1);
                                isRed = true;
                            }
                            const match = cleanC.match(/^([A-HJ-T])(\d+)$/);
                            if (match) {
                                const indices = commentCoordToIndices(match[1], match[2]);
                                if (indices) {
                                    indices.isRed = isRed;
                                    indicesList.push(indices);
                                }
                            }
                        }
                        if (indicesList.length > 0) {
                            drawCommentCoordHighlights(indicesList);
                        }
                    }
                } else {
                    const col = target.getAttribute('data-col');
                    const row = target.getAttribute('data-row');
                    const isRed = target.getAttribute('data-red') === 'true';
                    const indices = commentCoordToIndices(col, row);
                    if (indices) {
                        indices.isRed = isRed;
                        drawCommentCoordHighlights([indices]);
                    }
                }
            }
            if (target.classList && target.classList.contains('comment-stone-group')) {
                _commentStoneGroupBlackCells = [];
                _commentStoneGroupWhiteCells = [];
                _commentStoneGroupGroups = [];
                const groupsJson = target.getAttribute('data-groups');
                if (groupsJson) {
                    try {
                        const groups = JSON.parse(groupsJson.replace(/&quot;/g, '"'));
                        groups.forEach((g, idx) => {
                            const cells = [];
                            g.o.forEach(coord => {
                                const m = coord.match(/^([A-HJ-T])(\d+)$/);
                                if (!m) return;
                                const cell = commentCoordToIndices(m[1], m[2]);
                                if (!cell) return;
                                cells.push(cell);
                                if (g.c === 'B') _commentStoneGroupBlackCells.push(cell);
                                else _commentStoneGroupWhiteCells.push(cell);
                            });
                            if (cells.length > 0) _commentStoneGroupGroups.push({ color: g.c, cells });
                        });
                    } catch(e) {
                        _commentStoneGroupGroups = [];
                    }
                }
                _ladderBlackPath = [];
                _ladderWhitePath = [];
                _commentStoneGroupGroups.forEach((grp, idx) => {
                    if (idx > 0) {
                        if (grp.color === 'B') _ladderBlackPath.push(null);
                        else _ladderWhitePath.push(null);
                    }
                    if (grp.color === 'B') _ladderBlackPath.push(...grp.cells);
                    else _ladderWhitePath.push(...grp.cells);
                });
                drawBoard();
            }
            if (target.classList && target.classList.contains('comment-cell')) {
                const blockC = parseInt(target.getAttribute('data-block-c'), 10);
                const blockR = parseInt(target.getAttribute('data-block-r'), 10);
                if (!isNaN(blockC) && !isNaN(blockR)) {
                    _commentCellHighlighted = [{ c: blockC, r: blockR }];
                    drawBoard();
                }
            }
            if (target.classList && target.classList.contains('comment-cell-label')) {
                const blocksStr = target.getAttribute('data-blocks');
                if (blocksStr) {
                    _commentCellHighlighted = blocksStr.split(',').map(s => {
                        const m = s.match(/^([A-R])(\d+)$/);
                        if (!m) return null;
                        return { c: m[1].charCodeAt(0) - 65, r: parseInt(m[2], 10) - 1 };
                    }).filter(Boolean);
                    drawBoard();
                }
            }
        });
        elements.sgfCommentDisplay.addEventListener('mouseout', function(e) {
            if (e.target.classList && (e.target.classList.contains('comment-coord') || e.target.classList.contains('comment-quarter') || e.target.classList.contains('comment-hoshi') || e.target.classList.contains('comment-stone-group') || e.target.classList.contains('comment-cell') || e.target.classList.contains('comment-cell-label'))) {
                clearCommentCoordHighlights();
            }
        });
    }

    if (elements.btnExportSgf) {
        elements.btnExportSgf.addEventListener('click', exportEditedSgf);
    }

    // Extracted Moves Events
    if (elements.btnCopyOutput) {
        elements.btnCopyOutput.addEventListener('click', () => {
            if (elements.outputTextArea && elements.outputTextArea.value) {
                navigator.clipboard.writeText(elements.outputTextArea.value)
                    .then(() => alert('Moves copied to clipboard!'))
                    .catch(err => console.error('Failed to copy: ', err));
            }
        });
    }

    if (elements.btnCopySgf) {
        elements.btnCopySgf.addEventListener('click', () => {
            if (elements.sgfTextArea && elements.sgfTextArea.value) {
                const originalText = elements.btnCopySgf.innerHTML;
                navigator.clipboard.writeText(elements.sgfTextArea.value)
                    .then(() => {
                        elements.btnCopySgf.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                        setTimeout(() => { elements.btnCopySgf.innerHTML = originalText; }, 2000);
                    })
                    .catch(err => console.error('Failed to copy SGF: ', err));
            }
        });
    }

    const ensureRepIncludeTextChecked = () => {
        const hasText = (state.exportText.titleType && state.exportText.titleType !== 'none' && (state.exportText.titleType !== 'free' || state.exportText.titleFree.trim() !== '')) || 
                        (state.exportText.comment && state.exportText.comment.trim() !== '');
        if (hasText && elements.repIncludeText) {
            elements.repIncludeText.checked = true;
        }
    };

    // Diagram Text Controls Event Listeners

    if (elements.sourceManual) {
        elements.sourceManual.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.exportText.source = 'manual';
                updateSourceSelection();
            }
        });
    }

    if (elements.sourceSgf) {
        elements.sourceSgf.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.exportText.source = 'sgf';
                updateSourceSelection();
            }
        });
    }

    if (elements.repIncludeText) {
        elements.repIncludeText.addEventListener('change', () => {
            ensureRepIncludeTextChecked();
            updateReplicationCode();
        });
    }

    // Formatting Toolbar Buttons
    document.querySelectorAll('.btn-format').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.parentElement.dataset.for;
            const inputEl = document.getElementById(targetId);
            const styleType = btn.dataset.style;
            if (inputEl) {
                applyFormatting(inputEl, styleType);
            }
        });
    });


    // Undo / Redo Click listeners
    if (elements.btnUndo) {
        elements.btnUndo.addEventListener('click', () => {
            undo();
        });
    }
    if (elements.btnRedo) {
        elements.btnRedo.addEventListener('click', () => {
            redo();
        });
    }

    // Global keyboard shortcuts (Cmd/Ctrl + Z / Shift + Z)
    window.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            return; // Let browser handle text edits native undo/redo
        }
        
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        }
    });

    // Toggle Play Mode event listener
    const togglePlayMode = document.getElementById('toggle-play-mode');
    const playModeInfo = document.getElementById('play-mode-info');
    if (togglePlayMode) {
        togglePlayMode.addEventListener('change', (e) => {
            saveHistoryState();
            state.playMode = e.target.checked;
            if (playModeInfo) {
                if (state.playMode) {
                    playModeInfo.innerHTML = `
                        <p>🎮 <strong>Play Mode is Active:</strong> You can now play moves on the board interactively. Clicking on intersections will place stones alternatingly, similar to a real Go game.</p>
                        <p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--accent-indigo); font-weight: 500;">💡 Play Mode overrides active edit tools.</p>
                    `;
                } else {
                    playModeInfo.innerHTML = `
                        <p>🎮 <strong>Play Mode is Off:</strong> You are currently in <strong>Edit/Annotation Mode</strong>. Click on cells to draw stones, labels, and markers as annotations.</p>
                    `;
                }
            }
            drawBoard();
        });
    }

    // Legend Grouping Checkboxes
    const legendGroupNumbers = document.getElementById('legend-group-numbers');
    if (legendGroupNumbers) {
        legendGroupNumbers.addEventListener('change', (e) => {
            saveHistoryState();
            state.legend.groupNumbers = e.target.checked;
            updateLegendUI();
        });
    }
    const legendGroupLetters = document.getElementById('legend-group-letters');
    if (legendGroupLetters) {
        legendGroupLetters.addEventListener('change', (e) => {
            saveHistoryState();
            state.legend.groupLetters = e.target.checked;
            updateLegendUI();
        });
    }
    
    // Global keyboard listener for SGF navigation
    document.addEventListener('keydown', (e) => {
        // Prevent interfering with text inputs or textareas
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Only trigger if we have an imported SGF
        if (!state.sgfMoves || state.sgfMoves.length === 0) {
            return;
        }

        if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            if (typeof window.runScoreEstimate === 'function') window.runScoreEstimate();
            return;
        }

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToMove(state.currentMoveIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToMove(state.currentMoveIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            goToMove(state.currentMoveIndex + 5);
            fwd5Sound.currentTime = 0; fwd5Sound.play().catch(e => console.error(e));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            goToMove(state.currentMoveIndex - 5);
        } else if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            toggleAutoPlay();
        }
    });
}

// Coordinate conversions
function getGoTerm(r, c, p) {
    if (typeof window.detectHypotheticalTerm === 'function') {
        let result = window.detectHypotheticalTerm(r, c, p, state.currentMoveIndex);
        let match = result ? result.patternMatch : null;
        if (match && match.pattern && match.pattern.name) {
            return match.pattern.name;
        }
    }
    let ex = Math.min(c, 18 - c) + 1;
    let ey = Math.min(r, 18 - r) + 1;
    if (ex > ey) { let t = ex; ex = ey; ey = t; }
    if (ex === 10 && ey === 10) return "Tengen";
    if (ex === 4 && ey === 4) return "Hoshi";
    if (ex === 3 && ey === 3) return "San-san";
    if (ex === 3 && ey === 4) return "Komoku";
    if (ex === 4 && ey === 5) return "Takamoku";
    if (ex === 3 && ey === 5) return "Mokuhazushi";
    if (ex === 5 && ey === 5) return "Go-no-go";
    return `${ex}-${ey}`;
}

function getCanvasCoords(e) {
    const target = e.target;
    const rect = target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;
    return { x, y };
}

function getGridIntersection(cx, cy) {
    const c = Math.round((cx - PADDING) / CELL_SIZE);
    const r = Math.round((cy - PADDING) / CELL_SIZE);
    return {
        r: Math.max(-1, Math.min(19, r)),
        c: Math.max(-1, Math.min(19, c))
    };
}

function getBlockFromCanvas(cx, cy) {
    const c = Math.floor((cx - PADDING) / CELL_SIZE);
    const r = Math.floor((cy - PADDING) / CELL_SIZE);
    if (c < 0 || c > 17 || r < 0 || r > 17) return null;
    return { r, c };
}

// Get the visual coordinates of the selection box in 600x600 space
function getSelectionRect() {
    let x1, x2, y1, y2;
    
    if (state.crop.colStart === -1) {
        x1 = 0;
    } else {
        x1 = PADDING + (state.crop.colStart - 0.5) * CELL_SIZE;
    }
    
    if (state.crop.colEnd === 19) {
        x2 = CANVAS_SIZE;
    } else {
        x2 = PADDING + (state.crop.colEnd + 0.5) * CELL_SIZE;
    }
    
    if (state.crop.rowStart === -1) {
        y1 = 0;
    } else {
        y1 = PADDING + (state.crop.rowStart - 0.5) * CELL_SIZE;
    }
    
    if (state.crop.rowEnd === 19) {
        y2 = CANVAS_SIZE;
    } else {
        y2 = PADDING + (state.crop.rowEnd + 0.5) * CELL_SIZE;
    }
    
    return { x1, x2, y1, y2 };
}

// Interactive Mouse down handler
function handleMouseDown(e) {
    if (e.button !== 0) return; // Only left click
    const coords = getCanvasCoords(e);
    const { x, y } = coords;
    const { r, c } = getGridIntersection(x, y);
    const rect = getSelectionRect();
    const hitRadius = 16; // Hit test radius for handles

    // 1. Check if clicking on crop resize handles
    const dists = [
        Math.hypot(x - rect.x1, y - rect.y1), // TL
        Math.hypot(x - rect.x2, y - rect.y1), // TR
        Math.hypot(x - rect.x1, y - rect.y2), // BL
        Math.hypot(x - rect.x2, y - rect.y2)  // BR
    ];

    let clickedHandle = -1;
    for (let i = 0; i < 4; i++) {
        if (dists[i] < hitRadius) {
            clickedHandle = i + 1;
            break;
        }
    }

    if (clickedHandle !== -1) {
        if (state.activeTool === 'crop' && !state.cropLocked) {
            saveHistoryState();
            state.drag.mode = 'resize';
            state.drag.handle = clickedHandle;
            state.drag.startCell = { r, c };
            state.drag.initialCrop = Object.assign({}, state.crop);
            return;
        }
    }

    // 2. If no handles were clicked, evaluate cell action
    if (state.whatIfMode) {
        if (c >= 0 && c <= 18 && r >= 0 && r <= 18 && (!state.board[r][c].player)) {
            let p = 'B';
            if (state.currentMoveIndex >= 0 && state.currentMoveIndex < state.sgfMoves.length) {
                p = state.sgfMoves[state.currentMoveIndex].player;
            } else if (state.currentMoveIndex === -1) {
                p = 'B';
            }
            state.whatIfStone = { r, c, player: p, term: getGoTerm(r, c, p) };
            state.whatIfHover = null;
        } else {
            state.whatIfMode = false;
            state.whatIfStone = null;
            if (elements.btnWhatIf) {
                elements.btnWhatIf.style.backgroundColor = 'rgba(139, 26, 26, 0.1)';
                elements.btnWhatIf.style.borderColor = 'rgb(139, 26, 26)';
                elements.btnWhatIf.style.color = 'rgb(139, 26, 26)';
            }
        }
        drawBoard();
        return;
    }

    if (state.playMode) {
        if (c >= 0 && c <= 18 && r >= 0 && r <= 18) {
            const cell = state.board[r][c];
            if (cell.player === null) {
                const recorded = recordMoveAt(r, c, state.playTurn, 'play-mode');
                if (recorded) {
                    state.playTurn = state.playTurn === 'B' ? 'W' : 'B';
                }
            } else {
                const m = state.currentMoveIndex >= 0 ? state.sgfMoves[state.currentMoveIndex] : null;
                if (m && !m.isPass && m.r === r && m.c === c) {
                    removeLastMove();
                    state.playTurn = state.playTurn === 'B' ? 'W' : 'B';
                }
            }
        }
        return;
    }

    // Ref-Point mode: click to insert coord (e.g. C11) at cursor position
    if (state.refPointMode) {
        if (c >= 0 && c <= 18 && r >= 0 && r <= 18) {
            // Compute visual coord matching board labels (skip 'I', 19-r for row)
            const fc = state.isPovFlipped ? (18 - c) : c;
            const fr = state.isPovFlipped ? (18 - r) : r;
            const colIndex = fc >= 8 ? fc + 1 : fc;
            const col = String.fromCharCode(65 + colIndex);
            const row = 19 - fr;
            const coord = `${col}${row}`;
            const ta = elements.sgfCommentInput;

            // Check if this point is already selected (toggle off = deselect)
            const existIdx = state.refPointCells.findIndex(pt => pt.r === r && pt.c === c);
            if (existIdx >= 0) {
                state.refPointCells.splice(existIdx, 1);
            } else {
                state.refPointCells.push({ r, c });
            }

            // Rebuild the coord string from all selected points
            if (ta && ta.style.display === 'block' && state.refPointInsertPos >= 0) {
                const before = ta.value.slice(0, state.refPointInsertPos);
                const after = ta.value.slice(state.refPointInsertPos);
                // Skip past existing coord string (coords + commas) to find the tail
                let coordEnd = 0;
                while (coordEnd < after.length) {
                    if (/[A-HJ-T]/i.test(after[coordEnd])) {
                        coordEnd++;
                        while (coordEnd < after.length && /\d/.test(after[coordEnd])) coordEnd++;
                        while (coordEnd < after.length && /[, ]/.test(after[coordEnd])) coordEnd++;
                    } else {
                        break;
                    }
                }
                const coordStr = state.refPointCells.map(pt => {
                    const pfc = state.isPovFlipped ? (18 - pt.c) : pt.c;
                    const pfr = state.isPovFlipped ? (18 - pt.r) : pt.r;
                    const pColIndex = pfc >= 8 ? pfc + 1 : pfc;
                    const pCol = String.fromCharCode(65 + pColIndex);
                    const pRow = 19 - pfr;
                    return `${pCol}${pRow}`;
                }).join(', ');
                ta.value = before + coordStr + after.slice(coordEnd);
                ta.selectionStart = ta.selectionEnd = before.length + coordStr.length;
            }
            drawBoard();
        }
        return;
    }

    // Ref-Area mode: toggle blocks in/out of selection (block-based, 18×18)
    if (state.refAreaMode) {
        const block = getBlockFromCanvas(x, y);
        if (block) {
            const idx = state.refAreaCells.findIndex(pt => pt.r === block.r && pt.c === block.c);
            if (idx >= 0) {
                state.refAreaCells.splice(idx, 1);
            } else {
                state.refAreaCells.push(block);
            }
            // Dynamically write cell list into textarea
            const ta = elements.sgfCommentInput;
            if (ta && ta.style.display === 'block' && state.refAreaInsertPos >= 0) {
                const before = ta.value.slice(0, state.refAreaInsertPos);
                const after = ta.value.slice(state.refAreaInsertPos);
                // Build coords inside cell()
                const coords = state.refAreaCells.map(pt => {
                    const col = String.fromCharCode(65 + pt.c);
                    const row = pt.r + 1;
                    return `${col}${row}`;
                }).join(', ');
                const cellStr = coords ? `cell(${coords})` : '';
                // Skip past any existing cell(...) to find the tail
                let tailStart = 0;
                const cellMatch = after.match(/^cell\([^)]*\)/);
                if (cellMatch) tailStart = cellMatch[0].length;
                const tail = after.slice(tailStart);
                ta.value = before + cellStr + tail;
                ta.selectionStart = ta.selectionEnd = state.refAreaInsertPos + cellStr.length;
            }
            drawBoard();
        }
        return;
    }

    if (state.activeTool === 'crop') {
        if (state.cropLocked) return; // Prevent edits when locked
        
        // Check if click is inside the selection box to drag and move it
        if (c >= state.crop.colStart && c <= state.crop.colEnd && r >= state.crop.rowStart && r <= state.crop.rowEnd) {
            saveHistoryState();
            state.drag.mode = 'move';
            state.drag.startCell = { r, c };
            state.drag.initialCrop = Object.assign({}, state.crop);
        } else {
            // Start drawing a new crop box
            saveHistoryState();
            state.drag.mode = 'draw';
            state.drag.startCell = { r, c };
            state.crop.colStart = c;
            state.crop.colEnd = c;
            state.crop.rowStart = r;
            state.crop.rowEnd = r;
            drawBoard();
            updateCropBadge();
        }
    } else {
        // Place stone/marker/label on cell intersection
        applyToolToCell(r, c);
    }
}

// Interactive Mouse move handler (updating resize/move/cursor status)
function handleMouseMove(e) {
    const coords = getCanvasCoords(e);
    const { x, y } = coords;
    const { r, c } = getGridIntersection(x, y);
    
    // Update cursor style depending on hover state when NOT dragging
    if (!state.drag.mode) {
        if (state.whatIfMode) {
            if (c >= 0 && c <= 18 && r >= 0 && r <= 18 && !state.board[r][c].player) {
                if (!state.whatIfStone || state.whatIfStone.r !== r || state.whatIfStone.c !== c) {
                    if (!state.whatIfHover || state.whatIfHover.r !== r || state.whatIfHover.c !== c) {
                        state.whatIfHover = { r, c };
                        drawBoard();
                    }
                } else if (state.whatIfHover) {
                    state.whatIfHover = null;
                    drawBoard();
                }
            } else {
                if (state.whatIfHover) {
                    state.whatIfHover = null;
                    drawBoard();
                }
            }
            [elements.canvasInitial, elements.canvasStudy].forEach(canv => {
                if (canv) canv.style.cursor = 'crosshair';
            });
            return;
        } else {
            if (state.whatIfHover) {
                state.whatIfHover = null;
                drawBoard();
            }
        }

        // Ref-Point mode: just set cursor, no hover highlight needed
        if (state.refPointMode) {
            [elements.canvasInitial, elements.canvasStudy].forEach(canv => {
                if (canv) canv.style.cursor = 'crosshair';
            });
            return;
        }

        // Ref-Area mode: track hover block
        if (state.refAreaMode) {
            const block = getBlockFromCanvas(x, y);
            const prev = state.refAreaHoverCell;
            if (block && (!prev || prev.r !== block.r || prev.c !== block.c)) {
                state.refAreaHoverCell = block;
                drawBoard();
            } else if (!block && prev) {
                state.refAreaHoverCell = null;
                drawBoard();
            }
            [elements.canvasInitial, elements.canvasStudy].forEach(canv => {
                if (canv) canv.style.cursor = 'crosshair';
            });
            return;
        }

        const rect = getSelectionRect();
        const hitRadius = 12;
        
        const distTL = Math.hypot(x - rect.x1, y - rect.y1);
        const distBR = Math.hypot(x - rect.x2, y - rect.y2);
        const distTR = Math.hypot(x - rect.x2, y - rect.y1);
        const distBL = Math.hypot(x - rect.x1, y - rect.y2);
        const isNearCorner = distTL <= 15 || distBR <= 15 || distTR <= 15 || distBL <= 15;

        if (!state.cropLocked && (state.activeTool === 'crop')) {
            if (distTL <= 15) {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'nwse-resize';
                });
            } else if (distBR <= 15) {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'nwse-resize';
                });
            } else if (distTR <= 15) {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'nesw-resize';
                });
            } else if (distBL <= 15) {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'nesw-resize';
                });
            } else if (c >= state.crop.colStart && c <= state.crop.colEnd && r >= state.crop.rowStart && r <= state.crop.rowEnd) {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'move';
                });
            } else {
                [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                    if (c) c.style.cursor = 'crosshair';
                });
            }
        } else if (state.cropLocked && state.activeTool === 'crop') {
            [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                if (c) c.style.cursor = 'not-allowed';
            });
        } else {
            [elements.canvasInitial, elements.canvasStudy].forEach(c => {
                if (c) c.style.cursor = 'pointer';
            });
        }
        return;
    }

    // Handle Active Dragging states
    if (state.drag.mode === 'resize') {
        const h = state.drag.handle;
        const init = state.drag.initialCrop;
        
        if (h === 1) { // TL
            state.crop.colStart = Math.min(Math.min(init.colEnd, c), 18);
            state.crop.rowStart = Math.min(Math.min(init.rowEnd, r), 18);
        } else if (h === 2) { // TR
            state.crop.colEnd = Math.max(Math.max(init.colStart, c), 0);
            state.crop.rowStart = Math.min(Math.min(init.rowEnd, r), 18);
        } else if (h === 3) { // BL
            state.crop.colStart = Math.min(Math.min(init.colEnd, c), 18);
            state.crop.rowEnd = Math.max(Math.max(init.rowStart, r), 0);
        } else if (h === 4) { // BR
            state.crop.colEnd = Math.max(Math.max(init.colStart, c), 0);
            state.crop.rowEnd = Math.max(Math.max(init.rowStart, r), 0);
        }
        drawBoard();
        updateCropBadge();
    } else if (state.drag.mode === 'move') {
        const dc = c - state.drag.startCell.c;
        const dr = r - state.drag.startCell.r;
        const init = state.drag.initialCrop;
        
        const width = init.colEnd - init.colStart;
        const height = init.rowEnd - init.rowStart;
        
        let newColStart = init.colStart + dc;
        let newRowStart = init.rowStart + dr;
        
        // Clamp bounds so box stays on board (including coordinate labels [-1, 19])
        if (newColStart < -1) newColStart = -1;
        if (newColStart + width > 19) newColStart = 19 - width;
        if (newRowStart < -1) newRowStart = -1;
        if (newRowStart + height > 19) newRowStart = 19 - height;
        
        state.crop.colStart = newColStart;
        state.crop.colEnd = newColStart + width;
        state.crop.rowStart = newRowStart;
        state.crop.rowEnd = newRowStart + height;
        
        drawBoard();
        updateCropBadge();
    } else if (state.drag.mode === 'draw') {
        const start = state.drag.startCell;
        state.crop.colStart = Math.min(18, Math.min(start.c, c));
        state.crop.colEnd = Math.max(0, Math.max(start.c, c));
        state.crop.rowStart = Math.min(18, Math.min(start.r, r));
        state.crop.rowEnd = Math.max(0, Math.max(start.r, r));
        
        drawBoard();
        updateCropBadge();
    }
}

// Mouse up handler
function handleMouseUp() {
    if (state.drag.mode) {
        const init = state.drag.initialCrop;
        const current = state.crop;
        const cropChanged = !init || 
            init.colStart !== current.colStart || 
            init.colEnd !== current.colEnd || 
            init.rowStart !== current.rowStart || 
            init.rowEnd !== current.rowEnd;

        if (!cropChanged && init) {
            undoStack.pop();
            updateUndoRedoButtons();
        } else if (cropChanged) {
            state.isSgfDirty = true; state.popupShownForCurrentChange = false;
            updateSaveRecGameButton();
            if (elements.sgfExportContainer) {
                elements.sgfExportContainer.style.display = 'flex';
                if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
            }
        }

        state.drag.mode = null;
        state.drag.handle = null;
        state.drag.startCell = null;
        state.drag.initialCrop = null;
        [elements.canvasInitial, elements.canvasStudy].forEach(c => {
            if (c) c.style.cursor = 'default';
        });
        drawBoard();
    }
}

// Update the crop selection dimensions text label
function updateCropBadge() {
    const colCount = state.crop.colEnd - state.crop.colStart + 1;
    const rowCount = state.crop.rowEnd - state.crop.rowStart + 1;
    
    const hasLeft = (state.crop.colStart === -1);
    const hasRight = (state.crop.colEnd === 19);
    const hasTop = (state.crop.rowStart === -1);
    const hasBottom = (state.crop.rowEnd === 19);

    if (colCount === 21 && rowCount === 21) {
        if (elements.cropDimensionsBadge) elements.cropDimensionsBadge.textContent = 'Selected Size: Full Board with Coordinates (21x21)';
    } else {
        const colStartLabel = hasLeft ? 'Margin' : (state.isPovFlipped ? COLS[18 - state.crop.colStart] : COLS[state.crop.colStart]);
        const colEndLabel = hasRight ? 'Margin' : (state.isPovFlipped ? COLS[18 - state.crop.colEnd] : COLS[state.crop.colEnd]);
        const rowStartLabel = hasTop ? 'Margin' : (state.isPovFlipped ? state.crop.rowStart + 1 : 19 - state.crop.rowStart);
        const rowEndLabel = hasBottom ? 'Margin' : (state.isPovFlipped ? state.crop.rowEnd + 1 : 19 - state.crop.rowEnd);
        
        let labelInfo = `${colStartLabel}${rowStartLabel} to ${colEndLabel}${rowEndLabel}`;
        let extraInfo = [];
        if (hasLeft || hasRight || hasTop || hasBottom) {
            if (hasLeft) extraInfo.push('Left Coord');
            if (hasRight) extraInfo.push('Right Coord');
            if (hasTop) extraInfo.push('Top Coord');
            if (hasBottom) extraInfo.push('Bottom Coord');
            labelInfo += ` (incl. ${extraInfo.join(', ')})`;
        }
        if (elements.cropDimensionsBadge) elements.cropDimensionsBadge.textContent = `Selected Size: ${colCount}x${rowCount} (${labelInfo})`;
    }
}

// Apply Selected Tool Elements on Click
function applyToolToCell(r, c) {
    // Check if clicked cell is within actual board bounds (0 to 18)
    if (c < 0 || c > 18 || r < 0 || r > 18) {
        return; // Clicked coordinate margins, ignore placing stones
    }
    const cell = state.board[r][c];
    const tool = state.activeTool;

    // Stone & Play tools record real SGF moves (with captures / ko), then rebuild the board.
    if (tool === 'stone-b' || tool === 'stone-w' || tool === 'play-b' || tool === 'play-w') {
        // Play Black / Play White alternate from the selected starting color (GoWrite-style):
        // play-b -> B, W, B, ... ; play-w -> W, B, W, ... via state.playSeq.currentColor.
        let color;
        if (tool === 'stone-b') color = 'B';
        else if (tool === 'stone-w') color = 'W';
        else color = state.playSeq.currentColor;
        recordMoveAt(r, c, color, tool);
        return;
    }

    // Check if the change will actually modify the board state
    let changed = false;
    if (tool === 'clear' && (cell.player !== null || cell.annotation !== null || cell.label !== null)) changed = true;
    else if (tool === 'hoshi') changed = true;
    else if (tool === 'mark-triangle' && cell.annotation !== 'triangle') changed = true;
    else if (tool === 'mark-square' && cell.annotation !== 'square') changed = true;
    else if (tool === 'mark-circle' && cell.annotation !== 'circle') changed = true;
    else if (tool === 'mark-cross' && cell.annotation !== 'cross') changed = true;
    else if (tool === 'mark-red-circle' && cell.annotation !== 'red-circle') changed = true;
    else if (tool === 'mark-green-circle' && cell.annotation !== 'green-circle') changed = true;
    else if (tool === 'label-letter' && cell.label !== state.customLetter) changed = true;
    else if (tool === 'label-number' && cell.label !== String(state.customNumber)) changed = true;
    else if (tool === 'label-text' && cell.label !== state.customText) changed = true;

    if (changed) {
        saveHistoryState(tool);
    }

    if (tool === 'clear') {
        cell.player = null;
        cell.annotation = null;
        cell.label = null;
        if (state.annotLastStone && state.annotLastStone.r === r && state.annotLastStone.c === c) {
            state.annotLastStone = null;
        }
    } else if (tool === 'hoshi') {
        state.hoshiPoints[r][c] = !state.hoshiPoints[r][c];
    } else if (tool === 'mark-triangle') {
        cell.annotation = 'triangle';
    } else if (tool === 'mark-square') {
        cell.annotation = 'square';
    } else if (tool === 'mark-circle') {
        cell.annotation = 'circle';
    } else if (tool === 'mark-cross') {
        cell.annotation = 'cross';
    } else if (tool === 'mark-red-circle') {
        cell.annotation = 'red-circle';
    } else if (tool === 'mark-green-circle') {
        cell.annotation = 'green-circle';
    } else if (tool === 'label-letter') {
        cell.label = state.customLetter;
        
        // Auto-increment letter
        const code = state.customLetter.charCodeAt(0);
        if (code >= 65 && code < 90) { // Increment A to Y
            state.customLetter = String.fromCharCode(code + 1);
            elements.customLetterInput.value = state.customLetter;
            elements.toolLetterPreview.textContent = state.customLetter.toLowerCase();
            if (window.updateResetBtnVisibility) window.updateResetBtnVisibility();
        }
    } else if (tool === 'label-number') {
        cell.label = String(state.customNumber);
        
        // Auto-increment number
        state.customNumber = Math.min(99, state.customNumber + 1);
        elements.customNumberInput.value = state.customNumber;
        elements.toolNumberPreview.textContent = state.customNumber;
        if (window.updateResetBtnVisibility) window.updateResetBtnVisibility();
    } else if (tool === 'label-text') {
        cell.label = state.customText;
    }

    drawBoard();

    if (changed && tool !== 'stone-b' && tool !== 'stone-w' && tool !== 'crop' && tool !== 'clear') {
        sfxAnnot.currentTime = 0;
        sfxAnnot.play().catch(e => console.error('Annot audio play failed:', e));
    }

    if (changed) {
        syncAnnotationsToState();
    }
}

function syncAnnotationsToState() {
    let anns = [];
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const cell = state.board[r][c];
            if (cell.annotation) anns.push({ r, c, type: cell.annotation });
            if (cell.label) anns.push({ r, c, type: 'label', label: cell.label });
        }
    }
    if (state.currentMoveIndex === -1) {
        state.baselineAnnotations = anns;
    } else if (state.currentMoveIndex >= 0 && state.currentMoveIndex < state.sgfMoves.length) {
        state.sgfMoves[state.currentMoveIndex].annotations = anns;
    }
    
    state.isSgfDirty = true; state.popupShownForCurrentChange = false;
    updateSaveRecGameButton();
    if (elements.sgfExportContainer) {
        elements.sgfExportContainer.style.display = 'flex';
        if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
    }
}

// Render the Interactive Go Board (Screen)

// Flip the board 180 degrees (POV)
function flipBoard180() {
    saveHistoryState();
    
    state.fastForwardAnim = {
        active: true,
        startTime: performance.now(),
        durationPerStone: 8,
        individualSlideDuration: 400,
        cellMoves: Array.from({length: 19}, () => Array(19).fill(-1)),
        lastStonesRevealed: -1,
        audioPool: []
    };
    
    // 1. Flip current board
    const newBoard = Array.from({length: 19}, () => Array.from({length: 19}, () => ({player: null, annotation: null, label: null})));
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            newBoard[18-r][18-c] = JSON.parse(JSON.stringify(state.board[r][c]));
        }
    }
    state.board = newBoard;
    
    // 2. Flip baseline board
    if (state.baselineBoard) {
        const newBaseline = Array.from({length: 19}, () => Array.from({length: 19}, () => ({player: null, annotation: null, label: null})));
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                newBaseline[18-r][18-c] = JSON.parse(JSON.stringify(state.baselineBoard[r][c]));
            }
        }
        state.baselineBoard = newBaseline;
    }
    
    // 3. Flip hoshi points
    const newHoshi = Array.from({length: 19}, () => Array(19).fill(false));
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            newHoshi[18-r][18-c] = state.hoshiPoints[r][c];
        }
    }
    state.hoshiPoints = newHoshi;
    
    // 4. Flip allSgfMoves (automatically affects sgfMoves due to references)
    if (state.allSgfMoves) {
        state.allSgfMoves.forEach(m => {
            if (m.r !== -1 && m.c !== -1) {
                m.r = 18 - m.r;
                m.c = 18 - m.c;
            }
        });
    }
    
    // Populate cellMoves using the newly flipped coordinates in sgfMoves
    if (state.sgfMoves) {
        state.sgfMoves.forEach((m, i) => {
            if (m.r !== -1 && m.c !== -1) {
                state.fastForwardAnim.cellMoves[m.r][m.c] = i;
            }
        });
    }
    
    // 5. Flip crop window
    const oldCrop = state.crop;
    state.crop = {
        colStart: 18 - oldCrop.colEnd,
        colEnd: 18 - oldCrop.colStart,
        rowStart: 18 - oldCrop.rowEnd,
        rowEnd: 18 - oldCrop.rowStart
    };
    
    state.isPovFlipped = !state.isPovFlipped;
    
    // 6. Flip player display
    const metaContainer = document.getElementById('sgf-meta-container');
    const capB = document.getElementById('capture-container-b');
    const capW = document.getElementById('capture-container-w');
    const toggleB = document.getElementById('toggle-capture-b');
    const toggleW = document.getElementById('toggle-capture-w');
    
    if (metaContainer && capB && capW && toggleB && toggleW) {
        if (state.isPovFlipped) {
            metaContainer.style.flexDirection = 'row-reverse';
            capB.style.left = 'auto';
            capB.style.right = '1rem';
            capW.style.left = '1rem';
            capW.style.right = 'auto';
            toggleB.style.left = 'auto';
            toggleB.style.right = '8px';
            toggleW.style.left = '8px';
            toggleW.style.right = 'auto';
        } else {
            metaContainer.style.flexDirection = 'row';
            capB.style.left = '1rem';
            capB.style.right = 'auto';
            capW.style.left = 'auto';
            capW.style.right = '1rem';
            toggleB.style.left = '8px';
            toggleB.style.right = 'auto';
            toggleW.style.left = 'auto';
            toggleW.style.right = '8px';
        }
    }
    
    updatePlayerHighlightUI();
    drawBoard();
    updateCropBadge();
    updateReplicationCode();
    generateAutoSgfText();
}

// Sync state to Shudan DOM board

function drawBoard() {
    if (!elements.canvasInitial) elements.canvasInitial = document.getElementById('go-board-canvas-initial');
    if (!elements.canvasStudy)   elements.canvasStudy   = document.getElementById('go-board-canvas-study');
    if (!elements.canvasScoring) elements.canvasScoring = document.getElementById('go-board-canvas-scoring');
    const canvases = [
        { el: elements.canvasInitial, isPlayerMode: true, isStudyMode: false, isExportMode: false, isScoringMode: false },
        { el: elements.canvasStudy, isPlayerMode: false, isStudyMode: true, isExportMode: false, isScoringMode: false },
        { el: elements.canvasScoring, isPlayerMode: false, isStudyMode: false, isExportMode: false, isScoringMode: true }
    ];
    
    canvases.forEach(c => {
        if (c.el) {
            const context = c.el.getContext('2d');
            renderBoardToCtx(context, c.isPlayerMode, c.isStudyMode, c.isExportMode, c.isScoringMode);
        }
    });
}

function renderBoardToCtx(ctx, isPlayerMode, isStudyMode = false, isExportMode = false, isScoringMode = false) {
    if (isScoringMode || (ctx.canvas && ctx.canvas.id === 'go-board-canvas-scoring')) {
        renderScoringBoardToCtx(ctx);
        return;
    }
    const isInitialCanvas = (ctx.canvas && ctx.canvas.id === 'go-board-canvas-initial');
    
    // Clear full canvas first using actual resolution before scaling
    const canvasW = (ctx && ctx.canvas && ctx.canvas.width) ? ctx.canvas.width : CANVAS_SIZE;
    const canvasH = (ctx && ctx.canvas && ctx.canvas.height) ? ctx.canvas.height : CANVAS_SIZE;
    ctx.clearRect(0, 0, canvasW, canvasH);
    
    ctx.save();
    try {
        let style = null;
        if (isInitialCanvas) {
            style = state.initialBoardStyle;
        } else if (isStudyMode) {
            style = state.studyBoardStyle;
        }
        
        if (style && style.board) {
            const size = style.board.size || 600;
            const scaleFactor = size / 600;
            ctx.scale(scaleFactor, scaleFactor);
        }

        let ffAnimating = false;
        let currentTotalTime = 0;

        if (state.fastForwardAnim && state.fastForwardAnim.active) {
            const now = performance.now();
            currentTotalTime = now - state.fastForwardAnim.startTime;
            
            const stonesToReveal = Math.floor(currentTotalTime / state.fastForwardAnim.durationPerStone);
            const filterStart = (state.filterStart || 1) - 1;
            const activeMovesCount = Math.max(0, state.currentMoveIndex - filterStart + 1);
            const totalStones = state.sgfMoves ? Math.min(state.sgfMoves.length, activeMovesCount) : 0;
            
            if (stonesToReveal > state.fastForwardAnim.lastStonesRevealed && stonesToReveal <= totalStones) {
                let shouldPlaySound = false;
                for (let s = state.fastForwardAnim.lastStonesRevealed + 1; s <= stonesToReveal; s++) {
                    let mod = 4;
                    if (s >= 150) mod = 12;
                    else if (s >= 100) mod = 10;
                    else if (s >= 50) mod = 8;
                    else if (s >= 25) mod = 6;
                    
                    if (s % mod === 2) {
                        shouldPlaySound = true;
                        break;
                    }
                }
                
                state.fastForwardAnim.lastStonesRevealed = stonesToReveal;
                
                if (shouldPlaySound) {
                    let audio = state.fastForwardAnim.audioPool.find(a => a.ended || a.paused);
                    if (!audio && state.fastForwardAnim.audioPool.length < 8) {
                        audio = new Audio('_sfx/碁石を打つ.mp3');
                        audio.volume = 0.4;
                        state.fastForwardAnim.audioPool.push(audio);
                    }
                    if (audio) {
                        audio.currentTime = 0;
                        audio.play().catch(e => {});
                    }
                }
            }
            
            const totalAnimTime = (totalStones + 5) * state.fastForwardAnim.durationPerStone + state.fastForwardAnim.individualSlideDuration;

            if (currentTotalTime >= totalAnimTime) {
                state.fastForwardAnim.active = false;
            } else {
                ffAnimating = true;
            }
        }

        const getAnimatedPos = (r, c, moveIdx) => {
            let cx = PADDING + c * CELL_SIZE;
            let cy = PADDING + r * CELL_SIZE;
            if (ffAnimating && moveIdx !== undefined) {
                const revealTime = moveIdx * state.fastForwardAnim.durationPerStone;
                if (currentTotalTime >= revealTime) {
                    let p = (currentTotalTime - revealTime) / state.fastForwardAnim.individualSlideDuration;
                    if (p < 1.0) {
                        let ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
                        const startCx = PADDING + (18 - c) * CELL_SIZE;
                        const startCy = PADDING + (18 - r) * CELL_SIZE;
                        cx = startCx + (cx - startCx) * ease;
                        cy = startCy + (cy - startCy) * ease;
                    }
                }
            }
            return { cx, cy };
        };

        // 1. Draw canvas background color (white)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // 1.1 Draw board background wood color or image
        let currentBoardBg = '#dcb35c';
        let currentBorderMarginColor = '#dcb35c';
        let currentBorderLineColor = isPlayerMode ? '#1C1917' : '#000000';
        let currentBorderWidth = isPlayerMode ? 1 : 1.5;
        let borderScale = 1;
        
        let boardImage = null;
        
        if (style) {
            currentBoardBg = (style.board && style.board.useColor) ? style.board.color : '#dcb35c';
            currentBorderMarginColor = style.border ? style.border.color : '#dcb35c';
            borderScale = (style.border && style.border.size !== undefined) ? (parseFloat(style.border.size) / 100) : 1;
            
            if (style.board && !style.board.useColor && style.board.imgSrc) {
                const cacheKey = isInitialCanvas ? 'initialBoardBgImage' : 'studyBoardBgImage';
                if (!window[cacheKey]) {
                    window[cacheKey] = new Image();
                    window[cacheKey].onload = () => {
                        if (typeof drawBoard === 'function') drawBoard();
                    };
                    window[cacheKey].src = style.board.imgSrc;
                } else if (window[cacheKey].src !== style.board.imgSrc) {
                    window[cacheKey].src = style.board.imgSrc;
                }
                
                if (window[cacheKey].complete && window[cacheKey].naturalWidth > 0) {
                    boardImage = window[cacheKey];
                }
            }
        }
        
        // Calculate wood margin size
        const marginSize = (CELL_SIZE / 2) * borderScale;
        const woodX = PADDING - marginSize;
        const woodY = PADDING - marginSize;
        const woodW = 18 * CELL_SIZE + 2 * marginSize;
        const woodH = 18 * CELL_SIZE + 2 * marginSize;

        // Fill the outer wood area (margin) with the Border Color
        ctx.fillStyle = currentBorderMarginColor;
        ctx.fillRect(woodX, woodY, woodW, woodH);

        // Then fill the inner grid area with the Board Color or Image
        if (boardImage) {
            let imgZoom = 1.0;
            let imgOffsetX = 0;
            let imgOffsetY = 0;
            if (style && style.board && style.board.imgZoom !== undefined) {
                imgZoom = parseFloat(style.board.imgZoom);
            }
            if (style && style.board && style.board.imgOffsetX !== undefined) {
                imgOffsetX = parseFloat(style.board.imgOffsetX);
            }
            if (style && style.board && style.board.imgOffsetY !== undefined) {
                imgOffsetY = parseFloat(style.board.imgOffsetY);
            }

            if (style && style.board && style.board.imgRepeat) {
                ctx.save();
                ctx.translate(woodX, woodY);
                try {
                    const pattern = ctx.createPattern(boardImage, 'repeat');
                    if (pattern.setTransform) {
                        const matrix = new DOMMatrix().translate(imgOffsetX, imgOffsetY).scale(imgZoom, imgZoom);
                        pattern.setTransform(matrix);
                    }
                    ctx.fillStyle = pattern;
                    ctx.fillRect(0, 0, woodW, woodH);
                } catch (e) {
                    ctx.fillStyle = currentBoardBg;
                    ctx.fillRect(0, 0, woodW, woodH);
                }
                ctx.restore();
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.rect(woodX, woodY, woodW, woodH);
                ctx.clip();
                
                const scaledW = woodW * imgZoom;
                const scaledH = woodH * imgZoom;
                const dx = woodX + (woodW - scaledW) / 2 + imgOffsetX;
                const dy = woodY + (woodH - scaledH) / 2 + imgOffsetY;
                ctx.drawImage(boardImage, dx, dy, scaledW, scaledH);
                
                ctx.restore();
            }
        } else {
            ctx.fillStyle = currentBoardBg;
            ctx.fillRect(PADDING, PADDING, 18 * CELL_SIZE, 18 * CELL_SIZE);
        }

        // 1.2 Draw outline around wood board
        ctx.strokeStyle = currentBorderLineColor;
        ctx.lineWidth = currentBorderWidth;
        ctx.strokeRect(woodX, woodY, woodW, woodH);

        // 2. Draw coordinate labels (4 sides)
        let coordData = {
            show: true,
            primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
            secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
        };
        if (style && style.coord) {
            coordData = style.coord;
        }

        const markerStyle = (style && style.marker) ? style.marker : null;
        const markerEnabled = markerStyle ? !!markerStyle.show : state.showMoveMarker;
        const markerColor = markerStyle ? (markerStyle.color || '#ff3b30') : state.moveMarkerColor;

        if (coordData.show) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const easternNumerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];

            let markerCol = -1, markerRow = -1;
            if (markerEnabled && state.currentMoveIndex >= 0 && state.sgfMoves && state.currentMoveIndex < state.sgfMoves.length) {
                const markerMove = state.sgfMoves[state.currentMoveIndex];
                if (markerMove && markerMove.r >= 0 && markerMove.r < 19 && markerMove.c >= 0 && markerMove.c < 19) {
                    markerCol = markerMove.c;
                    markerRow = markerMove.r;
                }
            } else if (markerEnabled && state.annotLastStone) {
                markerCol = state.annotLastStone.c;
                markerRow = state.annotLastStone.r;
            }

            for (let i = 0; i < 19; i++) {
                const { cx: animX } = getAnimatedPos(0, i, 0);
                const { cy: animY } = getAnimatedPos(i, 0, 0);
                
                const flippedI = state.isPovFlipped ? (18 - i) : i;
                
                const colLabelWestern = String.fromCharCode(65 + (flippedI >= 8 ? flippedI + 1 : flippedI)); // A-T excluding I
                const rowLabelWestern = (19 - flippedI).toString();
                
                const colLabelEastern = (flippedI + 1).toString();
                const rowLabelEastern = easternNumerals[flippedI];

                const isMarkerCol = flippedI === markerCol;
                const isMarkerRow = flippedI === markerRow;

                if (coordData.primary.show) {
                    ctx.font = `normal ${coordData.primary.size}px "iGoRodinPro", sans-serif`;
                    const pad = parseFloat(coordData.primary.pad) || 0;
                    
                    const pCol = coordData.primary.type === 'eastern' ? colLabelEastern : colLabelWestern;
                    const pRow = coordData.primary.type === 'eastern' ? rowLabelEastern : rowLabelWestern;
                    
                    ctx.fillStyle = isMarkerCol ? markerColor : coordData.primary.color;
                    ctx.fillText(pCol, animX, PADDING / 2 - pad);
                    ctx.fillStyle = isMarkerRow ? markerColor : coordData.primary.color;
                    ctx.fillText(pRow, PADDING / 2 - pad, animY);
                }

                if (coordData.secondary.show) {
                    ctx.font = `normal ${coordData.secondary.size}px "iGoRodinPro", sans-serif`;
                    const pad = parseFloat(coordData.secondary.pad) || 0;
                    
                    const sCol = coordData.secondary.type === 'eastern' ? colLabelEastern : colLabelWestern;
                    const sRow = coordData.secondary.type === 'eastern' ? rowLabelEastern : rowLabelWestern;
                    
                    ctx.fillStyle = isMarkerCol ? markerColor : coordData.secondary.color;
                    ctx.fillText(sCol, animX, CANVAS_SIZE - PADDING / 2 + pad);
                    ctx.fillStyle = isMarkerRow ? markerColor : coordData.secondary.color;
                    ctx.fillText(sRow, CANVAS_SIZE - PADDING / 2 + pad, animY);
                }
            }
        }

        if (state.estimateMap) {
            ctx.save();
            ctx.globalAlpha = 0.85;
            for (let r = 0; r < 19; r++) {
                for (let c = 0; c < 19; c++) {
                    const val = state.estimateMap[r][c];
                    if (val === 1 || val === -1) {
                        ctx.fillStyle = val === 1 ? '#000000' : '#ffffff';
                        const cx = PADDING + c * CELL_SIZE;
                        const cy = PADDING + r * CELL_SIZE;
                        const boxSize = CELL_SIZE * 0.35;
                        ctx.fillRect(cx - boxSize/2, cy - boxSize/2, boxSize, boxSize);
                    }
                }
            }
            ctx.restore();
        }

        // 3. Draw grid lines
        let gridLineWidth = 1;
        let gridLineColor = isPlayerMode ? '#1C1917' : '#000000';
        let hoshiRadius = 3;
        let hoshiColor = '#000000';
        
        if (style && style.grid) {
            gridLineWidth = parseFloat(style.grid.lineSize) || 1;
            gridLineColor = style.grid.lineColor || (isPlayerMode ? '#1C1917' : '#000000');
            hoshiRadius = parseFloat(style.grid.hoshiSize) || 3;
            hoshiColor = style.grid.hoshiColor || '#000000';
        }

        ctx.lineWidth = gridLineWidth;
        ctx.strokeStyle = gridLineColor;
        
        // Draw horizontal & vertical grid lines
        for (let i = 0; i < 19; i++) {
            const offset = PADDING + i * CELL_SIZE;
            const isBoundary = (i === 0 || i === 18);
            
            // Vertical line
            ctx.beginPath();
            if (style && style.grid && isBoundary) {
                ctx.lineWidth = parseFloat(style.grid.boundarySize) || 1.5;
                ctx.strokeStyle = style.grid.boundaryColor || '#1c1917';
            } else {
                ctx.lineWidth = gridLineWidth;
                ctx.strokeStyle = gridLineColor;
            }
            ctx.moveTo(offset, PADDING);
            ctx.lineTo(offset, CANVAS_SIZE - PADDING);
            ctx.stroke();

            // Horizontal line
            ctx.beginPath();
            if (style && style.grid && isBoundary) {
                ctx.lineWidth = parseFloat(style.grid.boundarySize) || 1.5;
                ctx.strokeStyle = style.grid.boundaryColor || '#1c1917';
            } else {
                ctx.lineWidth = gridLineWidth;
                ctx.strokeStyle = gridLineColor;
            }
            ctx.moveTo(PADDING, offset);
            ctx.lineTo(CANVAS_SIZE - PADDING, offset);
            ctx.stroke();
        }

        // 4. Draw Hoshi star points
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (state.hoshiPoints[r][c]) {
                    const { cx, cy } = getAnimatedPos(r, c, undefined);
                    ctx.beginPath();
                    ctx.arc(cx, cy, hoshiRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = hoshiColor;
                    ctx.fill();
                }
            }
        }

        // 4.5 Draw Move Term Highlights (if any)
        if (typeof window.drawMoveTermHighlights === 'function') {
            window.drawMoveTermHighlights(ctx, PADDING, CELL_SIZE);
        }

        // 4.6-4.9 Draw all comment highlights as a single unified path (no additive alpha)
        const _hasQrt = typeof _commentQuarterHighlighted !== 'undefined' && _commentQuarterHighlighted !== null && _commentQuarterHighlighted.length > 0;
        const _hasHoshi = typeof _commentHoshiHighlighted !== 'undefined' && _commentHoshiHighlighted !== null && _commentHoshiHighlighted.length > 0;
        const _hasHoshiRect = typeof _commentHoshiRectHighlighted !== 'undefined' && _commentHoshiRectHighlighted !== null && _commentHoshiRectHighlighted.length > 0;
        const _hasCell = _commentCellHighlighted.length > 0;
        const _hasRefArea = state.refAreaCells.length > 0;
        const _hasRefPoint = state.refPointMode && state.refPointCells.length > 0;
        if (_hasQrt || _hasHoshi || _hasHoshiRect || _hasCell || _hasRefArea || _hasRefPoint) {
            ctx.save();
            ctx.beginPath();
            const mid = PADDING + 9 * CELL_SIZE;

            // Quarter highlights
            if (_hasQrt) {
                for (const entry of _commentQuarterHighlighted) {
                    if (typeof entry === 'object' && entry.qrt) {
                        let parentQrt = entry.qrt;
                        if (state.isPovFlipped) parentQrt = 5 - parentQrt;
                        let px, py;
                        if (parentQrt === 1) { px = PADDING; py = PADDING; }
                        else if (parentQrt === 2) { px = mid; py = PADDING; }
                        else if (parentQrt === 3) { px = PADDING; py = mid; }
                        else if (parentQrt === 4) { px = mid; py = mid; }
                        for (const sub of entry.subs) {
                            let sx, sy, sw, sh;
                            if (sub === 1) { sx = px; sy = py; sw = 5 * CELL_SIZE; sh = 5 * CELL_SIZE; }
                            else if (sub === 2) { sx = px + 5 * CELL_SIZE; sy = py; sw = 4 * CELL_SIZE; sh = 5 * CELL_SIZE; }
                            else if (sub === 3) { sx = px; sy = py + 5 * CELL_SIZE; sw = 5 * CELL_SIZE; sh = 4 * CELL_SIZE; }
                            else if (sub === 4) { sx = px + 5 * CELL_SIZE; sy = py + 5 * CELL_SIZE; sw = 4 * CELL_SIZE; sh = 4 * CELL_SIZE; }
                            ctx.rect(sx, sy, sw, sh);
                        }
                    } else {
                        let visualQrt = entry;
                        if (state.isPovFlipped) visualQrt = 5 - visualQrt;
                        let x, y, w, h;
                        if (visualQrt === 1) { x = PADDING; y = PADDING; w = 9 * CELL_SIZE; h = 9 * CELL_SIZE; }
                        else if (visualQrt === 2) { x = mid; y = PADDING; w = 9 * CELL_SIZE; h = 9 * CELL_SIZE; }
                        else if (visualQrt === 3) { x = PADDING; y = mid; w = 9 * CELL_SIZE; h = 9 * CELL_SIZE; }
                        else if (visualQrt === 4) { x = mid; y = mid; w = 9 * CELL_SIZE; h = 9 * CELL_SIZE; }
                        ctx.rect(x, y, w, h);
                    }
                }
            }

            // Hoshi circle highlights
            if (_hasHoshi) {
                for (const hNum of _commentHoshiHighlighted) {
                    const hp = HOSHI_POSITIONS[hNum];
                    if (!hp) continue;
                    const cx = PADDING + hp.c * CELL_SIZE;
                    const cy = PADDING + hp.r * CELL_SIZE;
                    const circleRadius = 3 * CELL_SIZE;
                    ctx.moveTo(cx + circleRadius, cy);
                    ctx.arc(cx, cy, circleRadius, 0, 2 * Math.PI);
                }
            }

            // Hoshi rectangle highlights
            if (_hasHoshiRect) {
                for (const hNum of _commentHoshiRectHighlighted) {
                    const hp = HOSHI_POSITIONS[hNum];
                    if (!hp) continue;
                    const radius = 3;
                    const cStart = Math.max(0, hp.c - radius);
                    const cEnd = Math.min(18, hp.c + radius);
                    const rStart = Math.max(0, hp.r - radius);
                    const rEnd = Math.min(18, hp.r + radius);
                    const x = PADDING + cStart * CELL_SIZE;
                    const y = PADDING + rStart * CELL_SIZE;
                    const w = (cEnd - cStart) * CELL_SIZE;
                    const h = (rEnd - rStart) * CELL_SIZE;
                    ctx.rect(x, y, w, h);
                }
            }

            // Cell block highlights (ref-area blocks between grid lines) — comment hover
            if (_hasCell) {
                for (const blk of _commentCellHighlighted) {
                    ctx.rect(PADDING + blk.c * CELL_SIZE, PADDING + blk.r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }
            }

            // Ref-Area selection highlights (interactive mode — same layer as ho/qrt)
            if (_hasRefArea) {
                for (const pt of state.refAreaCells) {
                    ctx.rect(PADDING + pt.c * CELL_SIZE, PADDING + pt.r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }
            }

            ctx.fillStyle = 'rgba(125, 221, 255, 0.55)';
            ctx.fill();
            ctx.restore();
        }

        // Ref-Point selection highlights (focus bracket rectangle at intersection)
        if (_hasRefPoint) {
            ctx.save();
            ctx.strokeStyle = 'rgba(67, 130, 119, 0.9)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            for (const pt of state.refPointCells) {
                const ix = PADDING + pt.c * CELL_SIZE;
                const iy = PADDING + pt.r * CELL_SIZE;
                const s = CELL_SIZE * 0.45;  // half-size of bracket rectangle
                const arm = CELL_SIZE * 0.22; // length of each corner arm
                // Top-left corner
                ctx.beginPath();
                ctx.moveTo(ix - s, iy - s + arm);
                ctx.lineTo(ix - s, iy - s);
                ctx.lineTo(ix - s + arm, iy - s);
                ctx.stroke();
                // Top-right corner
                ctx.beginPath();
                ctx.moveTo(ix + s - arm, iy - s);
                ctx.lineTo(ix + s, iy - s);
                ctx.lineTo(ix + s, iy - s + arm);
                ctx.stroke();
                // Bottom-left corner
                ctx.beginPath();
                ctx.moveTo(ix - s, iy + s - arm);
                ctx.lineTo(ix - s, iy + s);
                ctx.lineTo(ix - s + arm, iy + s);
                ctx.stroke();
                // Bottom-right corner
                ctx.beginPath();
                ctx.moveTo(ix + s - arm, iy + s);
                ctx.lineTo(ix + s, iy + s);
                ctx.lineTo(ix + s, iy + s - arm);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Ref-Area hover cursor (above the unified highlight, below stones)
        if (state.refAreaHoverCell && state.refAreaMode) {
            const hc = state.refAreaHoverCell;
            ctx.save();
            ctx.strokeStyle = 'rgba(125, 221, 255, 0.75)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(PADDING + hc.c * CELL_SIZE, PADDING + hc.r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // 5. Draw Board Cell Contents (Stones, Labels, Annotations)
        const boardWidth = 18 * CELL_SIZE + CELL_SIZE;
        const drawAnnotations = !state.displayMoveNumbers;
        
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                const cell = state.board[r][c];
                if (cell.player || cell.annotation || cell.label) {
                    let moveIdx = undefined;
                    if (ffAnimating) {
                        moveIdx = state.fastForwardAnim.cellMoves[r][c];
                        if (moveIdx !== -1) {
                            const revealTime = moveIdx * state.fastForwardAnim.durationPerStone;
                            if (currentTotalTime < revealTime) continue;
                        } else {
                            moveIdx = undefined;
                        }
                    }
                    
                    const { cx, cy } = getAnimatedPos(r, c, moveIdx);
                    
                    const clipRect = {
                        x: PADDING - CELL_SIZE / 2,
                        y: PADDING - CELL_SIZE / 2,
                        w: boardWidth,
                        h: boardWidth
                    };
                    let cellToDraw = cell;
                    if (ffAnimating && !drawAnnotations) {
                        cellToDraw = { player: cell.player, annotation: null, label: null };
                    }
                    drawCellContent(ctx, cellToDraw, cx, cy, CELL_SIZE, false, clipRect, currentBoardBg, null, r, c);
                }
            }
        }

        if (state.showLiberties && typeof window.Liberties !== 'undefined') {
            window.Liberties.drawOnCanvas(ctx, state.board, {
                padding: PADDING,
                cellSize: CELL_SIZE,
                dotSize: 3.5,
                opacity: 0.45
            });
        }

        // 5.5 Draw Move Number Overlays
        if (state.displayMoveNumbers && state.allSgfMoves && state.allSgfMoves.length > 0) {
            let absoluteCurrentIndex = -1;
            if (state.sgfMoves && state.sgfMoves.length > 0 && state.currentMoveIndex >= 0) {
                absoluteCurrentIndex = (state.filterStart || 1) - 1 + state.currentMoveIndex;
            } else {
                absoluteCurrentIndex = (state.filterStart || 1) - 2;
            }

            let startIndex = 0;
            if (state.moveNumberMode === 'lastN') {
                startIndex = Math.max(0, absoluteCurrentIndex - state.lastNMoves + 1);
            }
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (absoluteCurrentIndex >= 0) {
                for (let i = startIndex; i <= absoluteCurrentIndex && i < state.allSgfMoves.length; i++) {
                    const move = state.allSgfMoves[i];
                    if (!move || move.r < 0 || move.r >= 19 || move.c < 0 || move.c >= 19) continue;
                    
                    const cell = state.board[move.r][move.c];
                    // Only draw number if there's a stone of the move's color there
                    if (cell.player === move.player) {
                        let moveIdx = undefined;
                        if (ffAnimating) {
                            moveIdx = state.fastForwardAnim.cellMoves[move.r][move.c];
                            if (moveIdx !== -1) {
                                const revealTime = moveIdx * state.fastForwardAnim.durationPerStone;
                                if (currentTotalTime < revealTime) continue;
                            } else {
                                moveIdx = undefined;
                            }
                        }
                        
                        const { cx, cy } = getAnimatedPos(move.r, move.c, moveIdx);
                        
                        let moveDisplayNum;
                        if (state.showMoveCoord) {
                            moveDisplayNum = COLS[move.c] + (19 - move.r);
                        } else if (state.moveNumberCountback && state.moveNumberMode === 'lastN') {
                            moveDisplayNum = (state.lastNMoves - (absoluteCurrentIndex - i)).toString();
                        } else {
                            moveDisplayNum = (i + 1).toString();
                        }
                        const numStr = moveDisplayNum;
                        let fontSize = Math.floor(CELL_SIZE * 0.45);
                        if (numStr.length > 2) fontSize = Math.floor(CELL_SIZE * 0.32);
                        else if (numStr.length === 2) fontSize = Math.floor(CELL_SIZE * 0.4);
                        
                        ctx.font = `normal ${fontSize}px "Figtree", sans-serif`;
                        const yOffset = 0;
                        
                        if (cell.label || cell.annotation) {
                            ctx.beginPath();
                            ctx.arc(cx, cy, CELL_SIZE * 0.35, 0, 2 * Math.PI);
                            ctx.fillStyle = cell.player === 'B' ? '#111827' : '#f3f4f6';
                            ctx.fill();
                        }
                        
                        // Default coloring
                        if (isInitialCanvas && state.initialBoardStyle) {
                            const blackStoneFg = state.initialBoardStyle.blackStone?.fg || '#ffffff';
                            const whiteStoneFg = state.initialBoardStyle.whiteStone?.fg || '#111827';
                            ctx.fillStyle = cell.player === 'B' ? blackStoneFg : whiteStoneFg;
                            
                            const fgSizeVal = cell.player === 'B' ? state.initialBoardStyle.blackStone?.fgSize : state.initialBoardStyle.whiteStone?.fgSize;
                            const fgSize = parseFloat(fgSizeVal);
                            if (!isNaN(fgSize) && fgSize !== null) {
                                fontSize = fgSize;
                                ctx.font = `normal ${fontSize}px "Figtree", sans-serif`;
                            }
                        } else {
                            ctx.fillStyle = cell.player === 'B' ? '#ffffff' : '#000000';
                        }
                        
                        // Highlight latest move
                        if (i === absoluteCurrentIndex) {
                            ctx.fillStyle = cell.player === 'B' ? '#11ffee' : '#ff1122'; // #11ffee for Black, #ff1122 for White
                        }
                        
                        ctx.fillText(numStr, cx, cy + yOffset);
                    }
                }
            }
        }
        
        // Draw Next Move Hint
        if (state.showNextMoveHint) {
            const nextIndex = state.currentMoveIndex + 1;
            if (nextIndex < state.sgfMoves.length) {
                const nextMove = state.sgfMoves[nextIndex];
                if (nextMove && nextMove.r >= 0 && nextMove.r < 19 && nextMove.c >= 0 && nextMove.c < 19) {
                    const { cx, cy } = getAnimatedPos(nextMove.r, nextMove.c, undefined);
                    
                    let hintStyle = { color: '#ff3b30', size: 0.25, alpha: 0.5 };
                    const activeStyle = typeof getActiveStyleObject === 'function' ? getActiveStyleObject() : state.exportBoardStyle;
                    if (activeStyle && activeStyle.hint) {
                        hintStyle = activeStyle.hint;
                    }
                    
                    ctx.save();
                    ctx.globalAlpha = parseFloat(hintStyle.alpha);
                    ctx.strokeStyle = hintStyle.color;
                    ctx.lineWidth = Math.max(2, CELL_SIZE * 0.06);
                    ctx.beginPath();
                    ctx.arc(cx, cy, CELL_SIZE * parseFloat(hintStyle.size), 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // 5.5 Draw Top Highlights for move terms (on top of stones)
        if (typeof window.drawMoveTermTopHighlights === 'function') {
            window.drawMoveTermTopHighlights(ctx, PADDING, CELL_SIZE);
        }

        // 5.6 Draw Pass Text for current move if pass
        if (state.sgfMoves && state.sgfMoves.length > 0 && state.currentMoveIndex >= 0) {
            const move = state.sgfMoves[state.currentMoveIndex];
            if (move && move.isPass) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const passCx = PADDING + 9 * CELL_SIZE;
                const passCy = PADDING + 9 * CELL_SIZE;
                ctx.font = `bold ${Math.floor(CELL_SIZE * 0.75)}px "Figtree", sans-serif`;
                ctx.fillStyle = move.player === 'B' ? '#111827' : '#f3f4f6';
                const label = move.player === 'B' ? 'Black Pass' : 'White Pass';
                ctx.fillText(label, passCx + 2, passCy + 2);
                ctx.fillStyle = move.player === 'B' ? '#f3f4f6' : '#111827';
                ctx.fillText(label, passCx, passCy);
            }
        }

        if (!state.displayMoveNumbers && state.sgfMoves && state.sgfMoves.length > 0 && state.currentMoveIndex >= 0) {
            let shouldHide = false;
            if (ffAnimating) {
                const annotationRevealTime = (state.sgfMoves ? state.sgfMoves.length : 0) * state.fastForwardAnim.durationPerStone;
                if (currentTotalTime < annotationRevealTime) shouldHide = true;
            }
            if (!shouldHide) {
                const move = state.sgfMoves[state.currentMoveIndex];
                if (move && move.r >= 0 && move.r < 19 && move.c >= 0 && move.c < 19) {
                    const cell = state.board[move.r][move.c];
                    if (cell.player === move.player) {
                        const { cx, cy } = getAnimatedPos(move.r, move.c, undefined);
                        const rectSize = Math.max(4, CELL_SIZE * 0.25);
                        ctx.fillStyle = cell.player === 'B' ? '#11ffee' : '#ff1122';
                        ctx.fillRect(cx - rectSize/2, cy - rectSize/2, rectSize, rectSize);
                    }
                }
            }
        }

        // 5.7 Draw Ladder Trajectory Highlights (above stones)
        drawLadderHighlights(ctx);

        // 6. Draw Dimmed Non-Selected Area Overlay
        if (isPlayerMode && (state.activeTool === 'crop' || state.cropLocked)) {
            const rect = getSelectionRect();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';

            // Top overlay rect
            ctx.fillRect(0, 0, CANVAS_SIZE, rect.y1);
            // Bottom overlay rect
            ctx.fillRect(0, rect.y2, CANVAS_SIZE, CANVAS_SIZE - rect.y2);
            // Left overlay rect
            ctx.fillRect(0, rect.y1, rect.x1, rect.y2 - rect.y1);
            // Right overlay rect
            ctx.fillRect(rect.x2, rect.y1, CANVAS_SIZE - rect.x2, rect.y2 - rect.y1);

            // 7. Draw Selection Box highlight outline
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#4f46e5';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
            ctx.setLineDash([]); // Reset line dash

            // 8. Draw Selection Resize Handles (small circles/rects at corners)
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 2;
            const handleSize = 8;
            const hs = handleSize / 2;

            const corners = [
                { x: rect.x1, y: rect.y1 }, // TL
                { x: rect.x2, y: rect.y1 }, // TR
                { x: rect.x1, y: rect.y2 }, // BL
                { x: rect.x2, y: rect.y2 }  // BR
            ];

            corners.forEach(corner => {
                ctx.fillRect(corner.x - hs, corner.y - hs, handleSize, handleSize);
                ctx.strokeRect(corner.x - hs, corner.y - hs, handleSize, handleSize);
            });
        }

        // 9. Draw What-If Preview
        if (state.whatIfHover || state.whatIfStone) {
            const tgt = state.whatIfHover || state.whatIfStone;
            const isHover = !!state.whatIfHover;
            
            let p = 'B';
            if (state.whatIfStone) {
                p = state.whatIfStone.player;
            } else {
                if (state.currentMoveIndex >= 0 && state.currentMoveIndex < state.sgfMoves.length) {
                    p = state.sgfMoves[state.currentMoveIndex].player;
                }
            }
            
            const pCell = { player: p, annotation: null, label: null };
            const { cx, cy } = getAnimatedPos(tgt.r, tgt.c, undefined);
            const styleObj = document.body.classList.contains('study-mode-active') ? state.studyBoardStyle : state.initialBoardStyle;
            
            ctx.save();
            ctx.globalAlpha = isHover ? 0.4 : 0.6;
            const clipR = { x: PADDING - CELL_SIZE / 2, y: PADDING - CELL_SIZE / 2, w: boardWidth, h: boardWidth };
            drawCellContent(ctx, pCell, cx, cy, CELL_SIZE, false, clipR, currentBoardBg, null, tgt.r, tgt.c, styleObj);
            ctx.restore();
            
            if (!isHover && state.whatIfStone && state.whatIfStone.term) {
                const termStr = state.whatIfStone.term;
                ctx.save();
                ctx.font = `italic 500 ${Math.max(12, CELL_SIZE * 0.45)}px "AnthropicSansLight", sans-serif`;
                const textMetrics = ctx.measureText(termStr);
                const paddingX = 10;
                const pillWidth = textMetrics.width + paddingX * 2;
                const pillHeight = CELL_SIZE * 0.7;
                const pillX = cx - pillWidth / 2;
                const pillY = cy - CELL_SIZE * 1.2 - pillHeight / 2;
                
                ctx.fillStyle = p === 'B' ? '#111827' : '#f3f4f6';
                ctx.shadowColor = 'rgba(0,0,0,0.2)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 3;
                ctx.beginPath();
                ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 4);
                ctx.fill();
                
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = p === 'B' ? '#374151' : '#d1d5db';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.fillStyle = p === 'B' ? '#ffffff' : '#111827';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(termStr, cx, pillY + pillHeight / 2);
                ctx.restore();
            }
        }

        // 9.5. Draw capture animation (stones shrinking + fading away)
        if (state.captureAnim && state.captureAnim.active && state.captureAnim.stones.length > 0) {
            const elapsed = performance.now() - state.captureAnim.startTime;
            const t = Math.min(1, elapsed / state.captureAnim.duration);
            if (t >= 1) {
                state.captureAnim.active = false;
            } else {
                // Ease out cubic
                const ease = 1 - Math.pow(1 - t, 3);
                const scale = 1 - ease;
                const alpha = 1 - ease;

                for (const stone of state.captureAnim.stones) {
                    const { cx: sx, cy: sy } = getAnimatedPos(stone.r, stone.c, undefined);
                    const stoneRadius = CELL_SIZE * 0.42;
                    const animRadius = stoneRadius * scale;
                    if (animRadius < 0.5) continue;

                    ctx.save();
                    ctx.globalAlpha = alpha;

                    // Draw the stone being captured (same style as drawCellContent)
                    const isBlack = stone.player === 'B';
                    const bgColor = isBlack ? '#111827' : '#f3f4f6';

                    // Board mask circle
                    ctx.beginPath();
                    ctx.arc(sx, sy, animRadius * 1.08, 0, 2 * Math.PI);
                    ctx.fillStyle = currentBoardBg;
                    ctx.fill();

                    // Stone surface
                    ctx.beginPath();
                    ctx.arc(sx, sy, animRadius, 0, 2 * Math.PI);
                    if (isBlack) {
                        const grad = ctx.createRadialGradient(sx - animRadius * 0.3, sy - animRadius * 0.3, animRadius * 0.05, sx, sy, animRadius);
                        grad.addColorStop(0, '#5a5a5a');
                        grad.addColorStop(0.5, '#1a1a1a');
                        grad.addColorStop(1, '#000000');
                        ctx.fillStyle = grad;
                        ctx.shadowColor = 'rgba(0,0,0,0.4)';
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetY = 2;
                    } else {
                        const grad = ctx.createRadialGradient(sx - animRadius * 0.3, sy - animRadius * 0.3, animRadius * 0.05, sx, sy, animRadius);
                        grad.addColorStop(0, '#ffffff');
                        grad.addColorStop(0.5, '#e6e6e6');
                        grad.addColorStop(1, '#a0a0a0');
                        ctx.fillStyle = grad;
                        ctx.strokeStyle = '#888888';
                        ctx.lineWidth = 0.5;
                    }
                    ctx.fill();
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 0;
                    if (!isBlack) ctx.stroke();

                    // Red "X" over the captured stone
                    const xSize = animRadius * 0.5;
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = Math.max(2, animRadius * 0.15);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(sx - xSize, sy - xSize);
                    ctx.lineTo(sx + xSize, sy + xSize);
                    ctx.moveTo(sx + xSize, sy - xSize);
                    ctx.lineTo(sx - xSize, sy + xSize);
                    ctx.stroke();

                    ctx.restore();
                }
                // Request next frame to continue animation
                if (!ffAnimating) {
                    requestAnimationFrame(() => drawBoard());
                }
            }
        }

        // 10. Draw current move marker triangles in border (topmost layer)
        if (markerEnabled && state.currentMoveIndex >= 0 && state.sgfMoves && state.currentMoveIndex < state.sgfMoves.length) {
            const markerMove = state.sgfMoves[state.currentMoveIndex];
            if (markerMove && markerMove.r >= 0 && markerMove.r < 19 && markerMove.c >= 0 && markerMove.c < 19) {
                const { cx: markerX, cy: markerY } = getAnimatedPos(markerMove.r, markerMove.c, 0);
                const triSize = Math.max(4, marginSize * 0.9);
                ctx.fillStyle = markerColor;

                // Top triangle (▼) - in top border margin, pointing down
                const topBorderCenter = PADDING - marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(markerX, topBorderCenter + triSize * 0.3);
                ctx.lineTo(markerX - triSize * 0.5, topBorderCenter - triSize * 0.3);
                ctx.lineTo(markerX + triSize * 0.5, topBorderCenter - triSize * 0.3);
                ctx.closePath();
                ctx.fill();

                // Bottom triangle (▲) - in bottom border margin, pointing up
                const bottomBorderCenter = CANVAS_SIZE - PADDING + marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(markerX, bottomBorderCenter - triSize * 0.3);
                ctx.lineTo(markerX - triSize * 0.5, bottomBorderCenter + triSize * 0.3);
                ctx.lineTo(markerX + triSize * 0.5, bottomBorderCenter + triSize * 0.3);
                ctx.closePath();
                ctx.fill();

                // Left triangle (►) - in left border margin, pointing right
                const leftBorderCenter = PADDING - marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(leftBorderCenter + triSize * 0.3, markerY);
                ctx.lineTo(leftBorderCenter - triSize * 0.3, markerY - triSize * 0.5);
                ctx.lineTo(leftBorderCenter - triSize * 0.3, markerY + triSize * 0.5);
                ctx.closePath();
                ctx.fill();

                // Right triangle (◄) - in right border margin, pointing left
                const rightBorderCenter = CANVAS_SIZE - PADDING + marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(rightBorderCenter - triSize * 0.3, markerY);
                ctx.lineTo(rightBorderCenter + triSize * 0.3, markerY - triSize * 0.5);
                ctx.lineTo(rightBorderCenter + triSize * 0.3, markerY + triSize * 0.5);
                ctx.closePath();
                ctx.fill();
            }
        } else if (markerEnabled && state.annotLastStone) {
            const als = state.annotLastStone;
            if (als.r >= 0 && als.r < 19 && als.c >= 0 && als.c < 19) {
                const { cx: markerX, cy: markerY } = getAnimatedPos(als.r, als.c, 0);
                const triSize = Math.max(4, marginSize * 0.9);
                ctx.fillStyle = markerColor;

                const topBorderCenter = PADDING - marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(markerX, topBorderCenter + triSize * 0.3);
                ctx.lineTo(markerX - triSize * 0.5, topBorderCenter - triSize * 0.3);
                ctx.lineTo(markerX + triSize * 0.5, topBorderCenter - triSize * 0.3);
                ctx.closePath();
                ctx.fill();

                const bottomBorderCenter = CANVAS_SIZE - PADDING + marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(markerX, bottomBorderCenter - triSize * 0.3);
                ctx.lineTo(markerX - triSize * 0.5, bottomBorderCenter + triSize * 0.3);
                ctx.lineTo(markerX + triSize * 0.5, bottomBorderCenter + triSize * 0.3);
                ctx.closePath();
                ctx.fill();

                const leftBorderCenter = PADDING - marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(leftBorderCenter + triSize * 0.3, markerY);
                ctx.lineTo(leftBorderCenter - triSize * 0.3, markerY - triSize * 0.5);
                ctx.lineTo(leftBorderCenter - triSize * 0.3, markerY + triSize * 0.5);
                ctx.closePath();
                ctx.fill();

                const rightBorderCenter = CANVAS_SIZE - PADDING + marginSize / 2;
                ctx.beginPath();
                ctx.moveTo(rightBorderCenter - triSize * 0.3, markerY);
                ctx.lineTo(rightBorderCenter + triSize * 0.3, markerY - triSize * 0.5);
                ctx.lineTo(rightBorderCenter + triSize * 0.3, markerY + triSize * 0.5);
                ctx.closePath();
                ctx.fill();
            }
        }

        if (ffAnimating) {
            requestAnimationFrame(() => renderBoardToCtx(ctx, isPlayerMode, isStudyMode, isExportMode));
        } else {
            updateReplicationCode();
            updateLegendUI();
        }
    } finally {
        ctx.restore();
    }
}
function isPosInQuarter(cx, cy, cellSize, qrtNum) {
    const mid = 36 + 9 * cellSize;
    if (qrtNum === 1) return cx <= mid && cy <= mid;
    if (qrtNum === 2) return cx >= mid && cy <= mid;
    if (qrtNum === 3) return cx <= mid && cy >= mid;
    if (qrtNum === 4) return cx >= mid && cy >= mid;
    return false;
}

// Helper: Draw single cell elements (stones, annotations, labels)
function drawCellContent(targetCtx, cell, cx, cy, cellSize, isExport = false, clipRect = null, bgColor = '#DCB35C', fullBoardRect = null, r = null, c = null) {
    const stoneRadius = cellSize * 0.47;

    // To ensure the outer masking strokes only appear on the board, and do not
    // cover the outermost boundary grid lines, we create an inset clip area just for masks.
    let maskClipRect = null;
    if (clipRect) {
        maskClipRect = {
            x: clipRect.x + 1.5,
            y: clipRect.y + 1.5,
            w: clipRect.w - 3,
            h: clipRect.h - 3
        };
    }

    // Determine which style object to use based on the target canvas
    let style = null;
    const isInitialCanvas = (targetCtx.canvas && targetCtx.canvas.id === 'go-board-canvas-initial');
    const isStudyCanvas = (targetCtx.canvas && targetCtx.canvas.id === 'go-board-canvas-study');
    const isScoringCanvas = (targetCtx.canvas && targetCtx.canvas.id === 'go-board-canvas-scoring');
    
    if (isInitialCanvas) {
        style = state.initialBoardStyle;
    } else if (isStudyCanvas) {
        style = state.studyBoardStyle;
    } else if (isScoringCanvas) {
        style = state.scoringBoardStyle;
    } else {
        // It's the export off-screen canvas
        style = state.exportBoardStyle;
    }

    const getBoardFillStyle = () => {
        let boardImage = null;
        const boardImageCacheKey = isInitialCanvas ? 'initialBoardBgImage' : (isStudyCanvas ? 'studyBoardBgImage' : (isScoringCanvas ? 'scoringBoardBgImage' : 'exportBoardBgImage'));
        const cachedBoardImg = window[boardImageCacheKey];
        if (style && !style.board.useColor && cachedBoardImg && cachedBoardImg.complete && cachedBoardImg.naturalWidth > 0) {
            boardImage = cachedBoardImg;
        }

        if (boardImage) {
            let woodX, woodY, woodW, woodH;
            if (isExport && fullBoardRect) {
                woodX = fullBoardRect.x;
                woodY = fullBoardRect.y;
                woodW = fullBoardRect.w;
                woodH = fullBoardRect.h;
            } else {
                const borderScale = parseFloat(style.border.size) / 100 || 1;
                const marginSize = (cellSize / 2) * borderScale;
                woodX = PADDING - marginSize;
                woodY = PADDING - marginSize;
                woodW = 18 * cellSize + 2 * marginSize;
                woodH = 18 * cellSize + 2 * marginSize;
            }
            
            let imgZoom = 1.0;
            let imgOffsetX = 0;
            let imgOffsetY = 0;
            if (style.board.imgZoom !== undefined) imgZoom = parseFloat(style.board.imgZoom);
            if (style.board.imgOffsetX !== undefined) imgOffsetX = parseFloat(style.board.imgOffsetX);
            if (style.board.imgOffsetY !== undefined) imgOffsetY = parseFloat(style.board.imgOffsetY);

            try {
                if (style.board.imgRepeat) {
                    const pattern = targetCtx.createPattern(boardImage, 'repeat');
                    if (pattern && pattern.setTransform) {
                        pattern.setTransform(new DOMMatrix().translate(woodX + imgOffsetX, woodY + imgOffsetY).scale(imgZoom, imgZoom));
                    }
                    return pattern || bgColor;
                } else {
                    const pattern = targetCtx.createPattern(boardImage, 'no-repeat');
                    if (pattern && pattern.setTransform) {
                        const scaledW = woodW * imgZoom;
                        const scaledH = woodH * imgZoom;
                        const dx = woodX + (woodW - scaledW) / 2 + imgOffsetX;
                        const dy = woodY + (woodH - scaledH) / 2 + imgOffsetY;
                        pattern.setTransform(new DOMMatrix().translate(dx, dy).scale(scaledW / boardImage.naturalWidth, scaledH / boardImage.naturalHeight));
                    }
                    return pattern || bgColor;
                }
            } catch (e) {
                return bgColor;
            }
        }
        return bgColor;
    };

    let currentStoneRadius = stoneRadius;
    let currentStoneBg = '';
    let currentStoneBr = '';
    let currentStoneBrSize = 0;
    let currentStoneBrRadius = 0; // extra radial offset for the BR ring (0 = hugs stone)
    let currentStoneBrBlur = 0;   // Gaussian blur radius for the BR ring in px
    let currentStoneFg = '';
    let currentStoneFgSize = null;

    const stoneStyle = (style && cell.player) ? (cell.player === 'B' ? style.blackStone : style.whiteStone) : null;

    if (stoneStyle) {
        let bgSizeVal = parseFloat(stoneStyle.bgSize);
        if (!isNaN(bgSizeVal)) {
            if (bgSizeVal <= 2.0) {
                currentStoneRadius = bgSizeVal * cellSize;
            } else {
                currentStoneRadius = bgSizeVal * (cellSize / 29.3333); // Scale absolute pixel value proportionally
            }
        } else {
            currentStoneRadius = stoneRadius;
        }
        currentStoneBg = stoneStyle.bg;
        currentStoneBr = stoneStyle.br;
        
        currentStoneBrSize = parseFloat(stoneStyle.brSize);
        if (isNaN(currentStoneBrSize)) currentStoneBrSize = 0;
        // brSize is a border thickness proportional to the stone — scale it relative to currentStoneRadius
        // A value of 1 ≈ ~3% of stone radius; 10 = ~30% of stone radius
        else currentStoneBrSize = (currentStoneBrSize / 10) * currentStoneRadius * 0.3;

        // brRadius: radial offset for the BR ring (0 = ring hugs stone, >0 = floats outward, <0 = sinks under stone)
        // Stored as a multiplier of currentStoneRadius so it's always proportional
        let brRadiusVal = parseFloat(stoneStyle.brRadius);
        if (isNaN(brRadiusVal)) brRadiusVal = 0;
        currentStoneBrRadius = brRadiusVal * currentStoneRadius;

        // brBlur: Gaussian blur strength for the BRr ring in px (scaled proportionally to canvas)
        let brBlurVal = parseFloat(stoneStyle.brBlur);
        currentStoneBrBlur = (isNaN(brBlurVal) || brBlurVal <= 0) ? 0 : brBlurVal * (cellSize / 29.3333);
        
        currentStoneFg = stoneStyle.fg;
        currentStoneFgSize = parseFloat(stoneStyle.fgSize);
    } else {
        if (cell.player === 'B') {
            currentStoneBg = '#111827';
        } else if (cell.player === 'W') {
            currentStoneBg = '#f8fafc';
            currentStoneBr = '#000000';
            currentStoneBrSize = Math.max(1, cellSize * 0.03);
        }
    }

    // Resolve view type for isolated caching
    const viewPrefix = isExport ? 'export' : (isStudyCanvas ? 'study' : 'initial');

    let stoneImage = null;
    if (stoneStyle && !stoneStyle.useColor && stoneStyle.imgSrc) {
        const cacheKey = `${viewPrefix}${cell.player}StoneBgImage`;
        if (!window[cacheKey]) {
            window[cacheKey] = new Image();
            window[cacheKey].onload = () => {
                if (typeof drawBoard === 'function') drawBoard();
                // Ensure export preview also triggers a redraw when async images finish
                if (isExport && typeof updateExportPreview === 'function') updateExportPreview();
            };
            window[cacheKey].src = stoneStyle.imgSrc;
        } else if (window[cacheKey].src !== stoneStyle.imgSrc) {
            window[cacheKey].src = stoneStyle.imgSrc;
        }
        
        if (window[cacheKey].complete && window[cacheKey].naturalWidth > 0) {
            stoneImage = window[cacheKey];
        }
    }

    // 1. Draw Stones (Three-Layer Rendering: Board Mask -> Stone Border -> Stone Surface)
    if (cell.player) {
        // --- LAYER 3 (BOTTOM): Board Mask / Background Circle ---
        let bmSizeVal = (stoneStyle && stoneStyle.bmSize !== undefined) ? parseFloat(stoneStyle.bmSize) : NaN;
        if (!isNaN(bmSizeVal)) {
            bmSizeVal = bmSizeVal * (cellSize / 29.3333); // Scale proportionally to the export canvas cell size
        }
        
        let isHighlighted = false;
        let highlightColor = null;
        if (c !== null && r !== null && typeof window._highlightedCells !== 'undefined' && window._highlightedCells) {
            for (let i = 0; i < window._highlightedCells.length; i++) {
                if (Number(window._highlightedCells[i][0]) === Number(c) && Number(window._highlightedCells[i][1]) === Number(r)) {
                    isHighlighted = true;
                    highlightColor = 'rgba(0, 130, 240, 0.4)';
                }
            }
        }
        if (!isHighlighted && c !== null && r !== null && typeof window._responseVertices !== 'undefined' && window._responseVertices) {
            for (let i = 0; i < window._responseVertices.length; i++) {
                if (Number(window._responseVertices[i][0]) === Number(c) && Number(window._responseVertices[i][1]) === Number(r)) {
                    isHighlighted = true;
                    highlightColor = 'rgba(34, 197, 94, 0.4)';
                }
            }
        }
        
        const currentBoardMaskRadius = bmSizeVal || (currentStoneRadius + (isHighlighted ? -0.5 : 1));
        
        // Resolve board background image if textured
        let boardImage = null;
        const boardImageCacheKey = isInitialCanvas ? 'initialBoardBgImage' : (isStudyCanvas ? 'studyBoardBgImage' : 'exportBoardBgImage');
        const cachedBoardImg = window[boardImageCacheKey];
        if (style && !style.board.useColor && cachedBoardImg && cachedBoardImg.complete && cachedBoardImg.naturalWidth > 0) {
            boardImage = cachedBoardImg;
        }

        targetCtx.save();
        if (maskClipRect) {
            targetCtx.beginPath();
            targetCtx.rect(maskClipRect.x, maskClipRect.y, maskClipRect.w, maskClipRect.h);
            targetCtx.clip();
        }

        targetCtx.beginPath();
        targetCtx.arc(cx, cy, currentBoardMaskRadius, 0, 2 * Math.PI);
        
        if (boardImage) {
            targetCtx.clip();
            const borderScale = parseFloat(style.border.size) / 100 || 1;
            const marginSize = (cellSize / 2) * borderScale;
            let woodX, woodY, woodW, woodH;
            
            if (isExport && fullBoardRect) {
                woodX = fullBoardRect.x;
                woodY = fullBoardRect.y;
                woodW = fullBoardRect.w;
                woodH = fullBoardRect.h;
            } else {
                woodX = PADDING - marginSize;
                woodY = PADDING - marginSize;
                woodW = 18 * cellSize + 2 * marginSize;
                woodH = 18 * cellSize + 2 * marginSize;
            }
            
            let imgZoom = 1.0;
            let imgOffsetX = 0;
            let imgOffsetY = 0;
            if (style.board.imgZoom !== undefined) imgZoom = parseFloat(style.board.imgZoom);
            if (style.board.imgOffsetX !== undefined) imgOffsetX = parseFloat(style.board.imgOffsetX);
            if (style.board.imgOffsetY !== undefined) imgOffsetY = parseFloat(style.board.imgOffsetY);

            if (style.board.imgRepeat) {
                try {
                    targetCtx.translate(woodX, woodY);
                    const pattern = targetCtx.createPattern(boardImage, 'repeat');
                    if (pattern.setTransform) {
                        const matrix = new DOMMatrix().translate(imgOffsetX, imgOffsetY).scale(imgZoom, imgZoom);
                        pattern.setTransform(matrix);
                    }
                    targetCtx.fillStyle = pattern;
                    targetCtx.translate(-woodX, -woodY);
                    targetCtx.fill();
                } catch (e) {
                    targetCtx.fillStyle = bgColor;
                    targetCtx.fill();
                }
            } else {
                const scaledW = woodW * imgZoom;
                const scaledH = woodH * imgZoom;
                const dx = woodX + (woodW - scaledW) / 2 + imgOffsetX;
                const dy = woodY + (woodH - scaledH) / 2 + imgOffsetY;

                const srcX = ((cx - currentBoardMaskRadius) - dx) / scaledW * boardImage.naturalWidth;
                const srcY = ((cy - currentBoardMaskRadius) - dy) / scaledH * boardImage.naturalHeight;
                const srcW = (currentBoardMaskRadius * 2) / scaledW * boardImage.naturalWidth;
                const srcH = (currentBoardMaskRadius * 2) / scaledH * boardImage.naturalHeight;
                
                targetCtx.drawImage(boardImage, srcX, srcY, srcW, srcH, cx - currentBoardMaskRadius, cy - currentBoardMaskRadius, currentBoardMaskRadius * 2, currentBoardMaskRadius * 2);
            }
        } else {
            targetCtx.fillStyle = bgColor;
            targetCtx.fill();
        }

        // Apply quarter highlight overlay on top of the BM wood texture if this cell is inside the active quarter
        if (typeof _commentQuarterHighlighted !== 'undefined' && _commentQuarterHighlighted !== null && _commentQuarterHighlighted.length > 0) {
            let insideAny = false;
            const _mid = PADDING + 9 * cellSize;
            for (const qrt of _commentQuarterHighlighted) {
                if (typeof qrt === 'object' && qrt.qrt) {
                    let parentQrt = qrt.qrt;
                    if (state.isPovFlipped) parentQrt = 5 - parentQrt;
                    let px, py;
                    if (parentQrt === 1) { px = PADDING; py = PADDING; }
                    else if (parentQrt === 2) { px = _mid; py = PADDING; }
                    else if (parentQrt === 3) { px = PADDING; py = _mid; }
                    else if (parentQrt === 4) { px = _mid; py = _mid; }
                    for (const sub of qrt.subs) {
                        let sx, sy, sw, sh;
                        if (sub === 1) { sx = px; sy = py; sw = 5 * cellSize; sh = 5 * cellSize; }
                        else if (sub === 2) { sx = px + 5 * cellSize; sy = py; sw = 4 * cellSize; sh = 5 * cellSize; }
                        else if (sub === 3) { sx = px; sy = py + 5 * cellSize; sw = 5 * cellSize; sh = 4 * cellSize; }
                        else if (sub === 4) { sx = px + 5 * cellSize; sy = py + 5 * cellSize; sw = 4 * cellSize; sh = 4 * cellSize; }
                        if (cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh) { insideAny = true; break; }
                    }
                    if (insideAny) break;
                } else {
                    let visualQrt = qrt;
                    if (state.isPovFlipped) {
                        visualQrt = 5 - visualQrt;
                    }
                    if (isPosInQuarter(cx, cy, cellSize, visualQrt)) {
                        insideAny = true;
                        break;
                    }
                }
            }
            if (insideAny) {
                targetCtx.save();
                targetCtx.fillStyle = 'rgba(125, 221, 255, 0.55)';
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentBoardMaskRadius, 0, 2 * Math.PI);
                targetCtx.fill();
                targetCtx.restore();
            }
        }

        // Apply hoshi highlight overlay on board texture if this cell is within circle radius of a highlighted hoshi
        if (typeof _commentHoshiHighlighted !== 'undefined' && _commentHoshiHighlighted !== null && _commentHoshiHighlighted.length > 0) {
            let insideHoshi = false;
            const circleRadius = 3 * cellSize;
            for (const hNum of _commentHoshiHighlighted) {
                const hp = HOSHI_POSITIONS[hNum];
                if (!hp) continue;
                const hoshiCx = PADDING + hp.c * cellSize;
                const hoshiCy = PADDING + hp.r * cellSize;
                const dist = Math.sqrt((cx - hoshiCx) ** 2 + (cy - hoshiCy) ** 2);
                if (dist <= circleRadius) {
                    insideHoshi = true;
                    break;
                }
            }
            if (insideHoshi) {
                targetCtx.save();
                targetCtx.fillStyle = 'rgba(125, 221, 255, 0.55)';
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentBoardMaskRadius, 0, 2 * Math.PI);
                targetCtx.fill();
                targetCtx.restore();
            }
        }

        // Apply hoshi rectangle highlight overlay on board texture
        if (typeof _commentHoshiRectHighlighted !== 'undefined' && _commentHoshiRectHighlighted !== null && _commentHoshiRectHighlighted.length > 0) {
            let insideHoshiRect = false;
            const cellR = Math.round((cy - PADDING) / cellSize);
            const cellC = Math.round((cx - PADDING) / cellSize);
            for (const hNum of _commentHoshiRectHighlighted) {
                const hp = HOSHI_POSITIONS[hNum];
                if (!hp) continue;
                const radius = 3;
                if (Math.abs(cellR - hp.r) <= radius && Math.abs(cellC - hp.c) <= radius) {
                    insideHoshiRect = true;
                    break;
                }
            }
            if (insideHoshiRect) {
                targetCtx.save();
                targetCtx.fillStyle = 'rgba(125, 221, 255, 0.55)';
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentBoardMaskRadius, 0, 2 * Math.PI);
                targetCtx.fill();
                targetCtx.restore();
            }
        }

        // Apply cell block highlight overlay on board texture (intersection sits at corner of up to 4 blocks)
        if (_commentCellHighlighted.length > 0) {
            const iR = Math.round((cy - PADDING) / cellSize);
            const iC = Math.round((cx - PADDING) / cellSize);
            let insideCellBlock = false;
            for (const blk of _commentCellHighlighted) {
                if ((iC === blk.c && iR === blk.r) ||
                    (iC - 1 === blk.c && iR === blk.r) ||
                    (iC === blk.c && iR - 1 === blk.r) ||
                    (iC - 1 === blk.c && iR - 1 === blk.r)) {
                    insideCellBlock = true;
                    break;
                }
            }
            if (insideCellBlock) {
                targetCtx.save();
                targetCtx.fillStyle = 'rgba(125, 221, 255, 0.55)';
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentBoardMaskRadius, 0, 2 * Math.PI);
                targetCtx.fill();
                targetCtx.restore();
            }
        }

        targetCtx.restore();

        // Draw the transparent CIRCLE_F highlight circle (above BM layer, under stone)
        if (isHighlighted) {
            const baseStoneR = cellSize * 0.47;
            const CIRCLE_F = baseStoneR * 1.20;
            targetCtx.save();
            targetCtx.fillStyle = highlightColor;
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, CIRCLE_F, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.restore();
        }

        // Draw stone group highlight halos — first matching group claims the cell, no double-render
        if ((c !== null && r !== null) && _commentStoneGroupGroups.length > 0) {
            const baseR = cellSize * 0.47;
            for (let gi = 0; gi < _commentStoneGroupGroups.length; gi++) {
                const grp = _commentStoneGroupGroups[gi];
                let found = false;
                for (let i = 0; i < grp.cells.length; i++) {
                    if (grp.cells[i].r === r && grp.cells[i].c === c) { found = true; break; }
                }
                if (!found) continue;
                targetCtx.save();
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, baseR * 1.18, 0, Math.PI * 2);
                targetCtx.fillStyle = grp.color === 'B' ? 'rgba(50, 50, 50, 0.45)' : 'rgba(255, 255, 250, 0.55)';
                targetCtx.fill();
                targetCtx.lineWidth = 2;
                targetCtx.strokeStyle = grp.color === 'B' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(180, 180, 175, 0.85)';
                targetCtx.stroke();
                targetCtx.restore();
                break;
            }
        }

        // --- LAYER 2 (MIDDLE): Stone Border Ring (BRr) — always above BM, always below stone ---
        if (currentStoneBrSize > 0) {
            targetCtx.save();
            if (currentStoneBrBlur > 0) {
                targetCtx.filter = `blur(${currentStoneBrBlur.toFixed(2)}px)`;
            }
            targetCtx.beginPath();
            // Offset the ring by brRadius (proportional to stone size) beyond the stone edge
            const brArcRadius = currentStoneRadius + currentStoneBrRadius + currentStoneBrSize / 2;
            targetCtx.arc(cx, cy, brArcRadius, 0, 2 * Math.PI);
            targetCtx.lineWidth = currentStoneBrSize;
            targetCtx.strokeStyle = currentStoneBr;
            targetCtx.stroke();
            targetCtx.restore(); // clears filter
        }

        // --- LAYER 1 (TOP): Stone Surface ---
        targetCtx.save();
        if (clipRect && !isExport) {
            targetCtx.beginPath();
            targetCtx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
            targetCtx.clip();
        }

        const useGradient = (style && style.stoneSet === 'A' && cell.player);
        const useGradientB = (style && style.stoneSet === 'B' && cell.player);
        if (useGradient || useGradientB) {
            targetCtx.save();
            // Stronger drop shadow matching MultiGo
            targetCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            targetCtx.shadowBlur = Math.max(3, currentStoneRadius * 0.25);
            targetCtx.shadowOffsetX = Math.max(2, currentStoneRadius * 0.15);
            targetCtx.shadowOffsetY = Math.max(2, currentStoneRadius * 0.15);
            
            if (useGradientB) {
                if (cell.player === 'B') {
                    const gradient = targetCtx.createRadialGradient(
                        cx - currentStoneRadius * 0.25, cy - currentStoneRadius * 0.25, currentStoneRadius * 0.08,
                        cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.2
                    );
                    gradient.addColorStop(0.0, '#6b7280');
                    gradient.addColorStop(0.35, '#1f2937');
                    gradient.addColorStop(1.0, '#030712');
                    targetCtx.fillStyle = gradient;
                    targetCtx.beginPath();
                    targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
                    targetCtx.fill();
                } else {
                    const gradient = targetCtx.createRadialGradient(
                        cx - currentStoneRadius * 0.35, cy - currentStoneRadius * 0.35, currentStoneRadius * 0.15,
                        cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.2
                    );
                    gradient.addColorStop(0.0, '#fffef5');
                    gradient.addColorStop(0.5, '#f0ead6');
                    gradient.addColorStop(1.0, '#bab5a0');
                    targetCtx.fillStyle = gradient;
                    targetCtx.beginPath();
                    targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
                    targetCtx.fill();
                    
                    targetCtx.shadowColor = 'transparent';
                    targetCtx.lineWidth = Math.max(0.5, currentStoneRadius * 0.02);
                    targetCtx.strokeStyle = '#a09880';
                    targetCtx.stroke();
                }
            } else if (cell.player === 'B') {
                // Directional lighting: outer circle offset to the bottom right
                const gradient = targetCtx.createRadialGradient(
                    cx - currentStoneRadius * 0.3, cy - currentStoneRadius * 0.3, currentStoneRadius * 0.1,
                    cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.1
                );
                gradient.addColorStop(0.0, '#5a5a5a'); // Soft highlight
                gradient.addColorStop(0.4, '#1a1a1a'); // Mid tone
                gradient.addColorStop(1.0, '#000000'); // Pure black shadow
                targetCtx.fillStyle = gradient;
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
                targetCtx.fill();
            } else {
                // Directional lighting for white stone
                const gradient = targetCtx.createRadialGradient(
                    cx - currentStoneRadius * 0.3, cy - currentStoneRadius * 0.3, currentStoneRadius * 0.2,
                    cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.1
                );
                gradient.addColorStop(0.0, '#ffffff');
                gradient.addColorStop(0.5, '#e6e6e6');
                gradient.addColorStop(1.0, '#a0a0a0');
                targetCtx.fillStyle = gradient;
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
                targetCtx.fill();
                
                // Very subtle rim stroke, without double shadowing
                targetCtx.shadowColor = 'transparent';
                targetCtx.lineWidth = Math.max(0.5, currentStoneRadius * 0.02);
                targetCtx.strokeStyle = '#888888';
                targetCtx.stroke();
            }
            targetCtx.restore();
        } else if (stoneImage) {
            // Draw the custom image exactly as it is, preserving all shadows and transparent boundaries (no clipping!)
            targetCtx.drawImage(stoneImage, cx - currentStoneRadius, cy - currentStoneRadius, currentStoneRadius * 2, currentStoneRadius * 2);
        } else {
            // Draw solid color circle
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, currentStoneRadius, 0, 2 * Math.PI);
            targetCtx.fillStyle = currentStoneBg;
            targetCtx.fill();
        }
        targetCtx.restore();
        
        // Draw red cross if the stone is marked as dead by AI Estimation.
        // Never render on the scoring board: the scoring modal has its own markedDead
        // overlay and the estimation crosses are not part of the scoring computation.
        const isScoringCanvas = targetCtx.canvas && targetCtx.canvas.id === 'go-board-canvas-scoring';
        if (r !== null && c !== null && state.deadMap && state.deadMap[r][c] && !isScoringCanvas) {
            const size = cellSize * 0.25;
            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.moveTo(cx - size, cy - size);
            targetCtx.lineTo(cx + size, cy + size);
            targetCtx.moveTo(cx + size, cy - size);
            targetCtx.lineTo(cx - size, cy + size);
            targetCtx.strokeStyle = '#ef4444'; // Red color
            targetCtx.lineWidth = Math.max(2, cellSize * 0.08);
            targetCtx.lineCap = 'round';
            targetCtx.stroke();
            targetCtx.restore();
        }
    }

    // Draw stone group highlight halos on empty cells — first matching group claims the cell
    if (!cell.player && c !== null && r !== null && _commentStoneGroupGroups.length > 0) {
        const baseR = cellSize * 0.47;
        for (let gi = 0; gi < _commentStoneGroupGroups.length; gi++) {
            const grp = _commentStoneGroupGroups[gi];
            let found = false;
            for (let i = 0; i < grp.cells.length; i++) {
                if (grp.cells[i].r === r && grp.cells[i].c === c) { found = true; break; }
            }
            if (!found) continue;
            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, baseR * 1.18, 0, Math.PI * 2);
            targetCtx.fillStyle = grp.color === 'B' ? 'rgba(50, 50, 50, 0.45)' : 'rgba(255, 255, 250, 0.55)';
            targetCtx.fill();
            targetCtx.lineWidth = 2;
            targetCtx.strokeStyle = grp.color === 'B' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(180, 180, 175, 0.85)';
            targetCtx.stroke();
            targetCtx.restore();
            break;
        }
    }

    // Determine colors for markers based on wood or stone background
    let markerColor = '#111827';
    if (cell.player) {
        if (style) {
            markerColor = cell.player === 'B' ? style.blackStone.fg : style.whiteStone.fg;
        } else {
            markerColor = cell.player === 'B' ? '#ffffff' : '#111827';
        }
    }

    // 2. Draw Marker Annotations
    if (cell.annotation) {
        const baseLineWidth = Math.max(1.5, cellSize * 0.06);
        
        const buildAnnotationPath = () => {
            if (cell.annotation === 'triangle') {
                const R = cellSize * 0.24;
                targetCtx.beginPath();
                targetCtx.moveTo(cx, cy - R);
                targetCtx.lineTo(cx - R * 0.866, cy + R * 0.5);
                targetCtx.lineTo(cx + R * 0.866, cy + R * 0.5);
                targetCtx.closePath();
            } else if (cell.annotation === 'square') {
                const size = cellSize * 0.38;
                targetCtx.beginPath();
                targetCtx.rect(cx - size / 2, cy - size / 2, size, size);
            } else if (cell.annotation === 'circle' || cell.annotation === 'red-circle' || cell.annotation === 'green-circle') {
                const radius = cellSize * 0.22;
                targetCtx.beginPath();
                targetCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
            } else if (cell.annotation === 'cross') {
                const size = cellSize * 0.19;
                targetCtx.beginPath();
                targetCtx.moveTo(cx - size, cy - size);
                targetCtx.lineTo(cx + size, cy + size);
                targetCtx.moveTo(cx + size, cy - size);
                targetCtx.lineTo(cx - size, cy + size);
            }
        };

        // Mask grid lines by drawing a thick halo of board texture around the mark
        if (!cell.player) {
            targetCtx.save();
            buildAnnotationPath();
            targetCtx.lineWidth = baseLineWidth + Math.max(4, cellSize * 0.12); // Halo thickness
            targetCtx.strokeStyle = getBoardFillStyle();
            targetCtx.fillStyle = getBoardFillStyle();
            targetCtx.lineJoin = 'round';
            targetCtx.lineCap = 'round';
            targetCtx.stroke();
            if (cell.annotation !== 'cross') {
                targetCtx.fill(); // Fill the inside to erase the grid lines completely
            }
            targetCtx.restore();
        }

        // Draw the actual annotation stroke
        buildAnnotationPath();
        targetCtx.lineWidth = baseLineWidth;
        targetCtx.lineJoin = 'miter';
        targetCtx.lineCap = 'butt';
        targetCtx.strokeStyle = cell.annotation === 'red-circle' ? '#af0000' : (cell.annotation === 'green-circle' ? '#068200' : markerColor);
        targetCtx.stroke();
    }

    // 3. Draw labels (letters and numbers)
    if (cell.label) {
        const len = cell.label.length;
        const isOnStone = !!cell.player;
        let fontSize = Math.floor(cellSize * 0.55);
        
        if (isOnStone && style && currentStoneFgSize !== null && !isNaN(currentStoneFgSize)) {
            fontSize = currentStoneFgSize * (cellSize / 29.3333);
        } else {
            if (len > 2) fontSize = Math.floor(cellSize * 0.4);
            else if (len === 2) fontSize = Math.floor(cellSize * 0.48);
        }

        const isItalic = !isOnStone; // Use italic for board labels, normal for stone labels
        
        let labelToDraw = cell.label;
        if (labelToDraw.length === 1 && labelToDraw.match(/[a-zA-Z]/)) {
            labelToDraw = isOnStone ? labelToDraw.toUpperCase() : labelToDraw.toLowerCase();
        }
        
        targetCtx.font = `${isItalic ? 'italic bold ' : 'bold '}${fontSize}px 'Figtree', sans-serif`;
        
        if (cell.label.length >= 3) {
            let textW = targetCtx.measureText(labelToDraw).width;
            if (textW > cellSize * 0.95) {
                fontSize = fontSize * (cellSize * 0.95 / textW);
                targetCtx.font = `${isItalic ? 'italic bold ' : 'bold '}${fontSize}px 'Figtree', sans-serif`;
            }
        }
        
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        
        const yOffset = 0;
        
        // Mask grid lines behind the text by stroking a halo of board texture
        if (!cell.player) {
            targetCtx.save();
            targetCtx.lineWidth = Math.max(4, cellSize * 0.15); // Thick halo for text
            targetCtx.strokeStyle = getBoardFillStyle();
            targetCtx.lineJoin = 'round';
            targetCtx.miterLimit = 2;
            targetCtx.strokeText(labelToDraw, cx, cy + yOffset);
            targetCtx.restore();
        }
        targetCtx.fillStyle = markerColor; // Keep text black (or white if on black stone)

        targetCtx.fillText(labelToDraw, cx, cy + yOffset);
    }
}

// Apply formatting tags (bold/italic/underline) around selected text in input/textarea
function applyFormatting(inputEl, styleType) {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    const text = inputEl.value;
    const selectedText = text.substring(start, end);
    
    let openTag, closeTag;
    if (styleType === 'bold') {
        openTag = '**';
        closeTag = '**';
    } else if (styleType === 'italic') {
        openTag = '*';
        closeTag = '*';
    } else if (styleType === 'underline') {
        openTag = '<u>';
        closeTag = '</u>';
    }
    
    const replacement = openTag + selectedText + closeTag;
    inputEl.value = text.substring(0, start) + replacement + text.substring(end);
    
    // Set selection back
    inputEl.focus();
    const newStart = start + openTag.length;
    const newEnd = newStart + selectedText.length;
    inputEl.setSelectionRange(newStart, newEnd);
    
    // Trigger input event to update state
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

// Parse BBCode and Markdown formatting tags into styled text spans
function parseRichText(text) {
    const spans = [];
    let index = 0;
    
    // Active style state stack
    const style = {
        bold: false,
        italic: false,
        underline: false
    };

    // Style tags mapping
    const tags = [
        { open: '[b]', close: '[/b]', type: 'bold' },
        { open: '**', close: '**', type: 'bold' },
        { open: '[i]', close: '[/i]', type: 'italic' },
        { open: '*', close: '*', type: 'italic' },
        { open: '[u]', close: '[/u]', type: 'underline' },
        { open: '<u>', close: '</u>', type: 'underline' },
        { open: '<U>', close: '</U>', type: 'underline' }
    ];

    while (index < text.length) {
        let matchedTag = null;
        
        // Try to match closing tags first
        for (const tag of tags) {
            if (style[tag.type]) {
                if (text.startsWith(tag.close, index)) {
                    matchedTag = { tag, isOpen: false, length: tag.close.length };
                    break;
                }
            }
        }

        if (!matchedTag) {
            for (const tag of tags) {
                if (!style[tag.type]) {
                    if (text.startsWith(tag.open, index)) {
                        matchedTag = { tag, isOpen: true, length: tag.open.length };
                        break;
                    }
                }
            }
        }

        if (matchedTag) {
            style[matchedTag.tag.type] = matchedTag.isOpen;
            index += matchedTag.length;
        } else {
            // Find next tag index
            let nextTagIndex = text.length;
            for (const tag of tags) {
                const idxOpen = text.indexOf(tag.open, index);
                if (idxOpen !== -1 && idxOpen < nextTagIndex) {
                    nextTagIndex = idxOpen;
                }
                if (style[tag.type]) {
                    const idxClose = text.indexOf(tag.close, index);
                    if (idxClose !== -1 && idxClose < nextTagIndex) {
                        nextTagIndex = idxClose;
                    }
                }
            }

            const segment = text.substring(index, nextTagIndex);
            if (segment) {
                spans.push({
                    text: segment,
                    bold: style.bold,
                    italic: style.italic,
                    underline: style.underline
                });
            }
            index = nextTagIndex;
        }
    }

    if (spans.length === 0 && text.length > 0) {
        spans.push({ text: text, bold: false, italic: false, underline: false });
    }

    return spans;
}

// Wrap rich text spans to wrap lines that exceed maxWidth
function wrapRichText(text, maxWidth, commentFontSize, tempCtx) {
    const spans = parseRichText(text);
    const words = [];

    spans.forEach(span => {
        const parts = span.text.split(/(\s+)/);
        parts.forEach(part => {
            if (part) {
                words.push({
                    text: part,
                    bold: span.bold,
                    italic: span.italic,
                    underline: span.underline,
                    isSpace: /^\s+$/.test(part)
                });
            }
        });
    });

    const lines = [];
    let currentLine = [];
    let currentLineWidth = 0;

    words.forEach(word => {
        const weight = word.bold ? 'bold' : 'normal';
        tempCtx.font = `${word.italic ? 'italic ' : ''}${weight} ${commentFontSize}px 'Pretendard', sans-serif`;
        const wordWidth = tempCtx.measureText(word.text).width;

        if (word.isSpace && currentLine.length === 0) {
            return;
        }

        if (currentLineWidth + wordWidth > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [];
            currentLineWidth = 0;
            if (word.isSpace) {
                return;
            }
        }

        currentLine.push(word);
        currentLineWidth += wordWidth;
    });

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

// Draw a single line of wrapped rich text
function drawRichTextLine(ctx, line, x, y, fontSize) {
    let currentX = x;
    line.forEach(word => {
        const weight = word.bold ? 'bold' : 'normal';
        ctx.font = `${word.italic ? 'italic ' : ''}${weight} ${fontSize}px 'Pretendard', sans-serif`;
        ctx.fillText(word.text, currentX, y);

        if (word.underline) {
            const w = ctx.measureText(word.text).width;
            ctx.beginPath();
            ctx.moveTo(currentX, y + fontSize + 2);
            ctx.lineTo(currentX + w, y + fontSize + 2);
            ctx.lineWidth = Math.max(1, fontSize * 0.05);
            ctx.strokeStyle = '#000000';
            ctx.stroke();
        }

        currentX += ctx.measureText(word.text).width;
    });
}

// Draw centered rich text title on canvas
function drawCenteredRichText(ctx, text, centerY, fontSize, canvasWidth) {
    const spans = parseRichText(text);

    // 1. Measure total width of the rich text
    let totalWidth = 0;
    spans.forEach(span => {
        ctx.font = `${span.italic ? 'italic ' : ''}bold ${fontSize}px 'Pretendard', sans-serif`;
        totalWidth += ctx.measureText(span.text).width;
    });

    // 2. Draw each span starting at startX
    let currentX = (canvasWidth - totalWidth) / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    spans.forEach(span => {
        ctx.font = `${span.italic ? 'italic ' : ''}bold ${fontSize}px 'Pretendard', sans-serif`;
        ctx.fillText(span.text, currentX, centerY);

        if (span.underline) {
            const w = ctx.measureText(span.text).width;
            ctx.beginPath();
            ctx.moveTo(currentX, centerY + fontSize * 0.55);
            ctx.lineTo(currentX + w, centerY + fontSize * 0.55);
            ctx.lineWidth = Math.max(1.5, fontSize * 0.06);
            ctx.strokeStyle = '#000000';
            ctx.stroke();
        }

        currentX += ctx.measureText(span.text).width;
    });
}

async function loadRecoloredSvg(url, color) {
    const resp = await fetch(url);
    let svgText = await resp.text();
    svgText = svgText.replace(/fill:#[a-zA-Z0-9]{3,6}/g, `fill:${color}`);
    const blob = new Blob([svgText], {type: 'image/svg+xml'});
    const blobUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = blobUrl;
    });
}

// Capture off-screen and export high resolution PNG
async function generateDiagramDataURL() {
    try {
        let borderScale = 1.0;
        if (state.exportBoardStyle && state.exportBoardStyle.border && state.exportBoardStyle.border.size !== undefined) {
            borderScale = state.exportBoardStyle.border.size / 100;
        } else if (state.exportText.borderSize !== undefined) {
            borderScale = state.exportText.borderSize / 100;
        }
        const borderMargin = 0.5 * borderScale;
        const coordMargin = 0.9;

        const colStart = state.crop.colStart;
        const colEnd = state.crop.colEnd;
        const rowStart = state.crop.rowStart;
        const rowEnd = state.crop.rowEnd;

        const hasLeft = (colStart === -1);
        const hasRight = (colEnd === 19);
        const hasTop = (rowStart === -1);
        const hasBottom = (rowEnd === 19);

        const boardColStart = Math.max(0, colStart);
        const boardColEnd = Math.min(18, colEnd);
        const boardRowStart = Math.max(0, rowStart);
        const boardRowEnd = Math.min(18, rowEnd);

        const C_board = boardColEnd - boardColStart + 1;
        const R_board = boardRowEnd - boardRowStart + 1;

        const isFullBoard = (C_board === 19 && R_board === 19);

        const C_virtual = (C_board - 1) + (hasLeft ? (borderMargin + coordMargin) : borderMargin) + (hasRight ? (borderMargin + coordMargin) : borderMargin);
        const R_virtual = (R_board - 1) + (hasTop ? (borderMargin + coordMargin) : borderMargin) + (hasBottom ? (borderMargin + coordMargin) : borderMargin);

        const maxDim = isFullBoard ? 1050 : 800;
        const S_export = maxDim / Math.max(C_virtual, R_virtual);
        let diaScale = 1.0;
        if (state.exportBoardStyle && state.exportBoardStyle.board && state.exportBoardStyle.board.size !== undefined) {
            diaScale = state.exportBoardStyle.board.size / 600;
        } else if (state.exportText.diaSize !== undefined) {
            diaScale = state.exportText.diaSize / 100;
        }
        const S = S_export * diaScale;
        
        // Load user-defined padding
        const x_pad = state.exportText.paddingX;
        const y_pad = state.exportText.paddingY;
        const zl_pad = state.exportText.paddingZL;
        const zr_pad = state.exportText.paddingZR;

        // X metrics
        const woodExtensionX = 0.5 * S * borderScale;
        const woodExtensionY = 0.5 * S * borderScale;

        const diagramLeftMargin = hasLeft ? (0.4 * S + woodExtensionX) : (boardColStart === 0 ? woodExtensionX : 0);
        const diagramRightMargin = hasRight ? (0.4 * S + woodExtensionX) : (boardColEnd === 18 ? woodExtensionX : 0);

        const gridLeft = zl_pad + diagramLeftMargin;
        const gridRight = gridLeft + (C_board - 1) * S;
        
        const woodLeft = gridLeft - (boardColStart === 0 ? woodExtensionX : 0);
        const woodRight = gridRight + (boardColEnd === 18 ? woodExtensionX : 0);
        
        // Vertical Green Line X positions (for guides) and Text alignments
        const guideLeftX = woodLeft;
        const guideRightX = woodRight;
        const layoutMode = state.exportText.layoutMode || 'v';
        const commentSide = state.exportText.commentSide || 'right';
        const w_input = state.exportText.commentWidth || 300;
        const zl2_pad = state.exportText.paddingZL2 || 20;
        const zr2_pad = state.exportText.paddingZR2 || 20;

        // Default 'v' mode canvas width
        const baseVWidth = Math.max(guideRightX, gridRight + diagramRightMargin) + zr_pad;
        let canvasWidth = baseVWidth;
        let commentTextWidth = guideRightX - guideLeftX;

        if (layoutMode === 'h') {
            if (commentSide === 'left') {
                const mainOffsetX = (zl2_pad + w_input + zl_pad) - guideLeftX;
                canvasWidth = Math.max(guideRightX, gridRight + diagramRightMargin) + mainOffsetX + zr_pad;
            } else {
                const textRightX = guideRightX + zr_pad + w_input;
                canvasWidth = Math.max(textRightX, gridRight + diagramRightMargin) + zr2_pad;
            }
            commentTextWidth = w_input;
        }

        // Always base font sizes off the base V width to maintain consistent text sizing across modes
        const titleScale = (state.exportText.titleSize || 100) / 100;
        const commentScale = (state.exportText.commentSize || 100) / 100;
        
        const unscaledCanvasWidth = baseVWidth / diaScale;
        const baseTitleSize = Math.max(16, Math.floor(unscaledCanvasWidth * 0.05));
        const titleFontSize = baseTitleSize * titleScale;
        const baseRegularFontSize = Math.max(12, Math.floor(baseTitleSize * 0.65));
        const regularFontSize = baseRegularFontSize * commentScale;
        
        // Create an offscreen canvas to measure text heights
        const measureCanvas = document.createElement('canvas');
        const mCtx = measureCanvas.getContext('2d');
        
        function wrapText(ctx, text, maxWidth) {
            const paragraphs = text.split('\n');
            const lines = [];
            for (const para of paragraphs) {
                if (para.trim() === '') {
                    lines.push({ text: '', isBold: false, isRed: false });
                    continue;
                }
                const words = para.split(' ');
                let currentLine = '';
                // Simple bold parsing: **text**
                let isBold = para.startsWith('**') && para.endsWith('**');
                let isRed = para.startsWith('!!') && para.endsWith('!!');
                let cleanPara = para;
                if (isBold) cleanPara = para.substring(2, para.length - 2);
                if (isRed) cleanPara = para.substring(2, para.length - 2);
                
                const cleanWords = cleanPara.split(' ');
                
                for (let i = 0; i < cleanWords.length; i++) {
                    const testLine = currentLine + cleanWords[i] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxWidth && i > 0) {
                        lines.push({ text: currentLine.trim(), isBold, isRed });
                        currentLine = cleanWords[i] + ' ';
                    } else {
                        currentLine = testLine;
                    }
                }
                lines.push({ text: currentLine.trim(), isBold, isRed });
            }
            return lines;
        }

        let titleStartX = guideLeftX;
        let titleMaxWidth = guideRightX - guideLeftX;

        if (layoutMode === 'h') {
            if (commentSide === 'left') {
                titleStartX = zl2_pad;
                const mainOffsetX = (zl2_pad + w_input + zl_pad) - guideLeftX;
                titleMaxWidth = (guideRightX + mainOffsetX) - titleStartX;
            } else {
                titleStartX = guideLeftX;
                titleMaxWidth = (guideRightX + zr_pad + w_input) - titleStartX;
            }
        }

        // --- Part 1: Title ---
        let titleLines = [];
        let titleHeight = 0;
        if (state.exportText.includeTitle) {
            let titleText = '';
            if (state.exportText.titleType === 'auto' && state.sgfMoves && state.sgfMoves.length > 0) {
                const rawTitle = elements.sgfAutoTitle.getAttribute('data-raw-title') || elements.sgfAutoTitle.textContent;
                // Remove excessive whitespace that might be extracted from SVGs if data-raw-title is missing
                titleText = `**${rawTitle.replace(/\s+/g, ' ').trim()}**`;
            } else if (state.exportText.titleType === 'black-move') {
                titleText = '**Black ● to Play**';
            } else if (state.exportText.titleType === 'white-move') {
                titleText = '**White ○ to Play**';
            } else if (state.exportText.titleType === 'free') {
                titleText = state.exportText.titleFree || '';
            }
            if (titleText.trim() !== '') {
                mCtx.font = `bold ${titleFontSize}px sans-serif`;
                titleLines = wrapText(mCtx, titleText, titleMaxWidth);
                titleHeight = titleLines.length * (titleFontSize * 1.3);
            }
        }

        const legendScale = (state.exportText.legendSize || 100) / 100;
        const legendFontSize = baseRegularFontSize * legendScale;

        // --- Part 2: Legends ---
        let legendItems = [];
        let legendHeight = 0;
        if (state.exportText.includeLegends && state.legend && state.legend.meanings) {
            // First, scan the board to see what's actually present
            const validLegendKeys = new Set();
            for (let r = 0; r < 19; r++) {
                for (let c = 0; c < 19; c++) {
                    const cell = state.board[r][c];
                    if (cell.annotation) validLegendKeys.add(`mark-${cell.annotation}`);
                    if (cell.label) {
                        const labelStr = cell.label.trim();
                        const num = parseInt(labelStr, 10);
                        if (!isNaN(num) && num >= 1 && num <= 10 && labelStr === String(num)) {
                            validLegendKeys.add(`number-${num}`);
                            validLegendKeys.add('group-numbers');
                        } else if (/^[a-zA-Z]$/.test(labelStr)) {
                            validLegendKeys.add(`letter-${labelStr.toUpperCase()}`);
                            validLegendKeys.add('group-letters');
                        }
                    }
                }
            }

            const orderArray = state.legend.order || Object.keys(state.legend.meanings);
            for (const key of orderArray) {
                const value = state.legend.meanings[key] || '';
                if (validLegendKeys.has(key) && state.legend.active[key] !== false && value.trim() !== '') {
                    legendItems.push({ key: key, text: value.trim() });
                }
            }
            if (legendItems.length > 0) {
                legendHeight = legendItems.length * (legendFontSize * 1.4);
            }
        }

        // --- Part 3: Diagram ---
        // Diagram height is just the grid height. Margin x_pad is outside the grid.
        const gridHeight = (R_board - 1) * S;
        
        // --- Part 4: Comment ---
        let commentLines = [];
        let commentHeight = 0;
        if (state.exportText.includeComment) {
            let commentText = '';
            if (state.exportText.commentType === 'auto' && state.sgfMoves && state.sgfMoves.length > 0) {
                commentText = elements.sgfAutoComment.innerHTML.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, '');
            } else {
                commentText = state.exportText.comment || '';
            }
            if (commentText.trim() !== '') {
                mCtx.font = `${regularFontSize}px sans-serif`;
                commentLines = wrapText(mCtx, commentText, commentTextWidth);
                commentHeight = commentLines.length * (regularFontSize * 1.4);
            }
        }

        const flipnoteScale = (state.exportText.flipnoteSize || 100) / 100;
        const flipnoteFontSize = Math.max(10, Math.floor(baseTitleSize * 0.58)) * flipnoteScale;

        // --- Part 5: Flip Note ---
        let flipNoteLines = [];
        let flipNoteHeight = 0;
        if (state.exportText.includeFlipNote && state.isPovFlipped) {
            mCtx.font = `italic ${flipnoteFontSize}px 'iGoRodinPro', sans-serif`;
            const wtPlayer = (state.sgfMetadata && state.sgfMetadata.pw) ? state.sgfMetadata.pw : 'White';
            const noteText = `!!※ Board rotated to ${wtPlayer}’s perspective.!!`;
            flipNoteLines = wrapText(mCtx, noteText, commentTextWidth);
            flipNoteHeight = flipNoteLines.length * (flipnoteFontSize * 1.3);
        }

        // --- Calculate Layout Y Positions and Offsets ---
        const y1 = y_pad;
        const y2 = x_pad;
        
        const layout = [];
        let mainCurrentY = y1;
        
        // 1. Title
        if (titleHeight > 0) {
            layout.push({ type: 'title', y: mainCurrentY, height: titleHeight, isMain: true });
            mainCurrentY += titleHeight;
        }

        // 2. Legends (V-mode: above Diagram)
        if (layoutMode !== 'h' && legendHeight > 0) {
            if (layout.length > 0) mainCurrentY += y2;
            layout.push({ type: 'legends', y: mainCurrentY, height: legendHeight, isMain: true });
            mainCurrentY += legendHeight;
        }

        // 3. Diagram
        if (layout.length > 0) mainCurrentY += y2;
        const diagramStartY = mainCurrentY;
        const diagramTopMargin = hasTop ? (0.7 * S + woodExtensionY) : (boardRowStart === 0 ? woodExtensionY : 0);
        const diagramBottomMargin = hasBottom ? (0.4 * S + woodExtensionY) : (boardRowEnd === 18 ? woodExtensionY : 0);
        const diagramTotalHeight = diagramTopMargin + gridHeight + diagramBottomMargin;
        layout.push({ type: 'diagram', y: mainCurrentY, height: diagramTotalHeight, topMargin: diagramTopMargin, bottomMargin: diagramBottomMargin, isMain: true });
        mainCurrentY += diagramTotalHeight;

        let textCurrentY = (layoutMode === 'h') ? diagramStartY : mainCurrentY;

        // 2. Legends (H-mode: in Text column, above Comment)
        if (layoutMode === 'h' && legendHeight > 0) {
            layout.push({ type: 'legends', y: textCurrentY, height: legendHeight, isText: true });
            textCurrentY += legendHeight;
        }

        // 4. Comment
        if (commentHeight > 0) {
            if (layoutMode === 'h' && legendHeight > 0) textCurrentY += y2;
            else if (layoutMode !== 'h' && layout.length > 0) textCurrentY += y2;

            if (layoutMode === 'h') {
                const commentTopPadding = state.exportText.commentPadding || 0;
                textCurrentY += commentTopPadding;
            }

            layout.push({ type: 'comment', y: textCurrentY, height: commentHeight, isText: true });
            textCurrentY += commentHeight;
        }

        // 5. Flip Note
        if (flipNoteHeight > 0) {
            if (layout.some(l => l.isText)) textCurrentY += y2;
            layout.push({ type: 'flipnote', y: textCurrentY, height: flipNoteHeight, isText: true });
            textCurrentY += flipNoteHeight;
        }

        let maxMainY = mainCurrentY + (layoutMode === 'h' ? y2 + y1 : y1);
        let maxTextY = (layoutMode === 'h' ? textCurrentY : textCurrentY + y1);
        let canvasHeight = layoutMode === 'h' ? Math.max(maxMainY, maxTextY) : maxTextY;

        // X Offsets
        let mainOffsetX = 0;
        let textOffsetX = guideLeftX;

        if (layoutMode === 'h') {
            if (commentSide === 'left') {
                textOffsetX = zl2_pad;
                mainOffsetX = (zl2_pad + w_input + zl_pad) - guideLeftX;
            } else {
                mainOffsetX = 0;
                textOffsetX = guideRightX + zr_pad;
            }
        }

        // 1:1 Aspect Ratio logic
        let renderOffsetX = 0;
        let renderOffsetY = 0;
        if (layoutMode === '1:1') {
            if (canvasWidth > canvasHeight) {
                renderOffsetY = (canvasWidth - canvasHeight) / 2;
                canvasHeight = canvasWidth;
            } else {
                renderOffsetX = (canvasHeight - canvasWidth) / 2;
                canvasWidth = canvasHeight;
            }
        }

        // --- Create Main Canvas ---
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasWidth;
        exportCanvas.height = canvasHeight;
        const exportCtx = exportCanvas.getContext('2d');
        
        exportCtx.translate(renderOffsetX, renderOffsetY);

        // Fill white background
        exportCtx.fillStyle = '#FFFFFF';
        exportCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        // --- Draw Guiding Lines (if toggled) ---
        const showGuides = state.exportText.showGuidingLines;
        if (showGuides) {
            exportCtx.strokeStyle = '#00FF00';
            exportCtx.lineWidth = 1;
            exportCtx.font = `italic ${regularFontSize * 0.8}px "Anthropic Sans", sans-serif`;
            exportCtx.fillStyle = '#0000FF';

            // Vertical guides for Main Block
            exportCtx.beginPath();
            exportCtx.moveTo(guideLeftX + mainOffsetX, 0); exportCtx.lineTo(guideLeftX + mainOffsetX, canvasHeight);
            exportCtx.moveTo(guideRightX + mainOffsetX, 0); exportCtx.lineTo(guideRightX + mainOffsetX, canvasHeight);
            exportCtx.stroke();
            
            // Draw zL and zR labels
            if (zl_pad > 0) exportCtx.fillText('zL', mainOffsetX + guideLeftX / 2, canvasHeight / 2);
            if (zr_pad > 0) exportCtx.fillText('zR', mainOffsetX + guideRightX + zr_pad / 2, canvasHeight / 2);

            // Vertical guides for Text Block in H mode
            if (layoutMode === 'h') {
                exportCtx.beginPath();
                if (commentSide === 'left') {
                    exportCtx.moveTo(textOffsetX, 0); exportCtx.lineTo(textOffsetX, canvasHeight);
                    if (zl2_pad > 0) exportCtx.fillText('zL2', textOffsetX / 2, canvasHeight / 2);
                } else {
                    const textRightX = textOffsetX + w_input;
                    exportCtx.moveTo(textRightX, 0); exportCtx.lineTo(textRightX, canvasHeight);
                    if (zr2_pad > 0) exportCtx.fillText('zR2', textRightX + zr2_pad / 2, canvasHeight / 2);
                }
                exportCtx.stroke();
            }
            
            // Horizontal guides for layout parts
            const partsToGuide = layoutMode === 'h' ? layout.filter(p => p.isMain) : layout;
            
            partsToGuide.forEach((part, index) => {
                let hasGap = true;
                let gapLabel = (index === 0) ? 'y1' : 'y2';
                let gapVal = (index === 0) ? y1 : y2;
                
                if (index > 0) {
                    const prevPart = partsToGuide[index - 1];
                    if (part.y === prevPart.y + prevPart.height) {
                        hasGap = false;
                    }
                }

                if (hasGap) {
                    // Top guide for this part
                    exportCtx.beginPath();
                    exportCtx.moveTo(0, part.y); exportCtx.lineTo(canvasWidth, part.y);
                    exportCtx.stroke();
                    
                    // Label the gap above this part
                    let gapCenterY = part.y - gapVal / 2;
                    exportCtx.fillText(gapLabel, guideRightX - 20, gapCenterY);
                }
            });
            // Bottom guide for the last part
            const lastPart = partsToGuide[partsToGuide.length - 1];
            if (lastPart) {
                exportCtx.beginPath();
                exportCtx.moveTo(0, lastPart.y + lastPart.height); exportCtx.lineTo(canvasWidth, lastPart.y + lastPart.height);
                exportCtx.stroke();
                
                let bottomGapLabel = 'y1';
                let bottomGapVal = y1;
                
                if (layoutMode === 'h') {
                    // In H mode, the user expects a y2 gap below the diagram, just like V mode.
                    bottomGapLabel = 'y2';
                    bottomGapVal = y2;
                }
                
                let gapCenterY = lastPart.y + lastPart.height + bottomGapVal / 2;
                exportCtx.fillText(bottomGapLabel, guideRightX - 20, gapCenterY);
                
                if (layoutMode === 'h') {
                    // Draw the final y1 line below the y2 gap in H mode
                    let finalY = lastPart.y + lastPart.height + y2;
                    exportCtx.beginPath();
                    exportCtx.moveTo(0, finalY); exportCtx.lineTo(canvasWidth, finalY);
                    exportCtx.stroke();
                    exportCtx.fillText('y1', guideRightX - 20, finalY + y1 / 2);
                }
            }
        }

        // --- Draw Content ---
        for (const part of layout) {
            exportCtx.save();
            if (part.isMain) {
                exportCtx.translate(mainOffsetX, 0);
            } else if (part.isText) {
                exportCtx.translate(textOffsetX - guideLeftX, 0);
            }

            if (part.type === 'title') {
                exportCtx.fillStyle = '#000000';
                exportCtx.textAlign = 'left';
                exportCtx.textBaseline = 'top';
                let textY = part.y;
                for (const line of titleLines) {
                    exportCtx.font = line.isBold ? `bold ${titleFontSize}px "Anthropic Sans", sans-serif` : `${titleFontSize}px "Anthropic Sans", sans-serif`;
                    // exportCtx is translated by mainOffsetX for isMain parts, so we must subtract it
                    exportCtx.fillText(line.text, titleStartX - mainOffsetX, textY);
                    textY += titleFontSize * 1.3;
                }
            }
            else if (part.type === 'legends') {
                exportCtx.textAlign = 'left';
                let textY = part.y;
                const cellSize = legendFontSize * 1.8;
                const cx = guideLeftX + cellSize * 0.4;
                
                for (const item of legendItems) {
                    const cy = textY + (legendFontSize * 1.4) / 2;
                    let isText = false;
                    let char = '';
                    let isSingleLetter = false;
                    const markerColor = '#111827';
                    const baseLineWidth = Math.max(1.5, cellSize * 0.06);

                    if (item.key === 'mark-red-circle' || item.key === 'mark-circle' || item.key === 'mark-green-circle') {
                        const radius = cellSize * 0.22;
                        exportCtx.beginPath();
                        exportCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
                        exportCtx.lineWidth = baseLineWidth;
                        exportCtx.strokeStyle = item.key === 'mark-red-circle' ? '#af0000' : (item.key === 'mark-green-circle' ? '#068200' : markerColor);
                        exportCtx.stroke();
                    } else if (item.key === 'mark-blue-cross' || item.key === 'mark-cross') {
                        const size = cellSize * 0.19;
                        exportCtx.beginPath();
                        exportCtx.moveTo(cx - size, cy - size);
                        exportCtx.lineTo(cx + size, cy + size);
                        exportCtx.moveTo(cx + size, cy - size);
                        exportCtx.lineTo(cx - size, cy + size);
                        exportCtx.lineWidth = baseLineWidth;
                        exportCtx.strokeStyle = markerColor;
                        exportCtx.stroke();
                    } else if (item.key === 'mark-green-triangle' || item.key === 'mark-triangle') {
                        const R = cellSize * 0.24;
                        exportCtx.beginPath();
                        exportCtx.moveTo(cx, cy - R);
                        exportCtx.lineTo(cx - R * 0.866, cy + R * 0.5);
                        exportCtx.lineTo(cx + R * 0.866, cy + R * 0.5);
                        exportCtx.closePath();
                        exportCtx.lineWidth = baseLineWidth;
                        exportCtx.strokeStyle = markerColor;
                        exportCtx.stroke();
                    } else if (item.key === 'mark-orange-square' || item.key === 'mark-square') {
                        const size = cellSize * 0.38;
                        exportCtx.beginPath();
                        exportCtx.rect(cx - size / 2, cy - size / 2, size, size);
                        exportCtx.lineWidth = baseLineWidth;
                        exportCtx.strokeStyle = markerColor;
                        exportCtx.stroke();
                    } else {
                        isText = true;
                        if (item.key === 'group-numbers') { char = '1'; }
                        else if (item.key === 'group-letters') { char = 'a'; isSingleLetter = true; }
                        else if (item.key.startsWith('number-')) { char = item.key.split('-')[1]; }
                        else if (item.key.startsWith('letter-')) { char = item.key.split('-')[1].toLowerCase(); isSingleLetter = true; }
                        
                        const len = char.length;
                        let fontSize = Math.floor(cellSize * 0.55);
                        if (len > 2) fontSize = Math.floor(cellSize * 0.4);
                        else if (len === 2) fontSize = Math.floor(cellSize * 0.48);
                        
                        exportCtx.font = `italic ${fontSize}px 'Figtree', sans-serif`;
                        exportCtx.textAlign = 'center';
                        exportCtx.textBaseline = 'middle';
                        const yOffset = 0;
                        
                        exportCtx.fillStyle = markerColor;
                        exportCtx.fillText(char, cx, cy + yOffset);
                    }
                    
                    exportCtx.textAlign = 'left';
                    exportCtx.textBaseline = 'middle';
                    exportCtx.font = `${legendFontSize}px "Anthropic Sans", sans-serif`;
                    exportCtx.fillStyle = '#000000';
                    const textStartX = cx + cellSize * 0.5;
                    exportCtx.fillText(`= ${item.text}`, textStartX, cy);
                    
                    textY += legendFontSize * 1.4;
                }
            }
            else if (part.type === 'comment') {
                exportCtx.fillStyle = '#000000';
                exportCtx.textAlign = 'left';
                exportCtx.textBaseline = 'top';
                let textY = part.y;
                for (const line of commentLines) {
                    exportCtx.font = `${regularFontSize}px "Anthropic Sans", sans-serif`;
                    exportCtx.fillText(line.text, guideLeftX, textY);
                    textY += regularFontSize * 1.4;
                }
            }
            else if (part.type === 'flipnote') {
                exportCtx.textAlign = 'left';
                exportCtx.textBaseline = 'top';
                let textY = part.y;
                for (const line of flipNoteLines) {
                    exportCtx.font = `italic ${flipnoteFontSize}px 'iGoRodinPro', sans-serif`;
                    exportCtx.fillStyle = line.isRed ? '#FF0000' : '#000000';
                    let outText = line.text;
                    if (outText.startsWith('*')) outText = '※' + outText.substring(1);
                    exportCtx.fillText(outText, guideLeftX, textY);
                    textY += flipnoteFontSize * 1.3;
                }
            }
            else if (part.type === 'diagram') {
                // Draw Diagram!
                const gridTop = part.y + part.topMargin;
                const gridBottom = part.y + part.topMargin + gridHeight;
                
                // Wood margins
                const woodTop = (boardRowStart === 0) ? gridTop - woodExtensionY : gridTop;
                const woodBottom = (boardRowEnd === 18) ? gridBottom + woodExtensionY : gridBottom;
                
                // Full board geometry for correctly scaling/translating textures across crops
                const fullGridLeft = gridLeft - boardColStart * S;
                const fullGridTop = gridTop - boardRowStart * S;
                const fullWoodLeft = fullGridLeft - woodExtensionX;
                const fullWoodTop = fullGridTop - woodExtensionY;
                const fullWoodW = 18 * S + 2 * woodExtensionX;
                const fullWoodH = 18 * S + 2 * woodExtensionY;
                const fullBoardRect = { x: fullWoodLeft, y: fullWoodTop, w: fullWoodW, h: fullWoodH };
                
                let currentBgColor = '#DCB35C';
                let currentBoardColor = '#DCB35C';
                let borderScale = 1;
                let boardImage = null;
                
                if (state.exportBoardStyle) {
                    const style = state.exportBoardStyle;
                    currentBoardColor = style.board.useColor ? style.board.color : '#DCB35C';
                    currentBgColor = style.border.color;
                    borderScale = parseFloat(style.border.size) / 100 || 1;
                    
                    if (!style.board.useColor && style.board.imgSrc) {
                        if (!window.exportBoardBgImage) {
                            window.exportBoardBgImage = new Image();
                            window.exportBoardBgImage.src = style.board.imgSrc;
                        } else if (window.exportBoardBgImage.src !== style.board.imgSrc) {
                            window.exportBoardBgImage.src = style.board.imgSrc;
                        }
                        if (window.exportBoardBgImage.complete && window.exportBoardBgImage.naturalWidth > 0) {
                            boardImage = window.exportBoardBgImage;
                        }
                    }
                }
                
                // Fill the whole background with the border margin color
                exportCtx.fillStyle = currentBgColor;
                exportCtx.fillRect(woodLeft, woodTop, woodRight - woodLeft, woodBottom - woodTop);
                
                // Then paint the inner board area with the regular board color or image
                if (boardImage) {
                    exportCtx.save();
                    let imgZoom = 1.0;
                    let imgOffsetX = 0;
                    let imgOffsetY = 0;
                    if (state.exportBoardStyle.board.imgZoom !== undefined) {
                        imgZoom = parseFloat(state.exportBoardStyle.board.imgZoom);
                    }
                    if (state.exportBoardStyle.board.imgOffsetX !== undefined) {
                        imgOffsetX = parseFloat(state.exportBoardStyle.board.imgOffsetX);
                    }
                    if (state.exportBoardStyle.board.imgOffsetY !== undefined) {
                        imgOffsetY = parseFloat(state.exportBoardStyle.board.imgOffsetY);
                    }
                    
                    exportCtx.beginPath();
                    exportCtx.rect(woodLeft, woodTop, woodRight - woodLeft, woodBottom - woodTop);
                    exportCtx.clip();

                    if (state.exportBoardStyle.board.imgRepeat) {
                        try {
                            const pattern = exportCtx.createPattern(boardImage, 'repeat');
                            if (pattern.setTransform) {
                                pattern.setTransform(new DOMMatrix().translate(fullBoardRect.x + imgOffsetX, fullBoardRect.y + imgOffsetY).scale(imgZoom, imgZoom));
                            }
                            exportCtx.fillStyle = pattern;
                            exportCtx.fillRect(woodLeft, woodTop, woodRight - woodLeft, woodBottom - woodTop);
                        } catch (e) {
                            exportCtx.fillStyle = currentBoardColor;
                            exportCtx.fillRect(woodLeft, woodTop, woodRight - woodLeft, woodBottom - woodTop);
                        }
                    } else {
                        const scaledW = fullBoardRect.w * imgZoom;
                        const scaledH = fullBoardRect.h * imgZoom;
                        const dx = fullBoardRect.x + (fullBoardRect.w - scaledW) / 2 + imgOffsetX;
                        const dy = fullBoardRect.y + (fullBoardRect.h - scaledH) / 2 + imgOffsetY;
                        exportCtx.drawImage(boardImage, dx, dy, scaledW, scaledH);
                    }
                    exportCtx.restore();
                } else {
                    exportCtx.fillStyle = currentBoardColor;
                    exportCtx.fillRect(gridLeft, gridTop, gridRight - gridLeft, gridBottom - gridTop);
                }


                let gridMult = 1.0;
                let gridColor = '#000000';
                let hoshiMult = 1.0;
                let hoshiColor = '#000000';
                let boundaryColor = '#000000';
                let boundarySize = 1.5;

                if (state.exportBoardStyle) {
                    const style = state.exportBoardStyle;
                    gridMult = parseFloat(style.grid.lineSize) || 1.0;
                    gridColor = style.grid.lineColor;
                    hoshiMult = (parseFloat(style.grid.hoshiSize) || 3.0) / 3.0;
                    hoshiColor = style.grid.hoshiColor;
                    boundaryColor = style.grid.boundaryColor;
                    boundarySize = parseFloat(style.grid.boundarySize) || 1.5;
                }

                const baseLine = Math.max(1.2, S * 0.035);
                const regularLineWidth = baseLine * gridMult;
                const boundaryLineWidth = baseLine * boundarySize;
                const borderLineWidth = Math.max(2.5, S * 0.07);

                // Dashed lines
                exportCtx.strokeStyle = gridColor;
                exportCtx.lineWidth = regularLineWidth;
                exportCtx.setLineDash([Math.max(2, S * 0.04), Math.max(3, S * 0.06)]);
                const dashExtend = 0.5 * S;

                if (boardColStart > 0) {
                    for (let j = 0; j < R_board; j++) {
                        exportCtx.beginPath(); exportCtx.moveTo(gridLeft, gridTop + j * S); exportCtx.lineTo(gridLeft - dashExtend, gridTop + j * S); exportCtx.stroke();
                    }
                }
                if (boardColEnd < 18) {
                    for (let j = 0; j < R_board; j++) {
                        exportCtx.beginPath(); exportCtx.moveTo(gridRight, gridTop + j * S); exportCtx.lineTo(gridRight + dashExtend, gridTop + j * S); exportCtx.stroke();
                    }
                }
                if (boardRowStart > 0) {
                    for (let i = 0; i < C_board; i++) {
                        exportCtx.beginPath(); exportCtx.moveTo(gridLeft + i * S, gridTop); exportCtx.lineTo(gridLeft + i * S, gridTop - dashExtend); exportCtx.stroke();
                    }
                }
                if (boardRowEnd < 18) {
                    for (let i = 0; i < C_board; i++) {
                        exportCtx.beginPath(); exportCtx.moveTo(gridLeft + i * S, gridBottom); exportCtx.lineTo(gridLeft + i * S, gridBottom + dashExtend); exportCtx.stroke();
                    }
                }
                exportCtx.setLineDash([]);

                // Solid grid lines with boundary distinction
                for (let i = 0; i < C_board; i++) {
                    const isBoundary = ( (boardColStart === 0 && i === 0) || (boardColEnd === 18 && i === C_board - 1) );
                    if (isBoundary) {
                        exportCtx.lineWidth = boundaryLineWidth;
                        exportCtx.strokeStyle = boundaryColor;
                    } else {
                        exportCtx.lineWidth = regularLineWidth;
                        exportCtx.strokeStyle = gridColor;
                    }
                    exportCtx.beginPath(); exportCtx.moveTo(gridLeft + i * S, gridTop); exportCtx.lineTo(gridLeft + i * S, gridBottom); exportCtx.stroke();
                }
                for (let j = 0; j < R_board; j++) {
                    const isBoundary = ( (boardRowStart === 0 && j === 0) || (boardRowEnd === 18 && j === R_board - 1) );
                    if (isBoundary) {
                        exportCtx.lineWidth = boundaryLineWidth;
                        exportCtx.strokeStyle = boundaryColor;
                    } else {
                        exportCtx.lineWidth = regularLineWidth;
                        exportCtx.strokeStyle = gridColor;
                    }
                    exportCtx.beginPath(); exportCtx.moveTo(gridLeft, gridTop + j * S); exportCtx.lineTo(gridRight, gridTop + j * S); exportCtx.stroke();
                }

                // Thick borders
                exportCtx.lineWidth = borderLineWidth;
                exportCtx.strokeStyle = '#000000'; // Keep outermost border line black
                exportCtx.lineJoin = 'miter';
                exportCtx.lineCap = 'square';
                exportCtx.beginPath();
                if (boardRowStart === 0) { exportCtx.moveTo(woodLeft, woodTop); exportCtx.lineTo(woodRight, woodTop); }
                if (boardRowEnd === 18) { exportCtx.moveTo(woodLeft, woodBottom); exportCtx.lineTo(woodRight, woodBottom); }
                if (boardColStart === 0) { exportCtx.moveTo(woodLeft, woodTop); exportCtx.lineTo(woodLeft, woodBottom); }
                if (boardColEnd === 18) { exportCtx.moveTo(woodRight, woodTop); exportCtx.lineTo(woodRight, woodBottom); }
                exportCtx.stroke();

                // Hoshi
                const hoshiRadius = Math.max(2, S * 0.08) * hoshiMult;
                for (let r = boardRowStart; r <= boardRowEnd; r++) {
                    for (let c = boardColStart; c <= boardColEnd; c++) {
                        if ([(3), (9), (15)].includes(r) && [(3), (9), (15)].includes(c)) {
                            exportCtx.fillStyle = hoshiColor;
                            exportCtx.beginPath();
                            exportCtx.arc(gridLeft + (c - boardColStart) * S, gridTop + (r - boardRowStart) * S, hoshiRadius, 0, 2 * Math.PI);
                            exportCtx.fill();
                        }
                    }
                }

                // Stones & Annotations
                for (let r = boardRowStart; r <= boardRowEnd; r++) {
                    for (let c = boardColStart; c <= boardColEnd; c++) {
                        const cell = state.board[r][c];
                        const cx = gridLeft + (c - boardColStart) * S;
                        const cy = gridTop + (r - boardRowStart) * S;
                        
                        if (cell.player || cell.annotation || cell.label) {
                            const clipRect = {
                                x: woodLeft,
                                y: woodTop,
                                w: woodRight - woodLeft,
                                h: woodBottom - woodTop
                            };
                            drawCellContent(exportCtx, cell, cx, cy, S, true, clipRect, currentBoardColor, fullBoardRect, r, c);
                        }
                    }
                }

                // Move Numbers
                if (state.displayMoveNumbers && state.sgfMoves && state.sgfMoves.length > 0 && state.currentMoveIndex >= -1) {
                    let absoluteCurrentIndex = -1;
                    if (state.currentMoveIndex >= 0) {
                        absoluteCurrentIndex = (state.filterStart || 1) - 1 + state.currentMoveIndex;
                    } else {
                        absoluteCurrentIndex = (state.filterStart || 1) - 2;
                    }

                    let startIndex = 0;
                    if (state.moveNumberMode === 'lastN') {
                        startIndex = Math.max(0, absoluteCurrentIndex - state.lastNMoves + 1);
                    }
                    
                    exportCtx.textAlign = 'center';
                    exportCtx.textBaseline = 'middle';
                    if (absoluteCurrentIndex >= 0) {
                        for (let i = startIndex; i <= absoluteCurrentIndex && i < state.allSgfMoves.length; i++) {
                            const move = state.allSgfMoves[i];
                            if (!move || move.r < 0 || move.r >= 19 || move.c < 0 || move.c >= 19) continue;
                            if (move.r >= boardRowStart && move.r <= boardRowEnd && move.c >= boardColStart && move.c <= boardColEnd) {
                                const cell = state.board[move.r][move.c];
                                if (cell.player === move.player) {
                                    const cx = gridLeft + (move.c - boardColStart) * S;
                                    const cy = gridTop + (move.r - boardRowStart) * S;
                                    let moveDisplayNum;
                                    if (state.showMoveCoord) {
                                        moveDisplayNum = COLS[move.c] + (19 - move.r);
                                    } else if (state.moveNumberCountback && state.moveNumberMode === 'lastN') {
                                        moveDisplayNum = (state.lastNMoves - (absoluteCurrentIndex - i)).toString();
                                    } else {
                                        moveDisplayNum = (i + 1).toString();
                                    }
                                    const numStr = moveDisplayNum;
                                    
                                    let fontSize = Math.floor(S * 0.45);
                                    if (numStr.length > 2) fontSize = Math.floor(S * 0.32);
                                    else if (numStr.length === 2) fontSize = Math.floor(S * 0.4);
                                    
                                    exportCtx.font = `normal ${fontSize}px "Figtree", sans-serif`;
                                    
                                    if (i === absoluteCurrentIndex) {
                                        exportCtx.fillStyle = cell.player === 'B' ? '#11ffee' : '#ff1122';
                                    } else {
                                        if (state.exportBoardStyle) {
                                            exportCtx.fillStyle = cell.player === 'B' ? state.exportBoardStyle.blackStone.fg : state.exportBoardStyle.whiteStone.fg;
                                            const fgSize = cell.player === 'B' ? parseFloat(state.exportBoardStyle.blackStone.fgSize) : parseFloat(state.exportBoardStyle.whiteStone.fgSize);
                                            if (!isNaN(fgSize) && fgSize !== null) {
                                                fontSize = fgSize * (S / 29.3333);
                                                exportCtx.font = `normal ${fontSize}px "Figtree", sans-serif`;
                                            }
                                        } else {
                                            exportCtx.fillStyle = cell.player === 'B' ? '#FFFFFF' : '#000000';
                                        }
                                    }
                                    exportCtx.fillText(numStr.toString().toUpperCase(), cx, cy);
                                }
                            }
                        }
                    }
                }

                // Draw Next Move Hint
                if (state.showNextMoveHint) {
                    const nextIndex = state.currentMoveIndex + 1;
                    if (nextIndex < state.sgfMoves.length) {
                        const nextMove = state.sgfMoves[nextIndex];
                        if (nextMove && nextMove.r >= boardRowStart && nextMove.r <= boardRowEnd && nextMove.c >= boardColStart && nextMove.c <= boardColEnd) {
                            const cx = gridLeft + (nextMove.c - boardColStart) * S;
                            const cy = gridTop + (nextMove.r - boardRowStart) * S;
                            
                            let hintStyle = { color: '#ff3b30', size: 0.25, alpha: 0.5 };
                            if (state.exportBoardStyle && state.exportBoardStyle.hint) {
                                hintStyle = state.exportBoardStyle.hint;
                            }
                            
                            exportCtx.save();
                            exportCtx.globalAlpha = parseFloat(hintStyle.alpha);
                            exportCtx.strokeStyle = hintStyle.color;
                            exportCtx.lineWidth = Math.max(2, S * 0.06);
                            exportCtx.beginPath();
                            exportCtx.arc(cx, cy, S * parseFloat(hintStyle.size), 0, 2 * Math.PI);
                            exportCtx.stroke();
                            exportCtx.restore();
                        }
                    }
                }
                // Draw Coordinates
                let coordData = {
                    show: true,
                    primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
                    secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
                };
                if (state.exportBoardStyle && state.exportBoardStyle.coord) {
                    coordData = state.exportBoardStyle.coord;
                }

                if (coordData.show) {
                    const defaultCellSize = 600 / 19;
                    const easternNumerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];
                    
                    if (hasTop && coordData.primary.show) {
                        exportCtx.textAlign = 'center';
                        exportCtx.textBaseline = 'bottom';
                        exportCtx.fillStyle = coordData.primary.color;
                        const fontSize = (parseFloat(coordData.primary.size) / defaultCellSize) * S;
                        exportCtx.font = `normal ${fontSize}px "iGoRodinPro", sans-serif`;
                        const pad = parseFloat(coordData.primary.pad) || 0;
                        const scaledPad = (pad / defaultCellSize) * S;

                        for (let c = boardColStart; c <= boardColEnd; c++) {
                            const flippedI = state.isPovFlipped ? (18 - c) : c;
                            const colLabelWestern = String.fromCharCode(65 + (flippedI >= 8 ? flippedI + 1 : flippedI));
                            const colLabelEastern = (flippedI + 1).toString();
                            const pCol = coordData.primary.type === 'eastern' ? colLabelEastern : colLabelWestern;
                            exportCtx.fillText(pCol, gridLeft + (c - boardColStart) * S, gridTop - 0.5 * S - scaledPad);
                        }
                    }
                    if (hasBottom && coordData.secondary.show) {
                        exportCtx.textAlign = 'center';
                        exportCtx.textBaseline = 'top';
                        exportCtx.fillStyle = coordData.secondary.color;
                        const fontSize = (parseFloat(coordData.secondary.size) / defaultCellSize) * S;
                        exportCtx.font = `normal ${fontSize}px "iGoRodinPro", sans-serif`;
                        const pad = parseFloat(coordData.secondary.pad) || 0;
                        const scaledPad = (pad / defaultCellSize) * S;

                        for (let c = boardColStart; c <= boardColEnd; c++) {
                            const flippedI = state.isPovFlipped ? (18 - c) : c;
                            const colLabelWestern = String.fromCharCode(65 + (flippedI >= 8 ? flippedI + 1 : flippedI));
                            const colLabelEastern = (flippedI + 1).toString();
                            const sCol = coordData.secondary.type === 'eastern' ? colLabelEastern : colLabelWestern;
                            exportCtx.fillText(sCol, gridLeft + (c - boardColStart) * S, gridBottom + 0.5 * S + scaledPad);
                        }
                    }
                    if (hasLeft && coordData.primary.show) {
                        exportCtx.textAlign = 'right';
                        exportCtx.textBaseline = 'middle';
                        exportCtx.fillStyle = coordData.primary.color;
                        const fontSize = (parseFloat(coordData.primary.size) / defaultCellSize) * S;
                        exportCtx.font = `normal ${fontSize}px "iGoRodinPro", sans-serif`;
                        const pad = parseFloat(coordData.primary.pad) || 0;
                        const scaledPad = (pad / defaultCellSize) * S;

                        for (let r = boardRowStart; r <= boardRowEnd; r++) {
                            const flippedI = state.isPovFlipped ? (18 - r) : r;
                            const rowLabelWestern = (19 - flippedI).toString();
                            const rowLabelEastern = easternNumerals[flippedI];
                            const pRow = coordData.primary.type === 'eastern' ? rowLabelEastern : rowLabelWestern;
                            exportCtx.fillText(pRow, gridLeft - 0.5 * S - scaledPad, gridTop + (r - boardRowStart) * S);
                        }
                    }
                    if (hasRight && coordData.secondary.show) {
                        exportCtx.textAlign = 'left';
                        exportCtx.textBaseline = 'middle';
                        exportCtx.fillStyle = coordData.secondary.color;
                        const fontSize = (parseFloat(coordData.secondary.size) / defaultCellSize) * S;
                        exportCtx.font = `normal ${fontSize}px "iGoRodinPro", sans-serif`;
                        const pad = parseFloat(coordData.secondary.pad) || 0;
                        const scaledPad = (pad / defaultCellSize) * S;

                        for (let r = boardRowStart; r <= boardRowEnd; r++) {
                            const flippedI = state.isPovFlipped ? (18 - r) : r;
                            const rowLabelWestern = (19 - flippedI).toString();
                            const rowLabelEastern = easternNumerals[flippedI];
                            const sRow = coordData.secondary.type === 'eastern' ? rowLabelEastern : rowLabelWestern;
                            exportCtx.fillText(sRow, gridRight + 0.5 * S + scaledPad, gridTop + (r - boardRowStart) * S);
                        }
                    }
                }
            }
            exportCtx.restore();
        }
        
        const dataUrl = exportCanvas.toDataURL('image/png');
        return { dataUrl, filename: `board_export.png` };
    } catch (e) {
        console.error("Export Error: ", e);
        throw e;
    }
}


// Global modal state
let currentExportDataUrl = null;
let currentExportFilename = null;

// The actual trigger to open the modal
async function openExportModal() {
    const modal = document.getElementById('export-modal-overlay');
    if (!modal) {
        // Fallback if HTML not updated
        const result = await generateDiagramDataURL();
        triggerBrowserImageDownload(result.dataUrl, result.filename);
        return;
    }
    
    // Configure modal inputs based on state
    configureModalInputs();
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Refresh floating style panel if open
    if (typeof applyCustomPanelState === 'function') {
        applyCustomPanelState();
    }
    
    // Generate initial preview
    await updateExportPreview();
}

function configureModalInputs() {
    // Populate the radio buttons based on SGF loaded state
    const hasSgf = state.sgfMoves && state.sgfMoves.length > 0;
    
    const titleGroup = document.getElementById('export-title-source-group');
    const commentGroup = document.getElementById('export-comment-source-group');
    
    // Synchronize checkboxes with global state
    const includeTitleToggle = document.getElementById('export-include-title');
    const includeCommentToggle = document.getElementById('export-include-comment');
    const exportIncludeLegends = document.getElementById('export-include-legends');
    const exportIncludeFlipnote = document.getElementById('export-include-flipnote');
    const exportIncludeAll = document.getElementById('export-include-all');
    const exportShowGuidingLines = document.getElementById('export-show-guiding-lines');
    const exportXyzInputs = document.getElementById('export-xyz-inputs');
    const exportInputX = document.getElementById('export-input-x');
    const exportInputY = document.getElementById('export-input-y');
    const exportInputZl = document.getElementById('export-input-zl');
    const exportInputZr = document.getElementById('export-input-zr');
    const exportInputDiaSize = document.getElementById('export-input-dia-size');
    const exportInputBoardColor = document.getElementById('export-input-board-color');
    const exportInputBorderSize = document.getElementById('export-input-border-size');
    const exportInputBorderColor = document.getElementById('export-input-border-color');
    const exportInputTitleSize = document.getElementById('export-input-title-size');
    const exportInputLegendSize = document.getElementById('export-input-legend-size');
    const exportInputCommentSize = document.getElementById('export-input-comment-size');
    const exportInputFlipnoteSize = document.getElementById('export-input-flipnote-size');
    
    const exportInputGridSize = document.getElementById('export-input-grid-size');
    const exportInputGridColor = document.getElementById('export-input-grid-color');
    const exportInputHoshiSize = document.getElementById('export-input-hoshi-size');
    const exportInputHoshiColor = document.getElementById('export-input-hoshi-color');
    
    if (includeTitleToggle) includeTitleToggle.checked = state.exportText.includeTitle;
    if (includeCommentToggle) includeCommentToggle.checked = state.exportText.includeComment;
    if (exportIncludeLegends) exportIncludeLegends.checked = state.exportText.includeLegends;
    if (exportIncludeFlipnote) exportIncludeFlipnote.checked = state.exportText.includeFlipNote;
    
    if (exportIncludeAll) {
        exportIncludeAll.checked = state.exportText.includeTitle && 
                                   state.exportText.includeComment && 
                                   state.exportText.includeLegends && 
                                   state.exportText.includeFlipNote;
    }
    if (exportShowGuidingLines) exportShowGuidingLines.checked = state.exportText.showGuidingLines;
    if (exportXyzInputs) exportXyzInputs.style.display = state.exportText.showGuidingLines ? 'flex' : 'none';
    if (exportInputX) exportInputX.value = state.exportText.paddingX;
    if (exportInputY) exportInputY.value = state.exportText.paddingY;
    if (exportInputZl) exportInputZl.value = state.exportText.paddingZL;
    if (exportInputZr) exportInputZr.value = state.exportText.paddingZR;
    if (exportInputDiaSize) exportInputDiaSize.value = state.exportText.diaSize;
    if (exportInputBoardColor) exportInputBoardColor.value = state.exportText.boardColor || '#dcb35c';
    if (exportInputBorderSize) exportInputBorderSize.value = state.exportText.borderSize !== undefined ? state.exportText.borderSize : 100;
    if (exportInputBorderColor) exportInputBorderColor.value = state.exportText.borderColor || '#dcb35c';
    if (exportInputTitleSize) exportInputTitleSize.value = state.exportText.titleSize || 100;
    if (exportInputLegendSize) exportInputLegendSize.value = state.exportText.legendSize || 100;
    if (exportInputCommentSize) exportInputCommentSize.value = state.exportText.commentSize || 100;
    if (exportInputFlipnoteSize) exportInputFlipnoteSize.value = state.exportText.flipnoteSize || 100;

    if (exportInputGridSize) exportInputGridSize.value = state.exportText.gridSize !== undefined ? state.exportText.gridSize : 1.0;
    if (exportInputGridColor) exportInputGridColor.value = state.exportText.gridColor || '#000000';
    if (exportInputHoshiSize) exportInputHoshiSize.value = state.exportText.hoshiSize !== undefined ? state.exportText.hoshiSize : 2.0;
    if (exportInputHoshiColor) exportInputHoshiColor.value = state.exportText.hoshiColor || '#000000';

    // Sync input visibility
    const titleSizeContainer = document.getElementById('export-input-title-size-container');
    const legendSizeContainer = document.getElementById('export-input-legend-size-container');
    const commentSizeContainer = document.getElementById('export-input-comment-size-container');
    const flipnoteSizeContainer = document.getElementById('export-input-flipnote-size-container');
    
    if (titleSizeContainer) titleSizeContainer.style.display = state.exportText.includeTitle ? 'flex' : 'none';
    if (legendSizeContainer) legendSizeContainer.style.display = state.exportText.includeLegends ? 'flex' : 'none';
    if (commentSizeContainer) commentSizeContainer.style.display = state.exportText.includeComment ? 'flex' : 'none';
    if (flipnoteSizeContainer) flipnoteSizeContainer.style.display = (state.exportText.includeFlipNote && state.isPovFlipped) ? 'flex' : 'none';
    
    if (hasSgf) {
        if (state.exportText.titleType !== 'free' && state.exportText.titleType !== 'auto') state.exportText.titleType = 'auto';
        titleGroup.innerHTML = `
            <label class="radio-label"><input type="radio" name="title-source" value="auto" ${state.exportText.titleType === 'auto' ? 'checked' : ''}> Auto-generate from SGF</label>
            <label class="radio-label"><input type="radio" name="title-source" value="manual" ${state.exportText.titleType === 'free' ? 'checked' : ''}> Custom Manual Input</label>
        `;
        if (state.exportText.commentType !== 'free' && state.exportText.commentType !== 'auto') state.exportText.commentType = 'auto';
        commentGroup.innerHTML = `
            <label class="radio-label"><input type="radio" name="comment-source" value="auto" ${state.exportText.commentType === 'auto' ? 'checked' : ''}> Auto-generate from SGF</label>
            <label class="radio-label"><input type="radio" name="comment-source" value="manual" ${state.exportText.commentType === 'free' ? 'checked' : ''}> Custom Manual Input</label>
        `;
    } else {
        if (state.exportText.titleType !== 'free' && state.exportText.titleType !== 'white-move' && state.exportText.titleType !== 'black-move') state.exportText.titleType = 'black-move';
        titleGroup.innerHTML = `
            <label class="radio-label"><input type="radio" name="title-source" value="black" ${state.exportText.titleType === 'black-move' ? 'checked' : ''}> Black to Play</label>
            <label class="radio-label"><input type="radio" name="title-source" value="white" ${state.exportText.titleType === 'white-move' ? 'checked' : ''}> White to Play</label>
            <label class="radio-label"><input type="radio" name="title-source" value="manual" ${state.exportText.titleType === 'free' ? 'checked' : ''}> Custom Manual Input</label>
        `;
        state.exportText.commentType = 'free';
        commentGroup.innerHTML = `
            <label class="radio-label"><input type="radio" name="comment-source" value="manual" checked> Custom Manual Input</label>
        `;
    }
    
    // Sync wrapper visibility
    const titleWrapper = document.getElementById('export-title-manual-wrapper');
    const commentWrapper = document.getElementById('export-comment-manual-wrapper');
    if (titleWrapper) {
        if (state.exportText.titleType === 'free') titleWrapper.classList.remove('hidden');
        else titleWrapper.classList.add('hidden');
    }
    if (commentWrapper) {
        if (state.exportText.commentType === 'free') commentWrapper.classList.remove('hidden');
        else commentWrapper.classList.add('hidden');
    }
    
    // Set up listeners for radio buttons to show/hide manual inputs
    const attachRadioListeners = (groupName, wrapperId, inputId, stateKey) => {
        const radios = document.querySelectorAll(`input[name="${groupName}"]`);
        const wrapper = document.getElementById(wrapperId);
        radios.forEach(r => r.addEventListener('change', async (e) => {
            if (e.target.value === 'manual') {
                wrapper.classList.remove('hidden');
                if (stateKey === 'titleType') state.exportText.titleType = 'free';
                if (stateKey === 'commentType') state.exportText.commentType = 'free';
            } else {
                wrapper.classList.add('hidden');
                if (stateKey === 'titleType') {
                    if (e.target.value === 'black') state.exportText.titleType = 'black-move';
                    if (e.target.value === 'white') state.exportText.titleType = 'white-move';
                    if (e.target.value === 'auto') state.exportText.titleType = 'auto'; 
                } else if (stateKey === 'commentType') {
                    if (e.target.value === 'auto') state.exportText.commentType = 'auto';
                }
            }
            await updateExportPreview();
        }));
    };
    
    attachRadioListeners('title-source', 'export-title-manual-wrapper', 'export-title-manual-input', 'titleType');
    attachRadioListeners('comment-source', 'export-comment-manual-wrapper', 'export-comment-manual-input', 'commentType');
    
    // Attach text input listeners
    document.getElementById('export-title-manual-input').addEventListener('input', async (e) => {
        state.exportText.titleFree = e.target.value;
        // Debounce might be good here, but for now just update
        if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
        window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
    });
    
    document.getElementById('export-comment-manual-input').addEventListener('input', async (e) => {
        state.exportText.comment = e.target.value;
        if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
        window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
    });
    
    // Toggles
    const updateInclAllState = () => {
        const inclAll = document.getElementById('export-include-all');
        if (inclAll) {
            let allChecked = state.exportText.includeTitle && 
                             state.exportText.includeComment && 
                             state.exportText.includeLegends;
            if (state.isPovFlipped) {
                allChecked = allChecked && state.exportText.includeFlipNote;
            }
            inclAll.checked = allChecked;
        }
    };

    const includeAllToggle = document.getElementById('export-include-all');
    if (includeAllToggle) {
        includeAllToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            state.exportText.includeTitle = isChecked;
            state.exportText.includeComment = isChecked;
            state.exportText.includeLegends = isChecked;
            
            if (state.isPovFlipped) {
                state.exportText.includeFlipNote = isChecked;
            } else {
                state.exportText.includeFlipNote = false;
            }
            
            if (includeTitleToggle) {
                includeTitleToggle.checked = isChecked;
                const body = document.getElementById('export-title-body');
                if (isChecked) body.classList.remove('disabled'); else body.classList.add('disabled');
            }
            if (includeCommentToggle) {
                includeCommentToggle.checked = isChecked;
                const body = document.getElementById('export-comment-body');
                if (isChecked) {
                    body.classList.remove('disabled');
                    const hasSgf = state.sgfMoves && state.sgfMoves.length > 0;
                    if (hasSgf) {
                        state.exportText.commentType = 'auto';
                        const autoRadio = document.querySelector('input[name="comment-source"][value="auto"]');
                        if (autoRadio) autoRadio.checked = true;
                        const wrapper = document.getElementById('export-comment-manual-wrapper');
                        if (wrapper) wrapper.classList.add('hidden');
                    }
                } else {
                    body.classList.add('disabled');
                }
            }
            if (exportIncludeLegends) {
                exportIncludeLegends.checked = isChecked;
                const container = document.getElementById('legend-settings-container');
                if (container) {
                    if (isChecked) container.classList.remove('disabled'); else container.classList.add('disabled');
                }
            }
            if (exportIncludeFlipnote) {
                exportIncludeFlipnote.checked = state.exportText.includeFlipNote;
            }
            await updateExportPreview();
        });
    }

    if (includeTitleToggle) {
        includeTitleToggle.addEventListener('change', async (e) => {
            const body = document.getElementById('export-title-body');
            if (e.target.checked) body.classList.remove('disabled');
            else body.classList.add('disabled');
            state.exportText.includeTitle = e.target.checked;
            updateInclAllState();
            await updateExportPreview();
        });
    }
    if (includeCommentToggle) {
        includeCommentToggle.addEventListener('change', async (e) => {
            const body = document.getElementById('export-comment-body');
            if (e.target.checked) {
                body.classList.remove('disabled');
                const hasSgf = state.sgfMoves && state.sgfMoves.length > 0;
                if (hasSgf) {
                    state.exportText.commentType = 'auto';
                    const autoRadio = document.querySelector('input[name="comment-source"][value="auto"]');
                    if (autoRadio) autoRadio.checked = true;
                    const wrapper = document.getElementById('export-comment-manual-wrapper');
                    if (wrapper) wrapper.classList.add('hidden');
                }
            } else {
                body.classList.add('disabled');
            }
            state.exportText.includeComment = e.target.checked;
            updateInclAllState();
            await updateExportPreview();
        });
    }
    
    if (exportIncludeLegends) {
        exportIncludeLegends.addEventListener('change', async (e) => {
            const container = document.getElementById('legend-settings-container');
            if (container) {
                if (e.target.checked) container.classList.remove('disabled');
                else container.classList.add('disabled');
            }
            state.exportText.includeLegends = e.target.checked;
            updateInclAllState();
            await updateExportPreview();
        });
    }
    
    if (exportIncludeFlipnote) {
        exportIncludeFlipnote.addEventListener('change', async (e) => {
            state.exportText.includeFlipNote = e.target.checked;
            updateInclAllState();
            await updateExportPreview();
        });
    }

    
    if (exportShowGuidingLines) {
        exportShowGuidingLines.addEventListener('change', async (e) => {
            state.exportText.showGuidingLines = e.target.checked;
            if (exportXyzInputs) exportXyzInputs.style.display = e.target.checked ? 'flex' : 'none';
            await updateExportPreview();
        });
    }
    
    const updatePadding = async (e, key) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        state.exportText[key] = val;
        await updateExportPreview();
    };
    
    if (exportInputX) exportInputX.addEventListener('input', (e) => updatePadding(e, 'paddingX'));
    if (exportInputY) exportInputY.addEventListener('input', (e) => updatePadding(e, 'paddingY'));
    if (exportInputZl) exportInputZl.addEventListener('input', (e) => updatePadding(e, 'paddingZL'));
    if (exportInputZr) exportInputZr.addEventListener('input', (e) => updatePadding(e, 'paddingZR'));
    if (exportInputDiaSize) exportInputDiaSize.addEventListener('input', (e) => updatePadding(e, 'diaSize'));
    if (exportInputBoardColor) {
        exportInputBoardColor.addEventListener('input', async (e) => {
            state.exportText.boardColor = e.target.value;
            await updateExportPreview();
        });
    }
    if (exportInputBorderSize) exportInputBorderSize.addEventListener('input', (e) => updatePadding(e, 'borderSize'));
    if (exportInputBorderColor) {
        exportInputBorderColor.addEventListener('input', async (e) => {
            state.exportText.borderColor = e.target.value;
            await updateExportPreview();
        });
    }
    if (exportInputTitleSize) exportInputTitleSize.addEventListener('input', (e) => updatePadding(e, 'titleSize'));
    if (exportInputLegendSize) exportInputLegendSize.addEventListener('input', (e) => updatePadding(e, 'legendSize'));
    if (exportInputCommentSize) exportInputCommentSize.addEventListener('input', (e) => updatePadding(e, 'commentSize'));
    if (exportInputFlipnoteSize) exportInputFlipnoteSize.addEventListener('input', (e) => updatePadding(e, 'flipnoteSize'));

    if (exportInputGridSize) {
        exportInputGridSize.addEventListener('input', async (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 1.0;
            state.exportText.gridSize = val;
            await updateExportPreview();
        });
    }
    if (exportInputGridColor) {
        exportInputGridColor.addEventListener('input', async (e) => {
            state.exportText.gridColor = e.target.value;
            await updateExportPreview();
        });
    }
    if (exportInputHoshiSize) {
        exportInputHoshiSize.addEventListener('input', async (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 2.0;
            state.exportText.hoshiSize = val;
            await updateExportPreview();
        });
    }
    if (exportInputHoshiColor) {
        exportInputHoshiColor.addEventListener('input', async (e) => {
            state.exportText.hoshiColor = e.target.value;
            await updateExportPreview();
        });
    }

    if (exportIncludeFlipnote) {
        const flipNoteContainer = exportIncludeFlipnote.closest('div');
        if (flipNoteContainer) {
            if (!state.isPovFlipped) {
                flipNoteContainer.style.opacity = '0.5';
                flipNoteContainer.style.pointerEvents = 'none';
                exportIncludeFlipnote.checked = false;
                state.exportText.includeFlipNote = false;
            } else {
                flipNoteContainer.style.opacity = '1';
                flipNoteContainer.style.pointerEvents = 'auto';
                exportIncludeFlipnote.checked = state.exportText.includeFlipNote;
            }
        }
    }

    // Layout Controls Initialization
    const layoutModeRadios = document.querySelectorAll('input[name="layout-mode"]');
    const hInputsPanel = document.getElementById('export-h-inputs');
    const commentSideRadios = document.querySelectorAll('input[name="comment-side"]');
    const exportInputW = document.getElementById('export-input-w');
    const exportInputZl2Container = document.getElementById('export-input-zl2-container');
    const exportInputZl2 = document.getElementById('export-input-zl2');
    const exportInputZr2Container = document.getElementById('export-input-zr2-container');
    const exportInputZr2 = document.getElementById('export-input-zr2');
    const exportInputCommentPadding = document.getElementById('export-input-comment-padding');

    // Sync UI with state
    layoutModeRadios.forEach(r => { if (r.value === state.exportText.layoutMode) r.checked = true; });
    commentSideRadios.forEach(r => { if (r.value === state.exportText.commentSide) r.checked = true; });
    if (exportInputW) exportInputW.value = state.exportText.commentWidth;
    if (exportInputZl2) exportInputZl2.value = state.exportText.paddingZL2;
    if (exportInputZr2) exportInputZr2.value = state.exportText.paddingZR2;
    if (exportInputCommentPadding) exportInputCommentPadding.value = state.exportText.commentPadding || 0;

    const updateLayoutUI = () => {
        const isH = state.exportText.layoutMode === 'h';
        if (hInputsPanel) hInputsPanel.style.display = isH ? 'flex' : 'none';
        
        if (isH) {
            if (state.exportText.commentSide === 'left') {
                if (exportInputZl2Container) exportInputZl2Container.style.display = 'flex';
                if (exportInputZr2Container) exportInputZr2Container.style.display = 'none';
            } else {
                if (exportInputZl2Container) exportInputZl2Container.style.display = 'none';
                if (exportInputZr2Container) exportInputZr2Container.style.display = 'flex';
            }
        } else {
            if (exportInputZl2Container) exportInputZl2Container.style.display = 'none';
            if (exportInputZr2Container) exportInputZr2Container.style.display = 'none';
        }
    };
    updateLayoutUI();

    // Event Listeners for new layout inputs
    layoutModeRadios.forEach(r => r.addEventListener('change', async (e) => {
        state.exportText.layoutMode = e.target.value;
        updateLayoutUI();
        await updateExportPreview();
    }));

    commentSideRadios.forEach(r => r.addEventListener('change', async (e) => {
        state.exportText.commentSide = e.target.value;
        updateLayoutUI();
        await updateExportPreview();
    }));

    if (exportInputW) exportInputW.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 50) val = 50;
        state.exportText.commentWidth = val;
        if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
        window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
    });

    if (exportInputCommentPadding) exportInputCommentPadding.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        state.exportText.commentPadding = val;
        if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
        window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
    });

    if (exportInputZl2) exportInputZl2.addEventListener('input', (e) => updatePadding(e, 'paddingZL2'));
    if (exportInputZr2) exportInputZr2.addEventListener('input', (e) => updatePadding(e, 'paddingZR2'));
}

async function updateExportPreview() {
    try {
        const titleSizeContainer = document.getElementById('export-input-title-size-container');
        const legendSizeContainer = document.getElementById('export-input-legend-size-container');
        const commentSizeContainer = document.getElementById('export-input-comment-size-container');
        const flipnoteSizeContainer = document.getElementById('export-input-flipnote-size-container');
        
        if (titleSizeContainer) titleSizeContainer.style.display = state.exportText.includeTitle ? 'flex' : 'none';
        if (legendSizeContainer) legendSizeContainer.style.display = state.exportText.includeLegends ? 'flex' : 'none';
        if (commentSizeContainer) commentSizeContainer.style.display = state.exportText.includeComment ? 'flex' : 'none';
        if (flipnoteSizeContainer) flipnoteSizeContainer.style.display = (state.exportText.includeFlipNote && state.isPovFlipped) ? 'flex' : 'none';

        const result = await generateDiagramDataURL();
        currentExportDataUrl = result.dataUrl;
        currentExportFilename = result.filename;
        const img = document.getElementById('export-preview-image');
        if (img) img.src = currentExportDataUrl;
    } catch (err) {
        console.error("Preview update failed", err);
    }
}


// State Serialization helper
function serializeState() {
    const includeTextInCode = elements.repIncludeText ? elements.repIncludeText.checked : true;

    const serialized = {
        crop: {
            colStart: state.crop.colStart,
            colEnd: state.crop.colEnd,
            rowStart: state.crop.rowStart,
            rowEnd: state.crop.rowEnd
        },
        cells: [],
        hoshi: [],
        nextLetter: state.customLetter,
        nextNumber: state.customNumber,
        playMode: state.playMode,
        playTurn: state.playTurn
    };

    if (includeTextInCode) {
        serialized.exportText = {
            includeText: state.exportText.includeText,
            titleType: state.exportText.titleType,
            titleFree: state.exportText.titleFree,
            comment: state.exportText.comment
        };
        serialized.legend = JSON.parse(JSON.stringify(state.legend));
    }

    // Serialize cells with active content
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const cell = state.board[r][c];
            if (cell.player || cell.annotation || cell.label) {
                serialized.cells.push({
                    r: r,
                    c: c,
                    p: cell.player || null,
                    a: cell.annotation || null,
                    l: cell.label || null
                });
            }
        }
    }

    // Serialize hoshi points configuration
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            if (state.hoshiPoints[r][c]) {
                serialized.hoshi.push([r, c]);
            }
        }
    }

    return JSON.stringify(serialized);
}

// Function to find matching SGF move index based on board stones
function findMatchingSgfMoveIndex(targetBoard) {
    if (!state.baselineBoard || !state.sgfMoves) return null;
    let tempBoard = JSON.parse(JSON.stringify(state.baselineBoard));
    
    const isMatch = (board1, board2) => {
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                const p1 = board1[r][c].player || null;
                const p2 = board2[r][c].player || null;
                if (p1 !== p2) return false;
            }
        }
        return true;
    };

    const targetBoardRotated = Array.from({length: 19}, (_, r) => 
        Array.from({length: 19}, (_, c) => targetBoard[18-r][18-c])
    );
    
    if (isMatch(tempBoard, targetBoard)) return { index: -1, needsFlip: false };
    if (isMatch(tempBoard, targetBoardRotated)) return { index: -1, needsFlip: true };
    
    for (let i = 0; i < state.sgfMoves.length; i++) {
        const m = state.sgfMoves[i];
        playStoneWithCaptures(tempBoard, m.r, m.c, m.player);
        if (isMatch(tempBoard, targetBoard)) return { index: i, needsFlip: false };
        if (isMatch(tempBoard, targetBoardRotated)) return { index: i, needsFlip: true };
    }
    return null;
}

// State Deserialization helper
function deserializeState(jsonString) {
    try {
        const data = JSON.parse(jsonString.trim());
        
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid code format.');
        }

        saveHistoryState();

        // Restore crop bounds
        if (data.crop && typeof data.crop === 'object') {
            state.crop.colStart = typeof data.crop.colStart === 'number' ? data.crop.colStart : 0;
            state.crop.colEnd = typeof data.crop.colEnd === 'number' ? data.crop.colEnd : 18;
            state.crop.rowStart = typeof data.crop.rowStart === 'number' ? data.crop.rowStart : 0;
            state.crop.rowEnd = typeof data.crop.rowEnd === 'number' ? data.crop.rowEnd : 18;
        } else {
            state.crop = { colStart: 0, colEnd: 18, rowStart: 0, rowEnd: 18 };
        }

        // Reset board cells
        state.board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
            player: null,
            annotation: null,
            label: null
        })));

        // Restore board cells
        if (Array.isArray(data.cells)) {
            data.cells.forEach(cell => {
                if (typeof cell.r === 'number' && cell.r >= 0 && cell.r < 19 &&
                    typeof cell.c === 'number' && cell.c >= 0 && cell.c < 19) {
                    state.board[cell.r][cell.c] = {
                        player: cell.p || null,
                        annotation: cell.a || null,
                        label: cell.l || null
                    };
                }
            });
        }

        // Reset and restore hoshi points
        state.hoshiPoints = Array.from({ length: 19 }, () => Array(19).fill(false));
        if (Array.isArray(data.hoshi)) {
            data.hoshi.forEach(pt => {
                if (Array.isArray(pt) && pt.length === 2) {
                    const [r, c] = pt;
                    if (typeof r === 'number' && r >= 0 && r < 19 &&
                        typeof c === 'number' && c >= 0 && c < 19) {
                        state.hoshiPoints[r][c] = true;
                    }
                }
            });
        } else {
            // Default hoshi points fallback
            state.hoshiPoints = Array.from({ length: 19 }, (_, r) => 
                Array.from({ length: 19 }, (_, c) => 
                    [3, 9, 15].includes(r) && [3, 9, 15].includes(c)
                )
            );
        }

        // Restore custom annotation next values
        if (data.nextLetter && typeof data.nextLetter === 'string') {
            state.customLetter = data.nextLetter.charAt(0).toUpperCase();
            elements.customLetterInput.value = state.customLetter;
            elements.toolLetterPreview.textContent = state.customLetter.toLowerCase();
        }
        if (typeof data.nextNumber === 'number') {
            state.customNumber = data.nextNumber;
            elements.customNumberInput.value = state.customNumber;
            elements.toolNumberPreview.textContent = state.customNumber;
        }

        // Restore exportText settings
        if (data.exportText && typeof data.exportText === 'object') {
            state.exportText = { ...state.exportText, ...data.exportText };
        } else {
            // Keep existing defaults
            state.exportText = {
                includeTitle: false,
                titleType: 'auto',
                titleFree: '',
                includeComment: false,
                commentType: 'auto',
                comment: '',
                includeLegends: false,
                includeFlipNote: false,
                showGuidingLines: false,
                paddingX: 20,
                paddingY: 20,
                paddingZL: 20,
                paddingZR: 20
            };
        }

        if (data.legend && typeof data.legend === 'object') {
            state.legend = JSON.parse(JSON.stringify(data.legend));
            const groupNum = document.getElementById('legend-group-numbers');
            if (groupNum) groupNum.checked = state.legend.groupNumbers;
            const groupLet = document.getElementById('legend-group-letters');
            if (groupLet) groupLet.checked = state.legend.groupLetters;
        } else {
            state.legend = { active: {}, meanings: {}, groupNumbers: true, groupLetters: true };
            const groupNum = document.getElementById('legend-group-numbers');
            if (groupNum) groupNum.checked = true;
            const groupLet = document.getElementById('legend-group-letters');
            if (groupLet) groupLet.checked = true;
        }

        // Restore playMode setting
        const togglePlayMode = document.getElementById('toggle-play-mode');
        const playModeInfo = document.getElementById('play-mode-info');
        if (data.hasOwnProperty('playMode')) {
            state.playMode = !!data.playMode;
        } else {
            state.playMode = false;
        }
        if (data.hasOwnProperty('playTurn')) {
            state.playTurn = data.playTurn;
        } else {
            state.playTurn = 'B';
        }
        if (togglePlayMode) {
            togglePlayMode.checked = state.playMode;
        }
        if (playModeInfo) {
            if (state.playMode) {
                playModeInfo.innerHTML = `
                    <p>🎮 <strong>Play Mode is Active:</strong> You can now play moves on the board interactively. Clicking on intersections will place stones alternatingly, similar to a real Go game.</p>
                    <p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--accent-indigo); font-weight: 500;">💡 Play Mode overrides active edit tools.</p>
                `;
            } else {
                playModeInfo.innerHTML = `
                    <p>🎮 <strong>Play Mode is Off:</strong> You are currently in <strong>Edit/Annotation Mode</strong>. Click on cells to draw stones, labels, and markers as annotations.</p>
                `;
            }
        }

        // Sync SGF Replayer without destroying annotations
        const matchResult = findMatchingSgfMoveIndex(state.board);
        if (matchResult !== null && state.sgfMoves) {
            const matchedIndex = matchResult.index;
            const needsFlip = matchResult.needsFlip;

            if (needsFlip) {
                // The pasted code is from the opposite POV of our current SGF state.
                // Flip the pasted state.board, state.crop, and state.hoshiPoints to match the current POV
                const newBoard = Array.from({length: 19}, () => Array.from({length: 19}, () => ({player: null, annotation: null, label: null})));
                for (let r = 0; r < 19; r++) {
                    for (let c = 0; c < 19; c++) {
                        newBoard[18-r][18-c] = JSON.parse(JSON.stringify(state.board[r][c]));
                    }
                }
                state.board = newBoard;

                const newHoshi = Array.from({length: 19}, () => Array(19).fill(false));
                for (let r = 0; r < 19; r++) {
                    for (let c = 0; c < 19; c++) {
                        newHoshi[18-r][18-c] = state.hoshiPoints[r][c];
                    }
                }
                state.hoshiPoints = newHoshi;

                const oldCrop = state.crop;
                state.crop = {
                    colStart: 18 - oldCrop.colEnd,
                    colEnd: 18 - oldCrop.colStart,
                    rowStart: 18 - oldCrop.rowEnd,
                    rowEnd: 18 - oldCrop.rowStart
                };
            }

            state.currentMoveIndex = matchedIndex;
            
            let totalCapturedByB = state.prefixCaptures?.B || 0;
            let totalCapturedByW = state.prefixCaptures?.W || 0;
    let capturedThisMove = 0;
    let capturedPositions = [];
            
            let tempBoard = JSON.parse(JSON.stringify(state.baselineBoard));
            for (let i = 0; i <= matchedIndex; i++) {
                const m = state.sgfMoves[i];
                const captured = playStoneWithCaptures(tempBoard, m.r, m.c, m.player);
                if (m.player === 'B') {
                    totalCapturedByB += captured.count;
                } else {
                    totalCapturedByW += captured.count;
                }
                if (i === matchedIndex) capturedThisMove = captured.count;
            }
            
            const rCurPlayer = matchedIndex >= 0 ? state.sgfMoves[matchedIndex].player : null;
            state.captures = {
                B: totalCapturedByB,
                W: totalCapturedByW,
                B_before: totalCapturedByB - (rCurPlayer === 'B' ? capturedThisMove : 0),
                W_before: totalCapturedByW - (rCurPlayer === 'W' ? capturedThisMove : 0),
                lastCaptured: capturedThisMove,
                lastPlayer: rCurPlayer
            };
            
            if (elements.replayerMoveKpi) {
                elements.replayerMoveKpi.textContent = `${matchedIndex + 1} / ${state.sgfMoves.length}`;
            }
            
            updateCommentUI();
            updatePlayerHighlightUI();
            updateCapturesUI(false);
        }

        // Redraw and update crop UI
        drawBoard();
        updateCropBadge();
        
        // Clear paste input
        if (elements.repCodeInput) elements.repCodeInput.value = '';
        alert('Board configuration successfully applied!');
    } catch (err) {
        console.error('Failed to parse board code: ', err);
        alert('Failed to apply code. Please ensure you copied the entire replication code and try again.');
    }
}

// Live update output
function updateReplicationCode() {
    if (elements.repCodeOutput) {
        elements.repCodeOutput.value = serializeState();
    }
}

// Trigger a browser fallback download for files
function triggerBrowserDownload(content, filename, mimeType) {
    try {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Failed to download: ', err);
    }
}

// Trigger a browser fallback download for images
function triggerBrowserImageDownload(dataUrl, filename) {
    try {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Failed to download image: ', err);
    }
}

// --- Diagram Legend Logic ---
function updateLegendUI() {
    const legendContainer = document.getElementById('legend-items-container');
    const groupingOptions = document.getElementById('legend-grouping-options');
    if (!legendContainer || !groupingOptions) return;

    // 1. Scan board for used annotations and labels
    const usedMarks = new Set();
    const usedNumbers = new Set();
    const usedLetters = new Set();

    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const cell = state.board[r][c];
            if (cell.annotation) {
                usedMarks.add(cell.annotation);
            }
            if (cell.label) {
                const labelStr = cell.label.trim();
                const num = parseInt(labelStr, 10);
                if (!isNaN(num) && num >= 1 && num <= 10 && labelStr === String(num)) {
                    usedNumbers.add(num);
                } else if (/^[a-jA-J]$/.test(labelStr)) {
                    usedLetters.add(labelStr.toUpperCase());
                }
            }
        }
    }

    const hasMarks = usedMarks.size > 0;
    const hasNumbers = usedNumbers.size > 0;
    const hasLetters = usedLetters.size > 0;

    if (!hasMarks && !hasNumbers && !hasLetters) {
        legendContainer.innerHTML = '<div class="info-badge" style="font-size: 11px; text-align: center;">No markers or labels on board</div>';
        groupingOptions.classList.add('hidden');
        return;
    }

    groupingOptions.classList.remove('hidden');

    let legendObjects = [];
    const addLegend = (id, labelText) => {
        legendObjects.push({ id, labelText });
    };

    // Marks
    const markLabels = {
        'triangle': 'Triangle',
        'square': 'Square',
        'circle': 'Circle',
        'cross': 'Cross',
        'red-circle': 'Red Circle',
        'green-circle': 'Green Circle'
    };

    const marksArray = Array.from(usedMarks).sort();
    marksArray.forEach(mark => addLegend(`mark-${mark}`, markLabels[mark]));

    // Numbers
    if (hasNumbers) {
        if (state.legend.groupNumbers) {
            const numArr = Array.from(usedNumbers);
            const minNum = Math.min(...numArr);
            const maxNum = Math.max(...numArr);
            const labelStr = minNum === maxNum ? `Number ${minNum}` : `Numbers ${minNum}-${maxNum}`;
            addLegend('group-numbers', labelStr);
        } else {
            Array.from(usedNumbers).sort((a,b)=>a-b).forEach(num => addLegend(`number-${num}`, `Number ${num}`));
        }
    }

    // Letters
    if (hasLetters) {
        if (state.legend.groupLetters) {
            const sortedLetters = Array.from(usedLetters).sort();
            const minLet = sortedLetters[0];
            const maxLet = sortedLetters[sortedLetters.length - 1];
            const labelStr = minLet === maxLet ? `Letter ${minLet}` : `Letters ${minLet}-${maxLet}`;
            addLegend('group-letters', labelStr);
        } else {
            Array.from(usedLetters).sort().forEach(letter => addLegend(`letter-${letter}`, `Letter ${letter}`));
        }
    }

    // Sort legendObjects by state.legend.order
    if (!state.legend.order) state.legend.order = [];
    legendObjects.sort((a, b) => {
        let indexA = state.legend.order.indexOf(a.id);
        let indexB = state.legend.order.indexOf(b.id);
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        return indexA - indexB;
    });

    state.legend.order = legendObjects.map(obj => obj.id);

    let html = '';
    const createInputRow = (id, labelText) => {
        const isActive = state.legend.active[id] !== false; // true by default
        const meaning = state.legend.meanings[id] || '';
        return `
            <div draggable="true" class="legend-row" data-id="${id}" style="display: flex; align-items: center; gap: 8px; cursor: grab; padding: 4px; border-radius: 4px; transition: all 0.2s; opacity: ${isActive ? '1' : '0.4'};">
                <div style="color: #9ca3af; display: flex; align-items: center;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"></path></svg>
                </div>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; width: 85px; flex-shrink: 0; margin: 0;">
                    <input type="checkbox" class="legend-checkbox" data-id="${id}" ${isActive ? 'checked' : ''}>
                    <span>${labelText}</span>
                </label>
                <input type="text" class="legend-input" data-id="${id}" value="${meaning}" placeholder="Meaning..." style="flex: 1; padding: 4px; border-radius: var(--radius-sm); border: 1px solid var(--border-card); font-size: 11px;" ${!isActive ? 'disabled' : ''}>
            </div>
        `;
    };

    legendObjects.forEach(obj => {
        html += createInputRow(obj.id, obj.labelText);
    });

    legendContainer.innerHTML = html;

    // Attach event listeners
    const checkboxes = legendContainer.querySelectorAll('.legend-checkbox');
    const inputs = legendContainer.querySelectorAll('.legend-input');
    const rows = legendContainer.querySelectorAll('.legend-row');

    checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            saveHistoryState();
            state.legend.active[id] = e.target.checked;
            
            const row = legendContainer.querySelector(`.legend-row[data-id="${id}"]`);
            if (row) {
                row.style.opacity = e.target.checked ? '1' : '0.4';
            }
            
            const input = legendContainer.querySelector(`.legend-input[data-id="${id}"]`);
            if (input) {
                input.disabled = !e.target.checked;
            }
            updateReplicationCode();
            
            const modal = document.getElementById('export-modal-overlay');
            if (modal && !modal.classList.contains('hidden')) {
                if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
                window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
            }
        });
    });

    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const id = e.target.dataset.id;
            state.legend.meanings[id] = e.target.value;
            e.target.setAttribute('value', e.target.value); 
            updateReplicationCode();
            
            const modal = document.getElementById('export-modal-overlay');
            if (modal && !modal.classList.contains('hidden')) {
                if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
                window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
            }
        });
    });

    let dragSrcEl = null;
    rows.forEach(row => {
        row.addEventListener('dragstart', function(e) {
            dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
            this.style.opacity = '0.4';
        });
        row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        });
        row.addEventListener('dragenter', function(e) {
            this.style.background = '#e5e7eb';
        });
        row.addEventListener('dragleave', function(e) {
            this.style.background = 'transparent';
        });
        row.addEventListener('drop', async function(e) {
            e.stopPropagation();
            this.style.background = 'transparent';
            if (dragSrcEl !== this) {
                const allRows = Array.from(legendContainer.querySelectorAll('.legend-row'));
                const srcIndex = allRows.indexOf(dragSrcEl);
                const targetIndex = allRows.indexOf(this);
                if (srcIndex < targetIndex) {
                    this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(dragSrcEl, this);
                }
                const newOrderRows = Array.from(legendContainer.querySelectorAll('.legend-row'));
                state.legend.order = newOrderRows.map(r => r.dataset.id);
                updateReplicationCode();
                
                const modal = document.getElementById('export-modal-overlay');
                if (modal && !modal.classList.contains('hidden')) {
                    if (window.exportPreviewTimeout) clearTimeout(window.exportPreviewTimeout);
                    window.exportPreviewTimeout = setTimeout(updateExportPreview, 300);
                }
            }
            return false;
        });
        row.addEventListener('dragend', function(e) {
            this.style.opacity = '1';
            rows.forEach(r => r.style.background = 'transparent');
        });
    });
}

function captureIfDead(tempBoard, r, c, color) {
    const group = [];
    const visited = Array.from({length: 19}, () => Array(19).fill(false));
    let hasLiberty = false;
    
    const dfs = (cr, cc) => {
        visited[cr][cc] = true;
        group.push({r: cr, c: cc});
        
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let [dr, dc] of dirs) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                if (!tempBoard[nr][nc].player) {
                    hasLiberty = true;
                } else if (tempBoard[nr][nc].player === color && !visited[nr][nc]) {
                    dfs(nr, nc);
                }
            }
        }
    };
    dfs(r, c);
    if (!hasLiberty) {
        const captured = group.map(pt => ({ r: pt.r, c: pt.c, player: color }));
        group.forEach(pt => { tempBoard[pt.r][pt.c].player = null; });
        return { count: group.length, positions: captured };
    }
    return { count: 0, positions: [] };
}

function playStoneWithCaptures(tempBoard, r, c, color) {
    if (r < 0 || r > 18 || c < 0 || c > 18) return { count: 0, positions: [] };
    tempBoard[r][c].player = color;
    let totalCount = 0;
    let allPositions = [];
    const opp = color === 'B' ? 'W' : 'B';
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    dirs.forEach(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19 && tempBoard[nr][nc].player === opp) {
            const result = captureIfDead(tempBoard, nr, nc, opp);
            totalCount += result.count;
            allPositions.push(...result.positions);
        }
    });
    const suicide = captureIfDead(tempBoard, r, c, color);
    totalCount += suicide.count;
    allPositions.push(...suicide.positions);
    return { count: totalCount, positions: allPositions };
}

// ── Comment Coordinate Highlighting ──

// ── Lightweight Markdown Renderer for Comments ──

function renderMarkdown(text) {
    if (!text) return text;

    // Escape HTML entities (but preserve existing tags from parseCommentCoords)
    // We only escape if this is raw text, not already processed HTML
    let html = text;

    // Normalize line endings
    html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Process block-level elements first (split by double newlines for paragraphs)
    const lines = html.split('\n');
    const blocks = [];
    let currentBlock = [];
    let inCodeBlock = false;
    let codeBlockContent = [];
    let codeBlockLang = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Fenced code blocks: ```lang ... ```
        if (line.trimStart().startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                const langAttr = codeBlockLang ? ` class="language-${codeBlockLang}"` : '';
                blocks.push(`<pre><code${langAttr}>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
                codeBlockContent = [];
                codeBlockLang = '';
                inCodeBlock = false;
            } else {
                // Start code block
                inCodeBlock = true;
                codeBlockLang = line.trimStart().slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Blank line = block separator
        if (line.trim() === '') {
            if (currentBlock.length > 0) {
                blocks.push(processBlockLines(currentBlock));
                currentBlock = [];
            }
            continue;
        }

        currentBlock.push(line);
    }

    // Flush remaining block
    if (inCodeBlock) {
        blocks.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
    }
    if (currentBlock.length > 0) {
        blocks.push(processBlockLines(currentBlock));
    }

    return blocks.join('\n');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function processBlockLines(lines) {
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Headings: # ... ######
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const content = renderInlineMarkdown(headingMatch[2]);
            result.push(`<h${level}>${content}</h${level}>`);
            i++;
            continue;
        }

        // Blockquote: > ...
        if (trimmed.startsWith('> ')) {
            const quoteLines = [];
            while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
                quoteLines.push(lines[i].trimStart().slice(2));
                i++;
            }
            result.push(`<blockquote>${renderInlineMarkdown(quoteLines.join('\n'))}</blockquote>`);
            continue;
        }

        // Unordered list: - or * or + at start
        if (/^[-*+]\s/.test(trimmed)) {
            const listItems = [];
            while (i < lines.length && /^[-*+]\s/.test(lines[i].trimStart())) {
                listItems.push(lines[i].trimStart().replace(/^[-*+]\s/, ''));
                i++;
            }
            result.push('<ul>' + listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('') + '</ul>');
            continue;
        }

        // Ordered list: 1. or 1) etc
        if (/^\d+[.)]\s/.test(trimmed)) {
            const listItems = [];
            while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trimStart())) {
                listItems.push(lines[i].trimStart().replace(/^\d+[.)]\s/, ''));
                i++;
            }
            result.push('<ol>' + listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('') + '</ol>');
            continue;
        }

        // Horizontal rule: --- or *** or ___
        if (/^[-*_]{3,}\s*$/.test(trimmed)) {
            result.push('<hr>');
            i++;
            continue;
        }

        // Table: line with pipes and next line is separators
        if (trimmed.includes('|') && i + 1 < lines.length && /^\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(lines[i + 1].trim())) {
            const headerCells = parseTableRow(trimmed);
            i += 2; // skip header + separator
            const bodyRows = [];
            while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
                bodyRows.push(parseTableRow(lines[i].trim()));
                i++;
            }
            let table = '<table><thead><tr>' + headerCells.map(c => `<th>${renderInlineMarkdown(c)}</th>`).join('') + '</tr></thead><tbody>';
            for (const row of bodyRows) {
                table += '<tr>' + row.map(c => `<td>${renderInlineMarkdown(c)}</td>`).join('') + '</tr>';
            }
            table += '</tbody></table>';
            result.push(table);
            continue;
        }

        // Regular paragraph line — collect consecutive non-blank, non-special lines
        const paraLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
            const l = lines[i].trimStart();
            // Stop if this line is a block-level syntax
            if (/^#{1,6}\s/.test(l) || /^[-*+]\s/.test(l) || /^\d+[.)]\s/.test(l) || l.startsWith('> ') || /^[-*_]{3,}\s*$/.test(l)) break;
            paraLines.push(l);
            i++;
        }
        if (paraLines.length > 0) {
            result.push(`<p>${renderInlineMarkdown(paraLines.join('<br>'))}</p>`);
        }
    }

    return result.join('\n');
}

function parseTableRow(line) {
    const cleaned = line.replace(/^\|/, '').replace(/\|$/, '');
    return cleaned.split('|').map(c => c.trim());
}

function renderInlineMarkdown(text) {
    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold+Italic: ***text*** or ___text___
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.+?)_/g, '<em>$1</em>');

    // Strikethrough: ~~text~~
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Images: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');

    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    return text;
}

// ── End Markdown Renderer ──

const COL_INDEX = {};
COLS.forEach((ch, i) => { COL_INDEX[ch] = i; });

const COORD_RE = /\b([A-HJ-T])([1-9]|1[0-9])\b/g;
const GROUP_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=\{\[([^\]]+)\]\}/g;
const STONE_GROUP_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=\{(\s*B\s*\[[^\]]*\]\s*,\s*W\s*\[[^\]]*\]\s*|\s*W\s*\[[^\]]*\]\s*,\s*B\s*\[[^\]]*\]\s*)\}/g;

let _commentHighlightedCells = [];
let _commentQuarterHighlighted = null;
let _commentHoshiHighlighted = null;
let _commentHoshiRectHighlighted = null;
let _commentCellHighlighted = [];
let _commentStoneGroupBlackCells = [];
let _commentStoneGroupWhiteCells = [];
let _commentStoneGroupGroups = [];
let _ladderBlackPath = [];
let _ladderWhitePath = [];

function drawLadderHighlights(ctx) {
    if (_ladderBlackPath.length === 0 && _ladderWhitePath.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = CELL_SIZE * 0.75;
    function drawPath(path, color) {
        if (path.length < 2) return;
        ctx.strokeStyle = color;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < path.length; i++) {
            if (path[i] === null) {
                if (started) { ctx.stroke(); ctx.beginPath(); started = false; }
                continue;
            }
            if (!started) {
                ctx.moveTo(PADDING + path[i].c * CELL_SIZE, PADDING + path[i].r * CELL_SIZE);
                started = true;
            } else {
                ctx.lineTo(PADDING + path[i].c * CELL_SIZE, PADDING + path[i].r * CELL_SIZE);
            }
        }
        if (started) ctx.stroke();
    }
    drawPath(_ladderBlackPath, 'rgba(64, 224, 208, 0.45)');
    drawPath(_ladderWhitePath, 'rgba(221, 64, 114, 0.45)');
    ctx.restore();
}

function parseSingleCoords(text) {
    if (!text) return text;
    // First, parse red coordinates: {!D4}
    text = text.replace(/\{!([A-HJ-T])([1-9]|1[0-9])\}/g, '<span class="comment-coord" data-col="$1" data-row="$2" data-red="true">$1$2</span>');
    // Then, parse standard coordinates: D4
    text = text.replace(COORD_RE, '<span class="comment-coord" data-col="$1" data-row="$2">$1$2</span>');
    return text;
}

function _parseStoneGroups(text, matches) {
    const COORD_RE_INNER = /\b([A-HJ-T])([1-9]|1[0-9])\b/g;
    function _parseBWGroups(inner) {
        const G_RE = /([BW])\[([^\]]*)\]/g;
        const result = [];
        let gm;
        while ((gm = G_RE.exec(inner)) !== null) {
            const color = gm[1];
            const coordsInner = gm[2];
            const coords = [];
            let cm;
            COORD_RE_INNER.lastIndex = 0;
            while ((cm = COORD_RE_INNER.exec(coordsInner)) !== null) {
                coords.push(cm[1] + cm[2]);
            }
            if (coords.length > 0) result.push({ color, coords });
        }
        return result;
    }
    let result = '';
    let i = 0;
    while (i < text.length) {
        const eqIdx = text.indexOf('={', i);
        if (eqIdx === -1) { result += text.substring(i); break; }
        const beforeEq = text.substring(0, eqIdx);
        const wordMatch = beforeEq.match(/([^\s=]+)$/);
        if (!wordMatch) { result += text.substring(i, eqIdx + 1); i = eqIdx + 1; continue; }
        const afterEq = eqIdx + 2;
        let depth = 1, j = afterEq;
        while (j < text.length && depth > 0) {
            if (text[j] === '{') depth++;
            else if (text[j] === '}') depth--;
            j++;
        }
        if (depth !== 0) { result += text.substring(i, eqIdx + 1); i = eqIdx + 1; continue; }
        const inner = text.substring(afterEq, j - 1);
        const groups = _parseBWGroups(inner);
        const allBlack = groups.filter(g => g.color === 'B');
        const allWhite = groups.filter(g => g.color === 'W');
        if (allBlack.length > 0 || allWhite.length > 0) {
            result += text.substring(i, eqIdx - wordMatch[0].length);
            const placeholder = `__STONE_GROUP_PLACEHOLDER_${matches.length}__`;
            matches.push({ word: wordMatch[0], groups: groups.map(g => ({ color: g.color, coords: g.coords })) });
            result += placeholder;
            i = j;
        } else {
            result += text.substring(i, j);
            i = j;
        }
    }
    return result;
}

function parseCommentCoords(text) {
    if (!text) return text;
    
    // Replace word={here} with a custom-label coordinate link
    text = text.replace(/(?<![A-Za-z0-9_-])([^\s=]+)=\{here\}/gi, '<span class="comment-coord comment-here">$1</span>');
    // Replace standalone {here} with a special coordinate link
    text = text.replace(/\{here\}/gi, '<span class="comment-coord comment-here">here</span>');
    
    // Tokenize word=cell(A1, A2, ...) patterns (new ref-Area format — single cell() with comma-separated coords)
    const cellLabelMatches = [];
    const CELL_LABEL_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=cell\(([A-R](?:1[0-8]|[1-9])(?:\s*,\s*[A-R](?:1[0-8]|[1-9]))*)\)/g;
    text = text.replace(CELL_LABEL_RE, (match, word, coordList) => {
        const placeholder = `__CELL_LABEL_PLACEHOLDER_${cellLabelMatches.length}__`;
        const blocks = [];
        const coordRe = /([A-R])(1[0-8]|[1-9])/g;
        let cm;
        while ((cm = coordRe.exec(coordList)) !== null) {
            blocks.push({ c: cm[1].charCodeAt(0) - 65, r: parseInt(cm[2], 10) - 1 });
        }
        cellLabelMatches.push({ word, blocks });
        return placeholder;
    });

    // Tokenize word={cell(C18), cell(C17), ...} patterns (legacy format — backward compatibility)
    const CELL_LABEL_LEGACY_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=\{((?:cell\([A-R](?:1[0-8]|[1-9])\)[\s,]*)*cell\([A-R](?:1[0-8]|[1-9])\))\}/g;
    text = text.replace(CELL_LABEL_LEGACY_RE, (match, word, cellList) => {
        const placeholder = `__CELL_LABEL_PLACEHOLDER_${cellLabelMatches.length}__`;
        const blocks = [];
        const cellRe = /cell\(([A-R])(1[0-8]|[1-9])\)/g;
        let cm;
        while ((cm = cellRe.exec(cellList)) !== null) {
            blocks.push({ c: cm[1].charCodeAt(0) - 65, r: parseInt(cm[2], 10) - 1 });
        }
        cellLabelMatches.push({ word, blocks });
        return placeholder;
    });

    // Tokenize standalone cell(A1, A2, ...) patterns (new format — no word prefix)
    const CELL_STANDALONE_RE = /cell\(([A-R](?:1[0-8]|[1-9])(?:\s*,\s*[A-R](?:1[0-8]|[1-9]))*)\)/g;
    text = text.replace(CELL_STANDALONE_RE, (match, coordList) => {
        const placeholder = `__CELL_LABEL_PLACEHOLDER_${cellLabelMatches.length}__`;
        const blocks = [];
        const coordRe = /([A-R])(1[0-8]|[1-9])/g;
        let cm;
        while ((cm = coordRe.exec(coordList)) !== null) {
            blocks.push({ c: cm[1].charCodeAt(0) - 65, r: parseInt(cm[2], 10) - 1 });
        }
        cellLabelMatches.push({ word: match, blocks });
        return placeholder;
    });

    // Tokenize legacy standalone {cell(C18), cell(C17), ...} patterns (backward compatibility)
    const CELL_STANDALONE_LEGACY_RE = /\{((?:cell\([A-R](?:1[0-8]|[1-9])\)[\s,]*)*cell\([A-R](?:1[0-8]|[1-9])\))\}/g;
    text = text.replace(CELL_STANDALONE_LEGACY_RE, (match, cellList) => {
        const placeholder = `__CELL_LABEL_PLACEHOLDER_${cellLabelMatches.length}__`;
        const blocks = [];
        const cellRe = /cell\(([A-R])(1[0-8]|[1-9])\)/g;
        let cm;
        while ((cm = cellRe.exec(cellList)) !== null) {
            blocks.push({ c: cm[1].charCodeAt(0) - 65, r: parseInt(cm[2], 10) - 1 });
        }
        cellLabelMatches.push({ word: match, blocks });
        return placeholder;
    });

    // Tokenize standalone cell([A-R][1-18]) syntax (ref-area blocks between grid lines)
    const cellMatches = [];
    text = text.replace(/\bcell\(([A-R])(1[0-8]|[1-9])\)/g, (match, col, row) => {
        const placeholder = `__CELL_PLACEHOLDER_${cellMatches.length}__`;
        const blockC = col.charCodeAt(0) - 65;
        const blockR = parseInt(row, 10) - 1;
        cellMatches.push({ col, row: parseInt(row, 10), blockC, blockR });
        return placeholder;
    });
    
    // Tokenize stone group syntax: ={B[P5, Q4], W[Q5, R4]}
    const stoneGroupMatches = [];
    text = _parseStoneGroups(text, stoneGroupMatches);
    
    // Tokenize word={COORD} patterns (single coordinate like tenuki={M12})
    const singleCoordMatches = [];
    const SINGLE_COORD_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=\{([A-HJ-T](?:1[0-9]|[1-9]))\}/g;
    text = text.replace(SINGLE_COORD_RE, (match, word, coord) => {
        const placeholder = `__SINGLE_COORD_PLACEHOLDER_${singleCoordMatches.length}__`;
        singleCoordMatches.push({ word, coord });
        return placeholder;
    });

    // Tokenize {qrtN, ho(N), ho[N], qrtN--{qrtM}, ...} patterns (with or without word prefix)
    const MIXED_ITEM_RE = /(?<![A-Za-z0-9_-])([^\s=]+)=\{\s*((?:(?:qrt[1-4](?:\s*--\{\s*qrt[1-4](?:\s*,\s*qrt[1-4])*\s*\})?)|(?:ho\([1-9]\))|(?:ho\[[1-9]\]))(?:\s*,\s*(?:(?:qrt[1-4](?:\s*--\{\s*qrt[1-4](?:\s*,\s*qrt[1-4])*\s*\})?)|(?:ho\([1-9]\))|(?:ho\[[1-9]\])))*\s*)\}/g;
    const mixedMatches = [];
    text = text.replace(MIXED_ITEM_RE, (match, word, itemListStr) => {
        const placeholder = `__MIXED_PLACEHOLDER_${mixedMatches.length}__`;
        const qrtNums = [];
        const hoshiCircleNums = [];
        const hoshiRectNums = [];
        const subQuadrants = [];
        const itemRe = /qrt([1-4])\s*--\{\s*qrt([1-4](?:\s*,\s*qrt[1-4])*)\s*\}|qrt([1-4])|ho\(([1-9])\)|ho\[([1-9])\]/g;
        let m;
        while ((m = itemRe.exec(itemListStr)) !== null) {
            if (m[1] && m[2]) {
                const parentQrt = parseInt(m[1], 10);
                const subQrts = m[2].split(/\s*,\s*/).map(s => parseInt(s.replace('qrt', ''), 10));
                subQuadrants.push({ parent: parentQrt, subs: subQrts });
            } else if (m[3]) qrtNums.push(parseInt(m[3], 10));
            else if (m[4]) hoshiCircleNums.push(parseInt(m[4], 10));
            else if (m[5]) hoshiRectNums.push(parseInt(m[5], 10));
        }
        mixedMatches.push({ word, qrtNums, hoshiCircleNums, hoshiRectNums, subQuadrants });
        return placeholder;
    });

    // Tokenize standalone {qrtN, ho(N), ho[N], qrtN--{qrtM}, ...} patterns (no word prefix)
    const STANDALONE_MIXED_RE = /\{\s*((?:(?:qrt[1-4](?:\s*--\{\s*qrt[1-4](?:\s*,\s*qrt[1-4])*\s*\})?)|(?:ho\([1-9]\))|(?:ho\[[1-9]\]))(?:\s*,\s*(?:(?:qrt[1-4](?:\s*--\{\s*qrt[1-4](?:\s*,\s*qrt[1-4])*\s*\})?)|(?:ho\([1-9]\))|(?:ho\[[1-9]\])))*\s*)\}/g;
    text = text.replace(STANDALONE_MIXED_RE, (match, itemListStr) => {
        const placeholder = `__MIXED_PLACEHOLDER_${mixedMatches.length}__`;
        const qrtNums = [];
        const hoshiCircleNums = [];
        const hoshiRectNums = [];
        const subQuadrants = [];
        const itemRe = /qrt([1-4])\s*--\{\s*qrt([1-4](?:\s*,\s*qrt[1-4])*)\s*\}|qrt([1-4])|ho\(([1-9])\)|ho\[([1-9])\]/g;
        let m;
        while ((m = itemRe.exec(itemListStr)) !== null) {
            if (m[1] && m[2]) {
                const parentQrt = parseInt(m[1], 10);
                const subQrts = m[2].split(/\s*,\s*/).map(s => parseInt(s.replace('qrt', ''), 10));
                subQuadrants.push({ parent: parentQrt, subs: subQrts });
            } else if (m[3]) qrtNums.push(parseInt(m[3], 10));
            else if (m[4]) hoshiCircleNums.push(parseInt(m[4], 10));
            else if (m[5]) hoshiRectNums.push(parseInt(m[5], 10));
        }
        mixedMatches.push({ word: match, qrtNums, hoshiCircleNums, hoshiRectNums, subQuadrants });
        return placeholder;
    });

    let parts = [];
    let lastIndex = 0;
    let match;
    
    // First find any group syntax like LABEL={[R16, P16, Q17]}
    while ((match = GROUP_RE.exec(text)) !== null) {
        let prefix = text.substring(lastIndex, match.index);
        prefix = parseSingleCoords(prefix);
        parts.push(prefix);
        
        let label = match[1];
        let coordsStr = match[2];
        let coords = [];
        
        // Match either red coords {!Q9} or standard coords Q9
        let coordRe = /(?:\{!([A-HJ-T])([1-9]|1[0-9])\})|(?:\b([A-HJ-T])([1-9]|1[0-9])\b)/g;
        let m;
        while ((m = coordRe.exec(coordsStr)) !== null) {
            if (m[1] && m[2]) {
                coords.push('!' + m[1] + m[2]);
            } else if (m[3] && m[4]) {
                coords.push(m[3] + m[4]);
            }
        }
        parts.push(`<span class="comment-coord comment-coord-group" data-coords="${coords.join(',')}">${label}</span>`);
        
        lastIndex = GROUP_RE.lastIndex;
    }
    
    let suffix = text.substring(lastIndex);
    suffix = parseSingleCoords(suffix);
    parts.push(suffix);
    
    let result = parts.join('');

    // Restore the placeholders as hoverable highlights (mixed qrt + hoshi circle + hoshi rect + sub-quadrant)
    for (let i = 0; i < mixedMatches.length; i++) {
        const placeholder = `__MIXED_PLACEHOLDER_${i}__`;
        const entry = mixedMatches[i];
        let attrs = '';
        if (entry.qrtNums.length > 0) attrs += ` data-quarters="${entry.qrtNums.join(',')}"`;
        if (entry.hoshiCircleNums.length > 0) attrs += ` data-hoshis="${entry.hoshiCircleNums.join(',')}"`;
        if (entry.hoshiRectNums.length > 0) attrs += ` data-hoshi-rects="${entry.hoshiRectNums.join(',')}"`;
        if (entry.subQuadrants && entry.subQuadrants.length > 0) {
            const subParts = entry.subQuadrants.map(sq => `${sq.parent}:${sq.subs.join(',')}`);
            attrs += ` data-sub-quadrants="${subParts.join(';')}"`;
        }
        const hasQrt = entry.qrtNums.length > 0;
        const hasHoshi = entry.hoshiCircleNums.length > 0 || entry.hoshiRectNums.length > 0;
        const hasSubQrt = entry.subQuadrants && entry.subQuadrants.length > 0;
        const classes = 'comment-coord' + (hasQrt || hasSubQrt ? ' comment-quarter' : '') + (hasHoshi ? ' comment-hoshi' : '') + (hasSubQrt ? ' comment-sub-quarter' : '');
        const html = `<span class="${classes}"${attrs}>${entry.word}</span>`;
        result = result.replace(placeholder, html);
    }

    // Restore single coordinate placeholders (word={COORD})
    for (let i = 0; i < singleCoordMatches.length; i++) {
        const placeholder = `__SINGLE_COORD_PLACEHOLDER_${i}__`;
        const { word, coord } = singleCoordMatches[i];
        const col = coord[0].toUpperCase();
        const row = coord.slice(1);
        const html = `<span class="comment-coord" data-col="${col}" data-row="${row}">${word}</span>`;
        result = result.replace(placeholder, html);
    }

    // Restore stone group placeholders (word={B[...], W[...]})
    for (let i = 0; i < stoneGroupMatches.length; i++) {
        const placeholder = `__STONE_GROUP_PLACEHOLDER_${i}__`;
        const { word, groups } = stoneGroupMatches[i];
        const groupsJson = JSON.stringify(groups.map(g => ({ c: g.color, o: g.coords })));
        const allCoords = groups.flatMap(g => g.coords);
        const html = `<span class="comment-coord comment-stone-group" data-groups="${groupsJson.replace(/"/g, '&quot;')}" data-all="${allCoords.join(',')}">${word}</span>`;
        result = result.replace(placeholder, html);
    }

    // Restore cell label placeholders (word=cell(C18), cell(C17), ...)
    for (let i = 0; i < cellLabelMatches.length; i++) {
        const placeholder = `__CELL_LABEL_PLACEHOLDER_${i}__`;
        const { word, blocks } = cellLabelMatches[i];
        const blockStr = blocks.map(b => `${String.fromCharCode(65 + b.c)}${b.r + 1}`).join(',');
        const html = `<span class="comment-coord comment-cell-label" data-blocks="${blockStr}">${word}</span>`;
        result = result.replace(placeholder, html);
    }

    // Restore cell placeholders (cell(B3) — ref-area block references)
    for (let i = 0; i < cellMatches.length; i++) {
        const placeholder = `__CELL_PLACEHOLDER_${i}__`;
        const { col, row, blockC, blockR } = cellMatches[i];
        const html = `<span class="comment-coord comment-cell" data-block-c="${blockC}" data-block-r="${blockR}">cell(${col}${row})</span>`;
        result = result.replace(placeholder, html);
    }
    
    return result;
}

function commentCoordToIndices(colLetter, rowNum) {
    const c = COL_INDEX[colLetter];
    const r = 19 - parseInt(rowNum, 10);
    if (c === undefined || r < 0 || r > 18) return null;
    if (state.isPovFlipped) {
        return { r: 18 - r, c: 18 - c };
    }
    return { r, c };
}

function drawCommentCoordHighlights(cells) {
    clearCommentCoordHighlights();
    if (!cells || cells.length === 0) return;

    const ctxs = [];
    if (elements.canvasInitial) {
        const size = (state.initialBoardStyle && state.initialBoardStyle.board && state.initialBoardStyle.board.size) ? state.initialBoardStyle.board.size : 600;
        ctxs.push({ ctx: elements.canvasInitial.getContext('2d'), scale: size / 600 });
    }
    if (elements.canvasStudy) {
        const size = (state.studyBoardStyle && state.studyBoardStyle.board && state.studyBoardStyle.board.size) ? state.studyBoardStyle.board.size : 600;
        ctxs.push({ ctx: elements.canvasStudy.getContext('2d'), scale: size / 600 });
    }

    const PADDING = 36;
    const CELL_SIZE = (600 - 2 * PADDING) / 18;
    const RADIUS = CELL_SIZE * 0.45;

    _commentHighlightedCells = cells.slice();

    for (const item of ctxs) {
        const ctx = item.ctx;
        const scaleFactor = item.scale;
        
        for (const cell of cells) {
            const cx = PADDING + cell.c * CELL_SIZE;
            const cy = PADDING + cell.r * CELL_SIZE;
            ctx.save();
            ctx.scale(scaleFactor, scaleFactor);
            ctx.beginPath();
            ctx.arc(cx, cy, RADIUS * 1.15, 0, Math.PI * 2);
            ctx.fillStyle = cell.isRed ? 'rgba(217, 4, 41, 0.2)' : 'rgba(0, 130, 240, 0.2)';
            ctx.fill();
            ctx.strokeStyle = cell.isRed ? '#D90429' : '#0082F0';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
    }
}

function drawQuarterHighlight(qrtNums) {
    _commentHighlightedCells = [];
    _commentQuarterHighlighted = qrtNums.map(n => n);
    drawBoard();
}

function drawSubQuarterHighlight(parentQrt, subQrts) {
    _commentHighlightedCells = [];
    _commentQuarterHighlighted = [{ qrt: parentQrt, subs: subQrts }];
    drawBoard();
}

// Hoshi points (0-indexed row, col)
var HOSHI_POSITIONS = [
    null, // 0 unused
    { r: 3, c: 3 },   // hoshi1 = D16
    { r: 3, c: 9 },   // hoshi2 = K16
    { r: 3, c: 15 },  // hoshi3 = Q16
    { r: 9, c: 3 },   // hoshi4 = D10
    { r: 9, c: 9 },   // hoshi5 = K10
    { r: 9, c: 15 },  // hoshi6 = Q10
    { r: 15, c: 3 },  // hoshi7 = D4
    { r: 15, c: 9 },  // hoshi8 = K4
    { r: 15, c: 15 }  // hoshi9 = Q4
];

function drawHoshiHighlight(hoshiNums) {
    _commentHighlightedCells = [];
    _commentQuarterHighlighted = null;
    _commentHoshiHighlighted = hoshiNums.map(n => n);
    _commentHoshiRectHighlighted = null;
    drawBoard();
}

function clearCommentCoordHighlights() {
    let needsRedraw = false;
    if (_commentHighlightedCells.length > 0) {
        _commentHighlightedCells = [];
        needsRedraw = true;
    }
    if (_commentQuarterHighlighted !== null) {
        _commentQuarterHighlighted = null;
        needsRedraw = true;
    }
    if (_commentHoshiHighlighted !== null) {
        _commentHoshiHighlighted = null;
        needsRedraw = true;
    }
    if (_commentHoshiRectHighlighted !== null) {
        _commentHoshiRectHighlighted = null;
        needsRedraw = true;
    }
    if (_commentCellHighlighted.length > 0) {
        _commentCellHighlighted = [];
        needsRedraw = true;
    }
    if (_commentStoneGroupBlackCells.length > 0 || _commentStoneGroupWhiteCells.length > 0) {
        _commentStoneGroupBlackCells = [];
        _commentStoneGroupWhiteCells = [];
        _commentStoneGroupGroups = [];
        needsRedraw = true;
    }
    if (_ladderBlackPath.length > 0 || _ladderWhitePath.length > 0) {
        _ladderBlackPath = [];
        _ladderWhitePath = [];
        needsRedraw = true;
    }
    if (needsRedraw) {
        drawBoard();
    }
}

function updateAnnotationIndicators() {
    const container = document.getElementById('move-annotation-indicators');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'none';
    if (state.currentMoveIndex < 0 || !state.sgfMoves || !state.sgfMoves[state.currentMoveIndex]) return;

    const move = state.sgfMoves[state.currentMoveIndex];
    const chips = [];

    const moveAnnotLabels = { TE: 'Tesuji', BM: 'Bad Move', DO: 'Doubtful', IT: 'Interesting' };
    const nodeAnnotLabels = { GB: 'Good for Black', GW: 'Good for White', DM: 'Even', UC: 'Unclear' };
    const annotColors = { TE: '#22c55e', BM: '#ef4444', DO: '#a855f7', IT: '#3b82f6', GB: '#111827', GW: '#f3f4f6', DM: '#9ca3af', UC: '#f59e0b' };

    if (move.moveAnnotation) {
        const label = moveAnnotLabels[move.moveAnnotation.type] || move.moveAnnotation.type;
        const color = annotColors[move.moveAnnotation.type] || '#6b7280';
        chips.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;color:${color};border:1.5px solid ${color};">● ${label}</span>`);
    }

    if (move.nodeAnnotation) {
        const label = nodeAnnotLabels[move.nodeAnnotation.type] || move.nodeAnnotation.type;
        const color = annotColors[move.nodeAnnotation.type] || '#6b7280';
        const bg = move.nodeAnnotation.type === 'GB' ? '#e5e7eb' : (move.nodeAnnotation.type === 'GW' ? '#111827' : 'transparent');
        const textColor = move.nodeAnnotation.type === 'GB' ? '#111827' : (move.nodeAnnotation.type === 'GW' ? '#f3f4f6' : color);
        chips.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;color:${textColor};background:${bg};border:1.5px solid ${color};">${label}</span>`);
    }

    if (move.nodeName) {
        chips.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;color:#6366f1;border:1.5px solid #6366f1;">N: ${move.nodeName}</span>`);
    }

    if (chips.length > 0) {
        container.innerHTML = chips.join('');
        container.style.display = 'flex';
    }
}

function formatRootMetadata() {
  var p = state.sgfRootProps
  if (!p) return ''
  function v(tag) {
    var arr = p[tag]
    if (!arr || !arr.length) return ''
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].trim() !== '') return arr[i]
    }
    return ''
  }
  var lines = []
  if (v('PB')) lines.push('PB: ' + v('PB') + (v('BR') ? ' (' + v('BR') + ')' : ''))
  if (v('PW')) lines.push('PW: ' + v('PW') + (v('WR') ? ' (' + v('WR') + ')' : ''))
  if (v('RE')) lines.push('RE: ' + v('RE'))
  if (v('GN')) lines.push('GN: ' + v('GN'))
  if (v('DT')) lines.push('DT: ' + v('DT'))
  if (v('EV')) lines.push('EV: ' + v('EV'))
  if (v('PC')) lines.push('PC: ' + v('PC'))
  if (v('KM')) lines.push('KM: ' + v('KM'))
  if (v('RU')) lines.push('RU: ' + v('RU'))
  if (v('HA')) lines.push('HA: ' + v('HA'))
  if (v('GC')) lines.push('GC: ' + v('GC'))
  return lines.join('<br>')
}

function updateCommentUI() {
    if (!elements.sgfCommentDisplay) return;
    
    updateAnnotationIndicators();

    if (state.currentMoveIndex < 0) {
      const totalAll = state.allSgfMoves ? state.allSgfMoves.length : 0;
      const isBeginningOfGame = (!state.filterStart || state.filterStart === 1) && 
                                (!state.filterEnd || state.filterEnd === totalAll || state.filterEnd === Infinity);
      if (isBeginningOfGame) {
        var md = formatRootMetadata()
        var bc = state.baselineComment || ''
        var parts = []
        if (md) parts.push(md)
        if (bc.trim() !== '') {
          var parsed = parseCommentCoords(bc)
          var mdRendered = renderMarkdown(parsed)
          if (parts.length) parts.push('<hr style="border:none;border-top:1px solid #333;margin:4px 0">')
          parts.push(mdRendered)
        }
        if (!parts.length && state.sgfMoves && state.sgfMoves.length > 0) {
          var fc = state.sgfMoves[0].comment
          if (fc && fc.trim() !== '') {
            var parsed = parseCommentCoords(fc)
            var mdRendered = renderMarkdown(parsed)
            parts.push(parsed)
          }
        }
        if (parts.length) {
          elements.sgfCommentDisplay.innerHTML = parts.join('')
          elements.sgfCommentDisplay.style.opacity = '1'
        } else {
          elements.sgfCommentDisplay.innerHTML = ''
          elements.sgfCommentDisplay.textContent = 'No comments on this move.'
          elements.sgfCommentDisplay.style.opacity = '0.5'
        }
      } else {
        elements.sgfCommentDisplay.innerHTML = ''
        elements.sgfCommentDisplay.textContent = 'No comments on this move.'
        elements.sgfCommentDisplay.style.opacity = '0.5'
      }
      if (elements.sgfCommentDropdown && !elements.sgfCommentDropdown.disabled) {
        elements.sgfCommentDropdown.value = ''
      }
      return
    }

    const comment = state.sgfMoves[state.currentMoveIndex].comment || ''
        
    if (comment.trim() === '') {
        elements.sgfCommentDisplay.innerHTML = '';
        elements.sgfCommentDisplay.textContent = 'No comments on this move.';
        elements.sgfCommentDisplay.style.opacity = '0.5';
    } else {
        const parsed = parseCommentCoords(comment);
        const mdRendered = renderMarkdown(parsed);
        elements.sgfCommentDisplay.innerHTML = mdRendered;
        elements.sgfCommentDisplay.style.opacity = '1';
    }
    
    if (elements.sgfCommentInput && elements.sgfCommentInput.style.display === 'block') {
        elements.sgfCommentDisplay.style.display = 'block';
        elements.sgfCommentInput.style.display = 'none';
        if (elements.sgfCommentResizeHandle) elements.sgfCommentResizeHandle.style.display = 'none';
        if (elements.btnSgfCommentEdit) elements.btnSgfCommentEdit.style.display = 'flex';
        if (elements.btnSgfCommentSave) elements.btnSgfCommentSave.style.display = 'none';
        if (elements.btnRefArea) {
            elements.btnRefArea.disabled = true;
            if (state.refAreaMode) {
                state.refAreaMode = false;
                state.refAreaCells = [];
                state.refAreaHoverCell = null;
                elements.btnRefArea.style.backgroundColor = '';
                elements.btnRefArea.style.borderColor = '';
                elements.btnRefArea.style.color = '';
                elements.btnRefArea.style.fontWeight = '';
            }
        }
        if (elements.btnRefPoint) {
            elements.btnRefPoint.disabled = true;
            if (state.refPointMode) {
                state.refPointMode = false;
                state.refPointCells = [];
                state.refPointInsertPos = -1;
                elements.btnRefPoint.style.backgroundColor = '';
                elements.btnRefPoint.style.borderColor = '';
                elements.btnRefPoint.style.color = '';
                elements.btnRefPoint.style.fontWeight = '';
            }
        }
    }
    


    if (elements.sgfCommentDropdown && !elements.sgfCommentDropdown.disabled) {
        if (state.currentMoveIndex >= 0 && state.sgfMoves[state.currentMoveIndex].comment && state.sgfMoves[state.currentMoveIndex].comment.trim() !== "") {
            elements.sgfCommentDropdown.value = state.currentMoveIndex.toString();
        } else {
            elements.sgfCommentDropdown.value = "";
        }
    }
}

function populateCommentDropdown() {
    if (!elements.sgfCommentDropdown) return;
    
    elements.sgfCommentDropdown.innerHTML = '';
    
    if (!state.sgfMoves || state.sgfMoves.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "No comment has made in this SGF file";
        elements.sgfCommentDropdown.appendChild(opt);
        elements.sgfCommentDropdown.disabled = true;
        return;
    }
    
    const movesWithComments = [];
    for (let i = 0; i < state.sgfMoves.length; i++) {
        const comment = state.sgfMoves[i].comment;
        if (comment && comment.trim() !== "") {
            movesWithComments.push({ index: i, comment: comment.trim() });
        }
    }
    
    if (movesWithComments.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "No comment has made in this SGF file";
        elements.sgfCommentDropdown.appendChild(opt);
        elements.sgfCommentDropdown.disabled = true;
        return;
    }
    
    elements.sgfCommentDropdown.disabled = false;
    
    const defOpt = document.createElement('option');
    defOpt.value = "";
    defOpt.textContent = `Select a move with comment (${movesWithComments.length} found)...`;
    elements.sgfCommentDropdown.appendChild(defOpt);
    
    for (const item of movesWithComments) {
        const opt = document.createElement('option');
        opt.value = item.index;
        let shortText = item.comment.substring(0, 35).replace(/\n/g, ' ');
        if (item.comment.length > 35) shortText += '...';
        opt.textContent = `Move #${item.index + 1}: ${shortText}`;
        elements.sgfCommentDropdown.appendChild(opt);
    }
    
    // Sync current
    if (state.currentMoveIndex >= 0 && state.sgfMoves[state.currentMoveIndex].comment && state.sgfMoves[state.currentMoveIndex].comment.trim() !== "") {
        elements.sgfCommentDropdown.value = state.currentMoveIndex.toString();
    }
}

async function exportEditedSgf(customFilename) {
    const szVal = (state.boardWidth === state.boardHeight)
        ? String(state.boardWidth)
        : state.boardWidth + ':' + state.boardHeight;

    const rootProps = {
        GM: ['1'],
        FF: ['4'],
        CA: ['UTF-8'],
        SZ: [szVal],
        AP: ['Go Diagram Annotator:4.0']
    };

    if (state.sgfMetadata.pb) rootProps.PB = [state.sgfMetadata.pb];
    if (state.sgfMetadata.pw) rootProps.PW = [state.sgfMetadata.pw];
    if (state.sgfMetadata.br) rootProps.BR = [state.sgfMetadata.br];
    if (state.sgfMetadata.wr) rootProps.WR = [state.sgfMetadata.wr];
    if (state.sgfMetadata.re) rootProps.RE = [state.sgfMetadata.re];
    if (state.sgfMetadata.dt) rootProps.DT = [state.sgfMetadata.dt];
    if (state.sgfMetadata.ev) rootProps.EV = [state.sgfMetadata.ev];
    if (state.sgfMetadata.pc) rootProps.PC = [state.sgfMetadata.pc];
    if (state.sgfMetadata.gn) rootProps.GN = [state.sgfMetadata.gn];
    if (state.sgfMetadata.km) rootProps.KM = [state.sgfMetadata.km];
    if (state.sgfMetadata.ru) rootProps.RU = [state.sgfMetadata.ru];
    if (state.sgfMetadata.ha) rootProps.HA = [state.sgfMetadata.ha];
    if (state.sgfMetadata.tm) rootProps.TM = [state.sgfMetadata.tm];
    if (state.sgfMetadata.ot) rootProps.OT = [state.sgfMetadata.ot];
    if (state.sgfMetadata.so) rootProps.SO = [state.sgfMetadata.so];
    if (state.sgfMetadata.an) rootProps.AN = [state.sgfMetadata.an];
    if (state.sgfMetadata.cp) rootProps.CP = [state.sgfMetadata.cp];
    if (state.sgfMetadata.us) rootProps.US = [state.sgfMetadata.us];

    if (state.baselineComment) {
        rootProps.C = [state.baselineComment];
    } else if (state.sgfMetadata.gc) {
        rootProps.GC = [state.sgfMetadata.gc];
    }

    const setupBoard = state.setupBoard || state.baselineBoard;
    const ab = [], aw = [];
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const pt = SgfEngine.formatGoPoint(c, r);
            if (!pt) continue;
            if (setupBoard[r][c].player === 'B') ab.push(pt);
            if (setupBoard[r][c].player === 'W') aw.push(pt);
        }
    }
    if (ab.length > 0) rootProps.AB = ab;
    if (aw.length > 0) rootProps.AW = aw;
    if (state.plColor) rootProps.PL = [state.plColor];
    if (state.sgfMetadata.tb) rootProps.TB = state.sgfMetadata.tb.slice();
    if (state.sgfMetadata.tw) rootProps.TW = state.sgfMetadata.tw.slice();
    if (state.sgfMetadata.vw) rootProps.VW = state.sgfMetadata.vw.slice();

    Object.assign(rootProps, SgfEngine.annotationsToProperties(state.baselineAnnotations));
    if (state.baselineUnknownProps) {
        Object.assign(rootProps, JSON.parse(JSON.stringify(state.baselineUnknownProps)));
    }

    const mainLineProps = [rootProps];

    state.sgfMoves.forEach(m => {
        let nodeProps = {};
        if (m.isPass) {
            nodeProps[m.player] = [''];
        } else {
            const coord = SgfEngine.formatGoPoint(m.c, m.r);
            if (coord) nodeProps[m.player] = [coord];
        }
        if (m.comment) nodeProps.C = [m.comment];
        if (m.nodeName) nodeProps.N = [m.nodeName];
        if (m.moveNumber != null) nodeProps.MN = [String(m.moveNumber)];

        if (m.moveAnnotation) {
            if (m.moveAnnotation.type === 'TE') nodeProps.TE = [m.moveAnnotation.value || '1'];
            else if (m.moveAnnotation.type === 'BM') nodeProps.BM = [m.moveAnnotation.value || '1'];
            else if (m.moveAnnotation.type === 'DO') nodeProps.DO = [''];
            else if (m.moveAnnotation.type === 'IT') nodeProps.IT = [''];
        }

        if (m.nodeAnnotation) {
            if (m.nodeAnnotation.type === 'GB') nodeProps.GB = [m.nodeAnnotation.value || '1'];
            else if (m.nodeAnnotation.type === 'GW') nodeProps.GW = [m.nodeAnnotation.value || '1'];
            else if (m.nodeAnnotation.type === 'DM') nodeProps.DM = [m.nodeAnnotation.value || '1'];
            else if (m.nodeAnnotation.type === 'UC') nodeProps.UC = [m.nodeAnnotation.value || '1'];
        }

        Object.assign(nodeProps, SgfEngine.annotationsToProperties(m.annotations));
        if (m.unknownProps) {
            nodeProps = SgfEngine.mergeUnknownProperties(nodeProps, m.unknownProps);
        }
        mainLineProps.push(nodeProps);
    });

    let tree;
    if (state.sgfTree && state.isSgfDirty) {
        tree = SgfEngine.cloneTree(state.sgfTree);
        const branchPath = state.variationData?.currentBranchPath || [0];
        SgfEngine.replaceBranchNodes(tree, branchPath, mainLineProps);
    } else if (state.sgfTree && !state.isSgfDirty) {
        tree = state.sgfTree;
    } else {
        tree = { nodes: mainLineProps.map(p => ({ properties: JSON.parse(JSON.stringify(p)), children: [] })), children: [] };
    }

    let sgf = SgfEngine.writeSgf(tree);
    if (typeof SgfSanitizer !== 'undefined' && typeof SgfSanitizer.sanitize === 'function') {
        sgf = SgfSanitizer.sanitize(sgf) || sgf;
    }
    state.rawSgf = sgf;
    let filename;
    if (customFilename) {
        filename = customFilename;
    } else {
        const originalName = elements.selectedFileName && elements.selectedFileName.textContent ? elements.selectedFileName.textContent : 'game.sgf';
        let baseName = originalName.endsWith('.sgf') ? originalName.slice(0, -4) : originalName;
        // Strip any existing 13-digit timestamp suffix (using hyphen or en-dash)
        baseName = baseName.replace(/[–-]\d{13}$/, '');
        filename = `${baseName}–${Date.now()}.sgf`;
    }
    
    // Attempt File System Access API for "override" to prompt a true save-as/overwrite dialog
    if (customFilename && state.fileHandle) {
        try {
            const writable = await state.fileHandle.createWritable();
            await writable.write(sgf);
            await writable.close();
            
            state.isSgfDirty = false;
            if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'none';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
            return;
        } catch (err) {
            console.error('Direct overwrite failed:', err);
        }
    } else if (customFilename && window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'SGF File',
                    accept: {'application/x-go-sgf': ['.sgf', '.txt']},
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(sgf);
            await writable.close();
            
            state.isSgfDirty = false;
            if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'none';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
            return;
        } catch (err) {
            if (err.name === 'AbortError') return; 
        }
    }

    // Fallback or "mk new" behavior
    const blob = new Blob([sgf], {type: 'application/x-go-sgf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    state.isSgfDirty = false;
    if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'none';
    if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
}

function cancelAnnotationEdit() {
    if (elements.sgfCommentInput && elements.sgfCommentInput.style.display === 'block') {
        elements.sgfCommentDisplay.style.display = 'block';
        elements.sgfCommentInput.style.display = 'none';
        if (elements.sgfCommentResizeHandle) elements.sgfCommentResizeHandle.style.display = 'none';
        elements.sgfCommentInput.style.borderColor = 'var(--border-card)';
        elements.sgfCommentInput.style.borderWidth = '1px';
        if (elements.btnSgfCommentEdit) elements.btnSgfCommentEdit.style.display = 'flex';
        if (elements.btnSgfCommentSave) elements.btnSgfCommentSave.style.display = 'none';
        if (elements.annotEditor) elements.annotEditor.style.display = 'none';
        if (elements.btnRefArea) {
            elements.btnRefArea.disabled = true;
            if (state.refAreaMode) {
                state.refAreaMode = false;
                state.refAreaCells = [];
                state.refAreaHoverCell = null;
                elements.btnRefArea.style.backgroundColor = '';
                elements.btnRefArea.style.borderColor = '';
                elements.btnRefArea.style.color = '';
                elements.btnRefArea.style.fontWeight = '';
            }
        }
        if (elements.btnRefPoint) {
            elements.btnRefPoint.disabled = true;
            if (state.refPointMode) {
                state.refPointMode = false;
                state.refPointCells = [];
                state.refPointInsertPos = -1;
                elements.btnRefPoint.style.backgroundColor = '';
                elements.btnRefPoint.style.borderColor = '';
                elements.btnRefPoint.style.color = '';
                elements.btnRefPoint.style.fontWeight = '';
            }
        }
    }
}

function updateExtractedMoves() {
    if (!elements.outputTextArea) return;
    if (state.sgfMoves.length === 0) {
        elements.outputTextArea.value = '';
        if (elements.sgfTextArea) elements.sgfTextArea.value = '';
        return;
    }
    const moves = state.sgfMoves.map((m, i) => {
        const coord = COLS[m.c] + (19 - m.r);
        return `${i + 1}${m.player}[${coord}]`;
    });
    elements.outputTextArea.value = moves.join(', ');

    if (elements.sgfTextArea) {
        let sgf = "(;FF[4]GM[1]SZ[19]\n";
        state.sgfMoves.forEach(m => {
            const col = String.fromCharCode(97 + m.c);
            const row = String.fromCharCode(97 + m.r);
            sgf += `;${m.player}[${col}${row}]`;
        });
        sgf += ")\n";
        elements.sgfTextArea.value = sgf;
    }
}

function updateVariationUI() {
    if (!state.sgfMoves || state.sgfMoves.length === 0) {
        if (elements.variationLabel) elements.variationLabel.textContent = 'Variation 1/1';
        if (elements.btnVarPrev) { elements.btnVarPrev.disabled = true; elements.btnVarPrev.style.opacity = '0.6'; elements.btnVarPrev.style.cursor = 'not-allowed'; }
        if (elements.btnVarNext) { elements.btnVarNext.disabled = true; elements.btnVarNext.style.opacity = '0.6'; elements.btnVarNext.style.cursor = 'not-allowed'; }
        return;
    }

    const absIdx = (state.filterStart || 1) - 1 + Math.max(0, state.currentMoveIndex);
    const bp = state.variationData.branchPoints.find(b => b.moveIndex === absIdx);

    if (bp && bp.variants.length > 1) {
        const label = bp.variants[bp.current].label || `Variation ${bp.current + 1}`;
        if (elements.variationLabel) elements.variationLabel.textContent = `${label} (${bp.current + 1}/${bp.variants.length})`;
        if (elements.btnVarPrev) { elements.btnVarPrev.disabled = bp.current <= 0; elements.btnVarPrev.style.opacity = bp.current <= 0 ? '0.6' : '1'; elements.btnVarPrev.style.cursor = bp.current <= 0 ? 'not-allowed' : 'pointer'; }
        if (elements.btnVarNext) { elements.btnVarNext.disabled = bp.current >= bp.variants.length - 1; elements.btnVarNext.style.opacity = bp.current >= bp.variants.length - 1 ? '0.6' : '1'; elements.btnVarNext.style.cursor = bp.current >= bp.variants.length - 1 ? 'not-allowed' : 'pointer'; }
    } else {
        if (elements.variationLabel) elements.variationLabel.textContent = 'Variation 1/1';
        if (elements.btnVarPrev) { elements.btnVarPrev.disabled = true; elements.btnVarPrev.style.opacity = '0.6'; elements.btnVarPrev.style.cursor = 'not-allowed'; }
        if (elements.btnVarNext) { elements.btnVarNext.disabled = true; elements.btnVarNext.style.opacity = '0.6'; elements.btnVarNext.style.cursor = 'not-allowed'; }
    }
}

function navigateVariation(dir) {
    const absIdx = (state.filterStart || 1) - 1 + Math.max(0, state.currentMoveIndex);
    const bpIndex = state.variationData.branchPoints.findIndex(b => b.moveIndex === absIdx);
    if (bpIndex === -1) return;

    const bp = state.variationData.branchPoints[bpIndex];
    const newCurrent = bp.current + dir;
    if (newCurrent < 0 || newCurrent >= bp.variants.length) return;

    const newPath = state.variationData.currentBranchPath.slice(0, bpIndex + 1);
    newPath[bpIndex] = newCurrent;

    switchBranchAndGoToNode(newPath, 0);
}

function switchBranchAndGoToNode(path, nodeIndex) {
    const tree = state.sgfTree;
    if (!tree) return;

    const newAllSgfMovesProps = [];
    let currentTree = tree;
    for (let i = 0; i <= path.length; i++) {
        const limit = (i === path.length) ? (nodeIndex + 1) : currentTree.nodes.length;
        for (let j = 0; j < limit; j++) {
            newAllSgfMovesProps.push(currentTree.nodes[j].properties);
        }
        if (i < path.length) {
            if (currentTree.children && currentTree.children[path[i]]) {
                currentTree = currentTree.children[path[i]];
            } else {
                break;
            }
        }
    }

    // Now, continue down the leftmost descendant of currentTree
    let descTree = currentTree;
    while (descTree.children && descTree.children.length > 0) {
        descTree = descTree.children[0];
        for (let j = 0; j < descTree.nodes.length; j++) {
            newAllSgfMovesProps.push(descTree.nodes[j].properties);
        }
    }

    const bw = Math.min(state.boardWidth, 19);
    const bh = Math.min(state.boardHeight, 19);

    const newMoves = [];
    newAllSgfMovesProps.forEach((props, idx) => {
        const isRootOnly = idx === 0 && state.sgfTree.nodes[0] === newAllSgfMovesProps[0] && !props.B && !props.W;
        if (isRootOnly) return;

        if (props.B || props.W) {
            const color = props.B ? 'B' : 'W';
            const coordStr = props[color][0];
            const pt = SgfEngine.parseGoPoint(coordStr, bw, bh);
            if (!pt) return;

            const comment = props.C ? props.C[0] : '';
            const { annotations, territory } = SgfEngine.parseMarkupProperties(props, bw, bh);
            const unknownProps = SgfEngine.extractUnknownProperties(props);

            let moveAnnotation = null;
            if (props.TE) moveAnnotation = { type: 'TE', value: props.TE[0] || '1' };
            else if (props.BM) moveAnnotation = { type: 'BM', value: props.BM[0] || '1' };
            else if (props.DO) moveAnnotation = { type: 'DO', value: null };
            else if (props.IT) moveAnnotation = { type: 'IT', value: null };

            let nodeAnnotation = null;
            if (props.GB) nodeAnnotation = { type: 'GB', value: props.GB[0] || '1' };
            else if (props.GW) nodeAnnotation = { type: 'GW', value: props.GW[0] || '1' };
            else if (props.DM) nodeAnnotation = { type: 'DM', value: props.DM[0] || '1' };
            else if (props.UC) nodeAnnotation = { type: 'UC', value: props.UC[0] || '1' };

            const nodeName = props.N ? props.N[0] : '';
            const moveNumber = props.MN ? parseInt(props.MN[0], 10) : null;

            newMoves.push({
                player: color,
                c: pt.isPass ? -1 : pt.c,
                r: pt.isPass ? -1 : pt.r,
                comment,
                isPass: pt.isPass,
                annotations,
                territory,
                unknownProps,
                moveAnnotation,
                nodeAnnotation,
                nodeName,
                moveNumber,
                sgfNode: props
            });
        }
    });

    state.allSgfMoves = newMoves;

    // Recalculate branch points along the chosen path
    const branchPoints = [];
    {
        let moveIdx = 0;
        let cTree = tree;
        while (cTree) {
            const contributingNodes = cTree.nodes.filter(n => n.properties.B || n.properties.W).length;
            if (cTree.children && cTree.children.length > 1) {
                const variants = cTree.children.map((child, ci) => {
                    let label = '';
                    for (const n of child.nodes) {
                        if (n.properties.N && n.properties.N[0]) { label = n.properties.N[0]; break; }
                    }
                    return { label: label || `Variation ${ci + 1}`, treeIndex: ci };
                });
                branchPoints.push({ moveIndex: moveIdx + contributingNodes, variants, current: 0 });
            }
            moveIdx += contributingNodes;
            if (cTree.children && cTree.children.length > 0) {
                const bpIdx = branchPoints.length - 1;
                const chosenChildIndex = (bpIdx < path.length) ? path[bpIdx] : 0;
                if (branchPoints[bpIdx]) {
                    branchPoints[bpIdx].current = chosenChildIndex;
                }
                cTree = cTree.children[chosenChildIndex];
            } else {
                cTree = null;
            }
        }
    }

    state.variationData = {
        branchPoints,
        currentBranchPath: path.slice()
    };

    const rangeText = elements.rangeInput ? elements.rangeInput.value : 'all';
    const [start] = parseRange(rangeText);

    state.sgfMoves = state.allSgfMoves.slice(Math.max(0, start - 1));

    // Calculate moveCount up to nodeIndex in path
    let moveCount = 0;
    let tempTree = tree;
    for (let i = 0; i <= path.length; i++) {
        const limit = (i === path.length) ? (nodeIndex + 1) : tempTree.nodes.length;
        for (let j = 0; j < limit; j++) {
            if (tempTree.nodes[j].properties.B || tempTree.nodes[j].properties.W) {
                moveCount++;
            }
        }
        if (i < path.length) {
            if (tempTree.children && tempTree.children[path[i]]) {
                tempTree = tempTree.children[path[i]];
            } else {
                break;
            }
        }
    }

    const targetMoveIndexInAll = moveCount - 1;
    const targetMoveIndexInSgfMoves = targetMoveIndexInAll - (start - 1);

    state.baselineBoard = JSON.parse(JSON.stringify(state.setupBoard));
    let pB = 0, pW = 0;
    const limitIdx = Math.max(0, start - 1);
    for (let i = 0; i < limitIdx && i < state.allSgfMoves.length; i++) {
        const m = state.allSgfMoves[i];
        if (!m.isPass && m.r >= 0 && m.r < 19 && m.c >= 0 && m.c < 19) {
            const captured = playStoneWithCaptures(state.baselineBoard, m.r, m.c, m.player);
            if (m.player === 'B') pB += captured.count; else pW += captured.count;
        }
    }
    state.prefixCaptures = { B: pB, W: pW };

    calculateGamePhases();
    goToMove(targetMoveIndexInSgfMoves);
    updateVariationUI();
    updateExtractedMoves();
    populateCommentDropdown();
}
window.switchBranchAndGoToNode = switchBranchAndGoToNode;

// ── Endgame markup resolution (DD / MA / TB / TW) ─────────────────────────
// Algorithmic, game-agnostic lookup for dead-stone / territory markup that works
// for ANY loaded record regardless of how loadSGF placed (or folded) the props.
// Resolution order:
//   1. the move currently under the replayer,
//   2. the LAST markup-bearing move in allSgfMoves (full sequence),
//   3. the LAST markup-bearing move in the (possibly filtered) sgfMoves,
//   4. root-level DD/MA/TB/TW properties (state.sgfRootProps / state.sgfMetadata),
//   5. the LAST markup-bearing raw node in the parsed SGF main line (covers terminal
//      annotation-only nodes that loadSGF could not fold onto a move).
// Returns a node exposing { DD, MA, TB, TW, player } or null when no markup exists.
// Canonical converter: a saved Manual Scoring session (scoringData) → SGF scoring props.
// Pure function of `data` (no closure state), so it lives at module top level and is shared by
// the modal export path, findEndgameMarkup's session fallback, and resolveScoringInputs —
// one definition of how a session becomes DD/MA/TB/TW, so every consumer derives identical sets.
// Returns { dd, ma, tb, tw } (compressed point strings) plus `board`: the session board with
// lifted (dead) stones restored to their original colors — exactly the grid GoScorer scores,
// so a consumer can reproduce the modal's prisoner counts for an identical total.
// ── SSOT: one canonical scoring-session → SGF-props converter ──────────────
// Every consumer (modal prop-bar widget, saveScoringResult, SGF export/viewer
// injection, findEndgameMarkup's session fallback, resolveScoringInputs) derives
// DD/MA/TB/TW from this single function, so a session always produces identical
// marks no matter which surface reads it. The input is session-shaped (the live
// `scoringState` or a persisted `rec.scoringData` snapshot are interchangeable).
function computeScoringPropsFromSession(session) {
    const dd = [];
    const ma = [];
    const tb = [];
    const tw = [];
    const ruleMode = (session.ruleMode || 'japanese');
    // Territory is derived from the session's CURRENT board: the blue-panel Run score, the
    // saved DD/MA/TB/TW and the modal's result badge must all reflect the exact board the
    // user last edited (re-arranged/replaced stones included). baseBoard is deliberately NOT
    // read here — it is only the untouched-position seed seedAutoDeadMarks uses on first entry.
    const boardData = (session.board && session.board.length) ? session.board : [];
    const markedDead = session.markedDead || null;
    const deadInfo = session.deadStonesInfo || null;
    const manualTerritory = session.manualTerritory || null;

    // DD & MA: every position currently marked dead (MA mirrors DD by convention)
    if (markedDead) {
        for (let r = 0; r < 19; r++) {
            const row = markedDead[r];
            if (!row) continue;
            for (let c = 0; c < 19; c++) {
                if (row[c]) {
                    const pt = (typeof SgfEngine !== 'undefined' && SgfEngine.formatGoPoint)
                        ? SgfEngine.formatGoPoint(c, r)
                        : null;
                    if (pt) {
                        dd.push(pt);
                        ma.push(pt);
                    }
                }
            }
        }
    }

    const stonesWithDead = boardData.map((row, ri) =>
        row.map((val, ci) => {
            if (markedDead && markedDead[ri] && markedDead[ri][ci] && val === 0) {
                return (deadInfo && deadInfo[ri] && deadInfo[ri][ci]) || 0;
            }
            return val;
        })
    );

    let locScores = null;
    let areaScores = null;
    if (window.GoScorer) {
        try {
            if (ruleMode === 'japanese') {
                locScores = window.GoScorer.territoryScoring(stonesWithDead, markedDead, false);
            } else {
                areaScores = window.GoScorer.areaScoring(stonesWithDead, markedDead);
            }
        } catch (e) {}
    }

    // TB & TW: territory intersections (explicit manual marks win; auto-derived otherwise)
    for (let r = 0; r < 19; r++) {
        const row = boardData[r];
        if (!row) continue;
        for (let c = 0; c < 19; c++) {
            if (row[c] !== 0) continue;
            let terrColor = 0;
            if (manualTerritory && manualTerritory[r] && manualTerritory[r][c] > 0) {
                terrColor = manualTerritory[r][c];
            } else if (ruleMode === 'japanese' && locScores) {
                terrColor = (locScores[r][c] && locScores[r][c].isTerritoryFor) || 0;
            } else if (ruleMode === 'chinese' && areaScores) {
                terrColor = (areaScores[r] && areaScores[r][c]) || 0;
            }

            if (terrColor === 1 || terrColor === 2) {
                const pt = (typeof SgfEngine !== 'undefined' && SgfEngine.formatGoPoint)
                    ? SgfEngine.formatGoPoint(c, r)
                    : null;
                if (pt) {
                    if (terrColor === 1) tb.push(pt);
                    else tw.push(pt);
                }
            }
        }
    }

    const compFn = (typeof SgfEngine !== 'undefined' && SgfEngine.compressGoPoints)
        ? SgfEngine.compressGoPoints
        : (pts => pts);

    return {
        dd: compFn(dd),
        ma: compFn(ma),
        tb: compFn(tb),
        tw: compFn(tw),
        board: stonesWithDead,
        rawCounts: { dd: dd.length, ma: ma.length, tb: tb.length, tw: tw.length }
    };
}

function computeSgfPropsFromScoringData(data) {
    if (!data || !data.board || !data.markedDead) return null;
    return computeScoringPropsFromSession(data);
}

// ── Legacy migration: reconcile a session missing manual territory ──────────
// Sessions saved by older builds did NOT persist manualTerritory (the bug that made
// manually-marked territory silently fall back to auto-derived territory). When a
// restored session has no manual territory marks but the loaded SGF carries TB/TW,
// recover the recorded territory from the SGF tree so every downstream consumer —
// the reopened modal, the prop bars, the blue-panel Run score, the export — sees the
// saved territory instead of auto-derived points. The tree-only lookup (includeSession
// = false) avoids reading back the very session we are normalizing. Pure: returns a
// NEW session when it backfills, the same reference otherwise (never mutates).
function normalizeScoringSession(session) {
    if (!session || !session.board) return session;
    const mt = session.manualTerritory;
    let hasManual = false;
    if (mt) {
        outer: for (let r = 0; r < 19; r++) {
            const row = mt[r];
            if (!row) continue;
            for (let c = 0; c < 19; c++) {
                if (row[c]) { hasManual = true; break outer; }
            }
        }
    }
    if (hasManual) return session;

    const mk = findEndgameMarkup(false);
    if (!mk || (!mk.TB && !mk.TW)) return session;

    const bw = (session.board[0] && session.board[0].length) || 19;
    const bh = session.board.length || 19;
    const md = session.markedDead || null;
    const out = {
        ...session,
        manualTerritory: mt ? mt.map(r => (r ? [...r] : r)) : Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0))
    };
    if (mk.TB) {
        SgfEngine.expandPointList(mk.TB, bw, bh).forEach(pt => {
            const row = session.board[pt.r];
            if (!row || row[pt.c] !== 0) return;
            if (md && md[pt.r] && md[pt.r][pt.c]) return;
            out.manualTerritory[pt.r][pt.c] = 1;
        });
    }
    if (mk.TW) {
        SgfEngine.expandPointList(mk.TW, bw, bh).forEach(pt => {
            const row = session.board[pt.r];
            if (!row || row[pt.c] !== 0) return;
            if (md && md[pt.r] && md[pt.r][pt.c]) return;
            out.manualTerritory[pt.r][pt.c] = 2;
        });
    }
    return out;
}

function findEndgameMarkup(includeSession) {
    const hasMarkup = (m) => !!(m && (m.DD || m.MA || m.TB || m.TW));

    if (state.currentMoveIndex >= 0 && state.sgfMoves && hasMarkup(state.sgfMoves[state.currentMoveIndex])) {
        return state.sgfMoves[state.currentMoveIndex];
    }

    if (state.allSgfMoves && state.allSgfMoves.length) {
        for (let i = state.allSgfMoves.length - 1; i >= 0; i--) {
            if (hasMarkup(state.allSgfMoves[i])) return state.allSgfMoves[i];
        }
    }

    if (state.sgfMoves && state.sgfMoves.length) {
        for (let i = state.sgfMoves.length - 1; i >= 0; i--) {
            if (hasMarkup(state.sgfMoves[i])) return state.sgfMoves[i];
        }
    }

    const rootProps = state.sgfRootProps || null;
    if (rootProps) {
        const meta = state.sgfMetadata || {};
        const DD = rootProps.DD || null;
        const MA = rootProps.MA || null;
        const TB = rootProps.TB || meta.tb || null;
        const TW = rootProps.TW || meta.tw || null;
        if (DD || MA || TB || TW) return { DD, MA, TB, TW, player: null };
    }

    if (state.sgfTree && typeof SgfEngine !== 'undefined' && typeof SgfEngine.extractMainLine === 'function') {
        const mainLine = SgfEngine.extractMainLine(state.sgfTree);
        for (let i = mainLine.length - 1; i >= 0; i--) {
            const props = mainLine[i];
            if (props && (props.DD || props.MA || props.TB || props.TW)) {
                return { DD: props.DD || null, MA: props.MA || null, TB: props.TB || null, TW: props.TW || null, player: null };
            }
        }
    }

    // Final fallback: the study record's SAVED scoring session. The SGF viewer injects this
    // markup at display time, so a record whose workingSgf string itself never received the
    // DD/MA/TB/TW props (e.g. scoring saved through a flow that did not regenerate the SGF
    // string) would otherwise appear "unmarked" to the scorer while the user sees them in the
    // buffer. Rebuild the props through the shared canonical converter so this fallback always
    // derives the exact same marks the Manual Scoring Modal derives for that session.
    // `includeSession === false` skips this tier (used for tree-only lookups).
    if (includeSession !== false && state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec && rec.scoringData) {
            const props = computeSgfPropsFromScoringData(rec.scoringData);
            if (props && (props.dd.length || props.ma.length || props.tb.length || props.tw.length)) {
                return { DD: props.dd, MA: props.ma, TB: props.tb, TW: props.tw, player: null };
            }
        }
    }

    return null;
}
window.findEndgameMarkup = findEndgameMarkup;

// Single named komi default — the ONLY 6.5 literal in the scoring paths. Every other komi
// default (extractSgfKomi fallback, scoringState initial value, YSE panel, legacy-session
// restore) references this constant or the resolver below, so the default can change in
// exactly one place.
const DEFAULT_KOMI = 6.5;

// SSOT komi resolver — the ONLY place komi is read from the SGF. The Manual Scoring Modal's
// session init, the legacy-session restore, the YSE estimate panel, and resolveScoringInputs
// all consume it, so a game with KM[0] is scored with komi 0 on every surface. NOTE:
// parseFloat() || fallback would turn '0' into the default (0 is falsy); the isNaN() guard
// is what keeps a real 0 komi as 0. Only a missing/unparsable value falls back to
// DEFAULT_KOMI.
function extractSgfKomi() {
    let rawKomi = null;
    if (state.sgfMetadata && state.sgfMetadata.km !== undefined && state.sgfMetadata.km !== null && state.sgfMetadata.km !== '') {
        rawKomi = state.sgfMetadata.km;
    } else if (state.gameInfo && state.gameInfo.km !== undefined && state.gameInfo.km !== null && state.gameInfo.km !== '') {
        rawKomi = state.gameInfo.km;
    } else if (state.gameInfo && state.gameInfo.KM !== undefined && state.gameInfo.KM !== null && state.gameInfo.KM !== '') {
        rawKomi = state.gameInfo.KM;
    } else if (state.gameInfo && state.gameInfo.komi !== undefined && state.gameInfo.komi !== null && state.gameInfo.komi !== '') {
        rawKomi = state.gameInfo.komi;
    }
    const parsedKomi = parseFloat(rawKomi);
    return isNaN(parsedKomi) ? DEFAULT_KOMI : parsedKomi;
}
window.extractSgfKomi = extractSgfKomi;

// Unify every scoring-input source into ONE canonical snapshot so the blue-panel Run control
// and the Manual Scoring Modal always consume identical inputs. Precedence is a strict,
// algorithmic chain (most recent, user-confirmed resolution wins):
//   1. Live session memory (_scoringPersistData) — the first source the modal restores.
//   2. Persisted study scoringData — the second source the modal restores.
//   3. SGF endgame markup (DD/MA/TB/TW) resolved anywhere in the loaded record.
// A session that carries NO resolution (no dead marks, no territory) is skipped so the
// record's own markup can still drive the score; a session that resolves anything is
// authoritative over markup, because it is the exact board+marks snapshot the modal displays —
// guaranteeing blue-panel == modal parity for every saved session.
function resolveScoringInputs() {
    const snapshot = {
        board: state.board,
        captures: { B: 0, W: 0 },
        komi: extractSgfKomi(),
        handicap: parseInt((state.sgfMetadata && state.sgfMetadata.ha), 10) || 0,
        deadStones: [],
        tbPoints: [],
        twPoints: [],
        hasMarkup: false,
        positionLabel: '',
        provenance: '',
        markupMove: null
    };

    // ── Tier 1/2: Manual Scoring session (live memory, then persisted record) ──
    let session = null;
    if (_scoringPersistData && _scoringPersistData.board) {
        session = normalizeScoringSession(_scoringPersistData);
    } else if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec && rec.scoringData && rec.scoringData.board) session = normalizeScoringSession(rec.scoringData);
    }

    if (session) {
        const md = session.markedDead || null;
        const mt = session.manualTerritory || null;
        let resolves = false;
        if (md) {
            for (let r = 0; r < md.length && !resolves; r++) {
                const row = md[r];
                if (!row) continue;
                for (let c = 0; c < row.length; c++) {
                    if (row[c]) { resolves = true; break; }
                }
            }
        }
        if (!resolves && mt) {
            for (let r = 0; r < mt.length && !resolves; r++) {
                const row = mt[r];
                if (!row) continue;
                for (let c = 0; c < row.length; c++) {
                    if (row[c] === 1 || row[c] === 2) { resolves = true; break; }
                }
            }
        }

        if (resolves) {
            const props = computeSgfPropsFromScoringData(session);
            const bHeight = session.board.length || 19;
            const bWidth = session.board[0] ? session.board[0].length : bHeight;
            const expand = (list) => (list && list.length) ? SgfEngine.expandPointList(list, bWidth, bHeight) : [];
            const numericBoard = (props && props.board) ? props.board : session.board;

            snapshot.board = numericBoard.map(row => row.map(v =>
                v === 1 ? { player: 'B', annotation: null, label: null }
                : v === 2 ? { player: 'W', annotation: null, label: null }
                : { player: null, annotation: null, label: null }
            ));
            // SSOT-and-Synced: the modal's result badge (drawBoard) and its Computing formula
            // are both computed from the LIVE capture fields (blackCaptures/whiteCaptures),
            // so the blue panel must read the SAME source. Mirror the modal's expression
            // verbatim: the session's editable captures win (Replacing a prisoner back onto
            // the board legitimately reduces the capture count everywhere).
            snapshot.captures = {
                B: (session.blackCaptures || 0),
                W: (session.whiteCaptures || 0)
            };
            snapshot.komi = (session.komi != null) ? Number(session.komi) : snapshot.komi;
            // The Scoring Modal's displayed formula is territory + dead + captures + komi and
            // never adds a handicap term — reproduce it verbatim so blue panel == modal.
            snapshot.handicap = 0;
            snapshot.deadStones = expand(props ? props.dd : null);
            snapshot.tbPoints = expand(props ? props.tb : null);
            snapshot.twPoints = expand(props ? props.tw : null);
            snapshot.hasMarkup = snapshot.deadStones.length > 0 || snapshot.tbPoints.length > 0 || snapshot.twPoints.length > 0;
            snapshot.positionLabel = 'Scored from the Manual Scoring session (matches the Scoring Modal)';
            snapshot.provenance = 'Manual Scoring session';
            return snapshot;
        }
    }

    // ── Tier 3: SGF endgame markup resolved from the loaded record ──
    const markupMove = findEndgameMarkup();
    if (markupMove && (markupMove.DD || markupMove.MA || markupMove.TB || markupMove.TW)) {
        const markupIsCurrent = !!(state.sgfMoves && markupMove === state.sgfMoves[state.currentMoveIndex]);

        let compBoard = state.board;
        let compCaptures = state.captures ? { B: state.captures.B, W: state.captures.W } : { B: 0, W: 0 };
        let positionLabel = state.currentMoveIndex >= 0 ? `Position after move ${state.currentMoveIndex + 1}` : 'Initial board state';

        if (!markupIsCurrent) {
            const terminal = replayToTerminal();
            compBoard = terminal.board;
            compCaptures = terminal.captures;
            const moveCount = state.allSgfMoves ? state.allSgfMoves.length : (state.sgfMoves ? state.sgfMoves.length : 0);
            positionLabel = `Endgame position (move ${moveCount})`;
        }

        const rawBoardData = BoardEstimate.fromBoard(compBoard);
        const bHeight = rawBoardData.length;
        const bWidth = bHeight > 0 ? rawBoardData[0].length : 0;
        const expand = (list) => (list) ? SgfEngine.expandPointList(list, bWidth, bHeight) : [];
        const deadStones = [];
        const tbPoints = [];
        const twPoints = [];

        if (markupMove.DD || markupMove.MA) {
            expand(markupMove.DD).forEach(pt => deadStones.push({ r: pt.r, c: pt.c }));
            expand(markupMove.MA).forEach(pt => deadStones.push({ r: pt.r, c: pt.c }));
        } else if (markupMove.TB || markupMove.TW) {
            if (markupMove.TB) {
                expand(markupMove.TB).forEach(pt => {
                    tbPoints.push({ r: pt.r, c: pt.c });
                    if (rawBoardData[pt.r] && rawBoardData[pt.r][pt.c] === -1) deadStones.push({ r: pt.r, c: pt.c });
                });
            }
            if (markupMove.TW) {
                expand(markupMove.TW).forEach(pt => {
                    twPoints.push({ r: pt.r, c: pt.c });
                    if (rawBoardData[pt.r] && rawBoardData[pt.r][pt.c] === 1) deadStones.push({ r: pt.r, c: pt.c });
                });
            }
        }

        snapshot.board = compBoard;
        snapshot.captures = compCaptures;
        snapshot.deadStones = deadStones;
        snapshot.tbPoints = tbPoints;
        snapshot.twPoints = twPoints;
        snapshot.hasMarkup = true;
        snapshot.positionLabel = positionLabel;
        snapshot.provenance = 'SGF endgame markup (DD/MA/TB/TW)';
        snapshot.markupMove = markupMove;
        return snapshot;
    }

    return snapshot;
}
window.resolveScoringInputs = resolveScoringInputs;

function goToMove(index) {
    if (state.whatIfMode) {
        state.whatIfMode = false;
        state.whatIfStone = null;
        if (elements.btnWhatIf) {
            elements.btnWhatIf.style.backgroundColor = 'rgba(139, 26, 26, 0.1)';
            elements.btnWhatIf.style.borderColor = 'rgb(139, 26, 26)';
            elements.btnWhatIf.style.color = 'rgb(139, 26, 26)';
        }
    }
    if (state.refPointMode) {
        state.refPointMode = false;
        state.refPointCells = [];
        state.refPointInsertPos = -1;
        if (elements.btnRefPoint) {
            elements.btnRefPoint.style.backgroundColor = '';
            elements.btnRefPoint.style.borderColor = '';
            elements.btnRefPoint.style.color = '';
            elements.btnRefPoint.style.fontWeight = '';
        }
    }
    if (state.refAreaMode) {
        state.refAreaMode = false;
        state.refAreaCells = [];
        state.refAreaHoverCell = null;
        if (elements.btnRefArea) {
            elements.btnRefArea.style.backgroundColor = '';
            elements.btnRefArea.style.borderColor = '';
            elements.btnRefArea.style.color = '';
            elements.btnRefArea.style.fontWeight = '';
        }
    }
    cancelAnnotationEdit();
    state.estimateMap = null;
    state.estimateScore = null;
    state.estimateResult = null;
    state.deadMap = null;

    // Clear stale move-term highlights — they get re-populated on next badge hover
    if (window._termHL) window._termHL.clear();
    const existingPanel = document.getElementById('estimate-rich-panel');
    if (existingPanel) existingPanel.remove();
    
    const estBtn = document.getElementById('btn-score-estimate');
    if (estBtn) {
        estBtn.style.background = 'rgba(139, 26, 26, 0.1)';
        estBtn.style.color = 'rgb(139, 26, 26)';
    }

    state.showLiberties = false;
    const libPanel = document.getElementById('liberties-rich-panel');
    if (libPanel) libPanel.remove();
    
    const libBtn = document.getElementById('btn-liberties');
    if (libBtn) {
        libBtn.style.background = 'rgba(139, 26, 26, 0.1)';
        libBtn.style.color = 'rgb(139, 26, 26)';
        libBtn.setAttribute('title', 'Toggle Liberties (Cmd+Shift+L)');
    }

    
    if (typeof checkSgfChangeAndShowPopup === 'function') {
        checkSgfChangeAndShowPopup();
    }

    if (!state.baselineBoard) return;
    
    const isSingleStepForward = (index === state.currentMoveIndex + 1);
    const isSingleStepBackward = (index === state.currentMoveIndex - 1);
    
    if (index < -1) index = -1;
    if (index >= state.sgfMoves.length) index = state.sgfMoves.length - 1;
    
    if (isSingleStepForward && index <= state.sgfMoves.length - 1 && index > -1) {
        if (typeof stoneSound !== 'undefined') {
            stoneSound.currentTime = 0;
            stoneSound.play().catch(e => console.warn('Audio play failed:', e));
        }
    } else if (isSingleStepBackward && state.currentMoveIndex > -1) {
        if (typeof removeSound !== 'undefined') {
            removeSound.currentTime = 0;
            removeSound.play().catch(e => console.warn('Audio play failed:', e));
        }
    }
    
    state.currentMoveIndex = index;
    if (state.activeStudyId && !state.isSgfLoading && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            rec.currentMoveIndex = index;
            rec.lastAccess = typeof window.formatStudyAccessTime === 'function' ? window.formatStudyAccessTime() : new Date().toLocaleString();
            if (typeof captureCurrentAppSettings === 'function') {
                rec.settings = captureCurrentAppSettings();
            }
            console.log(`[StudyRecordDB] goToMove(${index}) -> updated rec.currentMoveIndex = ${index} for activeStudyId: ${state.activeStudyId}`);
            StudyRecordDB.saveRecord(rec);
            if (typeof window.updateSaveRecGameButton === 'function') window.updateSaveRecGameButton();
        }
    }
    state.board = JSON.parse(JSON.stringify(state.baselineBoard));
    
    let totalCapturedByB = state.prefixCaptures?.B || 0;
    let totalCapturedByW = state.prefixCaptures?.W || 0;
    let capturedThisMove = 0;
    let capturedPositions = [];
    
    for (let i = 0; i <= index; i++) {
        const m = state.sgfMoves[i];
        if (m.isPass) continue;
        const result = playStoneWithCaptures(state.board, m.r, m.c, m.player);
        if (m.player === 'B') {
            totalCapturedByB += result.count;
        } else {
            totalCapturedByW += result.count;
        }
        if (i === index) {
            capturedThisMove = result.count;
            capturedPositions = result.positions;
        }
    }
    
    const curPlayer = index >= 0 ? state.sgfMoves[index].player : null;
    state.captures = {
        B: totalCapturedByB,
        W: totalCapturedByW,
        B_before: totalCapturedByB - (curPlayer === 'B' ? capturedThisMove : 0),
        W_before: totalCapturedByW - (curPlayer === 'W' ? capturedThisMove : 0),
        lastCaptured: capturedThisMove,
        lastPlayer: curPlayer
    };

    // Trigger capture animation (only when stepping forward, not fast-forward or initial load)
    if (capturedPositions.length > 0 && !state.fastForwardAnim?.active && index >= 0) {
        const animStones = capturedPositions.map(p => {
            const { cx, cy } = { cx: PADDING + p.c * CELL_SIZE, cy: PADDING + p.r * CELL_SIZE };
            return { r: p.r, c: p.c, player: p.player, cx, cy };
        });
        state.captureAnim = { active: true, startTime: performance.now(), duration: 400, stones: animStones };
    } else {
        state.captureAnim = { active: false, startTime: 0, duration: 400, stones: [] };
    }
    if (elements.replayerMoveKpi) {
        const absIdx = (state.filterStart || 1) - 1 + index;
        const totalAll = state.allSgfMoves ? state.allSgfMoves.length : 0;
        
        const isFiltered = totalAll > 0 && totalAll !== state.sgfMoves.length;
        
        if (isFiltered) {
            const endMove = (state.filterEnd && state.filterEnd !== Infinity) ? state.filterEnd : totalAll;
            elements.replayerMoveKpi.textContent = `${absIdx + 1} / ${endMove}`;
        } else {
            elements.replayerMoveKpi.textContent = `${absIdx + 1} / ${totalAll}`;
        }
        
        if (!elements.replayerMoveKpi._gotoBound) {
            elements.replayerMoveKpi._gotoBound = true;
            elements.replayerMoveKpi.addEventListener('dblclick', function() {
                if (elements.replayerMoveKpi._editing) return;
                elements.replayerMoveKpi._editing = true;
                var txt = this.textContent;
                var match = txt.match(/\d+/);
                var cur = match ? parseInt(match[0], 10) : 1;
                
                const totalAllVal = state.allSgfMoves ? state.allSgfMoves.length : 0;
                const isFilteredVal = totalAllVal > 0 && totalAllVal !== state.sgfMoves.length;
                
                const minVal = isFilteredVal ? (state.filterStart || 1) : 1;
                const maxVal = isFilteredVal ? ((state.filterEnd && state.filterEnd !== Infinity) ? state.filterEnd : totalAllVal) : totalAllVal;
                
                var input = document.createElement('input');
                input.type = 'number';
                input.min = minVal;
                input.max = maxVal;
                input.value = cur;
                input.style.cssText = 'width:60px;font-size:0.85rem;font-weight:600;color:var(--success);font-variant-numeric:tabular-nums;background:transparent;border:1px solid var(--success);border-radius:4px;padding:1px 4px;text-align:center;outline:none;';
                this.textContent = '';
                this.appendChild(input);
                input.focus();
                input.select();
                function done() {
                    if (!elements.replayerMoveKpi._editing) return;
                    elements.replayerMoveKpi._editing = false;
                    var val = parseInt(input.value, 10);
                    if (!isNaN(val) && val >= minVal && val <= maxVal) {
                        const targetIdx = isFilteredVal ? (val - minVal) : (val - 1);
                        goToMove(targetIdx);
                    } else {
                        goToMove(state.currentMoveIndex);
                    }
                }
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') { e.preventDefault(); done(); }
                    if (e.key === 'Escape') { e.preventDefault(); elements.replayerMoveKpi._editing = false; goToMove(state.currentMoveIndex); }
                });
                input.addEventListener('blur', done);
            });
        }
    }
    
    window.runScoreEstimate = async function() {
        const estimateBtn = document.getElementById('btn-score-estimate');
        const setEstimateBtnActive = (active) => {
            if (!estimateBtn) return;
            estimateBtn.style.background = active ? 'rgb(139, 26, 26)' : 'rgba(139, 26, 26, 0.1)';
            estimateBtn.style.color = active ? 'rgb(248, 245, 238)' : 'rgb(139, 26, 26)';
        };

        if (state.estimateMap) {
            state.estimateMap = null;
            state.estimateScore = null;
            state.estimateResult = null;
            state.deadMap = null; // clear dead stone X marks
            
            const existingPanel = document.getElementById('estimate-rich-panel');
            if (existingPanel) existingPanel.remove();
            
            setEstimateBtnActive(false);
            drawBoard();
            return;
        }

        if (typeof BoardEstimate === 'undefined') {
            console.error("BoardEstimate module not loaded.");
            return;
        }

        let aiDeadMap = null;
        let aiError = null;

        if (typeof deadstones !== 'undefined') {
            try {
                await new Promise(r => setTimeout(r, 10)); // allow browser to breathe
                const data = BoardEstimate.fromBoard(state.board);
                const vertices = await deadstones.guess(data, {finished: false, iterations: 200});
                aiDeadMap = [...Array(19)].map(_ => Array(19).fill(false));
                for (let [x, y] of vertices) {
                    if (x >= 0 && x < 19 && y >= 0 && y < 19) aiDeadMap[y][x] = true;
                }
                state.deadMap = aiDeadMap;
            } catch (e) {
                console.error('AI Estimation failed', e);
                aiError = e.message;
            }
        }
        
        // Isolation: YSE always runs its own estimation. Never feed recorded
        // TB/TW markup (or baselineTerritory) into estimate() — doing so would
        // short-circuit the AI and replay JTS-derived territory instead.
        let territoryBlack = [];
        let territoryWhite = [];

        // YSE reads komi through the same SSOT resolver as the modal and the blue panel, so a
        // game with KM[0] shows komi 0 here too (a third inline reader was a drift risk).
        const komi = extractSgfKomi();
        const handicap = parseInt(state.sgfMetadata.ha, 10) || 0;
        const rules = state.sgfMetadata.ru || 'Japanese';
        const inGameCaptures = state.captures ? { B: state.captures.B, W: state.captures.W } : { B: 0, W: 0 };
        const result = BoardEstimate.estimate(state.board, {
            komi,
            handicap,
            territoryBlack,
            territoryWhite,
            inGameCaptures,
            rules,
            aiDeadMap
        });
        state.estimateMap = result.areaMap;
        state.estimateScore = result.score;
        state.estimateResult = result.result;
        setEstimateBtnActive(true);
        
        const moveText = state.currentMoveIndex >= 0 
            ? `Position after move ${state.currentMoveIndex + 1}` 
            : 'Initial board state';
        
        // Remove existing panel if any
        let panel = document.getElementById('estimate-rich-panel');
        if (panel) panel.remove();
        
        // Create rich glassmorphism panel
        panel = document.createElement('div');
        panel.id = 'estimate-rich-panel';
        panel.style.position = 'fixed';
        panel.style.top = '-500px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '999999999';
        panel.style.transition = 'top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        panel.style.background = 'rgba(238, 227, 161, 0.85)';
        panel.style.backdropFilter = 'blur(12px)';
        panel.style.webkitBackdropFilter = 'blur(12px)';
        panel.style.borderRadius = '12px';
        panel.style.padding = '16px 24px';
        panel.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.3)';
        panel.style.fontFamily = "'Inter', 'Roboto', sans-serif";
        panel.style.color = '#1f2937';
        panel.style.minWidth = '500px';
        panel.style.pointerEvents = 'auto'; // allow the panel to intercept clicks so they aren't treated as 'outside'
        
        const b = result.score;
        const isArea = result.isArea;
        
        const bTotal = isArea ? b.area[0] : (b.territory[0] + b.captures[0] + (b.deadStones ? b.deadStones[0] : 0));
        const wTotal = isArea ? (b.area[1] + komi + handicap) : (b.territory[1] + b.captures[1] + (b.deadStones ? b.deadStones[1] : 0) + komi);
        
        const formatDiff = (blackScore, whiteScore) => {
            let diff = blackScore - whiteScore;
            if (diff > 0) return `B+${Number.isInteger(diff) ? diff : diff.toFixed(1)}`;
            if (diff < 0) return `W+${Number.isInteger(-diff) ? -diff : (-diff).toFixed(1)}`;
            return 'Draw';
        };

        const bAreaTot = b.area[0];
        const wAreaTot = b.area[1] + komi + handicap;
        const areaStr = formatDiff(bAreaTot, wAreaTot);

        const bTerrTot = b.territory[0] + b.captures[0] + (b.deadStones ? b.deadStones[0] : 0);
        const wTerrTot = b.territory[1] + b.captures[1] + (b.deadStones ? b.deadStones[1] : 0) + komi;
        const terrStr = formatDiff(bTerrTot, wTerrTot);
        
        panel.innerHTML = `
            <div id="close-estimate-panel" style="position: absolute; top: 10px; right: 12px; cursor: pointer; font-size: 20px; line-height: 20px; font-weight: bold; color: #9ca3af; transition: color 0.2s;">&times;</div>
            <div style="font-weight: 700; font-size: 1.1rem; text-align: center; margin-bottom: 8px; color: #111827; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;">
                <span>Score Estimate:</span>
                <div style="display: flex; gap: 8px;">
                    <span style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.95rem; border: 1px solid rgba(239, 68, 68, 0.2);">Area [${areaStr}]</span>
                    <span style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 4px 10px; border-radius: 6px; font-size: 0.95rem; border: 1px solid rgba(59, 130, 246, 0.2);">Territory [${terrStr}]</span>
                </div>
            </div>
            <div style="text-align: center; margin-bottom: 16px; color: #6b7280; font-size: 0.85rem; font-style: italic;">
                ( ${moveText} )
            </div>
            <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.95rem;">
                <thead>
                    <tr style="color: #4b5563; font-size: 0.75rem; letter-spacing: 0.05em; font-weight: 600;">
                        <th style="padding-bottom: 8px;">PLYR</th>
                        <th style="padding-bottom: 8px;">AREA</th>
                        <th style="padding-bottom: 8px;">TERR</th>
                        <th style="padding-bottom: 8px;">CAPT</th>
                        <th style="padding-bottom: 8px;">DEAD</th>
                        <th style="padding-bottom: 8px;">KOMI</th>
                        <th style="padding-bottom: 8px;">HANDI</th>
                        <th style="padding-bottom: 8px;">TOT</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid rgba(0,0,0,0.1);">
                        <td style="padding: 10px 0;">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #555, #000); box-shadow: 1px 1px 3px rgba(0,0,0,0.4); margin: 0 auto;"></div>
                        </td>
                        <td style="font-weight: 700; font-size: 1.1rem;">${b.area[0]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.territory[0]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.captures[0]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.deadStones ? b.deadStones[0] : '-'}</td>
                        <td style="color: #6b7280; font-weight: 500;">-</td>
                        <td style="color: #6b7280; font-weight: 500;">-</td>
                        <td style="font-weight: 700; font-size: 1.1rem;">${bTotal}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0;">
                            <div style="width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff, #ddd); box-shadow: 1px 1px 3px rgba(0,0,0,0.3); border: 1px solid #ccc; margin: 0 auto;"></div>
                        </td>
                        <td style="font-weight: 700; font-size: 1.1rem;">${b.area[1]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.territory[1]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.captures[1]}</td>
                        <td style="color: #6b7280; font-weight: 500;">${b.deadStones ? b.deadStones[1] : '-'}</td>
                        <td style="color: #6b7280; font-weight: 500;">${komi}</td>
                        <td style="color: #6b7280; font-weight: 500;">${handicap}</td>
                        <td style="font-weight: 700; font-size: 1.1rem;">${wTotal}</td>
                    </tr>
                </tbody>
            </table>
        `;

        if (aiDeadMap) {
            panel.innerHTML += `
                <div style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #10b981;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <span style="font-size: 0.85rem; font-weight: 600;">100% AI Accuracy Applied</span>
                </div>
            `;
        } else if (aiError) {
            panel.innerHTML += `
                <div style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #ef4444;">
                    <span style="font-size: 0.85rem; font-weight: 600;">AI Failed (Using JS Fallback): ${aiError}</span>
                </div>
            `;
        } else {
            panel.innerHTML += `
                <div style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #f59e0b;">
                    <span style="font-size: 0.85rem; font-weight: 600;">AI Unavailable (Using JS Fallback)</span>
                </div>
            `;
        }
        
        // ── Computational Method (Japanese Territory Rules) ──
        // Always rendered as the blue panel inside the yellow modal. The Run control inside it
        // is gated on Game End: before the final move the panel shows a short notice that an
        // exact score is only available at game end; on the final move the "Run / Compute >"
        // button appears. Pressing it runs the deterministic Japanese territory scorer when the
        // node carries DD/MA/TB/TW markup, or — if no endgame markup exists anywhere — prompts
        // the user to resolve dead stones in the Manual Scoring Modal before computing.
        const atFinalMove = state.currentMoveIndex === (state.sgfMoves ? state.sgfMoves.length - 1 : -1);

        panel.innerHTML += `
            <div id="computational-estimate-card" style="margin-top: 14px; background: linear-gradient(135deg, #090e52 0%, #0c1468 100%); border-radius: 12px; padding: 16px 20px; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);">
                <div style="font-weight: 700; font-size: 1.1rem; text-align: center; margin-bottom: 12px; color: #ffffff; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                    Computational Method (Japanese Territory Rules)
                </div>
                ${atFinalMove ? `
                    <div style="text-align: center;">
                        <button id="btn-run-computational-method" type="button" style="padding: 9px 20px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; background: #10b981; color: #ffffff; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4); font-family: inherit;">Run / Compute &gt;</button>
                        <div style="color: #cbd5e1; font-size: 0.75rem; margin-top: 8px;">Deterministic Japanese territory scoring from DD/MA/TB/TW endgame markup.</div>
                    </div>
                    <div id="computational-method-result" style="margin-top: 12px;"></div>
                ` : `
                    <div style="background: rgba(255, 255, 255, 0.08); padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); text-align: center;">
                        <div style="color: #93c5fd; font-weight: 700; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 6px;">Available Only Upon Game End</div>
                        <div style="color: #cbd5e1; font-size: 0.8rem; line-height: 1.4;">
                            This function is available only when the game has ended. Navigate to the final move to compute the exact Japanese territory score.
                        </div>
                    </div>
                `}
            </div>
        `;

        const runBtn = panel.querySelector('#btn-run-computational-method');
        const resultEl = panel.querySelector('#computational-method-result');

        const runComputationalMethod = () => {
            if (!resultEl) return;
            try {

            // Resolve the scoring inputs algorithmically through ONE canonical snapshot
            // (resolveScoringInputs): the saved/live Manual Scoring session wins when it
            // carries a resolution; otherwise the SGF DD/MA/TB/TW markup resolved anywhere in
            // the record (current move, move sequences, root props, raw main line) drives the
            // score. Both sources feed the identical scorer inputs, so the blue panel always
            // matches the Scoring Modal for a saved session.
            const snapshot = resolveScoringInputs();
            const markupMove = snapshot.markupMove;
            const compBoard = snapshot.board;
            const compCaptures = snapshot.captures;
            const compPositionLabel = snapshot.positionLabel;
            const compDeadStones = snapshot.deadStones;
            const compTbPoints = snapshot.tbPoints;
            const compTwPoints = snapshot.twPoints;
            const hasSgfMarkup = snapshot.hasMarkup;

            const rawBoardData = BoardEstimate.fromBoard(compBoard);
            const bHeight = rawBoardData.length;
            const bWidth = bHeight > 0 ? rawBoardData[0].length : 0;
            const totalIntersections = bHeight * bWidth;

            // No-Markup Gate: without DD/MA/TB/TW anywhere, do NOT approximate. Warn the user
            // and direct them to the Manual Scoring Modal to mark dead stones, save, re-run.
            if (!hasSgfMarkup) {
                resultEl.innerHTML = `
                    <div id="computational-estimate-warning" style="margin-top: 2px; background: linear-gradient(135deg, #78350f 0%, #92400e 100%); border-radius: 12px; padding: 16px 20px; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);">
                        <div style="font-weight: 700; font-size: 1.1rem; text-align: center; margin-bottom: 12px; color: #ffffff; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                            Computational Method (Japanese Territory Rules)
                        </div>
                        <div style="background: rgba(0, 0, 0, 0.3); padding: 14px; border-radius: 8px; border: 1px solid #fbbf24; text-align: center;">
                            <div style="color: #fcd34d; font-weight: 800; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 6px;">No DD/MA/TB/TW Endgame Markup Found</div>
                            <div style="color: #fef3c7; font-size: 0.8rem; line-height: 1.4;">
                                The deterministic Japanese territory scorer requires resolved dead stones before counting. This game has no explicit endgame markup (DD/MA/TB/TW) anywhere, so no approximate score is rendered.<br><br><strong>Action Required:</strong> Mark dead stones with the X tool in the Manual Scoring Modal, then save and run again.
                            </div>
                            <button id="btn-open-manual-scoring" type="button" style="margin-top: 12px; padding: 8px 18px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: #10b981; color: #ffffff; border: 1px solid rgba(255,255,255,0.3); font-family: inherit;">Open Manual Scoring Modal</button>
                        </div>
                    </div>
                `;
                const openScoringBtn = document.getElementById('btn-open-manual-scoring');
                if (openScoringBtn) {
                    openScoringBtn.addEventListener('click', () => {
                        if (typeof window.openScoringModal === 'function') window.openScoringModal();
                    });
                }
                return;
            }

            // 2. Run deterministic Japanese Territory Scorer (Guaranteed L&D resolution)
            //    Explicit TB/TW lists are passed through so the scorer counts declared
            //    territory directly instead of running topological flood-fill.
            const compResult = BoardEstimate.evaluateJapaneseTerritory(compBoard, {
                deadStones: compDeadStones,
                tbPoints: compTbPoints,
                twPoints: compTwPoints,
                inGameCaptures: compCaptures,
                komi: snapshot.komi,
                handicap: snapshot.handicap
            });

            let lastMoveText = compPositionLabel;
            if (markupMove && markupMove.player) {
                const lastPlayer = markupMove.player === 'W' ? 'White' : 'Black';
                if (markupMove === state.sgfMoves[state.currentMoveIndex]) {
                    lastMoveText = `${lastPlayer} played move ${state.currentMoveIndex + 1}`;
                } else {
                    lastMoveText = `${lastPlayer} played move ${state.allSgfMoves.length} (endgame position)`;
                }
            }

            // Render score detail inside the blue panel
            resultEl.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; font-size: 0.82rem;">
                        <div style="background: rgba(255, 255, 255, 0.08); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                            <div style="color: #93c5fd; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px;">1. State Reconstruction (SGF Log)</div>
                            <div>Total Intersections: <strong>${totalIntersections}</strong> (${bWidth}x${bHeight})</div>
                            <div style="color: #cbd5e1; font-size: 0.78rem; margin-top: 3px;">In-Game Prisoners: B: ${compResult.bInGameCaptures} | W: ${compResult.wInGameCaptures}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.08); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                            <div style="color: #93c5fd; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px;">2. Dead Stones & Prisoners</div>
                            <div>Scrubbed Dead: B: <strong>${compResult.bDeadCount}</strong> | W: <strong>${compResult.wDeadCount}</strong> <span style="color:#94a3b8; font-size:0.7rem;">(${snapshot.provenance})</span></div>
                            <div style="color: #cbd5e1; font-size: 0.78rem; margin-top: 3px;">Total Prisoners: B: ${compResult.bPrisoners} | W: ${compResult.wPrisoners}</div>
                        </div>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.08); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 12px; font-size: 0.84rem;">
                        <div style="color: #93c5fd; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 6px;">3. Explicit Territory Counting (TB/TW Markup)</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#333; border:1px solid #aaa; margin-right:6px;"></span>Black Territory:</span>
                            <span><strong>${compResult.bTerritory} pts</strong></span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fff; margin-right:6px;"></span>White Territory:</span>
                            <span><strong>${compResult.wTerritory} pts</strong></span>
                        </div>
                        <div style="color:#cbd5e1; font-size:0.75rem; margin-top:4px;">Neutral Dame / Seki: ${compResult.dameCount} pts (Natively ignored under Japanese Rules)</div>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.06); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 12px; font-size: 0.78rem; color: #cbd5e1;">
                        <span style="color: #93c5fd; font-weight: 600;">Japanese Territory Computation:</span> Black Total = ${compResult.bTerritory} + ${compResult.bPrisoners} = <strong>${compResult.bTotal}</strong> | White Total = ${compResult.wTerritory} + ${compResult.wPrisoners} + ${snapshot.komi} = <strong>${compResult.wTotal}</strong>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0, 0, 0, 0.3); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.15);">
                        <div>
                            <div style="color: #93c5fd; font-weight: 600; font-size: 0.75rem; text-transform: uppercase;">4 & 5. Final Territory Output</div>
                            <div style="color: #e2e8f0; font-size: 0.78rem; margin-top: 2px;">
                                ${lastMoveText ? `${lastMoveText} | ` : ''}Japanese Territory Rules
                            </div>
                        </div>
                        <div style="background: #10b981; color: #ffffff; padding: 6px 16px; border-radius: 8px; font-weight: 800; font-size: 1.15rem; box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4); border: 1px solid rgba(255, 255, 255, 0.3); letter-spacing: 0.03em;">
                            ${compResult.resultStr}
                        </div>
                    </div>
            `;
            } catch (err) {
                console.error('Computational Method failed', err);
                if (resultEl) {
                    resultEl.innerHTML = `
                        <div style="background: rgba(0, 0, 0, 0.3); padding: 14px; border-radius: 8px; border: 1px solid #f87171; text-align: center;">
                            <div style="color: #fca5a5; font-weight: 800; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 6px;">Computational Method Error</div>
                            <div style="color: #fecaca; font-size: 0.8rem; line-height: 1.4;">${String(err && err.message ? err.message : err)}</div>
                        </div>
                    `;
                }
            }
        };

        if (runBtn) {
            runBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                runComputationalMethod();
            });
        }

        // Append to body directly for global popup behavior
        document.body.appendChild(panel);
        
        // Animate bounce down
        requestAnimationFrame(() => {
            panel.style.top = '20px';
        });
        
        const closePanel = () => {
            const existingPanel = document.getElementById('estimate-rich-panel');
            if (existingPanel) existingPanel.remove();
            document.removeEventListener('click', outsideClickListener);
            // Note: Keep state.estimateMap intact so board visualization remains active on the canvas!
            // Visualization is only cleared when pressing the Estimate button again or navigating to another move.
        };

        const outsideClickListener = (e) => {
            if (!panel.contains(e.target)) {
                closePanel();
            }
        };

        setTimeout(() => {
            document.addEventListener('click', outsideClickListener);
        }, 10);

        const closeBtn = panel.querySelector('#close-estimate-panel');
        if (closeBtn) {
            closeBtn.style.pointerEvents = 'auto';
            closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#1f2937');
            closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#9ca3af');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closePanel();
            });
        }
        
        drawBoard();
    };
    
    const applyAnnotations = (anns) => {
        if (!anns) return;
        anns.forEach(a => {
            if (a.r >= 0 && a.r < 19 && a.c >= 0 && a.c < 19) {
                if (a.type === 'label') {
                    state.board[a.r][a.c].label = a.label;
                } else {
                    state.board[a.r][a.c].annotation = a.type;
                }
            }
        });
    };
    
    if (state.currentMoveIndex === -1) {
        applyAnnotations(state.baselineAnnotations);
    } else if (state.currentMoveIndex >= 0 && state.currentMoveIndex < state.sgfMoves.length) {
        applyAnnotations(state.sgfMoves[state.currentMoveIndex].annotations);
    }
    
    drawBoard();
    
    // Smart auto-reset for Letter and Number annotations based on currently visible board state
    let highestCode = 64; // before 'A'
    let highestNum = 0;
    
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const cell = state.board[r][c];
            if (cell.label) {
                if (cell.label.length === 1) {
                    const code = cell.label.toUpperCase().charCodeAt(0);
                    if (code >= 65 && code <= 90) {
                        if (code > highestCode) highestCode = code;
                    }
                }
                const num = parseInt(cell.label, 10);
                if (!isNaN(num) && num.toString() === cell.label) {
                    if (num > highestNum) highestNum = num;
                }
            }
        }
    }
    
    state.customLetter = String.fromCharCode(Math.min(90, highestCode + 1));
    state.customNumber = Math.min(99, highestNum + 1);
    
    if (elements.customLetterInput) elements.customLetterInput.value = state.customLetter;
    if (elements.toolLetterPreview) elements.toolLetterPreview.textContent = state.customLetter.toLowerCase();
    
    if (elements.customNumberInput) elements.customNumberInput.value = state.customNumber;
    if (elements.toolNumberPreview) elements.toolNumberPreview.textContent = state.customNumber;
    if (window.updateResetBtnVisibility) window.updateResetBtnVisibility();

    updateCropBadge();
    updateReplicationCode();
    updateCommentUI();
    updatePlayerHighlightUI();
    updateCapturesUI(isSingleStepForward);
    updateVariationUI();
    updatePhaseBar();
    
    if (state._scoringResume) {
        state._scoringResume = false;
    } else if (typeof checkAndShowGameEndPopup === 'function') {
        checkAndShowGameEndPopup();
    }
    updateEndgameScoringUI();
}

function updateCapturesUI(isSingleStepForward) {
    const cbBox = document.getElementById('capture-container-b');
    const cwBox = document.getElementById('capture-container-w');
    const cbTot = document.getElementById('capture-total-b');
    const cwTot = document.getElementById('capture-total-w');
    const cbCur = document.getElementById('capture-curr-b');
    const cwCur = document.getElementById('capture-curr-w');
    
    if (!cbBox || !cwBox || !state.captures) return;
    
    const p = state.captures.lastPlayer;
    const c = state.captures.lastCaptured;
    
    if (isSingleStepForward && c > 0 && p) {
        // Show "before" total + green increment
        if (p === 'B') {
            cbTot.textContent = state.captures.B_before || 0;
            cbCur.textContent = `+${c}`;
            cbCur.style.opacity = '1';
            if (state.captureToggleB !== false) cbBox.style.transform = 'translateY(0%)';
        } else {
            cwTot.textContent = state.captures.W_before || 0;
            cwCur.textContent = `+${c}`;
            cwCur.style.opacity = '1';
            if (state.captureToggleW !== false) cwBox.style.transform = 'translateY(0%)';
        }
        
        // Auto-hide after 3s: update total to final, then fade +N and hide
        if (state.autoHideCaptureTimer) clearTimeout(state.autoHideCaptureTimer);
        state.autoHideCaptureTimer = setTimeout(() => {
            cbTot.textContent = state.captures.B || 0;
            cwTot.textContent = state.captures.W || 0;
            cbCur.style.opacity = '0';
            cwCur.style.opacity = '0';
            if (state.captureToggleB !== true) cbBox.style.transform = 'translateY(-100%)';
            if (state.captureToggleW !== true) cwBox.style.transform = 'translateY(-100%)';
        }, 3000);
    } else {
        cbTot.textContent = state.captures.B || 0;
        cwTot.textContent = state.captures.W || 0;
        if (state.captureToggleB !== true) cbBox.style.transform = 'translateY(-100%)';
        if (state.captureToggleW !== true) cwBox.style.transform = 'translateY(-100%)';
        cbCur.style.opacity = '0';
        cwCur.style.opacity = '0';
    }
    
    updateCaptureStoneBadges();
    generateAutoSgfText();
}

function updateCaptureStoneBadges() {
    var banner = document.getElementById('study-player-term-banner');
    if (!banner || !state.captures) return;
    var topRow = banner.firstElementChild;
    if (!topRow) return;
    
    // Determine current player to play (absolute-index-aware)
    var activePlayer = 'B';
    if (state.currentMoveIndex >= 0) {
        var absIdx = (state.filterStart || 1) - 1 + state.currentMoveIndex;
        var nextAbsIdx = absIdx + 1;
        if (state.allSgfMoves && nextAbsIdx < state.allSgfMoves.length) {
            activePlayer = state.allSgfMoves[nextAbsIdx].player;
        } else if (state.sgfMoves && state.currentMoveIndex + 1 < state.sgfMoves.length) {
            activePlayer = state.sgfMoves[state.currentMoveIndex + 1].player;
        } else if (state.sgfMoves && state.sgfMoves[state.currentMoveIndex]) {
            activePlayer = state.sgfMoves[state.currentMoveIndex].player === 'B' ? 'W' : 'B';
        }
    } else if (state.sgfMoves && state.sgfMoves.length > 0) {
        activePlayer = state.plColor || state.sgfMoves[0].player;
    }
    var isBlackTurn = activePlayer === 'B';
    var captureCount = isBlackTurn ? state.captures.B : state.captures.W;
    
    var badge = document.getElementById('study-stone-badge');
    if (captureCount > 0) {
        var stoneImg = isBlackTurn ? '_img-svg/wte-1.png' : '_img-svg/blk-1.png';
        var textColor = isBlackTurn ? '#1a1a1a' : '#ffffff';
        var newText = String(captureCount);
        var baseTransform = 'translateY(-50%)';
        
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'study-stone-badge';
            badge.style.cssText = 'position:absolute;top:15%;right:10px;width:24px;height:24px;border-radius:50%;background-size:100%;background-position:center;background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;z-index:20;border:2px solid rgb(255,255,255);font-size:10px;font-weight:bold;line-height:1;font-family:sans-serif;pointer-events:none;';
            badge.style.transform = baseTransform + ' perspective(400px) rotateX(0deg)';
            topRow.appendChild(badge);
            badge.style.backgroundImage = 'url("' + stoneImg + '")';
            badge.textContent = newText;
            badge.style.color = textColor;
            
            // Appear with vertical flip
            badge.style.transition = 'none';
            badge.style.transform = baseTransform + ' perspective(400px) rotateX(90deg) scale(0.6)';
            badge.style.display = 'flex';
            requestAnimationFrame(function() {
                badge.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                badge.style.transform = baseTransform + ' perspective(400px) rotateX(0deg) scale(1)';
            });
        } else {
            var oldImg = badge.style.backgroundImage || '';
            var oldText = badge.textContent || '';
            var contentChanged = !oldImg.includes(stoneImg) || oldText !== newText;
            
            if (contentChanged) {
                // Flip out vertically
                badge.style.transition = 'transform 0.12s ease-in';
                badge.style.transform = baseTransform + ' perspective(400px) rotateX(90deg) scale(0.6)';
                
                var badgeRef = badge;
                setTimeout(function() {
                    // Update content mid-flip
                    badgeRef.style.backgroundImage = 'url("' + stoneImg + '")';
                    badgeRef.textContent = newText;
                    badgeRef.style.color = textColor;
                    // Flip back
                    badgeRef.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    badgeRef.style.transform = baseTransform + ' perspective(400px) rotateX(0deg) scale(1)';
                }, 120);
            } else {
                badge.style.display = 'flex';
            }
        }
    } else if (badge) {
        // Flip out then hide
        badge.style.transition = 'transform 0.12s ease-in';
        badge.style.transform = 'translateY(-50%) perspective(400px) rotateX(90deg) scale(0.6)';
        setTimeout(function() {
            if (badge && badge.parentNode) badge.style.display = 'none';
            badge.style.transform = 'translateY(-50%) perspective(400px) rotateX(0deg) scale(1)';
        }, 120);
    }
}

function toggleCaptureBox(player) {
    const box = document.getElementById(`capture-container-${player.toLowerCase()}`);
    if (!box) return;
    
    const isB = player === 'B';
    const currentState = isB ? state.captureToggleB : state.captureToggleW;
    const isCurrentlyVisible = box.style.transform === 'translateY(0%)';
    
    if (isCurrentlyVisible && currentState !== false) {
        box.style.transform = 'translateY(-100%)';
        if (isB) state.captureToggleB = false; else state.captureToggleW = false;
    } else {
        box.style.transform = 'translateY(0%)';
        if (isB) state.captureToggleB = true; else state.captureToggleW = true;
    }
}

function updatePlayerHighlightUI() {
    try {
        const metaTurnStone = document.getElementById('meta-turn-stone');
        const metaBSection = document.getElementById('meta-b-section');
        const metaWSection = document.getElementById('meta-w-section');
        const metaBName = document.getElementById('meta-b-name');
        const metaWName = document.getElementById('meta-w-name');
        const metaBRank = document.getElementById('meta-b-rank');
        const metaWRank = document.getElementById('meta-w-rank');
        const toggleB = document.getElementById('toggle-capture-b');
        const toggleW = document.getElementById('toggle-capture-w');
        
        const absIdx = (state.filterStart || 1) - 1 + state.currentMoveIndex;
        
        let activePlayer = 'B';
        if (state.currentMoveIndex >= 0) {
            const nextAbsIdx = absIdx + 1;
            if (state.allSgfMoves && nextAbsIdx < state.allSgfMoves.length) {
                activePlayer = state.allSgfMoves[nextAbsIdx].player;
            } else if (state.sgfMoves && state.currentMoveIndex + 1 < state.sgfMoves.length) {
                activePlayer = state.sgfMoves[state.currentMoveIndex + 1].player;
            } else if (state.sgfMoves && state.sgfMoves[state.currentMoveIndex]) {
                activePlayer = state.sgfMoves[state.currentMoveIndex].player === 'B' ? 'W' : 'B';
            }
        } else if (state.sgfMoves && state.sgfMoves.length > 0) {
            activePlayer = state.plColor || state.sgfMoves[0].player;
        }
        
        if (metaTurnStone) {
            const nextNum = absIdx + 2;
            const newClass = activePlayer === 'B' ? 'stone-black-css' : 'stone-white-css';
            const isChanging = !metaTurnStone.classList.contains(newClass);
            
            // Cancel any pending animation timeout so stale writes don't land
            if (state._turnAnimTimer) { clearTimeout(state._turnAnimTimer); state._turnAnimTimer = null; }
            
            if (isChanging) {
                metaTurnStone.style.transition = 'transform 0.15s cubic-bezier(0.4, 0.0, 0.2, 1)';
                metaTurnStone.style.transform = 'translate(-50%, -50%) perspective(400px) rotateY(90deg) scale(0.8)';
                
                state._turnAnimTimer = setTimeout(() => {
                    if (state.currentMoveIndex !== state._turnAnimIdx) return;
                    metaTurnStone.className = newClass;
                    metaTurnStone.textContent = nextNum.toString();
                    metaTurnStone.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    metaTurnStone.style.transform = 'translate(-50%, -50%) perspective(400px) rotateY(0deg) scale(1)';
                }, 150);
                state._turnAnimIdx = state.currentMoveIndex;
            } else {
                metaTurnStone.className = newClass;
                metaTurnStone.textContent = nextNum.toString();
                metaTurnStone.style.transform = 'translate(-50%, -50%) perspective(400px) rotateY(0deg) scale(1)';
            }
        }

        const metaContainer = document.getElementById('sgf-meta-container');
        const isBlackLeft = !state.isPovFlipped;

        if (metaContainer) {
            metaContainer.style.borderColor = 'transparent';
            if (activePlayer === 'B') {
                metaContainer.style.background = isBlackLeft
                    ? `linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(90deg, #fed3ab 0%, #fed3ab 40%, rgba(0,0,0,0.06) 60%, rgba(0,0,0,0.06) 100%) border-box`
                    : `linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 40%, #fed3ab 60%, #fed3ab 100%) border-box`;
            } else {
                metaContainer.style.background = isBlackLeft
                    ? `linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 40%, #b3cdfc 60%, #b3cdfc 100%) border-box`
                    : `linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(90deg, #b3cdfc 0%, #b3cdfc 40%, rgba(0,0,0,0.06) 60%, rgba(0,0,0,0.06) 100%) border-box`;
            }
        }

        if (activePlayer === 'B') {
            const bGradNormal = `linear-gradient(90deg, #fdf1e7 0%, rgba(253, 241, 231, 0) 50%), radial-gradient(circle at 100% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`;
            const bGradFlipped = `linear-gradient(270deg, #fdf1e7 0%, rgba(253, 241, 231, 0) 50%), radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`;
            if (metaBSection) {
                metaBSection.style.background = isBlackLeft ? bGradNormal : bGradFlipped;
                metaBSection.style.opacity = '1';
                metaBSection.style.color = '#000000';
                metaBSection.style.border = 'none';
            }
            if (metaBName) { metaBName.style.fontWeight = '700'; metaBName.style.textShadow = '0px 0px 3px rgba(255, 255, 255, 0.6)'; }
            if (metaBRank) { metaBRank.style.color = '#BE4904'; metaBRank.style.opacity = '1'; metaBRank.style.fontWeight = '700'; }
            if (toggleB) { toggleB.style.color = '#BE4904'; toggleB.style.opacity = '1'; }

            if (metaWSection) {
                metaWSection.style.background = 'none';
                metaWSection.style.opacity = '1';
                metaWSection.style.color = '#9ca3af';
                metaWSection.style.border = 'none';
            }
            if (metaWName) { metaWName.style.fontWeight = '400'; metaWName.style.textShadow = ''; }
            if (metaWRank) { metaWRank.style.color = '#9ca3af'; metaWRank.style.opacity = '1'; metaWRank.style.fontWeight = '400'; }
            if (toggleW) { toggleW.style.color = '#9ca3af'; toggleW.style.opacity = '0.5'; }
        } else {
            const wGradNormal = `linear-gradient(270deg, rgba(208, 224, 252, 0.85) 0%, rgba(208, 224, 252, 0) 50%), radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #e3eefe 15%, #e3eefe 18%, #d1e4fe 19%, #d1e4fe 22%, #c1d8fe 23%, #c1d8fe 26%, #a0c1fa 27%, #a0c1fa 100%)`;
            const wGradFlipped = `linear-gradient(90deg, rgba(208, 224, 252, 0.85) 0%, rgba(208, 224, 252, 0) 50%), radial-gradient(circle at 100% 50%, #ffffff 0%, #ffffff 14%, #e3eefe 15%, #e3eefe 18%, #d1e4fe 19%, #d1e4fe 22%, #c1d8fe 23%, #c1d8fe 26%, #a0c1fa 27%, #a0c1fa 100%)`;
            if (metaWSection) {
                metaWSection.style.background = isBlackLeft ? wGradNormal : wGradFlipped;
                metaWSection.style.opacity = '1';
                metaWSection.style.color = '#ffffff';
                metaWSection.style.border = 'none';
            }
            if (metaWName) { metaWName.style.fontWeight = '700'; metaWName.style.textShadow = '0px 0px 3px rgba(0, 0, 0, 0.3)'; }
            if (metaWRank) { metaWRank.style.color = '#101389'; metaWRank.style.opacity = '1'; metaWRank.style.fontWeight = '700'; }
            if (toggleW) { toggleW.style.color = '#101389'; toggleW.style.opacity = '1'; }

            if (metaBSection) {
                metaBSection.style.background = 'none';
                metaBSection.style.opacity = '1';
                metaBSection.style.color = '#9ca3af';
                metaBSection.style.border = 'none';
            }
            if (metaBName) { metaBName.style.fontWeight = '400'; metaBName.style.textShadow = ''; }
            if (metaBRank) { metaBRank.style.color = '#9ca3af'; metaBRank.style.opacity = '1'; metaBRank.style.fontWeight = '400'; }
            if (toggleB) { toggleB.style.color = '#9ca3af'; toggleB.style.opacity = '0.5'; }
        }

        // --- Study Mode Player Term Banner ---
        const studyBanner = document.getElementById('study-player-term-banner');
        if (studyBanner) {
            if (!document.body.classList.contains('study-mode-active')) {
                studyBanner.style.setProperty('display', 'none', 'important');
            } else {
                studyBanner.style.setProperty('display', 'flex', 'important');
                
                const toPlayBg = document.getElementById('study-toplay-bar');
                const toPlayStone = document.getElementById('study-toplay-stone');
                const toPlayName = document.getElementById('study-toplay-name-text');
                const toPlayRank = document.getElementById('study-toplay-rank');
                
                if (toPlayBg && toPlayStone && toPlayName && toPlayRank) {
                    const isBlack = (activePlayer === 'B');
                    const bName = (state.sgfMetadata && state.sgfMetadata.pb) ? state.sgfMetadata.pb : 'Black';
                    const wName = (state.sgfMetadata && state.sgfMetadata.pw) ? state.sgfMetadata.pw : 'White';
                    const bRank = (state.sgfMetadata && state.sgfMetadata.br) ? `(${state.sgfMetadata.br})` : '';
                    const wRank = (state.sgfMetadata && state.sgfMetadata.wr) ? `(${state.sgfMetadata.wr})` : '';
                    
                    const nameStr = isBlack ? bName : wName;
                    const rankStr = isBlack ? bRank : wRank;
                    
                    let formattedNameStr = nameStr;
                    if (formattedNameStr) {
                        let parts = formattedNameStr.trim().split(/\s+/);
                        if (parts.length > 1) {
                            let lastWord = parts[parts.length - 1];
                            let firstLetter = parts[0].charAt(0).toUpperCase();
                            formattedNameStr = `${lastWord}, ${firstLetter}.`;
                        }
                    }
                    
                    toPlayName.textContent = formattedNameStr;
                    toPlayRank.textContent = rankStr;
                    
                    // Colors
                    const barBg = isBlack ? '#FFD101' : '#101389';
                    const playerColor = isBlack ? '#000000' : '#faf7ef';
                    const stoneImg = isBlack ? '_img-svg/blk-1.png' : '_img-svg/wte-1.png';
                    const stoneTextColor = isBlack ? '#ffffff' : '#000000';
                    const stoneTextShadow = isBlack ? '0 1px 2px rgba(0,0,0,0.8)' : 'none';
                    
                    const newStoneImg = `url('${stoneImg}')`;
                    const isChanging = toPlayStone.style.backgroundImage && !toPlayStone.style.backgroundImage.includes(stoneImg);
                    
                    // Move number (absolute)
                    let nextMoveNum = 1;
                    if (state.currentMoveIndex >= 0) {
                        const aidx = (state.filterStart || 1) - 1 + state.currentMoveIndex;
                        nextMoveNum = aidx + 2;
                    } else if (state.sgfMoves && state.sgfMoves.length > 0) {
                        const aidx = (state.filterStart || 1) - 1;
                        nextMoveNum = aidx + 1;
                    }
                    
                    if (state._studyAnimTimer) { clearTimeout(state._studyAnimTimer); state._studyAnimTimer = null; }
                    
                    if (isChanging) {
                        toPlayStone.style.transition = 'transform 0.15s cubic-bezier(0.4, 0.0, 0.2, 1)';
                        toPlayStone.style.transform = 'perspective(400px) rotateY(90deg) scale(0.8)';
                        
                        state._studyAnimTimer = setTimeout(() => {
                            if (state.currentMoveIndex !== state._studyAnimIdx) return;
                            toPlayBg.style.backgroundColor = barBg;
                            toPlayName.style.color = playerColor;
                            toPlayRank.style.color = playerColor;
                            
                            toPlayStone.style.backgroundImage = newStoneImg;
                            toPlayStone.style.color = stoneTextColor;
                            toPlayStone.style.textShadow = stoneTextShadow;
                            toPlayStone.textContent = nextMoveNum;
                            
                            toPlayStone.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                            toPlayStone.style.transform = 'perspective(400px) rotateY(0deg) scale(1)';
                        }, 150);
                        state._studyAnimIdx = state.currentMoveIndex;
                    } else {
                        toPlayBg.style.backgroundColor = barBg;
                        toPlayName.style.color = playerColor;
                        toPlayRank.style.color = playerColor;
                        
                        toPlayStone.style.backgroundImage = newStoneImg;
                        toPlayStone.style.color = stoneTextColor;
                        toPlayStone.style.textShadow = stoneTextShadow;
                        toPlayStone.textContent = nextMoveNum;
                        
                        toPlayStone.style.transform = 'perspective(400px) rotateY(0deg) scale(1)';
                    }
                }

                if (typeof window.refreshMoveTermBadge === 'function') {
                    window.refreshMoveTermBadge();
                }
            }
        }
    } catch (e) {
        console.error("Error in updatePlayerHighlightUI:", e);
    }
}

function toggleAutoPlay() {
    if (state.autoPlayTimer) {
        clearInterval(state.autoPlayTimer);
        state.autoPlayTimer = null;
        if (elements.btnAutoplay) {
            elements.btnAutoplay.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Play`;
            elements.btnAutoplay.style.backgroundColor = 'var(--success)';
            elements.btnAutoplay.style.borderColor = 'var(--success)';
            elements.btnAutoplay.style.color = 'white';
        }
    } else {
        let delay = 1000;
        if (elements.autoplayCustomSec && elements.autoplayCustomSec.value) {
            const parsed = parseFloat(elements.autoplayCustomSec.value);
            if (!isNaN(parsed) && parsed > 0) delay = parsed * 1000;
        }
        
        state.autoPlayTimer = setInterval(() => {
            if (state.currentMoveIndex < state.sgfMoves.length - 1) {
                goToMove(state.currentMoveIndex + 1);
            } else {
                toggleAutoPlay();
            }
        }, delay);
        
        if (elements.btnAutoplay) {
            elements.btnAutoplay.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>Pause`;
            elements.btnAutoplay.style.backgroundColor = '#8b1a1a';
            elements.btnAutoplay.style.borderColor = '#8b1a1a';
            elements.btnAutoplay.style.color = 'white';
        }
    }
}

function loadSGF(sgfString) {
    if (!sgfString || typeof sgfString !== 'string') return;
    saveHistoryState('load-sgf');

    state.board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({
        player: null,
        annotation: null,
        label: null
    })));

    state.allSgfMoves = [];
    state.sgfMoves = [];
    state.setupBoard = null;
    state.annotLastStone = null;
    state.currentMoveIndex = -1;
    state.isSgfDirty = false;
    state.baselineComment = '';
    state.baselineAnnotations = [];
    state.baselineUnknownProps = null;
    state.sgfMetadata = {};
    state.sgfRootProps = null;
    state.sgfTree = null;
    state.rawSgf = sgfString;
    state.plColor = null;
    state.boardWidth = 19;
    state.boardHeight = 19;
    state.variationData = { branchPoints: [], currentBranchPath: [0] };
    state.currentVariation = 0;
    if (elements.sgfExportContainer) elements.sgfExportContainer.style.display = 'none';
    if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
    if (elements.sgfExtractedWrapper) elements.sgfExtractedWrapper.style.display = 'none';

    const replayerSec = document.getElementById('replayer-section');
    if (replayerSec) replayerSec.style.display = 'block';

    // Expand SGF REPLAYER by default, collapse SGF Importer
    const replayerContent = document.getElementById('sgf-replayer-content');
    const replayerChevron = document.getElementById('sgf-replayer-chevron');
    if (replayerContent) replayerContent.style.display = 'flex';
    if (replayerChevron) replayerChevron.style.transform = 'rotate(180deg)';
    const importerContent = document.getElementById('sgf-tools-content');
    const importerChevron = document.getElementById('sgf-tools-chevron');
    if (importerContent) importerContent.style.display = 'none';
    if (importerChevron) importerChevron.style.transform = 'rotate(0deg)';

    if (state.autoPlayTimer) {
        clearInterval(state.autoPlayTimer);
        state.autoPlayTimer = null;
        if (elements.btnAutoplay) {
            elements.btnAutoplay.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Play`;
            elements.btnAutoplay.style.backgroundColor = 'var(--success)';
            elements.btnAutoplay.style.borderColor = 'var(--success)';
            elements.btnAutoplay.style.color = 'white';
        }
    }

    const tree = SgfEngine.parseSgf(sgfString);
    if (!tree || tree.nodes.length === 0) {
        console.error('Invalid SGF');
        return;
    }

    state.sgfTree = SgfEngine.cloneTree(tree);

    const rootNode = state.sgfTree.nodes[0];
    const rootProps = rootNode.properties;

    const boardSize = SgfEngine.parseBoardSize(rootProps.SZ);
    state.boardWidth = boardSize.width;
    state.boardHeight = boardSize.height;
    if (state.boardWidth !== 19 || state.boardHeight !== 19) {
        console.warn('SGF board size is ' + state.boardWidth + 'x' + state.boardHeight + '; UI displays 19x19. Coordinates outside range are ignored.');
    }

    const bw = Math.min(state.boardWidth, 19);
    const bh = Math.min(state.boardHeight, 19);

    SgfEngine.applySetupProperties(state.board, rootProps, bw, bh);

    state.setupBoard = JSON.parse(JSON.stringify(state.board));
    state.baselineBoard = JSON.parse(JSON.stringify(state.board));

    if (rootProps.PL && rootProps.PL.length > 0) {
        state.plColor = rootProps.PL[0];
    }

    if (rootProps.C && rootProps.C.length > 0) {
        state.baselineComment = rootProps.C[0];
    }

    const { annotations: rootAnnotations, territory: rootTerritory } = SgfEngine.parseMarkupProperties(rootProps, bw, bh);
    state.baselineAnnotations = rootAnnotations;
    state.baselineTerritory = rootTerritory;
    state.baselineUnknownProps = SgfEngine.extractUnknownProperties(rootProps);

    const mainLine = SgfEngine.extractMainLine(state.sgfTree);
    const branchPoints = [];

    {
        let moveIdx = 0;
        let currentTree = state.sgfTree;
        const branchPath = [0];
        while (currentTree) {
            const contributingNodes = currentTree.nodes.filter(n => n.properties.B || n.properties.W).length;
            if (currentTree.children && currentTree.children.length > 1) {
                const variants = currentTree.children.map((child, ci) => {
                    let label = '';
                    for (const n of child.nodes) {
                        if (n.properties.N && n.properties.N[0]) { label = n.properties.N[0]; break; }
                    }
                    return { label: label || `Variation ${ci + 1}`, treeIndex: ci };
                });
                branchPoints.push({ moveIndex: moveIdx + contributingNodes, variants, current: 0 });
            }
            moveIdx += contributingNodes;
            if (currentTree.children && currentTree.children.length > 0) {
                currentTree = currentTree.children[0];
            } else {
                currentTree = null;
            }
        }
    }
    state.variationData = { branchPoints, currentBranchPath: [0] };

    mainLine.forEach((props, index) => {
        const isRootOnly = index === 0 && state.sgfTree.nodes[0] === mainLine[0] && !props.B && !props.W;
        if (isRootOnly) return;

        const setupPresent = !!(props.AB || props.AW || props.AE || props.PL);
        if (setupPresent && !props.B && !props.W) {
            console.warn('SGF: Setup node in main line (move ' + index + ') — setup mid-game is noted but not replayed.');
        }

        if (props.B || props.W) {
            const color = props.B ? 'B' : 'W';
            const coordStr = props[color][0];
            const pt = SgfEngine.parseGoPoint(coordStr, bw, bh);
            if (!pt) return;

            const comment = props.C ? props.C[0] : '';
            const { annotations, territory } = SgfEngine.parseMarkupProperties(props, bw, bh);
            const unknownProps = SgfEngine.extractUnknownProperties(props);

            let moveAnnotation = null;
            if (props.TE) moveAnnotation = { type: 'TE', value: props.TE[0] || '1' };
            else if (props.BM) moveAnnotation = { type: 'BM', value: props.BM[0] || '1' };
            else if (props.DO) moveAnnotation = { type: 'DO', value: null };
            else if (props.IT) moveAnnotation = { type: 'IT', value: null };

            let nodeAnnotation = null;
            if (props.GB) nodeAnnotation = { type: 'GB', value: props.GB[0] || '1' };
            else if (props.GW) nodeAnnotation = { type: 'GW', value: props.GW[0] || '1' };
            else if (props.DM) nodeAnnotation = { type: 'DM', value: props.DM[0] || '1' };
            else if (props.UC) nodeAnnotation = { type: 'UC', value: props.UC[0] || '1' };

            const nodeName = props.N ? props.N[0] : '';
            const moveNumber = props.MN ? parseInt(props.MN[0], 10) : null;

            state.allSgfMoves.push({
                player: color,
                c: pt.isPass ? -1 : pt.c,
                r: pt.isPass ? -1 : pt.r,
                comment,
                isPass: pt.isPass,
                annotations,
                territory,
                unknownProps,
                moveAnnotation,
                nodeAnnotation,
                nodeName,
                moveNumber,
                DD: props.DD ? props.DD.slice() : null,
                MA: props.MA ? props.MA.slice() : null,
                TB: props.TB ? props.TB.slice() : null,
                TW: props.TW ? props.TW.slice() : null,
                sgfNode: props
            });
        }
    });

    // A terminal node that carries only endgame markup (DD/MA/TB/TW, no B/W move) is not a
    // move and is skipped above. Fold that markup onto the final move so scorers can resolve
    // Life & Death for the end position instead of halting for "missing" markup.
    // Algorithmic scan: only annotation-only nodes that appear STRICTLY AFTER the last move
    // node are terminal markup candidates, so no arbitrary trailing-window limit is needed and
    // mid-game markup is never folded onto the final move. Moves already carry their own props.
    if (state.allSgfMoves.length > 0) {
        const lastMove = state.allSgfMoves[state.allSgfMoves.length - 1];
        let lastMoveNodeIndex = -1;
        for (let i = mainLine.length - 1; i >= 0; i--) {
            if (mainLine[i] && (mainLine[i].B || mainLine[i].W)) {
                lastMoveNodeIndex = i;
                break;
            }
        }
        for (let i = mainLine.length - 1; i > lastMoveNodeIndex; i--) {
            const node = mainLine[i];
            if (node && (node.DD || node.MA || node.TB || node.TW)) {
                ['DD', 'MA', 'TB', 'TW'].forEach(tag => {
                    if (node[tag] && !lastMove[tag]) {
                        lastMove[tag] = node[tag].slice();
                    }
                });
                break;
            }
        }
    }

    const getMeta = (tag) => {
        return (rootProps[tag] && rootProps[tag].length > 0) ? rootProps[tag][0] : '';
    };

    state.sgfRootProps = rootProps;
    state.sgfMetadata = {
        pb: getMeta('PB'),
        pw: getMeta('PW'),
        br: getMeta('BR'),
        wr: getMeta('WR'),
        re: getMeta('RE'),
        dt: getMeta('DT'),
        ev: getMeta('EV'),
        pc: getMeta('PC'),
        gn: getMeta('GN'),
        km: getMeta('KM'),
        gc: getMeta('GC'),
        ru: getMeta('RU'),
        ha: getMeta('HA'),
        tm: getMeta('TM'),
        ot: getMeta('OT'),
        so: getMeta('SO'),
        an: getMeta('AN'),
        cp: getMeta('CP'),
        us: getMeta('US'),
        tb: rootProps.TB ? rootProps.TB.slice() : null,
        tw: rootProps.TW ? rootProps.TW.slice() : null,
        vw: rootProps.VW ? rootProps.VW.slice() : null
    };
    _scoringPersistData = null;

    if (state.sgfMetadata.ev.startsWith('"') && state.sgfMetadata.ev.endsWith('"')) {
        state.sgfMetadata.ev = state.sgfMetadata.ev.substring(1, state.sgfMetadata.ev.length - 1);
    }

    const subtitle = document.getElementById('header-subtitle-text');
    const metaWrapper = document.getElementById('sgf-meta-wrapper');

    if ((state.sgfMetadata.pb || state.sgfMetadata.pw) && subtitle && metaWrapper) {
        subtitle.style.display = 'none';
        metaWrapper.style.display = 'flex';
        
        document.getElementById('meta-b-name').textContent = state.sgfMetadata.pb || 'Black';
        document.getElementById('meta-b-rank').textContent = state.sgfMetadata.br ? `(${state.sgfMetadata.br})` : '';
        document.getElementById('meta-w-name').textContent = state.sgfMetadata.pw || 'White';
        document.getElementById('meta-w-rank').textContent = state.sgfMetadata.wr ? `(${state.sgfMetadata.wr})` : '';
        
        updatePlayerHighlightUI();
    } else if (subtitle && metaWrapper) {
        subtitle.style.display = 'block';
        metaWrapper.style.display = 'none';
    }

    if (elements.gameMetaPanel) {
        const formatVal = (val) => (val && val.trim() !== '' && val.trim().toLowerCase() !== 'none') ? val : '<span style="color: #9ca3af; font-style: italic;">n/a</span>';
        
        document.getElementById('info-gn-display').innerHTML = formatVal(state.sgfMetadata.gn);
        document.getElementById('info-ev-display').innerHTML = formatVal(state.sgfMetadata.ev);
        
        const blackStr = state.sgfMetadata.pb ? `${state.sgfMetadata.pb}${state.sgfMetadata.br ? ` (${state.sgfMetadata.br})` : ''}` : '';
        document.getElementById('info-pb-display').innerHTML = formatVal(blackStr);
        
        const whiteStr = state.sgfMetadata.pw ? `${state.sgfMetadata.pw}${state.sgfMetadata.wr ? ` (${state.sgfMetadata.wr})` : ''}` : '';
        document.getElementById('info-pw-display').innerHTML = formatVal(whiteStr);
        
        document.getElementById('info-re-display').innerHTML = formatVal(state.sgfMetadata.re);
        document.getElementById('info-km-display').innerHTML = formatVal(state.sgfMetadata.km);
        document.getElementById('info-moves').innerHTML = formatVal(state.allSgfMoves.length.toString());
        document.getElementById('info-dt-display').innerHTML = formatVal(state.sgfMetadata.dt);
        document.getElementById('info-pc-display').innerHTML = formatVal(state.sgfMetadata.pc);
        
        const commentToDisplay = state.baselineComment || state.sgfMetadata.gc || '';
        const commentMd = commentToDisplay ? renderMarkdown(parseCommentCoords(commentToDisplay)) : '';
        document.getElementById('info-comment-display').innerHTML = commentToDisplay ? commentMd : formatVal(commentToDisplay);
        
        elements.gameMetaPanel.style.display = 'block';
    }

    applyFilters();
    
    if (elements.sgfExportContainer) {
        if (state.isSgfDirty && state.sgfMoves && state.sgfMoves.length > 0) {
            elements.sgfExportContainer.style.display = 'flex';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
        } else {
            elements.sgfExportContainer.style.display = 'none';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
        }
    }
    
    if (elements.sgfExtractedWrapper) {
        if (state.sgfMoves && state.sgfMoves.length > 0) {
            elements.sgfExtractedWrapper.style.display = 'block';
        } else {
            elements.sgfExtractedWrapper.style.display = 'none';
        }
    }

    if (elements.sourceSgf) {
        elements.sourceSgf.checked = true;
        state.exportText.source = 'sgf';
        if (typeof updateSourceSelection !== 'undefined') {
            updateSourceSelection();
        }
    }
    
    generateAutoSgfText();
}

// Range Parser
function parseRange(rangeStr) {
    rangeStr = rangeStr.trim().toLowerCase().replace(/[\u2013\u2014]/g, '-');
    if (rangeStr === '0' || rangeStr === '' || rangeStr === 'all') {
        return [1, Infinity];
    }
    if (!rangeStr.includes('-')) {
        const val = parseInt(rangeStr, 10);
        if (isNaN(val)) return [1, Infinity];
        return [val, val];
    }
    const parts = rangeStr.split('-');
    const start = parts[0] ? parseInt(parts[0], 10) : 1;
    const endPart = parts[1];
    const end = (endPart && endPart !== '0') ? parseInt(endPart, 10) : Infinity;
    
    return [isNaN(start) ? 1 : start, isNaN(end) ? Infinity : end];
}

// Filter Moves by Range
function applyFilters() {
    if (!state.allSgfMoves) return;
    calculateGamePhases();
    
    // Calculate the current absolute move index before we change range filter
    const prevStart = (state.filterStart || 1) - 1;
    const currentAbsIdx = prevStart + (state.currentMoveIndex !== undefined ? state.currentMoveIndex : -1);
    const isInitialLoad = (state.filterStart === undefined);
    
    const rangeText = elements.rangeInput ? elements.rangeInput.value : 'all';
    const [start, end] = parseRange(rangeText);
    
    // Update baseline board by applying moves before the start
    state.filterStart = start;
    state.filterEnd = end;
    if (state.setupBoard) {
        state.baselineBoard = JSON.parse(JSON.stringify(state.setupBoard));
    }
    
    let prefixB = 0, prefixW = 0;
    for (let i = 0; i < start - 1 && i < state.allSgfMoves.length; i++) {
        const move = state.allSgfMoves[i];
        if (move.isPass) continue;
        if (move.r >= 0 && move.r < 19 && move.c >= 0 && move.c < 19) {
            const captured = playStoneWithCaptures(state.baselineBoard, move.r, move.c, move.player);
            if (move.player === 'B') prefixB += captured.count; else prefixW += captured.count;
        }
    }
    state.prefixCaptures = { B: prefixB, W: prefixW };
    
    // Set active moves
    state.sgfMoves = state.allSgfMoves.slice(Math.max(0, start - 1), end);
    
    // Determine target relative index in the new range
    let targetRelativeIdx = -1;
    const newStartIdx = start - 1;
    const newEndIdx = end;
    
    if (isInitialLoad) {
        targetRelativeIdx = state.sgfMoves.length > 0 ? 0 : -1;
    } else if (currentAbsIdx >= newStartIdx && currentAbsIdx < newEndIdx) {
        targetRelativeIdx = currentAbsIdx - newStartIdx;
    } else if (currentAbsIdx === newStartIdx - 1) {
        targetRelativeIdx = -1;
    } else {
        // Outside new range: default to start of new range (index 0)
        targetRelativeIdx = state.sgfMoves.length > 0 ? 0 : -1;
    }
    
    state.currentMoveIndex = targetRelativeIdx;
    goToMove(targetRelativeIdx);
    updateExtractedMoves();
    populateCommentDropdown();
    // Toggle export button based on whether SGF is dirty
    if (elements.sgfExportContainer) {
        if (state.isSgfDirty && state.sgfMoves && state.sgfMoves.length > 0) {
            elements.sgfExportContainer.style.display = 'flex';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'flex';
        } else {
            elements.sgfExportContainer.style.display = 'none';
            if (elements.btnExportSgf) elements.btnExportSgf.style.display = 'none';
        }
    }
}

function setAppMode(mode) {
    const mainApp = document.querySelector('.app-main');
    const btnCompact = document.getElementById('mode-compact');
    const btnEnlarge = document.getElementById('mode-enlarge');
    
    if (mode === 'enlarge') {
        mainApp.classList.add('enlarge-mode');
        if (btnEnlarge) btnEnlarge.classList.add('active');
        if (btnCompact) btnCompact.classList.remove('active');
    } else {
        mainApp.classList.remove('enlarge-mode');
        if (btnCompact) btnCompact.classList.add('active');
        if (btnEnlarge) btnEnlarge.classList.remove('active');
    }
    
    // Trigger board redraw with delay to allow CSS grid animation to settle
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        drawBoard();
    }, 150);
}

// Start application
document.addEventListener('DOMContentLoaded', init);

// Study Mode Logic
function setupStudyMode() {
    const btnEnter = document.getElementById('btn-enter-study-mode');
    const btnClose = document.getElementById('btn-close-study-mode');
    const overlay = document.getElementById('study-modal-overlay');
    const boardViewport = document.getElementById('study-board-viewport');
    const rightPanel = document.getElementById('study-modal-right');

    const boardCanvasWrapper = document.getElementById('board-canvas-wrapper') || document.querySelector('.board-wrapper');
    const originalBoardParent = boardCanvasWrapper ? boardCanvasWrapper.parentElement : null;
    
    const replayerWrapper = document.getElementById('sgf-replayer-wrapper');
    const originalReplayerParent = replayerWrapper ? replayerWrapper.parentElement : null;
    
    const gameMetaPanel = document.getElementById('game-meta-panel');
    const originalMetaParent = gameMetaPanel ? gameMetaPanel.parentElement : null;
    
    const exportXyzInputs = document.getElementById('export-xyz-inputs');
    const originalXyzParent = exportXyzInputs ? exportXyzInputs.parentElement : null;
    let originalXyzNextSibling = exportXyzInputs ? exportXyzInputs.nextSibling : null;

    if (!btnEnter || !btnClose) return;

    btnEnter.addEventListener('click', () => {
        if (document.body.classList.contains('study-mode-active')) {
            btnClose.click();
            return;
        }

        document.body.classList.add('study-mode-active');
        
        btnEnter.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> Exit Study Mode';
        btnEnter.style.setProperty('background', '#8b1a1a', 'important');
        btnEnter.style.setProperty('border-color', '#8b1a1a', 'important');
        btnEnter.style.setProperty('color', '#f8f5ee', 'important');
        
        let studyBanner = document.getElementById('study-player-term-banner');
        if (!studyBanner) {
            studyBanner = document.createElement('div');
            studyBanner.id = 'study-player-term-banner';
            studyBanner.style.cssText = 'display: none; flex-shrink: 0; min-height: 90px; flex-direction: column; align-items: center; position: relative; margin-top: 8px; margin-bottom: 12px; font-family: "Anthropic Sans", sans-serif;';
            studyBanner.innerHTML = `
                <!-- Top row: Player -->
                <div style="position: relative; width: 100%; height: 50px; margin-top: 15px;">
                    <!-- Color Bar -->
                    <div id="study-toplay-bar" style="position: absolute; left: 0; right: 0; top: 8px; bottom: 8px; display: flex; align-items: center; padding-left: 100px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="font-size: 24px; display: flex; align-items: baseline; gap: 8px;">
                            <span id="study-toplay-name-text" style="font-family: 'Anthropic Sans Medium', sans-serif;">Player</span>
                            <span id="study-toplay-rank" style="font-family: 'Anthropic Sans Light', sans-serif; font-size: 18px;">(9p)</span>
                        </div>
                    </div>
                    
                    <!-- Stone -->
                    <div id="study-toplay-stone" style="position: absolute; left: 15px; top: -10px; width: 70px; height: 70px; border-radius: 50%; background-size: 100%; background-position: center; background-repeat: no-repeat; background-color: transparent; display: flex; align-items: center; justify-content: center; font-family: 'Anthropic Sans Medium', sans-serif; font-size: 26px; z-index: 10; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); filter: drop-shadow(rgba(0, 0, 0, 0.15) 0px 2px 4px); transform: perspective(400px) rotateY(0deg) scale(1);">
                        1
                    </div>
                </div>

                <!-- Bottom row: Opponent Term -->
                <style>
                    @keyframes study-bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-3px); }
                    }
                    #study-opponent-term::after {
                        content: "";
                        position: absolute;
                        left: -5px;
                        top: 50%;
                        transform: translateY(-50%);
                        border-width: 5px 5px 5px 0;
                        border-style: solid;
                    }
                    #study-opponent-term.study-term-b::after { border-color: transparent #FFD101 transparent transparent; }
                    #study-opponent-term.study-term-w::after { border-color: transparent #101389 transparent transparent; }
                </style>
                <div id="study-opponent-term-container" style="margin-top: 12px; position: relative; height: 24px; visibility: hidden; width: 100%;">
                    <div style="position: absolute; left: 0; top: 0; width: 96px; height: 100%; display: flex; align-items: center; justify-content: flex-end;">
                        <span id="study-opponent-name" style="font-family: 'Anthropic Sans Bold', sans-serif; font-size: 16px; color: black;">Player:</span>
                    </div>
                    <div style="position: absolute; left: 105px; top: 50%; transform: translateY(-50%); z-index: 30; display: flex; align-items: center;">
                        <span id="study-opponent-term" style="cursor: pointer; padding: 4px 10px; border-radius: 4px; font-size: 14px; font-weight: 600; font-family: 'Anthropic Sans Medium Italic', sans-serif; display: inline-block; position: relative; max-width: 170px; line-height: 1.2; text-align: left; box-shadow: 0 2px 5px rgba(0,0,0,0.2); animation: study-bounce 2s infinite ease-in-out;">Term</span>
                    </div>
                </div>
            `;
            const rightPanelTarget = document.getElementById('study-modal-right') || document.querySelector('.right-panel');
            if (rightPanelTarget) {
                rightPanelTarget.insertBefore(studyBanner, rightPanelTarget.firstChild);
            } else {
                document.body.appendChild(studyBanner);
            }
        }

        if (studyBanner) {
            studyBanner.style.display = 'flex'; // FORCE DISPLAY
            rightPanel.insertBefore(studyBanner, rightPanel.firstChild); // FORCE TO TOP
        }
        
        if (replayerWrapper) rightPanel.appendChild(replayerWrapper);
        
        // Configure inputs with default values from state if they haven't been opened yet
        if (typeof configureModalInputs === 'function') {
            configureModalInputs();
        }

        if (gameMetaPanel) {
            rightPanel.appendChild(gameMetaPanel);
            gameMetaPanel.style.display = 'block';
        }

        const studyXyzInputs = document.getElementById('study-xyz-inputs');
        if (studyXyzInputs) {
            studyXyzInputs.style.display = 'flex';
            rightPanel.appendChild(studyXyzInputs);
        }
        
        const replayerContent = document.getElementById('sgf-replayer-content');
        if (replayerContent) replayerContent.style.display = 'flex';

        overlay.classList.remove('hidden');
        
        // Init game tree (only once)
        if (typeof GameTree !== 'undefined') {
            var gtContainer = document.getElementById('game-tree-container')
            if (gtContainer && !gtContainer._gameTreeInit) {
                gtContainer._gameTreeInit = true
                gtContainer.style.display = ''
                GameTree.init(gtContainer)
            }
        }

        // Small delay to ensure DOM updates before calculating crop
        setTimeout(() => {
            updateStudyCrop();
            updatePlayerHighlightUI(); // Trigger UI update for player banner
            window.dispatchEvent(new Event('resize'));
            if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
        }, 50);
    });

    btnClose.addEventListener('click', () => {
        document.body.classList.remove('study-mode-active');
        updatePlayerHighlightUI(); // Trigger UI update to hide player banner
        
        if (btnEnter) {
            btnEnter.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> Enter Study Mode';
            btnEnter.style.setProperty('background', 'var(--success)', 'important');
            btnEnter.style.setProperty('border-color', 'var(--success)', 'important');
            btnEnter.style.setProperty('color', 'white', 'important');
        }
        
        const studyBanner = document.getElementById('study-player-term-banner');
        if (studyBanner) {
            const originalRightPanel = document.querySelector('section.right-panel');
            if (originalRightPanel) originalRightPanel.insertBefore(studyBanner, originalRightPanel.firstChild);
        }

        if (replayerWrapper && originalReplayerParent) originalReplayerParent.appendChild(replayerWrapper);
        if (gameMetaPanel && originalMetaParent) originalMetaParent.appendChild(gameMetaPanel);
        
        const studyXyzInputs = document.getElementById('study-xyz-inputs');
        if (studyXyzInputs) {
            studyXyzInputs.style.display = 'none';
        }

        const canvas = document.getElementById('go-board-canvas-initial');
        if (canvas) {
            canvas.style.width = '';
            canvas.style.maxWidth = '';
            canvas.style.height = '';
            canvas.style.maxHeight = '';
        }

        boardViewport.style.width = 'auto';
        boardViewport.style.height = 'auto';
        boardViewport.style.transform = 'none';
        
        // Remove padding added by updateStudyCrop
        boardViewport.style.paddingLeft = '';
        boardViewport.style.paddingRight = '';
        boardViewport.style.paddingTop = '';
        boardViewport.style.paddingBottom = '';
        boardViewport.style.boxSizing = '';

        overlay.classList.add('hidden');
        
        drawBoard();
        window.dispatchEvent(new Event('resize'));
        if (typeof applyCustomPanelState === 'function') applyCustomPanelState();
    });

    // Click overlay background (exclusive of study modal) to exit study mode
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) btnClose.click();
    });

    // Bind study inputs
    const updateStudyPadding = (e, key) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        state.studyText[key] = val;
        updateStudyCrop();
    };
    const sInputY = document.getElementById('study-input-y'); if(sInputY) sInputY.addEventListener('input', (e) => updateStudyPadding(e, 'paddingY'));
    const sInputX = document.getElementById('study-input-x'); if(sInputX) sInputX.addEventListener('input', (e) => updateStudyPadding(e, 'paddingX'));
    const sInputZl = document.getElementById('study-input-zl'); if(sInputZl) sInputZl.addEventListener('input', (e) => updateStudyPadding(e, 'paddingZL'));
    const sInputZr = document.getElementById('study-input-zr'); if(sInputZr) sInputZr.addEventListener('input', (e) => updateStudyPadding(e, 'paddingZR'));
    const sInputDia = document.getElementById('study-input-dia-size'); if(sInputDia) sInputDia.addEventListener('input', (e) => updateStudyPadding(e, 'diaSize'));
    const sInputBdC = document.getElementById('study-input-board-color'); if(sInputBdC) sInputBdC.addEventListener('input', (e) => { state.studyText.boardColor = e.target.value; updateStudyCrop(); drawBoard(); });
    const sInputBordSize = document.getElementById('study-input-border-size'); if(sInputBordSize) sInputBordSize.addEventListener('input', (e) => { updateStudyPadding(e, 'borderSize'); drawBoard(); });
    const sInputBordC = document.getElementById('study-input-border-color'); if(sInputBordC) sInputBordC.addEventListener('input', (e) => { state.studyText.borderColor = e.target.value; updateStudyCrop(); drawBoard(); });
    const sInputGrid = document.getElementById('study-input-grid-size'); if(sInputGrid) sInputGrid.addEventListener('input', (e) => { state.studyText.gridSize = parseFloat(e.target.value)||1; drawBoard(); });
    const sInputGridC = document.getElementById('study-input-grid-color'); if(sInputGridC) sInputGridC.addEventListener('input', (e) => { state.studyText.gridColor = e.target.value; drawBoard(); });
    const sInputHoshi = document.getElementById('study-input-hoshi-size'); if(sInputHoshi) sInputHoshi.addEventListener('input', (e) => { state.studyText.hoshiSize = parseFloat(e.target.value)||2; drawBoard(); });
    const sInputHoshiC = document.getElementById('study-input-hoshi-color'); if(sInputHoshiC) sInputHoshiC.addEventListener('input', (e) => { state.studyText.hoshiColor = e.target.value; drawBoard(); });
}

function updateStudyCrop() {
    const boardCanvasWrapper = document.getElementById('board-canvas-wrapper-study');
    const boardViewport = document.getElementById('study-board-viewport');
    const canvas = document.getElementById('go-board-canvas-study');
    if (!boardCanvasWrapper || !boardViewport || !canvas) return;

    drawBoard();

    let y1 = parseInt(document.getElementById('study-input-y')?.value);
    if (isNaN(y1)) y1 = state.studyText.paddingY || 0;
    
    let y2 = parseInt(document.getElementById('study-input-x')?.value);
    if (isNaN(y2)) y2 = state.studyText.paddingX || 0;
    
    let zL = parseInt(document.getElementById('study-input-zl')?.value);
    if (isNaN(zL)) zL = state.studyText.paddingZL || 0;
    
    let zR = parseInt(document.getElementById('study-input-zr')?.value);
    if (isNaN(zR)) zR = state.studyText.paddingZR || 0;
    
    let scalePerc = parseInt(document.getElementById('study-input-dia-size')?.value);
    if (isNaN(scalePerc)) scalePerc = state.studyText.diaSize || 100;

    // Force canvas to its exact intrinsic pixel size so offsetWidth doesn't recursively shrink
    const studyBoardSize = (state.studyBoardStyle && state.studyBoardStyle.board && state.studyBoardStyle.board.size) || CANVAS_SIZE;
    canvas.style.width = `${studyBoardSize}px`;
    canvas.style.maxWidth = 'none';
    canvas.style.height = `${studyBoardSize}px`;
    canvas.style.maxHeight = 'none';

    // We no longer read state.crop (Focus Area) so the margin is untouched, allowing `margin: 0 auto` to center it
    boardCanvasWrapper.style.marginLeft = '';
    boardCanvasWrapper.style.marginTop = '';
    
    // Apply padding to viewport to simulate the export margins, and set background to white
    boardViewport.style.backgroundColor = '#ffffff';
    boardViewport.style.boxSizing = 'content-box';
    boardViewport.style.paddingLeft = `${zL}px`;
    boardViewport.style.paddingRight = `${zR}px`;
    boardViewport.style.paddingTop = `${y1}px`;
    boardViewport.style.paddingBottom = `${y2}px`;
    
    boardViewport.style.width = `${studyBoardSize}px`;
    boardViewport.style.height = `${studyBoardSize}px`;
    
    const scale = scalePerc / 100;
    boardViewport.style.position = 'absolute';
    boardViewport.style.top = '50%';
    boardViewport.style.left = '50%';
    boardViewport.style.transform = `translate(-50%, -50%) scale(${scale})`;
    boardViewport.style.transformOrigin = 'center center';
}

document.addEventListener('DOMContentLoaded', setupStudyMode);

// ==========================================================================
// FLOATING TOOL PALETTE LOGIC
// ==========================================================================

// ==========================================================================
// FLOATING CUSTOM PALETTE LOGIC (GOBAN PALETTE)
// ==========================================================================

function initFloatingToolbar() {
    // Load style settings for all four views
    try {
        const savedInitialStyle = localStorage.getItem('baduk_initial_board_style');
        if (savedInitialStyle) {
            state.initialBoardStyle = JSON.parse(savedInitialStyle);
        }
        const savedStudyStyle = localStorage.getItem('baduk_study_board_style');
        if (savedStudyStyle) {
            state.studyBoardStyle = JSON.parse(savedStudyStyle);
        }
        const savedExportStyle = localStorage.getItem('baduk_export_board_style');
        if (savedExportStyle) {
            state.exportBoardStyle = JSON.parse(savedExportStyle);
        }
        const savedScoringStyle = localStorage.getItem('baduk_scoring_board_style');
        if (savedScoringStyle) {
            state.scoringBoardStyle = JSON.parse(savedScoringStyle);
        } else if (state.initialBoardStyle) {
            state.scoringBoardStyle = JSON.parse(JSON.stringify(state.initialBoardStyle));
        }
    } catch (e) {
        console.error('Failed to parse board styles', e);
    }

    // Apply saved board sizes immediately on load
    if (state.initialBoardStyle && state.initialBoardStyle.board) {
        updateBoardWrapperSize('#go-board-canvas-initial', state.initialBoardStyle.board.size);
    }
    if (state.studyBoardStyle && state.studyBoardStyle.board) {
        updateBoardWrapperSize('#go-board-canvas-study', state.studyBoardStyle.board.size);
    }
    if (state.scoringBoardStyle && state.scoringBoardStyle.board) {
        updateBoardWrapperSize('#go-board-canvas-scoring', state.scoringBoardStyle.board.size);
    }

    // 1. Force panel hidden on initial page load, but load positioning metadata
    customPanelState.visible = false;
    customPanelState.hasDragged = localStorage.getItem('baduk_custom_panel_has_dragged') === 'true';
    try {
        const pos = localStorage.getItem('baduk_custom_panel_position');
        if (pos) {
            customPanelState.position = JSON.parse(pos);
        }
    } catch (e) {
        console.error('Failed to parse custom panel position', e);
    }

    // 2. Cache DOM elements
    elements.customPanel = document.getElementById('custom-floating-panel');
    elements.fabToggleFloating = document.getElementById('fab-toggle-floating');
    elements.btnCloseCustomPanel = document.getElementById('btn-close-custom-panel');
    elements.customDragHandle = document.getElementById('custom-panel-drag-handle');

    if (!elements.customPanel) return;

    // Bind event listeners for custom style editors
    bindStyleInputsEvents();
    initAccordion();

    // Default Stone Set radio toggle
    document.querySelectorAll('.stone-set-option:not(.disabled)').forEach(opt => {
        opt.addEventListener('click', () => {
            const wasActive = opt.classList.contains('active');
            document.querySelectorAll('.stone-set-option').forEach(o => o.classList.remove('active'));
            if (!wasActive) opt.classList.add('active');
            // Save selection to active style only
            const activeStyle = getActiveStyleObject();
            if (activeStyle) {
                activeStyle.stoneSet = wasActive ? null : opt.dataset.set;
                localStorage.setItem('baduk_initial_board_style', JSON.stringify(state.initialBoardStyle));
                localStorage.setItem('baduk_study_board_style', JSON.stringify(state.studyBoardStyle));
                localStorage.setItem('baduk_export_board_style', JSON.stringify(state.exportBoardStyle));
            }
            syncCustomStonesSection();
            drawBoard();
            if (typeof updateExportPreview === 'function') updateExportPreview();
        });
    });

    // Custom Stones collapsible header
    document.querySelectorAll('.custom-stones-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.custom-stones-section');
            if (!section || section.classList.contains('locked')) return;
            const body = section.querySelector('.custom-stones-body');
            if (section.classList.contains('expanded')) {
                section.classList.remove('expanded');
                if (body) body.style.maxHeight = '0';
            } else {
                section.classList.add('expanded');
                if (body) {
                    body.style.maxHeight = 'none';
                    const h = body.scrollHeight;
                    body.style.maxHeight = '0';
                    body.offsetHeight;
                    body.style.maxHeight = h + 'px';
                }
            }
        });
    });

    // 3. Apply initial state
    applyCustomPanelState();

    // 4. Bind event listeners
    if (elements.fabToggleFloating) {
        let isFabDragging = false;
        
        elements.fabToggleFloating.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            
            isFabDragging = false;
            
            const rect = elements.fabToggleFloating.getBoundingClientRect();
            const initialX = rect.left;
            const initialY = rect.top;
            
            // Switch to top/left absolute coordinate tracking for drag
            elements.fabToggleFloating.style.position = 'fixed';
            elements.fabToggleFloating.style.left = `${initialX}px`;
            elements.fabToggleFloating.style.top = `${initialY}px`;
            elements.fabToggleFloating.style.right = 'auto';
            elements.fabToggleFloating.style.bottom = 'auto';
            elements.fabToggleFloating.style.transform = 'none';
            elements.fabToggleFloating.style.transition = 'none'; // Keep movement fluid, no CSS lag
            
            const startX = e.clientX;
            const startY = e.clientY;
            
            function onPointerMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // Deadzone detection: only trigger drag if pulled 3px+ to avoid breaking clicks
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    isFabDragging = true;
                }
                
                if (!isFabDragging) return;
                
                let x = initialX + dx;
                let y = initialY + dy;

                const padding = 20;
                const maxX = window.innerWidth - rect.width - padding;
                const maxY = window.innerHeight - rect.height - padding;

                x = Math.max(padding, Math.min(x, maxX));
                y = Math.max(padding, Math.min(y, maxY));

                elements.fabToggleFloating.style.left = `${x}px`;
                elements.fabToggleFloating.style.top = `${y}px`;
            }

            function onPointerUp(upEvent) {
                elements.fabToggleFloating.style.transition = '';
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
            }

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });

        // Use capture phase so we can block the native click bubble entirely if it was a drag!
        elements.fabToggleFloating.addEventListener('click', (e) => {
            if (isFabDragging) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                isFabDragging = false;
                return;
            }
            toggleCustomPanel();
        }, { capture: true });
    }
    if (elements.btnCloseCustomPanel) {
        elements.btnCloseCustomPanel.addEventListener('click', () => {
            hideCustomPanel();
        });
    }

    // Auto-hide panel when clicking outside of it
    document.addEventListener('click', (e) => {
        if (!customPanelState.visible) return;
        const isClickInsidePanel = elements.customPanel && elements.customPanel.contains(e.target);
        const isClickInsideFab = elements.fabToggleFloating && elements.fabToggleFloating.contains(e.target);
        
        if (!isClickInsidePanel && !isClickInsideFab) {
            hideCustomPanel();
        }
    });

    // Dragging logic using Pointer Events (mouse + touch)
    if (elements.customDragHandle) {
        elements.customDragHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return; // Only left click
            if (e.target.closest('.palette-action-btn')) return; // Don't drag on buttons

            e.preventDefault();
            elements.customDragHandle.releasePointerCapture(e.pointerId);

            const rect = elements.customPanel.getBoundingClientRect();
            const initialX = rect.left;
            const initialY = rect.top;
            
            // Set explicit absolute positions, clear right and transform
            elements.customPanel.style.left = `${initialX}px`;
            elements.customPanel.style.top = `${initialY}px`;
            elements.customPanel.style.right = 'auto';
            elements.customPanel.style.transform = 'none';
            
            const startX = e.clientX;
            const startY = e.clientY;
            
            customPanelState.position = { x: initialX, y: initialY };
            customPanelState.hasDragged = true;
            localStorage.setItem('baduk_custom_panel_has_dragged', 'true');
            
            elements.customPanel.classList.add('dragging');

            function onPointerMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                let x = initialX + dx;
                let y = initialY + dy;

                // Constrain to viewport boundaries
                const padding = 10;
                const maxX = window.innerWidth - rect.width - padding;
                const maxY = window.innerHeight - rect.height - padding;

                x = Math.max(padding, Math.min(x, maxX));
                y = Math.max(padding, Math.min(y, maxY));

                elements.customPanel.style.left = `${x}px`;
                elements.customPanel.style.top = `${y}px`;
                
                customPanelState.position = { x, y };
            }

            function onPointerUp() {
                elements.customPanel.classList.remove('dragging');
                localStorage.setItem('baduk_custom_panel_position', JSON.stringify(customPanelState.position));
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    // Keep within bounds on window resize
    window.addEventListener('resize', () => {
        keepCustomPanelInViewport();
    });
}

function syncCustomStonesSection() {
    const section = document.querySelector('.custom-stones-section');
    if (!section) return;
    const hasActive = !!document.querySelector('.stone-set-option.active');
    const body = section.querySelector('.custom-stones-body');
    if (hasActive) {
        section.classList.add('locked');
        section.classList.remove('expanded');
        if (body) body.style.maxHeight = '0';
    } else {
        section.classList.remove('locked');
        section.classList.add('expanded');
        if (body) {
            body.style.maxHeight = 'none';
            const h = body.scrollHeight;
            body.style.maxHeight = '0';
            body.offsetHeight;
            body.style.maxHeight = h + 'px';
        }
    }
}

function applyCustomPanelState() {
    if (!elements.customPanel) return;
    
    if (customPanelState.visible) {
        elements.customPanel.classList.remove('hidden');
        if (elements.fabToggleFloating) {
            elements.fabToggleFloating.classList.add('active');
        }
        
        // Update title to show current board view
        const titleEl = document.getElementById('custom-panel-header-title');
        const view = getCurrentBoardView();
        if (titleEl) {
            titleEl.textContent = view;
        }

        // Populate Derive Style dropdown dynamically
        const deriveSelect = document.getElementById('derive-style-select');
        if (deriveSelect) {
            deriveSelect.innerHTML = '<option value="" style="color: #0f172a;">Select...</option>';
            const options = ['#go-board-canvas-initial', '#go-board-canvas-study', '#go-board-canvas-scoring', '#export-preview-image'];
            options.forEach(opt => {
                if (opt !== view) {
                    const optionEl = document.createElement('option');
                    optionEl.value = opt;
                    // Format names as requested: #-initial, #-study, #-scoring, #-image
                    optionEl.textContent = opt.replace('go-board-canvas', '').replace('export-preview', '').replace('--', '-');
                    optionEl.style.color = '#0f172a';
                    deriveSelect.appendChild(optionEl);
                }
            });
            deriveSelect.value = ''; // Reset selection
        }
        
        // Populate style editor inputs with current state values
        populateStyleInputs();

        // Set Default Stone Set radio: pre-select based on active style's stoneSet
        const stoneSetOptions = document.querySelectorAll('.stone-set-option');
        stoneSetOptions.forEach(opt => opt.classList.remove('active'));
        const activeStyle = getActiveStyleObject();
        if (activeStyle && activeStyle.stoneSet) {
            const matchingOpt = document.querySelector(`.stone-set-option[data-set="${activeStyle.stoneSet}"]`);
            if (matchingOpt) matchingOpt.classList.add('active');
        }

        // Sync Custom Stones section state based on Default Stone Set
        syncCustomStonesSection();
        
        // Position panel
        if (customPanelState.hasDragged) {
            elements.customPanel.style.left = `${customPanelState.position.x}px`;
            elements.customPanel.style.top = `${customPanelState.position.y}px`;
            elements.customPanel.style.right = 'auto';
            elements.customPanel.style.transform = 'none';
        } else {
            // Default position next to the FAB (CSS handles this, clear inline styles)
            elements.customPanel.style.left = '';
            elements.customPanel.style.top = '';
            elements.customPanel.style.right = '';
            elements.customPanel.style.transform = '';
        }
    } else {
        elements.customPanel.classList.add('hidden');
        if (elements.fabToggleFloating) {
            elements.fabToggleFloating.classList.remove('active');
        }
    }
}

function collapseAllAccordionItems() {
    document.querySelectorAll('.accordion-content').forEach(content => {
        content.classList.remove('open');
        content.style.maxHeight = '0';
    });
    document.querySelectorAll('.accordion-trigger').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelectorAll('.custom-stones-section').forEach(section => {
        section.classList.remove('expanded');
        const body = section.querySelector('.custom-stones-body');
        if (body) body.style.maxHeight = '0';
    });
}

function toggleCustomPanel() {
    customPanelState.visible = !customPanelState.visible;
    localStorage.setItem('baduk_custom_panel_visible', customPanelState.visible);
    collapseAllAccordionItems();
    applyCustomPanelState();
    if (customPanelState.visible) {
        keepCustomPanelInViewport();
    }
}

function hideCustomPanel() {
    customPanelState.visible = false;
    localStorage.setItem('baduk_custom_panel_visible', 'false');
    collapseAllAccordionItems();
    applyCustomPanelState();
}

function getCurrentBoardView() {
    const studyModal = document.getElementById('study-modal-overlay');
    const exportModal = document.getElementById('export-modal-overlay');
    const scoringModal = document.getElementById('scoring-modal-overlay');
    
    if (exportModal && !exportModal.classList.contains('hidden') && exportModal.style.display !== 'none') {
        return '#export-preview-image';
    } else if (scoringModal && !scoringModal.classList.contains('hidden') && scoringModal.style.display !== 'none') {
        return '#go-board-canvas-scoring';
    } else if (studyModal && !studyModal.classList.contains('hidden') && studyModal.style.display !== 'none') {
        return '#go-board-canvas-study';
    } else {
        return '#go-board-canvas-initial';
    }
}

function keepCustomPanelInViewport() {
    if (!elements.customPanel || elements.customPanel.classList.contains('hidden')) return;
    if (!customPanelState.hasDragged) return;
    
    const rect = elements.customPanel.getBoundingClientRect();
    const padding = 10;
    let x = rect.left;
    let y = rect.top;
    let changed = false;
    
    if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
        changed = true;
    }
    if (x < padding) {
        x = padding;
        changed = true;
    }
    if (y + rect.height > window.innerHeight - padding) {
        y = window.innerHeight - rect.height - padding;
        changed = true;
    }
    if (y < padding) {
        y = padding;
        changed = true;
    }
    
    if (changed) {
        elements.customPanel.style.left = `${x}px`;
        elements.customPanel.style.top = `${y}px`;
        localStorage.setItem('baduk_custom_panel_position', JSON.stringify({ x, y }));
    }
}

// ==========================================================================
// CUSTOM BOARD STYLE EDITOR HELPERS
// ==========================================================================

const DEFAULT_INITIAL_BOARD_STYLE = {
    stoneSet: null,
    blackStone: {
        useColor: true,
        bg: '#111827',
        imgSrc: '',
        bgSize: 0.45,
        fg: '#ffffff',
        fgSize: 11,
        br: '#ffffff',
        brSize: 0,
        brRadius: 0,
        brBlur: 0,
        bmSize: 15
    },
    whiteStone: {
        useColor: true,
        bg: '#f3f4f6',
        imgSrc: '',
        bgSize: 0.45,
        fg: '#111827',
        fgSize: 11,
        br: '#111827',
        brSize: 1,
        brRadius: 0,
        brBlur: 0,
        bmSize: 15
    },
    board: {
        useColor: true,
        color: '#dcb35c',
        imgSrc: '',
        imgRepeat: false, imgZoom: 1.0,
        size: 720
    },
    border: {
        color: '#dcb35c',
        size: 100
    },
    grid: {
        lineColor: '#1c1917',
        lineSize: 1,
        hoshiColor: '#1c1917',
        hoshiSize: 3,
        boundaryColor: '#1c1917',
        boundarySize: 1.5
    },
    coord: {
        show: true,
        primary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 },
        secondary: { show: true, type: 'western', color: '#000000', size: 12, pad: 5 }
    },
    hint: {
        color: '#ff3b30',
        size: 0.25,
        alpha: 0.5
    },
    marker: {
        show: false,
        color: '#ff3b30'
    }
};

function getActiveStyleObject() {
    const view = getCurrentBoardView();
    if (view === '#export-preview-image') {
        return state.exportBoardStyle;
    } else if (view === '#go-board-canvas-scoring') {
        return state.scoringBoardStyle || state.initialBoardStyle;
    } else if (view === '#go-board-canvas-study') {
        return state.studyBoardStyle;
    } else {
        return state.initialBoardStyle;
    }
}

function populateStyleInputs() {
    const style = getActiveStyleObject();
    if (!style) return;
    
    // Black Stone
    setInputVal('ib-black-bg', style.blackStone.bg);
    setInputVal('ib-black-bg-size', style.blackStone.bgSize);
    setInputVal('ib-black-fg', style.blackStone.fg);
    setInputVal('ib-black-fg-size', style.blackStone.fgSize);
    setInputVal('ib-black-br', style.blackStone.br);
    setInputVal('ib-black-br-size', style.blackStone.brSize);
    setInputVal('ib-black-br-radius', style.blackStone.brRadius || 0);
    setInputVal('ib-black-br-blur', style.blackStone.brBlur || 0);
    setInputVal('ib-black-bm-size', style.blackStone.bmSize);
    
    const blackThumb = document.getElementById('ib-black-stone-img-thumb');
    if (blackThumb) {
        if (!style.blackStone.useColor && style.blackStone.imgSrc) {
            blackThumb.style.backgroundImage = `url(${style.blackStone.imgSrc})`;
        } else {
            blackThumb.style.backgroundImage = '';
        }
    }
    
    // White Stone
    setInputVal('ib-white-bg', style.whiteStone.bg);
    setInputVal('ib-white-bg-size', style.whiteStone.bgSize);
    setInputVal('ib-white-fg', style.whiteStone.fg);
    setInputVal('ib-white-fg-size', style.whiteStone.fgSize);
    setInputVal('ib-white-br', style.whiteStone.br);
    setInputVal('ib-white-br-size', style.whiteStone.brSize);
    setInputVal('ib-white-br-radius', style.whiteStone.brRadius || 0);
    setInputVal('ib-white-br-blur', style.whiteStone.brBlur || 0);
    setInputVal('ib-white-bm-size', style.whiteStone.bmSize);
    
    const whiteThumb = document.getElementById('ib-white-stone-img-thumb');
    if (whiteThumb) {
        if (!style.whiteStone.useColor && style.whiteStone.imgSrc) {
            whiteThumb.style.backgroundImage = `url(${style.whiteStone.imgSrc})`;
        } else {
            whiteThumb.style.backgroundImage = '';
        }
    }
    
    // Board Background
    const useColorRadio = document.getElementById('ib-board-bg-use-color');
    const useImgRadio = document.getElementById('ib-board-bg-use-image');
    if (useColorRadio && useImgRadio) {
        useColorRadio.checked = style.board.useColor;
        useImgRadio.checked = !style.board.useColor;
    }
    setInputVal('ib-board-color', style.board.color);
    setInputVal('ib-board-img-repeat', style.board.imgRepeat, true);
    setInputVal('ib-board-img-zoom-slider', style.board.imgZoom !== undefined ? style.board.imgZoom : 1.0);
    setInputVal('ib-board-img-offset-x', style.board.imgOffsetX !== undefined ? style.board.imgOffsetX : 0);
    setInputVal('ib-board-img-offset-y', style.board.imgOffsetY !== undefined ? style.board.imgOffsetY : 0);
    setInputVal('ib-board-size', style.board.size);
    
    // Update thumbnail
    const thumb = document.getElementById('ib-board-img-thumb');
    if (thumb) {
        if (!style.board.useColor && style.board.imgSrc) {
            thumb.style.backgroundImage = `url(${style.board.imgSrc})`;
        } else {
            thumb.style.backgroundImage = '';
        }
    }
    
    // Board BDC (Border)
    setInputVal('ib-border-color', style.border.color);
    setInputVal('ib-border-size', style.border.size);
    
    // Grids
    setInputVal('ib-grid-line-color', style.grid.lineColor);
    setInputVal('ib-grid-line-size', style.grid.lineSize);
    setInputVal('ib-grid-hoshi-color', style.grid.hoshiColor);
    setInputVal('ib-grid-hoshi-size', style.grid.hoshiSize);
    setInputVal('ib-grid-border-color', style.grid.boundaryColor);
    setInputVal('ib-grid-border-size', style.grid.boundarySize);
    
    // Coordinates
    setInputVal('ib-coord-show', style.coord.show, true);
    
    setInputVal('ib-coord-prim-show', style.coord.primary.show, true);
    setInputVal('ib-coord-prim-type', style.coord.primary.type);
    setInputVal('ib-coord-prim-color', style.coord.primary.color);
    setInputVal('ib-coord-prim-size', style.coord.primary.size);
    setInputVal('ib-coord-prim-pad', style.coord.primary.pad);
    
    setInputVal('ib-coord-sec-show', style.coord.secondary.show, true);
    setInputVal('ib-coord-sec-type', style.coord.secondary.type);
    setInputVal('ib-coord-sec-color', style.coord.secondary.color);
    setInputVal('ib-coord-sec-size', style.coord.secondary.size);
    setInputVal('ib-coord-sec-pad', style.coord.secondary.pad);
    
    // Hint
    if (style.hint) {
        setInputVal('ib-hint-color', style.hint.color);
        setInputVal('ib-hint-size', style.hint.size);
        setInputVal('ib-hint-size-slider', style.hint.size);
        setInputVal('ib-hint-alpha', style.hint.alpha);
        setInputVal('ib-hint-alpha-slider', style.hint.alpha);
    }
    
    // Move Marker
    if (!style.marker) style.marker = { show: false, color: '#ff3b30' };
    setInputVal('ib-coord-move-marker', style.marker.show, true);
    setInputVal('ib-coord-move-marker-color', style.marker.color);
    state.showMoveMarker = !!style.marker.show;
    state.moveMarkerColor = style.marker.color || '#ff3b30';
}

function setInputVal(id, val, isCheckbox = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isCheckbox) {
        el.checked = !!val;
    } else {
        el.value = val;
    }
    
    // Also update the slider if it exists
    const slider = document.getElementById(`${id}-slider`);
    if (slider) {
        slider.value = val;
    }
    
    // Also update the color code text if it exists (uupm.cc style)
    const span = document.getElementById(`${id}-val`);
    if (span && typeof val === 'string' && val.startsWith('#')) {
        span.textContent = val.toUpperCase();
    }
}

function bindStyleInputsEvents() {
    const inputs = [
        { id: 'ib-black-bg-size', section: 'blackStone', key: 'bgSize', isNum: true },
        { id: 'ib-black-fg', section: 'blackStone', key: 'fg' },
        { id: 'ib-black-fg-size', section: 'blackStone', key: 'fgSize', isNum: true },
        { id: 'ib-black-br', section: 'blackStone', key: 'br' },
        { id: 'ib-black-br-size', section: 'blackStone', key: 'brSize', isNum: true },
        { id: 'ib-black-br-radius', section: 'blackStone', key: 'brRadius', isNum: true },
        { id: 'ib-black-br-blur', section: 'blackStone', key: 'brBlur', isNum: true },
        { id: 'ib-black-bm-size', section: 'blackStone', key: 'bmSize', isNum: true },
        
        { id: 'ib-white-bg-size', section: 'whiteStone', key: 'bgSize', isNum: true },
        { id: 'ib-white-fg', section: 'whiteStone', key: 'fg' },
        { id: 'ib-white-fg-size', section: 'whiteStone', key: 'fgSize', isNum: true },
        { id: 'ib-white-br', section: 'whiteStone', key: 'br' },
        { id: 'ib-white-br-size', section: 'whiteStone', key: 'brSize', isNum: true },
        { id: 'ib-white-br-radius', section: 'whiteStone', key: 'brRadius', isNum: true },
        { id: 'ib-white-br-blur', section: 'whiteStone', key: 'brBlur', isNum: true },
        { id: 'ib-white-bm-size', section: 'whiteStone', key: 'bmSize', isNum: true },
        
        { id: 'ib-board-color', section: 'board', key: 'color' },
        { id: 'ib-board-img-repeat', section: 'board', key: 'imgRepeat', isCheckbox: true },
        { id: 'ib-board-img-zoom-slider', section: 'board', key: 'imgZoom', isNum: true },
        { id: 'ib-board-img-offset-x', section: 'board', key: 'imgOffsetX', isNum: true },
        { id: 'ib-board-img-offset-y', section: 'board', key: 'imgOffsetY', isNum: true },
        { id: 'ib-board-size', section: 'board', key: 'size', isNum: true },
        
        { id: 'ib-border-color', section: 'border', key: 'color' },
        { id: 'ib-border-size', section: 'border', key: 'size', isNum: true },
        
        { id: 'ib-grid-line-color', section: 'grid', key: 'lineColor' },
        { id: 'ib-grid-line-size', section: 'grid', key: 'lineSize', isNum: true },
        { id: 'ib-grid-hoshi-color', section: 'grid', key: 'hoshiColor' },
        { id: 'ib-grid-hoshi-size', section: 'grid', key: 'hoshiSize', isNum: true },
        { id: 'ib-grid-border-color', section: 'grid', key: 'boundaryColor' },
        { id: 'ib-grid-border-size', section: 'grid', key: 'boundarySize', isNum: true },
        
        { id: 'ib-coord-show', section: 'coord', key: 'show', isCheckbox: true },
        { id: 'ib-coord-prim-show', section: 'coord', key: 'primary.show', isCheckbox: true },
        { id: 'ib-coord-prim-type', section: 'coord', key: 'primary.type' },
        { id: 'ib-coord-prim-color', section: 'coord', key: 'primary.color' },
        { id: 'ib-coord-prim-size', section: 'coord', key: 'primary.size', isNum: true },
        { id: 'ib-coord-prim-pad', section: 'coord', key: 'primary.pad', isNum: true },
        
        { id: 'ib-coord-sec-show', section: 'coord', key: 'secondary.show', isCheckbox: true },
        { id: 'ib-coord-sec-type', section: 'coord', key: 'secondary.type' },
        { id: 'ib-coord-sec-color', section: 'coord', key: 'secondary.color' },
        { id: 'ib-coord-sec-size', section: 'coord', key: 'secondary.size', isNum: true },
        { id: 'ib-coord-sec-pad', section: 'coord', key: 'secondary.pad', isNum: true },
        
        { id: 'ib-hint-color', section: 'hint', key: 'color' },
        { id: 'ib-hint-size', section: 'hint', key: 'size', isNum: true },
        { id: 'ib-hint-alpha', section: 'hint', key: 'alpha', isNum: true },
        
        { id: 'ib-coord-move-marker', section: 'marker', key: 'show', isCheckbox: true },
        { id: 'ib-coord-move-marker-color', section: 'marker', key: 'color' }
    ];
    
    inputs.forEach(item => {
        const el = document.getElementById(item.id);
        if (!el) return;
        
        const slider = document.getElementById(`${item.id}-slider`);
        
        const updateStyle = (val) => {
            const style = getActiveStyleObject();
            if (!style[item.section]) style[item.section] = {};
            
            if (item.key.includes('.')) {
                const parts = item.key.split('.');
                if (!style[item.section][parts[0]]) style[item.section][parts[0]] = {};
                style[item.section][parts[0]][parts[1]] = val;
            } else {
                style[item.section][item.key] = val;
            }
            
            // Special handling for board size
            if (item.id === 'ib-board-size') {
                const view = getCurrentBoardView();
                updateBoardWrapperSize(view, val);
            }
            
            saveStyleAndRedraw();
        };
        
        const handler = () => {
            let val;
            if (item.isCheckbox) {
                val = el.checked;
            } else if (item.isNum) {
                val = parseFloat(el.value);
                if (isNaN(val)) val = 0;
            } else {
                val = el.value;
            }
            
            if (slider) slider.value = val;
            
            // Update color code span if it exists (uupm.cc style)
            const span = document.getElementById(`${item.id}-val`);
            if (span && typeof val === 'string' && val.startsWith('#')) {
                span.textContent = val.toUpperCase();
            }
            
            updateStyle(val);
        };
        
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        
        const attachSliderReset = (targetElement) => {
            targetElement.addEventListener('dblclick', () => {
                const view = getCurrentBoardView();
                // All modes share the exact same structural default object (DEFAULT_INITIAL_BOARD_STYLE), 
                // so we use it as the universal source of truth to avoid undefined ReferenceErrors!
                let defStyle = DEFAULT_INITIAL_BOARD_STYLE;
                
                let defVal;
                if (item.key.includes('.')) {
                    const parts = item.key.split('.');
                    defVal = defStyle[item.section][parts[0]][parts[1]];
                } else {
                    defVal = defStyle[item.section][item.key];
                }
                
                targetElement.value = defVal;
                if (el !== targetElement && el) el.value = defVal;
                if (slider && slider !== targetElement) slider.value = defVal;
                updateStyle(defVal);
            });
        };

        if (slider) {
            slider.addEventListener('input', () => {
                let val = parseFloat(slider.value);
                if (isNaN(val)) val = 0;
                el.value = val;
                updateStyle(val);
            });
            attachSliderReset(slider);
        } else if (el.type === 'range') {
            attachSliderReset(el);
        }
    });
    
    // Stone BG Color input change (automatically reverts stone to color mode)
    const handleStoneBgColorChange = (colorElId, section) => {
        const el = document.getElementById(colorElId);
        if (!el) return;
        const handler = () => {
            const style = getActiveStyleObject();
            style[section].bg = el.value;
            style[section].useColor = true;
            
            // Update color code span (uupm.cc style)
            const span = document.getElementById(`${colorElId}-val`);
            if (span) span.textContent = el.value.toUpperCase();
            
            saveStyleAndRedraw();
            populateStyleInputs();
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    };
    handleStoneBgColorChange('ib-black-bg', 'blackStone');
    handleStoneBgColorChange('ib-white-bg', 'whiteStone');

    // Stone Image upload triggers
    const bindStoneImageUpload = (btnId, inputId, section) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                input.click();
            });
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(event) {
                    const img = new Image();
                    img.onload = function() {
                        // Compress stone image to 256x256 to save localStorage quota
                        const canvas = document.createElement('canvas');
                        canvas.width = 256;
                        canvas.height = 256;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, 256, 256);
                        const compressedDataUrl = canvas.toDataURL('image/png');
                        
                        const style = getActiveStyleObject();
                        style[section].imgSrc = compressedDataUrl;
                        style[section].useColor = false;
                        
                        saveStyleAndRedraw();
                        populateStyleInputs();
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
    };
    bindStoneImageUpload('ib-black-stone-img-thumb', 'ib-black-stone-img-input', 'blackStone');
    bindStoneImageUpload('ib-white-stone-img-thumb', 'ib-white-stone-img-input', 'whiteStone');

    // Board bg type radio buttons
    const useColorRadio = document.getElementById('ib-board-bg-use-color');
    const useImgRadio = document.getElementById('ib-board-bg-use-image');
    const handleBgTypeChange = () => {
        const style = getActiveStyleObject();
        style.board.useColor = !!(useColorRadio && useColorRadio.checked);
        saveStyleAndRedraw();
        populateStyleInputs();
    };
    if (useColorRadio) useColorRadio.addEventListener('change', handleBgTypeChange);
    if (useImgRadio) useImgRadio.addEventListener('change', handleBgTypeChange);
    
    // File input trigger
    const fileBtn = document.getElementById('ib-board-img-thumb');
    const fileInput = document.getElementById('ib-board-img-input');
    if (fileBtn && fileInput) {
        fileBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const maxDim = 1024;
                    let w = img.width;
                    let h = img.height;
                    
                    // Only scale down if it exceeds maxDim
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    
                    const style = getActiveStyleObject();
                    style.board.imgSrc = compressedDataUrl;
                    style.board.useColor = false;
                    if (useImgRadio) useImgRadio.checked = true;
                    if (useColorRadio) useColorRadio.checked = false;
                    
                    // Reset cached image object so it reloads
                    const view = getCurrentBoardView();
                    if (view === '#go-board-canvas-initial') {
                        window.initialBoardBgImage = null;
                    } else if (view === '#go-board-canvas-study') {
                        window.studyBoardBgImage = null;
                    } else {
                        window.exportBoardBgImage = null;
                    }
                    
                    saveStyleAndRedraw();
                    populateStyleInputs();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Section reset buttons
    document.querySelectorAll('.style-reset-section-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Stop propagation to prevent triggering accordion headers
            e.stopPropagation();
            const section = e.currentTarget.getAttribute('data-section');
            if (section && DEFAULT_INITIAL_BOARD_STYLE[section]) {
                const style = getActiveStyleObject();
                style[section] = JSON.parse(JSON.stringify(DEFAULT_INITIAL_BOARD_STYLE[section]));
                
                if (section === 'board') {
                    const view = getCurrentBoardView();
                    updateBoardWrapperSize(view, style.board.size);
                    
                    if (view === '#go-board-canvas-initial') {
                        window.initialBoardBgImage = null;
                    } else if (view === '#go-board-canvas-study') {
                        window.studyBoardBgImage = null;
                    } else {
                        window.exportBoardBgImage = null;
                    }
                } else if (section === 'blackStone') {
                    const view = getCurrentBoardView();
                    if (view === '#go-board-canvas-initial') window.initialBStoneBgImage = null;
                    else if (view === '#go-board-canvas-study') window.studyBStoneBgImage = null;
                    else window.exportBStoneBgImage = null;
                } else if (section === 'whiteStone') {
                    const view = getCurrentBoardView();
                    if (view === '#go-board-canvas-initial') window.initialWStoneBgImage = null;
                    else if (view === '#go-board-canvas-study') window.studyWStoneBgImage = null;
                    else window.exportWStoneBgImage = null;
                }
                
                saveStyleAndRedraw();
                populateStyleInputs();
            }
        });
    });

    // Reset All button
    const resetAllBtn = document.getElementById('btn-ib-reset-all');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            const view = getCurrentBoardView();
            const defaultStyle = JSON.parse(JSON.stringify(DEFAULT_INITIAL_BOARD_STYLE));
            
            if (view === '#export-preview-image') {
                state.exportBoardStyle = defaultStyle;
                window.exportBoardBgImage = null;
                window.exportBStoneBgImage = null;
                window.exportWStoneBgImage = null;
            } else if (view === '#go-board-canvas-scoring') {
                state.scoringBoardStyle = defaultStyle;
                window.scoringBoardBgImage = null;
                window.scoringBStoneBgImage = null;
                window.scoringWStoneBgImage = null;
            } else if (view === '#go-board-canvas-study') {
                state.studyBoardStyle = defaultStyle;
                window.studyBoardBgImage = null;
                window.studyBStoneBgImage = null;
                window.studyWStoneBgImage = null;
            } else {
                state.initialBoardStyle = defaultStyle;
                window.initialBoardBgImage = null;
                window.initialBStoneBgImage = null;
                window.initialWStoneBgImage = null;
            }
            
            updateBoardWrapperSize(view, defaultStyle.board.size);
            saveStyleAndRedraw();
            populateStyleInputs();
        });
    }

    // Derive Style Dropdown Listener
    const deriveSelect = document.getElementById('derive-style-select');
    if (deriveSelect) {
        deriveSelect.addEventListener('change', (e) => {
            const sourceView = e.target.value;
            if (!sourceView) return;
            
            const currentView = getCurrentBoardView();
            let sourceStyle;
            
            // 1. Deep copy from selected target
            if (sourceView === '#export-preview-image') {
                sourceStyle = JSON.parse(JSON.stringify(state.exportBoardStyle || DEFAULT_INITIAL_BOARD_STYLE));
            } else if (sourceView === '#go-board-canvas-scoring') {
                sourceStyle = JSON.parse(JSON.stringify(state.scoringBoardStyle || state.initialBoardStyle || DEFAULT_INITIAL_BOARD_STYLE));
            } else if (sourceView === '#go-board-canvas-study') {
                sourceStyle = JSON.parse(JSON.stringify(state.studyBoardStyle || DEFAULT_INITIAL_BOARD_STYLE));
            } else {
                sourceStyle = JSON.parse(JSON.stringify(state.initialBoardStyle || DEFAULT_INITIAL_BOARD_STYLE));
            }
            
            // 2. Inject into current view
            if (currentView === '#export-preview-image') {
                state.exportBoardStyle = sourceStyle;
                window.exportBoardBgImage = null;
                window.exportBStoneBgImage = null;
                window.exportWStoneBgImage = null;
            } else if (currentView === '#go-board-canvas-scoring') {
                state.scoringBoardStyle = sourceStyle;
                window.scoringBoardBgImage = null;
                window.scoringBStoneBgImage = null;
                window.scoringWStoneBgImage = null;
            } else if (currentView === '#go-board-canvas-study') {
                state.studyBoardStyle = sourceStyle;
                window.studyBoardBgImage = null;
                window.studyBStoneBgImage = null;
                window.studyWStoneBgImage = null;
            } else {
                state.initialBoardStyle = sourceStyle;
                window.initialBoardBgImage = null;
                window.initialBStoneBgImage = null;
                window.initialWStoneBgImage = null;
            }
            
            // 3. Cascade updates through UI and Rendering Engine
            updateBoardWrapperSize(currentView, sourceStyle.board.size);
            saveStyleAndRedraw();
            populateStyleInputs();
            
            // Reset dropdown so user can trigger it again
            e.target.value = '';
        });
    }
}

function updateBoardWrapperSize(view, size) {
    const dpr = window.devicePixelRatio || 1;

    if (view === '#go-board-canvas-study') {
        if (elements.canvasStudy) {
            elements.canvasStudy.width = size * dpr;
            elements.canvasStudy.height = size * dpr;
            elements.canvasStudy.getContext('2d').scale(dpr, dpr);
        }
        const wrapper = document.getElementById('board-canvas-wrapper-study') || elements.canvasStudy;
        if (wrapper) {
            wrapper.style.maxWidth = `${size}px`;
            wrapper.style.width = '100%';
        }
        const studyCanvas = document.getElementById('go-board-canvas-study');
        if (studyCanvas) {
            studyCanvas.style.width = `${size}px`;
            studyCanvas.style.height = `${size}px`;
        }
        const studyViewport = document.getElementById('study-board-viewport');
        if (studyViewport) {
            studyViewport.style.width = `${size}px`;
            studyViewport.style.height = `${size}px`;
        }
    } else if (view === '#go-board-canvas-scoring') {
        const scoringCanvas = document.getElementById('go-board-canvas-scoring');
        if (scoringCanvas) {
            scoringCanvas.width = size * dpr;
            scoringCanvas.height = size * dpr;
            scoringCanvas.style.width = `${size}px`;
            scoringCanvas.style.height = `${size}px`;
        }
        const wrapper = document.getElementById('board-canvas-wrapper-scoring') || scoringCanvas;
        if (wrapper) {
            wrapper.style.maxWidth = `${size}px`;
            wrapper.style.maxHeight = `${size}px`;
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
        }
    } else if (view === '#export-preview-image') {
        // Export size is handled inside diagram generator, we don't resize its DOM container here.
    } else {
        if (elements.canvasInitial) {
            elements.canvasInitial.width = size * dpr;
            elements.canvasInitial.height = size * dpr;
            elements.canvasInitial.getContext('2d').scale(dpr, dpr);
        }
        const wrapper = document.getElementById('board-canvas-wrapper-initial') || elements.canvasInitial;
        if (wrapper) {
            wrapper.style.maxWidth = `${size}px`;
            wrapper.style.width = '100%';
        }
    }
}

function saveStyleAndRedraw() {
    localStorage.setItem('baduk_initial_board_style', JSON.stringify(state.initialBoardStyle));
    localStorage.setItem('baduk_study_board_style', JSON.stringify(state.studyBoardStyle));
    if (state.scoringBoardStyle) {
        localStorage.setItem('baduk_scoring_board_style', JSON.stringify(state.scoringBoardStyle));
    }
    localStorage.setItem('baduk_export_board_style', JSON.stringify(state.exportBoardStyle));
    
    if (state.activeStudyId && typeof StudyRecordDB !== 'undefined' && typeof captureCurrentAppSettings === 'function') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            rec.settings = captureCurrentAppSettings();
            StudyRecordDB.saveRecord(rec);
        }
    }

    if (typeof drawBoard === 'function') drawBoard();
    
    const view = getCurrentBoardView();
    if (view === '#export-preview-image') {
        if (typeof updateExportPreview === 'function') updateExportPreview();
    }
}

function initAccordion() {
    const triggers = document.querySelectorAll('.accordion-trigger');
    triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const targetId = trigger.getAttribute('data-target');
            const target = document.getElementById(targetId);
            const isOpened = target.classList.contains('open');
            
            // Close all contents
            document.querySelectorAll('.accordion-content').forEach(content => {
                content.classList.remove('open');
                content.style.maxHeight = '0';
            });
            document.querySelectorAll('.accordion-trigger').forEach(t => {
                t.classList.remove('active');
            });
            
            // Open clicked if it wasn't open
            if (!isOpened) {
                target.classList.add('open');
                target.style.maxHeight = target.scrollHeight + 'px';
                trigger.classList.add('active');
            }
        });
    });
}

// --- SGF Change Popup Logic ---
function initSgfChangePopup() {
    const popup = document.getElementById('sgf-change-popup');
    const btnOverride = document.getElementById('sgf-btn-override');
    const btnMknew = document.getElementById('sgf-btn-mknew');
    const btnIgnore = document.getElementById('sgf-btn-ignore');

    if (!popup || !btnOverride || !btnMknew || !btnIgnore) return;

    btnOverride.addEventListener('click', () => {
        const currentName = elements.selectedFileName && elements.selectedFileName.textContent ? elements.selectedFileName.textContent : 'game.sgf';
        exportEditedSgf(currentName);
        popup.classList.remove('show');
    });

    btnMknew.addEventListener('click', () => {
        exportEditedSgf(); // will use default edited_game_...
        popup.classList.remove('show');
    });

    btnIgnore.addEventListener('click', () => {
        popup.classList.remove('show');
        // Do not reset popupShownForCurrentChange so it doesn't show again for the same change
    });
}

// --- Rec Game Unsaved Changes Warning Popup ---
function initRecUnsavedPopup() {
    const popup = document.getElementById('rec-unsaved-popup');
    const btnSave = document.getElementById('rec-unsaved-btn-save');
    const btnDismiss = document.getElementById('rec-unsaved-btn-dismiss');
    if (!popup || !btnSave || !btnDismiss) return;

    btnSave.addEventListener('click', () => {
        popup.classList.remove('show');
        // Trigger the Save / Update Rec Game button
        const saveBtn = document.getElementById('btn-save-rec-game');
        if (saveBtn) saveBtn.click();
    });

    btnDismiss.addEventListener('click', () => {
        popup.classList.remove('show');
        state.isSgfDirty = false;
    });

    popup.addEventListener('click', (e) => {
        if (e.target === popup) popup.classList.remove('show');
    });
}

function checkAndShowRecUnsavedPopup() {
    if (!state.activeStudyId || !state.isSgfDirty) return;
    const popup = document.getElementById('rec-unsaved-popup');
    if (popup) {
        popup.classList.add('show');
    }
}

function checkAndShowGameEndPopup() {
    if (!state.sgfMoves || state.sgfMoves.length === 0) return;
    
    // Only show if we actually reached the absolute last move of the entire SGF game
    const absIdx = (state.filterStart || 1) - 1 + state.currentMoveIndex;
    const absLastIdx = state.allSgfMoves ? state.allSgfMoves.length - 1 : state.sgfMoves.length - 1;
    
    if (absIdx !== absLastIdx) {
        state.gameEndPopupShown = false; 
        return;
    }
    
    if (state.gameEndPopupShown) return;
    
    const blk = (state.sgfMetadata.pb || 'Black').trim();
    const wht = (state.sgfMetadata.pw || 'White').trim();
    const res = (state.sgfMetadata.re || '').trim();
    const rule = (state.sgfMetadata.ru || 'Unknown').trim();
    const komi = (state.sgfMetadata.km || 'Unknown').trim();
    
    if (!res) return; 
    
    let winner = "";
    let method = res;
    if (res.toUpperCase().startsWith("B+")) { winner = blk; }
    else if (res.toUpperCase().startsWith("W+")) { winner = wht; }
    else if (res.toUpperCase() === "DRAW" || res.toUpperCase() === "0" || res.toUpperCase() === "JIGO") { winner = "Draw"; }
    
    const details = res.substring(2);
    if (winner && winner !== "Draw") {
        if (details.toUpperCase() === "R" || details.toUpperCase() === "RESIGN") method = "Resignation";
        else if (details.toUpperCase() === "T" || details.toUpperCase() === "TIME") method = "Time";
        else method = details + " points";
    }
    
    let resultStr = "";
    if (winner === "Draw") {
        resultStr = "The game ended in a draw.";
    } else if (winner) {
        resultStr = `<strong style="color: #0f172a;">${winner}</strong> won by ${method}.`;
    } else {
        resultStr = `Result: <strong>${res}</strong>`;
    }
    
    const hasValidRule = (rule && rule.toLowerCase() !== 'unknown' && rule !== '');
    const hasValidKomi = (komi && komi.toLowerCase() !== 'unknown' && komi !== '' && komi !== '0' && komi !== '0.0');
    
    const elDetails = document.getElementById('game-end-match-details');
    let noteStr = "";
    
    if (!hasValidRule && !hasValidKomi) {
        if (elDetails) elDetails.style.display = 'none';
    } else {
        if (elDetails) elDetails.style.display = 'block';
        let ruleTxt = hasValidRule ? `<strong>${rule}</strong>` : 'unspecified';
        let komiTxt = hasValidKomi ? `a <strong>${komi}-point</strong> komi` : 'no specified komi';
        noteStr = `This game was played under ${ruleTxt} rules with ${komiTxt}.`;
    }
    const elResult = document.getElementById('game-end-result-text');
    const elNote = document.getElementById('game-end-note-text');
    const elPopup = document.getElementById('game-end-popup');
    
    if (elResult && elNote && elPopup) {
        elResult.innerHTML = resultStr;
        elNote.innerHTML = noteStr;
        elPopup.style.display = 'flex';
        state.gameEndPopupShown = true;
    }
}

function updateEndgameScoringUI() {
    const el = document.getElementById('endgame-scoring-shortcut');
    if (!el) return;
    const onLastMove = state.sgfMoves && state.sgfMoves.length > 0 && state.currentMoveIndex === state.sgfMoves.length - 1;
    el.style.display = onLastMove ? 'block' : 'none';
}

function initGameEndPopup() {
    const btnCloseGameEnd = document.getElementById('btn-close-game-end');
    const btnGameEndOk = document.getElementById('btn-game-end-ok');
    const btnManualScoring = document.getElementById('btn-manual-scoring');
    const popupGameEnd = document.getElementById('game-end-popup');
    
    if (btnCloseGameEnd && popupGameEnd) {
        btnCloseGameEnd.addEventListener('click', () => popupGameEnd.style.display = 'none');
    }
    if (btnGameEndOk && popupGameEnd) {
        btnGameEndOk.addEventListener('click', () => popupGameEnd.style.display = 'none');
    }
    if (btnManualScoring && popupGameEnd) {
        btnManualScoring.addEventListener('click', () => {
            popupGameEnd.style.display = 'none';
            let savedData = null;
            if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
                const rec = StudyRecordDB.getRecord(state.activeStudyId);
                if (rec && rec.scoringData) {
                    savedData = rec.scoringData;
                }
            }
            openScoringModal(savedData);
        });
    }
}

function checkSgfChangeAndShowPopup() {
    // No SGF was ever loaded (fresh board) — there is no file to "override", so never show the popup.
    if (!state.sgfTree) return;
    if (state.isSgfDirty && !state.popupShownForCurrentChange) {
        // In Rec/Study mode: never show the file-change popup — user saves manually via "Save / Update Rec Game"
        if (state.activeStudyId) {
            return;
        }

        // File mode: show the original file-change popup
        const popup = document.getElementById('sgf-change-popup');
        const filenameSpan = document.getElementById('sgf-popup-filename');
        if (!popup || !filenameSpan) return;

        const currentName = elements.selectedFileName && elements.selectedFileName.textContent ? elements.selectedFileName.textContent : 'game.sgf';
        filenameSpan.textContent = currentName;
        popup.classList.add('show');
        state.popupShownForCurrentChange = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof deadstones !== 'undefined') {
        deadstones.useFetch('./deadstones_bg.wasm');
    }
    initSgfChangePopup();
    initRecUnsavedPopup();
    initGameEndPopup();
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSgfChangePopup();
    initRecUnsavedPopup();
    initGameEndPopup();
}

document.addEventListener('DOMContentLoaded', () => {
    state.showLiberties = false;
    
    let outsideLibertiesClickListener = null;

    const closeLibertiesPanel = () => {
        const existingPanel = document.getElementById('liberties-rich-panel');
        if (existingPanel) existingPanel.remove();
        if (outsideLibertiesClickListener) {
            document.removeEventListener('click', outsideLibertiesClickListener);
            outsideLibertiesClickListener = null;
        }
    };
    
    const toggleLiberties = () => {
        if (state.showLiberties) {
            // Currently ON, turn OFF
            state.showLiberties = false;
            closeLibertiesPanel();
            
            const btn = document.getElementById('btn-liberties');
            if (btn) {
                btn.style.background = 'rgba(139, 26, 26, 0.1)';
                btn.style.color = 'rgb(139, 26, 26)';
                btn.setAttribute('title', 'Toggle Liberties (Cmd+Shift+L)');
            }
            if (typeof drawBoard === 'function') drawBoard();
        } else {
            // Currently OFF, turn ON
            state.showLiberties = true;
            if (typeof drawBoard === 'function') drawBoard();
            
            const btn = document.getElementById('btn-liberties');
            let counts = {black: 0, white: 0, shared: 0};
            if (btn) {
                btn.style.background = 'rgb(139, 26, 26)';
                btn.style.color = 'rgb(248, 245, 238)';
                
                counts = typeof window.Liberties !== 'undefined' ? window.Liberties.countByColor(state.board) : {black: 0, white: 0, shared: 0};
                btn.setAttribute('title', `Liberties - B: ${counts.black}, W: ${counts.white}, Shared: ${counts.shared}`);
            }
            
            closeLibertiesPanel();
            
            const panel = document.createElement('div');
            panel.id = 'liberties-rich-panel';
            panel.style.position = 'fixed';
            panel.style.top = '-500px';
            panel.style.left = '50%';
            panel.style.transform = 'translateX(-50%)';
            panel.style.zIndex = '999999999';
            panel.style.transition = 'top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            panel.style.background = 'rgba(215, 225, 235, 0.85)'; // Sophisticated muted slate-blue to complement the earthy yellow
            panel.style.backdropFilter = 'blur(12px)';
            panel.style.webkitBackdropFilter = 'blur(12px)';
            panel.style.borderRadius = '12px';
            panel.style.padding = '16px 24px';
            panel.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
            panel.style.border = '1px solid rgba(255, 255, 255, 0.3)';
            panel.style.fontFamily = "'Inter', 'Roboto', sans-serif";
            panel.style.color = '#1f2937';
            panel.style.minWidth = '350px';
            panel.style.pointerEvents = 'auto';
            
            const moveText = state.currentMoveIndex >= 0 
                ? `Position after move ${state.currentMoveIndex + 1}` 
                : 'Initial board state';
                
            panel.innerHTML = `
                <div id="close-liberties-panel" style="position: absolute; top: 10px; right: 12px; cursor: pointer; font-size: 20px; line-height: 20px; font-weight: bold; color: #9ca3af; transition: color 0.2s;">&times;</div>
                <div style="font-weight: 700; font-size: 1.1rem; text-align: center; margin-bottom: 4px; color: #1f2937;">
                    Liberties Count
                </div>
                <div style="text-align: center; margin-bottom: 16px; color: #6b7280; font-size: 0.85rem; font-style: italic;">
                    ( ${moveText} )
                </div>
                <table style="width: auto; margin: 0 auto; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
                    <thead>
                        <tr style="color: #4b5563; font-size: 0.75rem; letter-spacing: 0.05em; font-weight: 600;">
                            <th style="padding-bottom: 8px; padding-right: 48px; text-align: left;">TYPE</th>
                            <th style="padding-bottom: 8px; text-align: right;">COUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid rgba(0,0,0,0.08);">
                            <td style="padding: 10px 48px 10px 0; display: flex; align-items: center; gap: 10px;">
                                <div style="width: 14px; height: 14px; background-color: #11ffee; border-radius: 2px;"></div>
                                <span style="font-weight: 600;">Black</span>
                            </td>
                            <td style="font-weight: 700; font-size: 1.1rem; text-align: right;">${counts.black}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(0,0,0,0.08);">
                            <td style="padding: 10px 48px 10px 0; display: flex; align-items: center; gap: 10px;">
                                <div style="width: 14px; height: 14px; background-color: #ff0033; border-radius: 2px;"></div>
                                <span style="font-weight: 600;">White</span>
                            </td>
                            <td style="font-weight: 700; font-size: 1.1rem; text-align: right;">${counts.white}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 48px 10px 0; display: flex; align-items: center; gap: 10px;">
                                <div style="width: 14px; height: 14px; background: linear-gradient(45deg, #11ffee 50%, #ff0033 0); border-radius: 2px;"></div>
                                <span style="font-weight: 600;">Shared</span>
                            </td>
                            <td style="font-weight: 700; font-size: 1.1rem; text-align: right;">${counts.shared}</td>
                        </tr>
                    </tbody>
                </table>
            `;
            
            document.body.appendChild(panel);
            
            requestAnimationFrame(() => {
                panel.style.top = '20px';
            });
            
            const closeBtn = panel.querySelector('#close-liberties-panel');
            closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#1f2937');
            closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#9ca3af');
            
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeLibertiesPanel();
            });
            
            outsideLibertiesClickListener = (e) => {
                if (!panel.contains(e.target)) {
                    closeLibertiesPanel();
                }
            };

            setTimeout(() => {
                document.addEventListener('click', outsideLibertiesClickListener);
            }, 10);
        }
    };
    
    const btnLiberties = document.getElementById('btn-liberties');
    if (btnLiberties) {
        btnLiberties.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLiberties();
        });
    }

    document.addEventListener('keydown', e => {
        if (e.shiftKey && e.metaKey && e.key === 'L') {
            toggleLiberties();
        }
    });

    // Wire up SGF Replayer Phase Bar button click events with lock/unlock toggle
    if (elements.btnPhaseFuseki) {
        elements.btnPhaseFuseki.addEventListener('click', () => {
            if (elements.btnRangeOpening && elements.btnRangeAll) {
                if (elements.btnRangeOpening.classList.contains('active')) {
                    elements.btnRangeAll.click();
                } else {
                    elements.btnRangeOpening.click();
                }
            }
        });
    }
    if (elements.btnPhaseChuban) {
        elements.btnPhaseChuban.addEventListener('click', () => {
            if (state.gamePhases && state.gamePhases.chubanStart !== -1 && elements.btnRangeMidgame && elements.btnRangeAll) {
                if (elements.btnRangeMidgame.classList.contains('active')) {
                    elements.btnRangeAll.click();
                } else {
                    elements.btnRangeMidgame.click();
                }
            }
        });
    }
    if (elements.btnPhaseYose) {
        elements.btnPhaseYose.addEventListener('click', () => {
            if (state.gamePhases && state.gamePhases.yoseStart !== -1 && elements.btnRangeEndgame && elements.btnRangeAll) {
                if (elements.btnRangeEndgame.classList.contains('active')) {
                    elements.btnRangeAll.click();
                } else {
                    elements.btnRangeEndgame.click();
                }
            }
        });
    }

    // Split game moves into Fuseki, Chuban, and Yose by replaying the board
    // state and delegating each move to phase-detector's detectGamePhaseDynamic.
    window.calculateGamePhases = function() {
        state.gamePhases = { chubanStart: -1, yoseStart: -1 };
        if (!state.allSgfMoves || state.allSgfMoves.length < 20) {
            updateFilterPresets();
            return;
        }

        if (typeof window.detectGamePhaseDynamic !== 'function') {
            updateFilterPresets();
            return;
        }

        // Replay on a temp board so we feed real board state to the detector
        const tempBoard = state.setupBoard
            ? JSON.parse(JSON.stringify(state.setupBoard))
            : Array.from({length: 19}, () =>
                Array.from({length: 19}, () => ({player: null, annotation: null, label: null})));

        let chubanStart = -1;
        let yoseStart = -1;

        for (let i = 0; i < state.allSgfMoves.length; i++) {
            const m = state.allSgfMoves[i];
            if (!m.isPass && m.r >= 0 && m.r < 19 && m.c >= 0 && m.c < 19) {
                playStoneWithCaptures(tempBoard, m.r, m.c, m.player);
            }

            const phase = window.detectGamePhaseDynamic(tempBoard, i, [], { skipCombatGuard: true, moveHistory: state.allSgfMoves });

            if (phase === 'chuban' && chubanStart === -1) chubanStart = i;
            if (phase === 'yose' && yoseStart === -1) yoseStart = i;
        }

        state.gamePhases = { chubanStart, yoseStart };
        updateFilterPresets();
    };

    window.updateFilterPresets = function() {
        if (!elements.btnRangeOpening || !elements.btnRangeMidgame || !elements.btnRangeEndgame) return;
        
        const totalAll = state.allSgfMoves ? state.allSgfMoves.length : 0;
        
        if (totalAll === 0 || !state.gamePhases) {
            elements.btnRangeOpening.textContent = "1–50 (Opening)";
            elements.btnRangeOpening.setAttribute('data-range', "1-50");
            elements.btnRangeMidgame.textContent = "51–150 (Midgame)";
            elements.btnRangeMidgame.setAttribute('data-range', "51-150");
            elements.btnRangeEndgame.textContent = "151–250 (Endgame)";
            elements.btnRangeEndgame.setAttribute('data-range', "151-250");
            elements.btnRangeMidgame.style.display = 'block';
            elements.btnRangeEndgame.style.display = 'block';
            return;
        }
        
        const chubanStart = state.gamePhases.chubanStart;
        const yoseStart = state.gamePhases.yoseStart;
        
        const openingEnd = chubanStart !== -1 ? chubanStart : totalAll;
        elements.btnRangeOpening.textContent = `1–${openingEnd} (Opening)`;
        elements.btnRangeOpening.setAttribute('data-range', `1-${openingEnd}`);
        
        if (chubanStart !== -1) {
            const midgameStart = openingEnd + 1;
            const midgameEnd = yoseStart !== -1 ? yoseStart : totalAll;
            if (midgameStart <= midgameEnd) {
                elements.btnRangeMidgame.textContent = `${midgameStart}–${midgameEnd} (Midgame)`;
                elements.btnRangeMidgame.setAttribute('data-range', `${midgameStart}-${midgameEnd}`);
                elements.btnRangeMidgame.style.display = 'block';
            } else {
                elements.btnRangeMidgame.style.display = 'none';
            }
        } else {
            elements.btnRangeMidgame.style.display = 'none';
        }
        
        if (yoseStart !== -1) {
            const endgameStart = yoseStart + 1;
            elements.btnRangeEndgame.textContent = `${endgameStart}–${totalAll} (Endgame)`;
            elements.btnRangeEndgame.setAttribute('data-range', `${endgameStart}-${totalAll}`);
            elements.btnRangeEndgame.style.display = 'block';
        } else {
            elements.btnRangeEndgame.style.display = 'none';
        }
    };

    // Update active highlight classes on SGF Phase Bar
    window.updatePhaseBar = function() {
        if (!elements.btnPhaseFuseki || !elements.btnPhaseChuban || !elements.btnPhaseYose) return;
        
        const totalAll = state.allSgfMoves ? state.allSgfMoves.length : 0;
        const absIdx = (state.filterStart || 1) - 1 + state.currentMoveIndex;
        
        // Reset node classes to default
        elements.btnPhaseFuseki.className = 'phase-step-node';
        elements.btnPhaseChuban.className = 'phase-step-node';
        elements.btnPhaseYose.className = 'phase-step-node';
        
        const circleFuseki = elements.btnPhaseFuseki.querySelector('.step-circle');
        const circleChuban = elements.btnPhaseChuban.querySelector('.step-circle');
        const circleYose = elements.btnPhaseYose.querySelector('.step-circle');
        
        const lineFusekiChuban = document.getElementById('line-fuseki-chuban');
        const lineChubanYose = document.getElementById('line-chuban-yose');
        
        const lockFuseki = document.getElementById('lock-fuseki');
        const lockChuban = document.getElementById('lock-chuban');
        const lockYose = document.getElementById('lock-yose');
        
        // Reset line classes
        if (lineFusekiChuban) lineFusekiChuban.className = 'step-line';
        if (lineChubanYose) lineChubanYose.className = 'step-line';
        
        // Helper to update lock visibility
        const updateLock = (lockEl, rangeBtnEl) => {
            if (lockEl) {
                if (rangeBtnEl && rangeBtnEl.classList.contains('active')) {
                    lockEl.classList.add('visible');
                } else {
                    lockEl.classList.remove('visible');
                }
            }
        };
        
        updateLock(lockFuseki, elements.btnRangeOpening);
        updateLock(lockChuban, elements.btnRangeMidgame);
        updateLock(lockYose, elements.btnRangeEndgame);
        
        // Reset circle texts to default numbers
        if (circleFuseki) circleFuseki.textContent = '1';
        if (circleChuban) circleChuban.textContent = '2';
        if (circleYose) circleYose.textContent = '3';
        
        if (totalAll === 0 || !state.gamePhases) {
            elements.btnPhaseFuseki.classList.add('active');
            elements.btnPhaseFuseki.style.cursor = 'pointer';
            
            elements.btnPhaseChuban.style.opacity = '0.4';
            elements.btnPhaseChuban.style.pointerEvents = 'none';
            if (lineFusekiChuban) lineFusekiChuban.style.opacity = '0.4';
            
            elements.btnPhaseYose.style.opacity = '0.4';
            elements.btnPhaseYose.style.pointerEvents = 'none';
            if (lineChubanYose) lineChubanYose.style.opacity = '0.4';
            
            // Progress bar
            const fillBar = document.getElementById('phase-progress-bar');
            const fillTextBg = document.getElementById('phase-progress-text-bg');
            const fillTextFg = document.getElementById('phase-progress-text-fg');
            if (fillBar) { fillBar.style.width = '0%'; fillBar.style.backgroundSize = '100% 100%'; }
            if (fillTextBg) fillTextBg.textContent = '0%';
            if (fillTextFg) fillTextFg.textContent = '0%';
            return;
        }
        
        const chubanStart = state.gamePhases.chubanStart;
        const yoseStart = state.gamePhases.yoseStart;
        
        // Show/hide phase availability based on whether they were detected in the SGF
        const hasChuban = chubanStart !== -1;
        const hasYose = yoseStart !== -1;
        
        elements.btnPhaseFuseki.style.opacity = '1';
        elements.btnPhaseFuseki.style.pointerEvents = 'auto';
        
        elements.btnPhaseChuban.style.opacity = hasChuban ? '1' : '0.4';
        elements.btnPhaseChuban.style.pointerEvents = hasChuban ? 'auto' : 'none';
        if (lineFusekiChuban) lineFusekiChuban.style.opacity = hasChuban ? '1' : '0.4';
        
        elements.btnPhaseYose.style.opacity = hasYose ? '1' : '0.4';
        elements.btnPhaseYose.style.pointerEvents = hasYose ? 'auto' : 'none';
        if (lineChubanYose) lineChubanYose.style.opacity = hasYose ? '1' : '0.4';
        
        // Determine active phase
        let activePhase = 'fuseki';
        if (hasYose && absIdx >= yoseStart) {
            activePhase = 'yose';
        } else if (hasChuban && absIdx >= chubanStart) {
            activePhase = 'chuban';
        }
        
        const isGameEnd = totalAll > 0 && absIdx === totalAll - 1;
        
        // Set node states and circle texts based on active phase
        if (activePhase === 'yose') {
            elements.btnPhaseFuseki.classList.add('completed');
            if (circleFuseki) circleFuseki.textContent = '✓';
            
            elements.btnPhaseChuban.classList.add('completed');
            if (circleChuban) circleChuban.textContent = '✓';
            
            if (isGameEnd) {
                elements.btnPhaseYose.classList.add('completed');
                if (circleYose) circleYose.textContent = '✓';
            } else {
                elements.btnPhaseYose.classList.add('active');
            }
            
            if (lineFusekiChuban) lineFusekiChuban.classList.add('complete');
            if (lineChubanYose) lineChubanYose.classList.add('complete');
        } else if (activePhase === 'chuban') {
            elements.btnPhaseFuseki.classList.add('completed');
            if (circleFuseki) circleFuseki.textContent = '✓';
            
            if (isGameEnd) {
                elements.btnPhaseChuban.classList.add('completed');
                if (circleChuban) circleChuban.textContent = '✓';
            } else {
                elements.btnPhaseChuban.classList.add('active');
            }
            
            elements.btnPhaseYose.className = 'phase-step-node'; // default
            
            if (lineFusekiChuban) lineFusekiChuban.classList.add('complete');
        } else {
            if (isGameEnd) {
                elements.btnPhaseFuseki.classList.add('completed');
                if (circleFuseki) circleFuseki.textContent = '✓';
            } else {
                elements.btnPhaseFuseki.classList.add('active');
            }
            
            elements.btnPhaseChuban.className = 'phase-step-node'; // default
            elements.btnPhaseYose.className = 'phase-step-node'; // default
        }
        
        // Calculate & update progress percentage
        // absIdx represents 0-based index of current move.
        // 0% at index -1, 100% when reaching the absolute last move index of totalAll.
        let pct = 0;
        if (totalAll > 0) {
            if (absIdx >= 0) {
                pct = Math.max(1, Math.min(100, Math.round(((absIdx + 1) / totalAll) * 100)));
            }
        }
        const fillBar = document.getElementById('phase-progress-bar');
        const fillTextBg = document.getElementById('phase-progress-text-bg');
        const fillTextFg = document.getElementById('phase-progress-text-fg');
        if (fillBar) { fillBar.style.width = `${pct}%`; fillBar.style.backgroundSize = pct > 0 ? `${10000 / pct}% 100%` : '100% 100%'; }
        if (fillTextBg) fillTextBg.textContent = `${pct}%`;
        if (fillTextFg) fillTextFg.textContent = `${pct}%`;
    };

    window.evaluateStrategicMove = function(r, c, player) {
        if (!state.allSgfMoves || r < 0 || r >= 19 || c < 0 || c >= 19) return 0.0;
        
        // 1. Gather recent move terms to feed tactical volatility metrics
        const recentTerms = [];
        if (state.allSgfMoves && typeof window.detectHypotheticalTerm === 'function') {
            const startIdx = Math.max(0, state.currentMoveIndex - 4);
            for (let i = startIdx; i <= state.currentMoveIndex; i++) {
                const m = state.allSgfMoves[i];
                if (m && !m.isPass) {
                    const termResult = window.detectHypotheticalTerm(m.r, m.c, m.player, i);
                    const term = termResult ? termResult.patternMatch : null;
                    if (term) recentTerms.push(term);
                }
            }
        }

        // 2. Determine active game phase dynamically, ignoring static SGF index flaws.
        let currentPhase = 'fuseki';
        if (typeof window.detectGamePhaseDynamic === 'function') {
            currentPhase = window.detectGamePhaseDynamic(state.board, state.currentMoveIndex, recentTerms, { moveHistory: state.allSgfMoves || [] });
        }
        
        const line = Math.min(c, 18 - c, r, 18 - r) + 1;
        const opponent = player === 'B' ? 'W' : 'B';
        
        // 2. Helper check functions
        const isEmptyCorner = function(row, col) {
            const isCornerR = row <= 3 || row >= 15;
            const isCornerC = col <= 3 || col >= 15;
            if (!isCornerR || !isCornerC) return false;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = row + dr, nc = col + dc;
                    if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                        if (state.board[nr][nc].player !== null) return false;
                    }
                }
            }
            return true;
        };
        
        const getAdjacentWallSize = function(row, col, color) {
            let chainSize = 0;
            const visited = Array.from({ length: 19 }, () => Array(19).fill(false));
            const queue = [];
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            
            for (let [dr, dc] of dirs) {
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                    if (state.board[nr][nc].player === color && !visited[nr][nc]) {
                        visited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
            
            while (queue.length > 0) {
                const [curR, curC] = queue.shift();
                chainSize++;
                for (let [dr, dc] of dirs) {
                    const nr = curR + dr, nc = curC + dc;
                    if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                        if (state.board[nr][nc].player === color && !visited[nr][nc]) {
                            visited[nr][nc] = true;
                            queue.push([nr, nc]);
                        }
                    }
                }
            }
            return chainSize;
        };
        
        const getExtensionDistance = function(row, col) {
            let minDistance = 999;
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for (let [dr, dc] of dirs) {
                for (let step = 1; step <= 6; step++) {
                    const nr = row + dr * step, nc = col + dc * step;
                    if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                        if (state.board[nr][nc].player === player) {
                            if (step < minDistance) minDistance = step;
                            break;
                        }
                        if (state.board[nr][nc].player === opponent) {
                            break;
                        }
                    }
                }
            }
            return minDistance === 999 ? 0 : minDistance;
        };
        
        const isSideExtension = function(row, col) {
            const isSide = (row === 2 || row === 3 || row === 15 || row === 16 || col === 2 || col === 3 || col === 15 || col === 16);
            if (!isSide) return false;
            return getExtensionDistance(row, col) > 0;
        };
        
        const isContact = function(row, col) {
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for (let [dr, dc] of dirs) {
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                    if (state.board[nr][nc].player === opponent) return true;
                }
            }
            return false;
        };
        
        const isCut = function(row, col) {
            const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
            for (let [dr, dc] of diagDirs) {
                const r1 = row + dr, c1 = col;
                const r2 = row, c2 = col + dc;
                const rOpp = row + dr, cOpp = col + dc;
                if (r1 >= 0 && r1 < 19 && c1 >= 0 && c1 < 19 &&
                    r2 >= 0 && r2 < 19 && c2 >= 0 && c2 < 19 &&
                    rOpp >= 0 && rOpp < 19 && cOpp >= 0 && cOpp < 19) {
                    if (state.board[rOpp][cOpp].player === opponent && 
                        (state.board[r1][c1].player === player || state.board[r2][c2].player === player)) {
                        return true;
                    }
                }
            }
            return false;
        };

        const isSenteMove = function(row, col) {
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for (let [dr, dc] of dirs) {
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < 19 && nc >= 0 && nc < 19) {
                    if (state.board[nr][nc].player === opponent) {
                        if (window.Liberties && typeof window.Liberties.computeLibertyMap === 'function') {
                            const map = window.Liberties.computeLibertyMap(state.board);
                            const libs = map.get(`${nc},${nr}`);
                            if (libs && libs.size <= 2) return true;
                        }
                    }
                }
            }
            return false;
        };

        // 3. Evaluate by current phase
        if (currentPhase === 'fuseki') {
            let score = 0.0;
            
            // Corners have highest priority in the opening
            if (isEmptyCorner(r, c)) {
                if (line === 3 || line === 4) {
                    score += 100.0; 
                }
            }
            
            // Base Extension Logic dictates length based on existing wall strength
            if (isSideExtension(r, c)) {
                const wallSize = getAdjacentWallSize(r, c, player);
                const optimalDistance = wallSize + 1; 
                const actualDistance = getExtensionDistance(r, c);
                
                if (actualDistance === optimalDistance) {
                    score += 50.0;
                } else if (actualDistance > optimalDistance) {
                    score -= 20.0; // Over-extension leaves room for invasion
                }
            }
            return score;
        } 
        
        else if (currentPhase === 'chuban') {
            let score = 0.0;
            let territoryLead = 0.0;
            
            if (state.baselineTerritory) {
                const bCount = state.baselineTerritory.black?.length || 0;
                const wCount = state.baselineTerritory.white?.length || 0;
                territoryLead = player === 'B' ? (bCount - wCount) : (wCount - bCount);
            }
            
            const contact = isContact(r, c);
            const cut = isCut(r, c);
            
            // Strategy based on power vs territory balance
            if (territoryLead > 10.0) {
                if (cut) score -= 50.0; // Play safe when ahead
            } else if (territoryLead < -10.0) {
                if (cut) score += 60.0; // Create complications when behind
            }
            
            // "Don't touch what you are attacking" principle
            if (contact) {
                score -= 30.0;
            } else {
                score += 40.0;
            }
            return score;
        } 
        
        else if (currentPhase === 'yose') {
            const basePoints = 5.0; 
            const sente = isSenteMove(r, c);
            const opponentCanSente = isContact(r, c); // Approximate proxy for opponent's follow-up
            
            // Initiative dominates endgame evaluation
            if (sente && opponentCanSente) {
                return Infinity; // Double Sente
            }
            if (sente || opponentCanSente) {
                return basePoints * 2.0; // Sente or Reverse Sente
            }
            
            return basePoints; // Gote
        }
        
        return 0.0;
    };
});

/* ==========================================================================
   MANUAL SCORING MODAL ENGINE (#scoring) - GOSCORER & RE-ARRANGE BUCKETS
   ========================================================================== */

_scoringPersistData = null;

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
    showDead: true,
    showCoords: true,
    komi: DEFAULT_KOMI,
    pendingClick: null,
    blackCaptures: 0,
    whiteCaptures: 0,
    frozen: false
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
        deadBlack: [...scoringState.deadBlack]
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
    updateScoringUI();
    drawBoard();
}

function undoScoring() {
    if (scoringState.frozen || scoringHistory.length === 0) return;
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
    const btnUndo = document.getElementById('btn-scoring-undo');
    const btnRedo = document.getElementById('btn-scoring-redo');
    if (btnUndo) {
        btnUndo.disabled = scoringHistory.length === 0;
        btnUndo.style.opacity = scoringHistory.length > 0 ? '1' : '0.4';
        btnUndo.style.cursor = scoringHistory.length > 0 ? 'pointer' : 'not-allowed';
    }
    if (btnRedo) {
        btnRedo.disabled = scoringFuture.length === 0;
        btnRedo.style.opacity = scoringFuture.length > 0 ? '1' : '0.4';
        btnRedo.style.cursor = scoringFuture.length > 0 ? 'pointer' : 'not-allowed';
    }
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
        btnClose.addEventListener('click', closeScoringModal);
    }
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeScoringModal();
        });
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
            scoringState.komi = parseFloat(e.target.value) || 0;
            updateScoringUI();
            drawBoard();
        });
    }
    const btnKomiMinus = document.getElementById('btn-scoring-komi-dec');
    if (btnKomiMinus) {
        btnKomiMinus.addEventListener('click', () => {
            scoringState.komi = Math.max(-100, scoringState.komi - 0.5);
            if (komiVal) komiVal.value = scoringState.komi;
            updateScoringUI();
            drawBoard();
        });
    }
    const btnKomiPlus = document.getElementById('btn-scoring-komi-inc');
    if (btnKomiPlus) {
        btnKomiPlus.addEventListener('click', () => {
            scoringState.komi = scoringState.komi + 0.5;
            if (komiVal) komiVal.value = scoringState.komi;
            updateScoringUI();
            drawBoard();
        });
    }

    const btnClearBuckets = document.getElementById('btn-scoring-clear-buckets');
    if (btnClearBuckets) {
        btnClearBuckets.addEventListener('click', () => {
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
            if (dialogReset) dialogReset.style.display = 'flex';
            else resetScoringBoardFromState({ pristine: true });
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
        btnSaveScoring.addEventListener('click', saveScoringResult);
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
        scoringState.markedDead[r][c] = false;
        scoringState.deadStonesInfo[r][c] = null;
        const mode = scoringState.interactionMode;
        if (color === 1) { // placing black stone
            if (mode === 'rearrange' && scoringState.rearrangeBlack.length > 0) {
                scoringState.rearrangeBlack.pop();
                scoringState.bucketBlack.pop();
            } else if (mode === 'mark' && scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                scoringState.bucketWhite.pop();
            } else if (mode === 'replace' && scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                const idx = scoringState.bucketWhite.indexOf('B');
                if (idx !== -1) scoringState.bucketWhite.splice(idx, 1);
            } else if (mode === 'replace' && (scoringState.whiteCaptures || 0) > 0) {
                scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
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
            if (mode === 'rearrange' && scoringState.rearrangeWhite.length > 0) {
                scoringState.rearrangeWhite.pop();
                scoringState.bucketWhite.pop();
            } else if (mode === 'mark' && scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                scoringState.bucketBlack.pop();
            } else if (mode === 'replace' && scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                const idx = scoringState.bucketBlack.indexOf('W');
                if (idx !== -1) scoringState.bucketBlack.splice(idx, 1);
            } else if (mode === 'replace' && (scoringState.blackCaptures || 0) > 0) {
                scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
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
    // pristine = the "Reset Board" action: rebuild the untouched SGF terminal EXACTLY like
    // opening the same file on goscorer's test page — every stone present, no dead/territory
    // marks, only the game's own in-game captures and komi. Non-pristine (first modal open)
    // keeps the original auto-seed-from-markup behavior.
    const pristine = !!(options && options.pristine);
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

    // Untouched-position snapshot: the ONLY remaining reader is seedAutoDeadMarks, which
    // auto-detects dead stones from the game's original position on first entry. It is not
    // read for territory, captures, or the result — those come from the live display board
    // (scoringState.board) so re-arrange/replace edits move the score everywhere consistently.
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

    // First entry per game: when the loaded record carries no endgame markup, seed the modal
    // from the goscorer (Sabaki) dead-stone heuristic so auto-marked dead stones and their
    // auto-derived territory are shown and counted EXACTLY like manual marks (one combined
    // set for computing). Never run for a pristine Reset.
    if (!markupMove && !pristine) {
        seedAutoDeadMarks(scoringState);
    }

    // Keep the canonical window reference in sync: the modal draws from window.scoringState,
    // and every mutation targets the same object in production (harmless no-op there), while
    // embedders/tests that inject a separate stub stay consistent.
    window.scoringState = scoringState;

    updateScoringSaveButton();
    updateScoringUI();
    drawBoard();
}

// Seed the scoring session from the goscorer (Sabaki) dead-stone heuristic on the FIRST
// entry per game, when no endgame markup resolved. Auto-detected dead stones are folded
// into the same markedDead / deadStonesInfo / dead-bucket structures as manual marks, so
// the modal treats the algorithm's output and the user's clicks as ONE combined set for
// computing. Territory is auto-derived by drawBoard from the same marks, so both are shown.
function seedAutoDeadMarks(ss) {
    const base = ss.baseBoard || ss.board;
    if (!base || typeof window.BoardEstimate === 'undefined' ||
        typeof window.BoardEstimate.detectDeadStonesHeuristic !== 'function') {
        return false;
    }
    let marked = false;
    try {
        const signData = base.map(row => row.map(v => v === 1 ? 1 : (v === 2 ? -1 : 0)));
        const deadMap = window.BoardEstimate.detectDeadStonesHeuristic(signData);
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (deadMap && deadMap[r] && deadMap[r][c] && base[r][c] !== 0 && !ss.markedDead[r][c]) {
                    const v = base[r][c];
                    ss.markedDead[r][c] = true;
                    ss.deadStonesInfo[r][c] = v;
                    // Lift the stone off the display board, exactly like a manually clicked
                    // dead mark: the X renders on the empty intersection, the stone sits only
                    // in its bucket, and Replace/Re-arrange never see the same stone twice
                    // (once on the board, once in the bucket). baseBoard keeps the canonical
                    // untouched position for the final result.
                    if (ss.board && ss.board[r] && ss.board[r][c] !== undefined) ss.board[r][c] = 0;
                    if (v === 1) {
                        ss.deadBlack.push('B');
                        ss.bucketWhite.push('B');
                    } else if (v === 2) {
                        ss.deadWhite.push('W');
                        ss.bucketBlack.push('W');
                    }
                    marked = true;
                }
            }
        }
    } catch (e) {
        console.error("Auto mark dead error:", e);
        return false;
    }
    return marked;
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

// Count territory/area cells for a given GoScorer score grid, with explicit manualTerritory
// marks always overriding the algorithm. Works for both Japanese (locScores[..].isTerritoryFor)
// and Chinese (areaScores[..] = color) rule modes; when GoScorer is unavailable it falls back
// to counting manual territory only.
function countTerritoryFromScores(ss, locScores, areaScores, ruleMode) {
    let b = 0, w = 0;
    const isJpn = ruleMode === 'japanese';
    for (let y = 0; y < 19; y++) {
        for (let x = 0; x < 19; x++) {
            if (ss.manualTerritory[y][x] > 0) {
                if (ss.manualTerritory[y][x] === 1) b++;
                else if (ss.manualTerritory[y][x] === 2) w++;
            } else if (isJpn && locScores && locScores[y] && locScores[y][x]) {
                if (locScores[y][x].isTerritoryFor === 1) b++;
                else if (locScores[y][x].isTerritoryFor === 2) w++;
            } else if (!isJpn && areaScores && areaScores[y] && areaScores[y][x]) {
                if (areaScores[y][x] === 1) b++;
                else if (areaScores[y][x] === 2) w++;
            }
        }
    }
    return { b, w };
}

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

    if (savedData) {
        restoreScoringFromSavedData(savedData);
        if (savedData._scoringDirty != null) {
            _scoringDirty = savedData._scoringDirty;
            _scoringHasSaved = savedData._scoringHasSaved || false;
            updateScoringSaveButton();
        }
        setScoringFrozen(savedData.frozen !== false);
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
    return {
        board: scoringState.board.map(r => [...r]),
        baseBoard: scoringState.baseBoard ? scoringState.baseBoard.map(r => [...r]) : undefined,
        baseCaptures: scoringState.baseCaptures ? { B: scoringState.baseCaptures.B, W: scoringState.baseCaptures.W } : undefined,
        markedDead: scoringState.markedDead.map(r => [...r]),
        deadStonesInfo: scoringState.deadStonesInfo.map(r => [...r]),
        manualTerritory: scoringState.manualTerritory.map(r => [...r]),
        bucketBlack: [...scoringState.bucketBlack],
        bucketWhite: [...scoringState.bucketWhite],
        rearrangeBlack: [...scoringState.rearrangeBlack],
        rearrangeWhite: [...scoringState.rearrangeWhite],
        deadWhite: [...scoringState.deadWhite],
        deadBlack: [...scoringState.deadBlack],
        ruleMode: scoringState.ruleMode,
        interactionMode: scoringState.interactionMode,
        komi: scoringState.komi,
        blackCaptures: scoringState.blackCaptures,
        whiteCaptures: scoringState.whiteCaptures,
        frozen: scoringState.frozen,
        _scoringDirty: _scoringDirty,
        _scoringHasSaved: _scoringHasSaved
    };
}

function closeScoringModal() {
    if (scoringState.active) {
        _scoringPersistData = buildScoringSessionSnapshot();
    }
    scoringState.active = false;
    const overlay = document.getElementById('scoring-modal-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    const dialog = document.getElementById('scoring-color-picker-dialog');
    if (dialog) dialog.style.display = 'none';
}

function setScoringFrozen(frozen) {
    scoringState.frozen = frozen;
    const overlay = document.getElementById('scoring-frozen-overlay');
    if (overlay) overlay.style.display = frozen ? 'block' : 'none';
}

function updateScoringSaveButton() {
    const btn = document.getElementById('btn-scoring-save');
    const editBtn = document.getElementById('btn-scoring-edit');
    if (!btn) return;

    if (scoringState.frozen) {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.textContent = '✓ Saved';
        btn.style.background = 'rgba(16, 185, 129, 0.5)';
        btn.style.color = '#6ee7b7';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.7)';
        btn.title = 'Scoring board saved';
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

    if (!_scoringDirty && !_scoringHasSaved) {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
        btn.textContent = 'Nothing Changed';
        btn.style.background = 'rgba(107, 114, 128, 0.2)';
        btn.style.color = '#9ca3af';
        btn.style.borderColor = 'rgba(107, 114, 128, 0.3)';
        btn.title = 'Make a change to the board first';
        if (editBtn) editBtn.style.display = 'none';
        return;
    }
    btn.disabled = false;
    btn.style.cursor = 'pointer';
    btn.textContent = 'Save Scoring';
    btn.style.background = 'rgba(239, 68, 68, 0.2)';
    btn.style.color = '#fca5a5';
    btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    btn.title = 'Save scoring to study record';
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
function saveScoringResult() {
    const btn = document.getElementById('btn-scoring-save');
    if (!btn) return;

    // ── Write DD / MA / TB / TW into the terminal SGF node ────────────────
    // Compute the four property arrays from the current scoring session.
    const sgfProps = computeSgfPropertyBars();

    // Find the target move node: the last move in the current sequence.
    // We write to the last element of state.sgfMoves (the terminal node).
    const moveCount = state.sgfMoves ? state.sgfMoves.length : 0;
    if (moveCount > 0 && sgfProps) {
        const lastMove = state.sgfMoves[moveCount - 1];
        if (lastMove) {
            if (!lastMove.unknownProps) lastMove.unknownProps = {};
            // Overwrite any prior scoring properties on this node
            if (sgfProps.dd.length > 0) {
                lastMove.unknownProps.DD = sgfProps.dd.slice();
            } else {
                delete lastMove.unknownProps.DD;
            }
            if (sgfProps.ma.length > 0) {
                lastMove.unknownProps.MA = sgfProps.ma.slice();
            } else {
                delete lastMove.unknownProps.MA;
            }
            if (sgfProps.tb.length > 0) {
                lastMove.unknownProps.TB = sgfProps.tb.slice();
            } else {
                delete lastMove.unknownProps.TB;
            }
            if (sgfProps.tw.length > 0) {
                lastMove.unknownProps.TW = sgfProps.tw.slice();
            } else {
                delete lastMove.unknownProps.TW;
            }
            // Mirror the four properties onto the terminal move's DIRECT fields (same shape as
            // loadSGF) so the Estimation modal Run gate finds the markup immediately, with no
            // reload needed.
            if (sgfProps.dd.length > 0) {
                lastMove.DD = sgfProps.dd.slice();
            } else {
                delete lastMove.DD;
            }
            if (sgfProps.ma.length > 0) {
                lastMove.MA = sgfProps.ma.slice();
            } else {
                delete lastMove.MA;
            }
            if (sgfProps.tb.length > 0) {
                lastMove.TB = sgfProps.tb.slice();
            } else {
                delete lastMove.TB;
            }
            if (sgfProps.tw.length > 0) {
                lastMove.TW = sgfProps.tw.slice();
            } else {
                delete lastMove.TW;
            }
            // Mark SGF as dirty so next export includes these properties
            state.isSgfDirty = true;
        }
    }

    // Save always finalizes the session state (saved flags, frozen) regardless of whether a
    // study record exists; the record block then snapshots the exact last-edited board.
    _scoringDirty = false;
    _scoringHasSaved = true;
    setScoringFrozen(true);

    if (state.activeStudyId && typeof StudyRecordDB !== 'undefined') {
        const rec = StudyRecordDB.getRecord(state.activeStudyId);
        if (rec) {
            // Persist the exact last-edited scoring board as the per-REC snapshot: lifted dead
            // stones, manual territory marks, rearrange/replace buckets, captures, komi, rule/
            // interaction mode, and frozen state. This is the single source of truth for what
            // the modal shows on reopen AND for the blue panel's Run score; DD/MA/TB/TW are
            // derived from it by the shared converter. Territory is intentionally NOT stored
            // as auto-derived points here — manualTerritory is what the user actually marked.
            rec.scoringData = buildScoringSessionSnapshot();

            // Update rec.workingSgf so downloaded SGF files contain DD / MA / TB / TW
            if (typeof generateCurrentSgfString === 'function') {
                rec.workingSgf = generateCurrentSgfString();
            }
            StudyRecordDB.saveRecord(rec);
        }
    }

    // Show "saved" badge on SGF property bars panel
    const badge = document.getElementById('sgf-prop-bars-save-badge');
    if (badge) badge.style.display = '';

    updateScoringSaveButton();
}

function restoreScoringFromSavedData(data) {
    scoringState.board = data.board.map(r => [...r]);
    scoringState.markedDead = data.markedDead.map(r => [...r]);
    scoringState.deadStonesInfo = data.deadStonesInfo ? data.deadStonesInfo.map(r => [...r]) : Array.from({length: 19}, () => Array.from({length: 19}, () => null));
    scoringState.manualTerritory = data.manualTerritory ? data.manualTerritory.map(r => [...r]) : Array.from({length: 19}, () => Array.from({length: 19}, () => 0));
    // Legacy migration: sessions saved before manualTerritory was persisted carried no
    // territory marks and silently fell back to auto-derived territory. If this snapshot has
    // no manual territory but the loaded SGF tree records TB/TW, recover the saved territory
    // so the reopened modal (and every downstream consumer) respects it.
    {
        const norm = normalizeScoringSession({
            board: scoringState.board,
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
    scoringState.ruleMode = data.ruleMode || 'japanese';
    scoringState.interactionMode = data.interactionMode || 'mark';
    // Legacy sessions saved without a komi field fall back to the SGF's real komi (via the
    // SSOT resolver) — never a hardcoded default — so a KM[0] game stays 0 here too.
    scoringState.komi = data.komi != null ? data.komi : extractSgfKomi();
    const elKomiInput = document.getElementById('scoring-komi-val');
    if (elKomiInput) elKomiInput.value = scoringState.komi;
    scoringState.blackCaptures = data.blackCaptures || 0;
    scoringState.whiteCaptures = data.whiteCaptures || 0;
    // Untouched-position snapshot for seedAutoDeadMarks (first-entry auto-detect). The score,
    // saved markup and blue-panel Run all read the live display board + live captures, so
    // legacy sessions simply carry no baseBoard without any behavior change.
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

    // Buckets display total counts matching sum of Re-arrange + Dead + Cap
    const bRe = scoringState.rearrangeBlack ? scoringState.rearrangeBlack.length : 0;
    const bDe = scoringState.deadWhite ? scoringState.deadWhite.length : 0;
    const bCa = scoringState.blackCaptures || 0;
    const bTotalCount = bRe + bDe + bCa;

    const wRe = scoringState.rearrangeWhite ? scoringState.rearrangeWhite.length : 0;
    const wDe = scoringState.deadBlack ? scoringState.deadBlack.length : 0;
    const wCa = scoringState.whiteCaptures || 0;
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
    // SSOT: delegate to the single canonical session→props converter so the prop-bar
    // widget, the SGF save path, and every other consumer can never drift apart.
    return computeScoringPropsFromSession(scoringState);
}

/**
 * Render the DD/MA/TB/TW values in the 4-column bar widget in the scoring modal sidebar.
 * Called from updateScoringUI() after every board change.
 */
function updateSgfPropBarsUI() {
    const props = computeSgfPropertyBars();

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
        if (currentVal !== 0) return;
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
        if (terrColor === 1) {
            const bAvail = scoringState.deadBlack.length > 0 || (scoringState.whiteCaptures || 0) > 0;
            if (!bAvail) return;
            saveScoringStateForUndo();
            scoringState.board[row][col] = 1;
            scoringState.markedDead[row][col] = false;
            scoringState.deadStonesInfo[row][col] = null;
            if (scoringState.deadBlack.length > 0) {
                scoringState.deadBlack.pop();
                const idx = scoringState.bucketWhite.indexOf('B');
                if (idx !== -1) scoringState.bucketWhite.splice(idx, 1);
            } else {
                scoringState.whiteCaptures = Math.max(0, (scoringState.whiteCaptures || 0) - 1);
            }
            updateScoringUI();
            drawBoard();
        } else if (terrColor === 2) {
            const wAvail = scoringState.deadWhite.length > 0 || (scoringState.blackCaptures || 0) > 0;
            if (!wAvail) return;
            saveScoringStateForUndo();
            scoringState.board[row][col] = 2;
            scoringState.markedDead[row][col] = false;
            scoringState.deadStonesInfo[row][col] = null;
            if (scoringState.deadWhite.length > 0) {
                scoringState.deadWhite.pop();
                const idx = scoringState.bucketBlack.indexOf('W');
                if (idx !== -1) scoringState.bucketBlack.splice(idx, 1);
            } else {
                scoringState.blackCaptures = Math.max(0, (scoringState.blackCaptures || 0) - 1);
            }
            updateScoringUI();
            drawBoard();
        } else {
            const bAvail = scoringState.deadBlack.length > 0 || (scoringState.whiteCaptures || 0) > 0;
            const wAvail = scoringState.deadWhite.length > 0 || (scoringState.blackCaptures || 0) > 0;
            if (!bAvail && !wAvail) return;
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
            if (btnB) btnB.style.display = bAvail ? '' : 'none';
            if (btnW) btnW.style.display = wAvail ? '' : 'none';
            dialog.style.display = 'block';
        }
    } else if (scoringState.interactionMode === 'rearrange') {
        const currentVal = scoringState.board[row][col];
        if (currentVal === 1) {
            saveScoringStateForUndo();
            scoringState.board[row][col] = 0;
            scoringState.markedDead[row][col] = false;
            scoringState.rearrangeBlack.push('B');
            scoringState.bucketBlack.push('B');
            updateScoringUI();
            drawBoard();
        } else if (currentVal === 2) {
            saveScoringStateForUndo();
            scoringState.board[row][col] = 0;
            scoringState.markedDead[row][col] = false;
            scoringState.rearrangeWhite.push('W');
            scoringState.bucketWhite.push('W');
            updateScoringUI();
            drawBoard();
        } else if (currentVal === 0) {
            const mode = scoringState.interactionMode;

            // Primary count: stones matching the current mode's type
            const bPrim = mode === 'rearrange'
                ? (scoringState.rearrangeBlack ? scoringState.rearrangeBlack.length : 0)
                : (scoringState.deadBlack ? scoringState.deadBlack.length : 0);
            const wPrim = mode === 'rearrange'
                ? (scoringState.rearrangeWhite ? scoringState.rearrangeWhite.length : 0)
                : (scoringState.deadWhite ? scoringState.deadWhite.length : 0);

            // Fallback total: anything available at all
            const bAll = (scoringState.rearrangeBlack ? scoringState.rearrangeBlack.length : 0)
                       + (scoringState.deadBlack ? scoringState.deadBlack.length : 0)
                       + (scoringState.whiteCaptures || 0);
            const wAll = (scoringState.rearrangeWhite ? scoringState.rearrangeWhite.length : 0)
                       + (scoringState.deadWhite ? scoringState.deadWhite.length : 0)
                       + (scoringState.blackCaptures || 0);

            if (bAll === 0 && wAll === 0) return;

            // ── Happy path: mode tells us the type ──────────────────────────
            // If only one color has mode-type stones → auto-place, no dialog
            if (bPrim > 0 && wPrim === 0) {
                saveScoringStateForUndo();
                scoringState.board[row][col] = 1;
                scoringState.markedDead[row][col] = false;
                scoringState.deadStonesInfo[row][col] = null;
                scoringState.rearrangeBlack.pop();
                scoringState.bucketBlack.pop();
                updateScoringUI(); drawBoard(); return;
            }
            if (wPrim > 0 && bPrim === 0) {
                saveScoringStateForUndo();
                scoringState.board[row][col] = 2;
                scoringState.markedDead[row][col] = false;
                scoringState.deadStonesInfo[row][col] = null;
                scoringState.rearrangeWhite.pop();
                scoringState.bucketWhite.pop();
                updateScoringUI(); drawBoard(); return;
            }

            // Both colors have mode-type stones → ask color only (no step 2)
            if (bPrim > 0 && wPrim > 0) {
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
                return;
            }

            // ── Fallback: mode-type is empty for both colors (e.g. only Cap. left)
            // Show full picker with sub-type step so user can still place from other types
            scoringState.pendingClick = { r: row, c: col };
            const dialog = document.getElementById('scoring-color-picker-dialog');
            if (!dialog) return;
            const canvasViewport = document.getElementById('scoring-board-viewport');
            const vRect = canvasViewport ? canvasViewport.getBoundingClientRect() : rect;
            dialog.style.left = `${Math.min(vRect.width - 260, Math.max(10, clickX - 120))}px`;
            dialog.style.top  = `${Math.min(vRect.height - 220, Math.max(10, clickY - 40))}px`;
            const s1 = document.getElementById('scoring-picker-step1');
            const s2 = document.getElementById('scoring-picker-step2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
            const btnB = document.getElementById('btn-place-black-stone');
            const btnW = document.getElementById('btn-place-white-stone');
            if (btnB) btnB.style.display = bAll > 0 ? '' : 'none';
            if (btnW) btnW.style.display = wAll > 0 ? '' : 'none';
            dialog.style.display = 'block';
            // In fallback, color buttons go to step 2 (sub-type picker)
            if (bAll > 0 && wAll === 0 && showPickerStep2) showPickerStep2(1);
            else if (wAll > 0 && bAll === 0 && showPickerStep2) showPickerStep2(2);
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
    const boardColor = (style.board && style.board.useColor && style.board.color) ? style.board.color : '#DCB35C';
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
    // Build stonesWithDead: restore original colors at markedDead positions.
    const stonesWithDead = scoringState.board.map((row, r) =>
        row.map((val, c) => {
            if (scoringState.markedDead[r][c] && val === 0) {
                // Restore original color from deadStonesInfo
                return scoringState.deadStonesInfo[r][c] || 0;
            }
            return val;
        })
    );

    let locScores = null;
    let areaScores = null;

    if (window.GoScorer) {
        if (scoringState.ruleMode === 'japanese') {
            try {
                locScores = window.GoScorer.territoryScoring(stonesWithDead, scoringState.markedDead, false);
            } catch(err) {
                console.error("GoScorer territory error:", err);
            }
        } else {
            try {
                areaScores = window.GoScorer.areaScoring(stonesWithDead, scoringState.markedDead);
            } catch(err) {
                console.error("GoScorer area error:", err);
            }
        }
    }


    // 6. Render Stones
    for (let r = 0; r < 19; r++) {
        for (let c = 0; c < 19; c++) {
            const val = scoringState.board[r][c];
            const cx = PADDING + c * CELL_SIZE;
            const cy = PADDING + r * CELL_SIZE;

            if (val === 1) {
                drawCellContent(ctx, { player: 'B', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c);
            } else if (val === 2) {
                drawCellContent(ctx, { player: 'W', annotation: null, label: null }, cx, cy, CELL_SIZE, false, null, boardColor, null, r, c);
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
        for (let r = 0; r < 19; r++) {
            for (let c = 0; c < 19; c++) {
                if (scoringState.manualTerritory[r][c] > 0) {
                    renderTerritoryRect(r, c, scoringState.manualTerritory[r][c]);
                    continue;
                }
                if (scoringState.board[r][c] === 0) {
                    let terrColor = null; // 1 = Black, 2 = White

                    if (scoringState.ruleMode === 'japanese' && locScores) {
                        terrColor = locScores[r][c].isTerritoryFor;
                    } else if (scoringState.ruleMode === 'chinese' && areaScores) {
                        terrColor = areaScores[r][c];
                    }

                    renderTerritoryRect(r, c, terrColor);
                }
            }
        }
    }

    // 8. Update Score Breakdown Display
    let bTerr = 0, wTerr = 0, bDead = 0, wDead = 0;
    let bTotal, wTotal, komi;
    if (scoringState.ruleMode === 'japanese') {
        if (locScores) {
            for (let y = 0; y < 19; y++) {
                for (let x = 0; x < 19; x++) {
                    // Manual territory overrides GoScorer
                    if (scoringState.manualTerritory[y][x] > 0) {
                        if (scoringState.manualTerritory[y][x] === 1) bTerr++;
                        else if (scoringState.manualTerritory[y][x] === 2) wTerr++;
                    } else {
                        if (locScores[y][x].isTerritoryFor === 1) bTerr++;
                        else if (locScores[y][x].isTerritoryFor === 2) wTerr++;
                    }
                }
            }
        } else {
            // Fallback: count manual territory even without GoScorer
            for (let y = 0; y < 19; y++) {
                for (let x = 0; x < 19; x++) {
                    if (scoringState.manualTerritory[y][x] === 1) bTerr++;
                    else if (scoringState.manualTerritory[y][x] === 2) wTerr++;
                }
            }
        }
        // Japanese rules: prisoners = dead stones of the OPPONENT color + game captures
        // dead White stones → Black captured them → count for BLACK (+1 each)
        // dead Black stones → White captured them → count for WHITE (+1 each)
        // Dead accounting comes from the MARKS (auto + recorded + manual are one set).
        bDead = countMarkedDeadStones(scoringState, 2);
        wDead = countMarkedDeadStones(scoringState, 1);
        const bCaps = scoringState.blackCaptures || 0;
        const wCaps = scoringState.whiteCaptures || 0;
        komi = scoringState.komi;
        bTotal = bTerr + bDead + bCaps;
        wTotal = wTerr + wDead + wCaps + komi;

        const elBF = document.getElementById('scoring-black-formula');
        const elBT = document.getElementById('scoring-black-total');
        const elWF = document.getElementById('scoring-white-formula');
        const elWT = document.getElementById('scoring-white-total');

        if (elBF) elBF.textContent = `${bTerr} (territory) + ${bDead} (dead) + ${bCaps} (caps)`;
        if (elBT) elBT.textContent = `= ${bTotal}`;
        if (elWF) elWF.textContent = `${wTerr} (territory) + ${wDead} (dead) + ${wCaps} (caps) + ${komi} (komi)`;
        if (elWT) elWT.textContent = `= ${wTotal}`;
    } else {
        let bArea = 0, wArea = 0;
        if (areaScores) {
            for (let y = 0; y < 19; y++) {
                for (let x = 0; x < 19; x++) {
                    // Manual territory overrides GoScorer
                    if (scoringState.manualTerritory[y][x] > 0) {
                        if (scoringState.manualTerritory[y][x] === 1) bArea++;
                        else if (scoringState.manualTerritory[y][x] === 2) wArea++;
                    } else {
                        if (areaScores[y][x] === 1) bArea++;
                        else if (areaScores[y][x] === 2) wArea++;
                    }
                }
            }
        } else {
            // Fallback: count manual territory even without GoScorer
            for (let y = 0; y < 19; y++) {
                for (let x = 0; x < 19; x++) {
                    if (scoringState.manualTerritory[y][x] === 1) bArea++;
                    else if (scoringState.manualTerritory[y][x] === 2) wArea++;
                }
            }
        }
        // Chinese area scoring: living stones + territory + dead opponent stones as prisoners
        const bDeadA = countMarkedDeadStones(scoringState, 2);
        const wDeadA = countMarkedDeadStones(scoringState, 1);
        const bCapsA = scoringState.blackCaptures || 0;
        const wCapsA = scoringState.whiteCaptures || 0;
        komi = scoringState.komi;
        // Note: goscorer areaScoring already counts living stones as part of area.
        // Dead opponent stones are prisoners, add them explicitly.
        bTotal = bArea + bDeadA;
        wTotal = wArea + wDeadA + komi;

        const elBF = document.getElementById('scoring-black-formula');
        const elBT = document.getElementById('scoring-black-total');
        const elWF = document.getElementById('scoring-white-formula');
        const elWT = document.getElementById('scoring-white-total');

        if (elBF) elBF.textContent = `${bArea} (area) + ${bDeadA} (dead prisoners)`;
        if (elBT) elBT.textContent = `= ${bTotal}`;
        if (elWF) elWF.textContent = `${wArea} (area) + ${wDeadA} (dead prisoners) + ${komi} (komi)`;
        if (elWT) elWT.textContent = `= ${wTotal}`;
    }

    // ── RESULT — always equal to the Computing formula above ─────────────
    // The result badge must equal the per-color Computing formula (territory + dead + caps +
    // komi) that is rendered right next to it, or the two displays show arithmetic that
    // doesn't add up (e.g. a W+6 badge beside a formula whose terms sum to W+4). Both are
    // computed from the SAME live state: the display board (scoringState.board), the mark
    // set, and the live capture fields (blackCaptures/whiteCaptures). Re-arranging / Replacing
    // dead stones legitimately moves the result — that is the point of editing the board, and
    // every saved consumer (rec.scoringData, the blue panel Run, exported DD/MA/TB/TW) reads
    // the same live session. baseBoard/baseCaptures are kept only as the untouched-position
    // seed that seedAutoDeadMarks reads on first entry; they no longer drive the score.
    let fBTotal, fWTotal;
    const finalBoard = scoringState.board;
    let finalLocScores = null;
    let finalAreaScores = null;
    if (window.GoScorer && finalBoard) {
        const finalStonesWithDead = finalBoard.map((row, r) =>
            row.map((val, c) => {
                if (scoringState.markedDead[r] && scoringState.markedDead[r][c] && val === 0) {
                    return scoringState.deadStonesInfo[r][c] || 0;
                }
                return val;
            })
        );
        try {
            if (scoringState.ruleMode === 'japanese') {
                finalLocScores = window.GoScorer.territoryScoring(finalStonesWithDead, scoringState.markedDead, false);
            } else {
                finalAreaScores = window.GoScorer.areaScoring(finalStonesWithDead, scoringState.markedDead);
            }
        } catch (err) {
            console.error("GoScorer final error:", err);
        }
    }
    const finalTerr = countTerritoryFromScores(scoringState, finalLocScores, finalAreaScores, scoringState.ruleMode);
    const fBDead = countMarkedDeadStones(scoringState, 2);
    const fWDead = countMarkedDeadStones(scoringState, 1);
    const fBCaps = scoringState.blackCaptures || 0;
    const fWCaps = scoringState.whiteCaptures || 0;
    if (scoringState.ruleMode === 'japanese') {
        fBTotal = finalTerr.b + fBDead + fBCaps;
        fWTotal = finalTerr.w + fWDead + fWCaps + komi;
    } else {
        fBTotal = finalTerr.b + fBDead;
        fWTotal = finalTerr.w + fWDead + komi;
    }
    const elResult = document.getElementById('scoring-result-display');
    if (elResult) {
        const diff = fBTotal - fWTotal;
        let text;
        if (diff > 0) text = `B+${Number.isInteger(diff) ? diff : diff.toFixed(1)}`;
        else if (diff < 0) text = `W+${Number.isInteger(-diff) ? -diff : (-diff).toFixed(1)}`;
        else text = 'Draw';
        elResult.textContent = text;
    }
    
    ctx.restore();
}

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScoringModal);
} else {
    initScoringModal();
}

