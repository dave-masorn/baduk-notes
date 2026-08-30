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
    // Variation Add mode: click an empty point to start/extend a branch (stays armed).
    if (state.variationEditMode) {
        if (c >= 0 && c <= 18 && r >= 0 && r <= 18 && !state.board[r][c].player) {
            const ok = addVariationAt(r, c);
            if (!ok) playSfx('annotUndo');
        }
        drawBoard();
        return;
    }

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
        // Variation Add mode: amber ghost stone preview at empty intersections.
        if (state.variationEditMode) {
            if (c >= 0 && c <= 18 && r >= 0 && r <= 18 && !state.board[r][c].player) {
                if (!state.variationHover || state.variationHover.r !== r || state.variationHover.c !== c) {
                    state.variationHover = { r, c };
                    drawBoard();
                }
            } else if (state.variationHover) {
                state.variationHover = null;
                drawBoard();
            }
            [elements.canvasInitial, elements.canvasStudy].forEach(canv => {
                if (canv) canv.style.cursor = 'crosshair';
            });
            return;
        } else if (state.variationHover) {
            state.variationHover = null;
            drawBoard();
        }

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
            state.isSgfDirty = true; state.sgfTreeIsCanonical = false; state.popupShownForCurrentChange = false;
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
        playSfx('annot');
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
    
    state.isSgfDirty = true; state.sgfTreeIsCanonical = false; state.popupShownForCurrentChange = false;
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
            style = getEffectiveInitialStyle();
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
                        audio = new Audio(SFX_BASE64.stone);
                        audio.volume = 0.4;
                        state.fastForwardAnim.audioPool.push(audio);
                    }
                    if (audio) {
                        playSfx(audio);
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

        // 1. Draw canvas background color. The BG control applies ONLY to the
        // main (#go-board-canvas-initial) and study (#go-board-canvas-study) boards — the
        // export preview and the scoring board keep their fixed white fill, so the picked
        // color is read only for those two canvases.
        let canvasBgColor = '#ffffff';
        if ((isInitialCanvas || isStudyMode) && style && style.bg && style.bg.color) {
            canvasBgColor = style.bg.color;
        }
        // BG solid ON fills the canvas with the picked color; solid OFF (default) leaves the
        // main/study canvas 100% transparent so whatever sits behind the board (the page)
        // shows through. The export preview and scoring board keep their fixed canvas fill.
        const isMainOrStudy = isInitialCanvas || isStudyMode;
        const bgSolid = isMainOrStudy && style && style.bg && style.bg.solid === true;
        if (!isMainOrStudy || bgSolid) {
            ctx.fillStyle = canvasBgColor;
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }

        // 1.1 Draw board background wood color or image
        let currentBoardBg = '#dcb35c';
        let currentBorderMarginColor = '#dcb35c';
        let currentBorderLineColor = isPlayerMode ? '#1C1917' : '#000000';
        let currentBorderWidth = isPlayerMode ? 1 : 1.5;
        let borderScale = 1;
        let borderOverrideOn = true;
        
        let boardImage = null;
        
        if (style) {
            currentBoardBg = (style.board && style.board.color) ? style.board.color : '#dcb35c';
            currentBorderMarginColor = style.border ? style.border.color : '#dcb35c';
            borderScale = (style.border && style.border.size !== undefined) ? Math.min(1, parseFloat(style.border.size) / 100) : 1;
            borderOverrideOn = !style.border || style.border.override !== false;
            
            if (style.board && !style.board.useColor && style.board.imgSrc) {
                const cacheKey = isInitialCanvas ? 'initialBoardBgImage' : 'studyBoardBgImage';
                const bgImg = window.loadBoardTextureImage(cacheKey, style.board.imgSrc, () => {
                    if (typeof drawBoard === 'function') drawBoard();
                });
                if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                    boardImage = bgImg;
                }
            }
        }
        
        // Calculate wood margin size
        const marginSize = (CELL_SIZE / 2) * borderScale;
        const woodX = PADDING - marginSize;
        const woodY = PADDING - marginSize;
        const woodW = 18 * CELL_SIZE + 2 * marginSize;
        const woodH = 18 * CELL_SIZE + 2 * marginSize;

        // Fill the outer wood area (margin). With Override ON (default) the margin is the
        // picked border color; with Override OFF it takes the board bg color instead.
        ctx.fillStyle = borderOverrideOn ? currentBorderMarginColor : currentBoardBg;
        ctx.fillRect(woodX, woodY, woodW, woodH);

        // Always fill the inner grid area with the Board Color first so transparent image/texture sits on top of it, and color acts as fallback if image isn't loaded!
        if (borderOverrideOn) {
            ctx.fillStyle = currentBoardBg;
            ctx.fillRect(PADDING, PADDING, 18 * CELL_SIZE, 18 * CELL_SIZE);
        }

        // Then draw the Board Image on top if present.
        // With Override ON the board image must never spill over the border margin,
        // so it is clipped to the 19x19 grid area; with Override OFF it fills the whole wood.
        if (boardImage) {
            let imgZoom = 1.0;
            let imgOffsetX = 0;
            let imgOffsetY = 0;
            let imgOpacity = 1.0;
            let imgBlendMode = 'normal';
            if (style && style.board) {
                if (style.board.imgZoom !== undefined) imgZoom = parseFloat(style.board.imgZoom);
                if (style.board.imgOffsetX !== undefined) imgOffsetX = parseFloat(style.board.imgOffsetX);
                if (style.board.imgOffsetY !== undefined) imgOffsetY = parseFloat(style.board.imgOffsetY);
                if (style.board.imgOpacity !== undefined) {
                    const parsedOp = parseFloat(style.board.imgOpacity);
                    if (!isNaN(parsedOp)) imgOpacity = Math.max(0, Math.min(1, parsedOp));
                }
                if (style.board.imgBlendMode) imgBlendMode = style.board.imgBlendMode;
            }
            const compositeOp = (imgBlendMode && imgBlendMode !== 'normal') ? imgBlendMode : 'source-over';

            const imgRectX = borderOverrideOn ? PADDING : woodX;
            const imgRectY = borderOverrideOn ? PADDING : woodY;
            const imgRectW = borderOverrideOn ? 18 * CELL_SIZE : woodW;
            const imgRectH = borderOverrideOn ? 18 * CELL_SIZE : woodH;

            if (style && style.board && style.board.imgRepeat) {
                ctx.save();
                ctx.globalAlpha = imgOpacity;
                ctx.globalCompositeOperation = compositeOp;
                ctx.translate(woodX, woodY);
                try {
                    const pattern = ctx.createPattern(boardImage, 'repeat');
                    if (pattern.setTransform) {
                        const matrix = new DOMMatrix().translate(imgOffsetX, imgOffsetY).scale(imgZoom, imgZoom);
                        pattern.setTransform(matrix);
                    }
                    ctx.fillStyle = pattern;
                    ctx.fillRect(imgRectX - woodX, imgRectY - woodY, imgRectW, imgRectH);
                } catch (e) {
                    ctx.fillStyle = currentBoardBg;
                    ctx.fillRect(imgRectX - woodX, imgRectY - woodY, imgRectW, imgRectH);
                }
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = imgOpacity;
                ctx.globalCompositeOperation = compositeOp;
                ctx.beginPath();
                ctx.rect(imgRectX, imgRectY, imgRectW, imgRectH);
                ctx.clip();
                
                const scaledW = woodW * imgZoom;
                const scaledH = woodH * imgZoom;
                const dx = woodX + (woodW - scaledW) / 2 + imgOffsetX;
                const dy = woodY + (woodH - scaledH) / 2 + imgOffsetY;
                ctx.drawImage(boardImage, dx, dy, scaledW, scaledH);
                
                ctx.restore();
            }
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
        
        // Draw horizontal & vertical grid lines — interior lines only (i = 1..17), drawn
        // exactly as the original loop's interior branches. The outer boundary (BDL) is
        // stroked below as a single rect, the same way the MSM scoring board strokes its
        // wood outline (strokeRect at :5197-5200), so the 4 corners join as clean miter
        // corners instead of two independent line ends meeting.
        for (let i = 1; i < 18; i++) {
            const offset = PADDING + i * CELL_SIZE;
            
            // Vertical line
            ctx.beginPath();
            ctx.moveTo(offset, PADDING);
            ctx.lineTo(offset, CANVAS_SIZE - PADDING);
            ctx.stroke();

            // Horizontal line
            ctx.beginPath();
            ctx.moveTo(PADDING, offset);
            ctx.lineTo(CANVAS_SIZE - PADDING, offset);
            ctx.stroke();
        }

        // Outer boundary line (BDL) — single strokeRect, miter-joined true corners,
        // matching the MSM scoring board's wood-outline strokeRect.
        ctx.save();
        ctx.lineWidth = (style && style.grid) ? (parseFloat(style.grid.boundarySize) || 1.5) : 1.5;
        ctx.strokeStyle = (style && style.grid) ? (style.grid.boundaryColor || '#1c1917') : '#1c1917';
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        ctx.strokeRect(PADDING, PADDING, 18 * CELL_SIZE, 18 * CELL_SIZE);
        ctx.restore();

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
        const clipRect = {
            x: PADDING - CELL_SIZE / 2,
            y: PADDING - CELL_SIZE / 2,
            w: boardWidth,
            h: boardWidth
        };

        // Variation-Add mode (mid-line): the new stone ALTERNATES the current
        // move — fade that move's own stone so the position reads "as if X
        // were lifted off", while the cursor carries its replacement.
        let varFadeStone = null;
        if (state.variationEditMode) {
            const vTotal = state.allSgfMoves ? state.allSgfMoves.length : 0;
            const vAbs = (state.filterStart || 1) - 1 + Math.max(-1, state.currentMoveIndex);
            if (vAbs >= 0 && vAbs < vTotal - 1 && state.allSgfMoves[vAbs] && !state.allSgfMoves[vAbs].isPass) {
                const vmv = state.allSgfMoves[vAbs];
                if (vmv.r >= 0 && vmv.r < 19 && vmv.c >= 0 && vmv.c < 19) varFadeStone = { r: vmv.r, c: vmv.c };
            }
        }

        // Pass 1: Draw Board Mask (BM layer) for all cells
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
                    
                    let cellToDraw = cell;
                    if (ffAnimating && !drawAnnotations) {
                        cellToDraw = { player: cell.player, annotation: null, label: null };
                    }
                    const isFadedCell = varFadeStone && varFadeStone.r === r && varFadeStone.c === c;
                    if (isFadedCell) { ctx.save(); ctx.globalAlpha = 0.35; }
                    drawCellContent(ctx, cellToDraw, cx, cy, CELL_SIZE, false, clipRect, currentBoardBg, null, r, c, 'bm');
                    if (isFadedCell) ctx.restore();
                }
            }
        }

        // Pass 2: Draw Stones, Shadows & Annotations for all cells
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
                    
                    let cellToDraw = cell;
                    if (ffAnimating && !drawAnnotations) {
                        cellToDraw = { player: cell.player, annotation: null, label: null };
                    }
                    const isFadedCell2 = varFadeStone && varFadeStone.r === r && varFadeStone.c === c;
                    if (isFadedCell2) { ctx.save(); ctx.globalAlpha = 0.35; }
                    drawCellContent(ctx, cellToDraw, cx, cy, CELL_SIZE, false, clipRect, currentBoardBg, null, r, c, 'stone');
                    if (isFadedCell2) ctx.restore();
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
                        const effInitialCanvasStyle = getEffectiveInitialStyle();
                        if (isInitialCanvas && effInitialCanvasStyle) {
                            const blackStoneFg = effInitialCanvasStyle.blackStone?.fg || '#ffffff';
                            const whiteStoneFg = effInitialCanvasStyle.whiteStone?.fg || '#111827';
                            ctx.fillStyle = cell.player === 'B' ? blackStoneFg : whiteStoneFg;
                            
                            const fgSizeVal = cell.player === 'B' ? effInitialCanvasStyle.blackStone?.fgSize : effInitialCanvasStyle.whiteStone?.fgSize;
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
            
            ctx.save();
            ctx.globalAlpha = isHover ? 0.4 : 0.6;
            const clipR = { x: PADDING - CELL_SIZE / 2, y: PADDING - CELL_SIZE / 2, w: boardWidth, h: boardWidth };
            drawCellContent(ctx, pCell, cx, cy, CELL_SIZE, false, clipR, currentBoardBg, null, tgt.r, tgt.c, 'all');
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

        // 9.4. Draw Variation-Add ghost stone (amber ring). Mid-line it
        // previews an ALTERNATIVE to the current move (same color); at the
        // line's tip it previews a CONTINUATION (next color).
        if (state.variationEditMode && state.variationHover) {
            const tgt = state.variationHover;
            const absIdx = (state.filterStart || 1) - 1 + Math.max(-1, state.currentMoveIndex);
            const ghTotal = state.allSgfMoves ? state.allSgfMoves.length : 0;
            let p = 'B';
            if (absIdx >= 0 && state.allSgfMoves[absIdx]) {
                p = (absIdx === ghTotal - 1)
                    ? (state.allSgfMoves[absIdx].player === 'B' ? 'W' : 'B')
                    : state.allSgfMoves[absIdx].player;
            } else if (state.plColor) {
                p = state.plColor === 'W' ? 'W' : 'B';
            }
            const { cx, cy } = getAnimatedPos(tgt.r, tgt.c, undefined);
            ctx.save();
            ctx.globalAlpha = 0.45;
            const pCell = { player: p, annotation: null, label: null };
            const clipR = { x: PADDING - CELL_SIZE / 2, y: PADDING - CELL_SIZE / 2, w: boardWidth, h: boardWidth };
            drawCellContent(ctx, pCell, cx, cy, CELL_SIZE, false, clipR, currentBoardBg, null, tgt.r, tgt.c, 'all');
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = Math.max(2, CELL_SIZE * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE * 0.48, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
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

// Deterministic hash → [0,1). Maps integer lattice coords + seed to a
// stable pseudo-random value. Used to build value noise.
function _hash2D(ix, iy, seed) {
    const h = ix * 374761393 + iy * 668265263 + seed * 1442695040888963407;
    const x = (h % 4294967296) >>> 0;
    const n = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function _smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// Bilinearly-interpolated value noise on a unit lattice.
function _valueNoise2D(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = _smoothstep(fx), sy = _smoothstep(fy);
    const v00 = _hash2D(x0, y0, seed);
    const v10 = _hash2D(x0 + 1, y0, seed);
    const v01 = _hash2D(x0, y0 + 1, seed);
    const v11 = _hash2D(x0 + 1, y0 + 1, seed);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
}

// Fractal Brownian motion — a few octaves of value noise summed at
// exponentially decreasing amplitude.
function _fbm(x, y, seed, octaves = 4) {
    let value = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
        value += _valueNoise2D(x * freq, y * freq, seed + o * 101) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.15;
    }
    return value / norm;
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
 * Slate surface texture — REWRITTEN from stroked "flow-field" lines to
 * procedural domain-warped fractal noise, rendered per-pixel.
 *
 * Why: the flow-field lines read as clearly *drawn* strokes (someone
 * traced lines), not as a photographed surface. This version samples a
 * domain-warped fBm field at every pixel and stamps the grayscale result
 * into an ImageData buffer — the surface reads as continuous organic
 * grain, the way real polished slate looks up close.
 *
 * The output is pure grayscale. Color is added later, in drawGoStone(),
 * via the base radial gradient + 'overlay' compositing. Overlay can only
 * scale luminance, it can't shift hue, so "texture only, color untouched"
 * stays true.
 *
 * Wobble/variation sources per stone: cloudSeed. It offsets the noise
 * domain AND seeds the fleck RNG, so each stone still gets a unique
 * surface — just unique in the "different patch of the same stone" way
 * instead of the old "different decorative pattern" way.
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

    // ---- Per-pixel domain-warped fBm noise ----
    // Inigo Quilez's classic domain warping: sample the field twice at
    // slightly offset frequencies, then use those two values as offsets
    // into a third field — the "warp" turns smooth blobs into organic
    // swirling grain. Frequency is tied to radius so the grain reads at
    // the same visual scale on every stone size.
    const img = tctx.createImageData(size, size);
    const data = img.data;
    const freq = 3.2 / radius;
    const warpStrength = 2.6;
    const grainAmp = 30;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = (x / size) * 2 - 1;
            const ny = (y / size) * 2 - 1;
            const d = Math.sqrt(nx * nx + ny * ny);
            const idx = (y * size + x) * 4;
            if (d > 1) continue; // transparent outside the stone circle
            // warp fields at slightly different offsets/frequencies
            const qx = _fbm(nx + cloudSeed * 3.1, ny + cloudSeed * 1.7, cloudSeed * 7 + 1, 3);
            const qy = _fbm(nx + cloudSeed * 5.3 + 5.2, ny + cloudSeed * 2.9 + 1.3, cloudSeed * 11 + 2, 3);
            // final field, offset by the warp
            const warped = _fbm(
                nx + warpStrength * (qx - 0.5),
                ny + warpStrength * (qy - 0.5),
                cloudSeed * 13 + 3,
                4
            );
            const gray = Math.max(0, Math.min(255, Math.round(128 + (warped - 0.5) * 2 * grainAmp)));
            data[idx]     = gray;
            data[idx + 1] = gray;
            data[idx + 2] = gray;
            data[idx + 3] = 255;
        }
    }
    tctx.putImageData(img, 0, 0);

    // ---- Sparse bright micro-flecks ----
    // Tiny bright specks — mineral inclusions catching the light. Sparse,
    // faint, and scaled to radius so they read at the same visual density
    // on big and small stones.
    const FLECK_COUNT = Math.min(30, Math.floor(radius * 0.4));
    const fleckBrightness = 0.15 + rand() * 0.35; // per-stone: 0.15–0.5
    for (let i = 0; i < FLECK_COUNT; i++) {
        const fAngle = rand() * Math.PI * 2;
        const fDist = Math.sqrt(rand()) * radius * 0.9;
        const fx2 = cx + Math.cos(fAngle) * fDist;
        const fy2 = cy + Math.sin(fAngle) * fDist;
        const fleckAlpha = (0.05 + rand() * 0.09) * fleckBrightness;
        tctx.fillStyle = `rgba(225,230,240,${fleckAlpha})`;
        tctx.fillRect(fx2, fy2, 0.9, 0.9);
    }

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
        // ============ SLATE — matte, mottled, near-uniform black ============
        // Rebuilt against a high-res photo: real nachiguro has almost NO
        // gloss (no tight bright core) and almost NO rim darkening (the
        // whole disk stays close to one dark value; the previous version's
        // drop to near-black #020303 at the edge and bright glassy core
        // were both wrong). What actually varies is the subtle mottled
        // cloudiness (handled by _getSlateTexture) plus a very gentle
        // overall tone/value drift (tintAmount/valueShift below).
        let coreColor = _lerpColor('#333739', '#37403f', tintAmount);
        if (valueShift !== 0) {
            const lightenTarget = valueShift > 0 ? '#565d60' : '#0a0b0c';
            coreColor = _lerpColor(coreColor, lightenTarget, Math.abs(valueShift) * 0.35);
        }
        // specStrength now only lifts the core a little — this is matte
        // stone, not glass, so keep the ceiling low even at full 0.5 cap.
        const brightCore = _lerpColor(coreColor, '#4a5153', specStrength * 0.6);
        const rimColor = _lerpColor(coreColor, '#000000', 0.4);

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
        // CHANGED: 'overlay' blend instead of normal alpha compositing. The
        // texture is pure grayscale (see _getSlateTexture): color is only
        // carried by the base gradient, and 'overlay' can only scale
        // luminance, never shift hue — so the color logic of this function
        // (all the _lerpColor calls below) stays exactly as it was. This is
        // the one line that makes "texture only, color untouched" true.
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(tex, cx - radius, cy - radius);
        ctx.globalCompositeOperation = 'source-over';
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
 * position, so each stone gets a distinct "shell"/"slate" look that stays
 * STABLE across redraws (no reroll/flicker on hover, undo, export preview,
 * etc.) — same (row, col, player) always yields the same variant.
 *
 * Seeded by POSITION (row, col), not by placement: capturing and replaying
 * a stone on the same point keeps the same grain pattern.
 *
 * Specular is capped at 0–0.5 (50%): real hamaguri/slate finishes are
 * gentle, and un-capped randomness occasionally rolled a near-glass glint
 * that looked out of place next to the matte ones.
 *
 * originAngle is randomized across the FULL circle so hamaguri stones on
 * the same board show growth bands curving in different directions,
 * rather than every stone sharing one fixed grain direction.
 *
 * Hamaguri grade (whiteness): Snow shells are rare (only ~5-10% of
 * natural shells qualify), pure white, with extremely fine, dense,
 * uniform grain. Blossom is the everyday grade — wider, coarser,
 * warmer-toned grain. So the majority of stones should be Blossom with
 * a scattering of Snow.
 *
 * Slate: real nachiguro is uniform matte black with subtle surface
 * mottle — NOT a glossy dark-blue-green glass (that's a common render
 * error). The stone-to-stone variation is in tone/value and in the
 * mottle pattern, not in color cast. So:
 *   - tintAmount blends a neutral "kuro" black with a blue-green "ao"
 *     cast — REAL Kuroki slate is closer to 90-95% pure black, so keep
 *     the tint range small (0.3–0.8 → we mostly stay near-neutral).
 *   - valueShift (±1) adds a subtle lighter/darker overall value drift,
 *     and cloudSeed varies the mottle pattern.
 *
 * ADJUSTABLE: the constants below (snowProbability, specularStrength cap,
 * tint range, etc.) control how wide a spread of variants you'll see.
 */
function getStoneVariant(row, col, player) {
    // Distinct seed space per player so black/white don't share patterns
    // even when a black and white stone happen to occupy mirrored spots.
    const seed = (row * 19 + col) * 137 + (player === 'B' ? 911 : 313);
    const rand = _mulberry32(seed);

    if (player === 'B') {
        // ---- Slate ----
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
            tintAmount: rand(),               // 0.0–1.0, kuro(0)↔ao(1) cast
            valueShift: valueShift,           // -1..1, skewed darker (80/20)
            cloudSeed: Math.floor(rand() * 10000),
            specularStrength: rand() * 0.5,   // 0–0.5 HARD CAP (50%)
        };
    } else {
        // ---- Hamaguri ----
        const snowProbability = 0.2; // ADJUSTABLE — real incidence is ~5–10%
        const isSnow = rand() < snowProbability;

        if (isSnow) {
            // Snow grade — fine, dense, uniform grain
            return {
                ringCount: 30 + Math.floor(rand() * 16),     // 30–46
                ringJitter: 0.3 + rand() * 0.35,             // 0.3–0.65
                originAngle: rand() * Math.PI * 2,           // 0–2π
                originDistMult: 7 + rand() * 3,              // 7–10, straighter bands
                whiteness: 0.75 + rand() * 0.25,             // 0.75–1.0, near-pure white
            };
        } else {
            // Blossom grade — wider, coarser grain
            return {
                ringCount: 8 + Math.floor(rand() * 10),      // 8–17
                ringJitter: 0.7 + rand() * 0.8,              // 0.7–1.5
                originAngle: rand() * Math.PI * 2,           // 0–2π
                originDistMult: 3.5 + rand() * 2.5,          // 3.5–6, more visible bow
                whiteness: 0.1 + rand() * 0.55,              // 0.1–0.65, warm cream
            };
        }
    }
}

// Helper: Draw single cell elements (stones, annotations, labels)
function drawCellContent(targetCtx, cell, cx, cy, cellSize, isExport = false, clipRect = null, bgColor = '#DCB35C', fullBoardRect = null, r = null, c = null, renderPass = 'all') {
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
        style = getEffectiveInitialStyle();
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
        // Seed a folder texture-reference load for canvases that have no cached
        // image yet (scoring/export); board image loads asynchronously and the
        // onload redraw picks it up, while the color fallback shows meanwhile.
        if (style && style.board && !style.board.useColor && typeof style.board.imgSrc === 'string'
            && style.board.imgSrc.indexOf('texture-ref:') === 0 && !cachedBoardImg) {
            window.loadBoardTextureImage(boardImageCacheKey, style.board.imgSrc, () => {
                if (typeof drawBoard === 'function') drawBoard();
            });
        }
        if (style && !style.board.useColor && cachedBoardImg && cachedBoardImg.complete && cachedBoardImg.naturalWidth > 0) {
            boardImage = cachedBoardImg;
        }
        const effectiveBgColor = (style && style.board && style.board.color) ? style.board.color : bgColor;

        if (boardImage) {
            let woodX, woodY, woodW, woodH;
            if (isExport && fullBoardRect) {
                woodX = fullBoardRect.x;
                woodY = fullBoardRect.y;
                woodW = fullBoardRect.w;
                woodH = fullBoardRect.h;
            } else {
                const borderScale = Math.min(1, parseFloat(style.border.size) / 100 || 1);
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
                    return pattern || effectiveBgColor;
                } else {
                    const pattern = targetCtx.createPattern(boardImage, 'no-repeat');
                    if (pattern && pattern.setTransform) {
                        const scaledW = woodW * imgZoom;
                        const scaledH = woodH * imgZoom;
                        const dx = woodX + (woodW - scaledW) / 2 + imgOffsetX;
                        const dy = woodY + (woodH - scaledH) / 2 + imgOffsetY;
                        pattern.setTransform(new DOMMatrix().translate(dx, dy).scale(scaledW / boardImage.naturalWidth, scaledH / boardImage.naturalHeight));
                    }
                    return pattern || effectiveBgColor;
                }
            } catch (e) {
                return effectiveBgColor;
            }
        }
        return effectiveBgColor;
    };

    let currentStoneRadius = stoneRadius;
    let currentStoneBg = '';
    let currentStoneBr = '';
    let currentStoneBrSize = 0;
    let currentStoneBrRadius = 0; // extra radial offset for the BR ring (0 = hugs stone)
    let currentStoneBrBlur = 0;   // Gaussian blur radius for the BR ring in px
    let currentStoneFg = '';
    let currentStoneFgSize = null;

    // Shared Stone Offset (X/Y): a single setting applied to BOTH Black and White stones.
    // Applies to LAYER 1 (Stone Surface) ONLY — the visible stone disk (gradient / custom
    // image / solid colour) shifts while the Board Mask composite (LAYER 3), Border Ring
    // (LAYER 2), labels, annotations, highlights (quarter/hoshi/cell, CIRCLE_F), move
    // numbers and territory overlays stay centered on the intersection.
    let stoneOffsetX = 0;
    let stoneOffsetY = 0;
    if (style && style.stoneOffset) {
        stoneOffsetX = parseFloat(style.stoneOffset.x) || 0;
        stoneOffsetY = parseFloat(style.stoneOffset.y) || 0;
    }

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
        const stoneImg = window.loadBoardTextureImage(cacheKey, stoneStyle.imgSrc, () => {
            if (typeof drawBoard === 'function') drawBoard();
            // Ensure export preview also triggers a redraw when async images finish
            if (isExport && typeof updateExportPreview === 'function') updateExportPreview();
        });
        if (stoneImg && stoneImg.complete && stoneImg.naturalWidth > 0) {
            stoneImage = stoneImg;
        }
    }

    // Early return for 'bm' pass when cell has no player
    if (renderPass === 'bm' && !cell.player) {
        return;
    }

    // 1. Draw Stones (Three-Layer Rendering: Board Mask -> Stone Border -> Stone Surface)
    if (cell.player && (renderPass === 'bm' || renderPass === 'all')) {
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

        // Note: `isScoringCanvas` is re-declared later inside this cell block (dead-cross
        // overlay), so a locally-scoped name is used here to avoid a TDZ reference.
        const isScoringBoardCtx = !!(targetCtx.canvas && targetCtx.canvas.id === 'go-board-canvas-scoring');

        const effectiveBoardBg = (style && style.board && style.board.color) ? style.board.color : bgColor;

        if (isScoringBoardCtx) {
            // MSM keeps the legacy single-fill board mask (wood texture or bg over the whole circle).
            targetCtx.fillStyle = effectiveBoardBg;
            targetCtx.fill();

            if (boardImage) {
                targetCtx.clip();
                const borderScale = Math.min(1, parseFloat(style.border.size) / 100 || 1);
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
                let imgOpacity = 1.0;
                let imgBlendMode = 'normal';
                if (style && style.board) {
                    if (style.board.imgZoom !== undefined) imgZoom = parseFloat(style.board.imgZoom);
                    if (style.board.imgOffsetX !== undefined) imgOffsetX = parseFloat(style.board.imgOffsetX);
                    if (style.board.imgOffsetY !== undefined) imgOffsetY = parseFloat(style.board.imgOffsetY);
                    if (style.board.imgOpacity !== undefined) {
                        const parsedOp = parseFloat(style.board.imgOpacity);
                        if (!isNaN(parsedOp)) imgOpacity = Math.max(0, Math.min(1, parsedOp));
                    }
                    if (style.board.imgBlendMode) imgBlendMode = style.board.imgBlendMode;
                }
                const compositeOp = (imgBlendMode && imgBlendMode !== 'normal') ? imgBlendMode : 'source-over';

                if (style.board.imgRepeat) {
                    try {
                        targetCtx.save();
                        targetCtx.globalAlpha = imgOpacity;
                        targetCtx.globalCompositeOperation = compositeOp;
                        targetCtx.translate(woodX, woodY);
                        const pattern = targetCtx.createPattern(boardImage, 'repeat');
                        if (pattern.setTransform) {
                            const matrix = new DOMMatrix().translate(imgOffsetX, imgOffsetY).scale(imgZoom, imgZoom);
                            pattern.setTransform(matrix);
                        }
                        targetCtx.fillStyle = pattern;
                        targetCtx.translate(-woodX, -woodY);
                        targetCtx.fill();
                        targetCtx.restore();
                    } catch (e) {
                        targetCtx.fillStyle = effectiveBoardBg;
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
                    
                    targetCtx.save();
                    targetCtx.globalAlpha = imgOpacity;
                    targetCtx.globalCompositeOperation = compositeOp;
                    targetCtx.drawImage(boardImage, srcX, srcY, srcW, srcH, cx - currentBoardMaskRadius, cy - currentBoardMaskRadius, currentBoardMaskRadius * 2, currentBoardMaskRadius * 2);
                    targetCtx.restore();
                }
            }
        } else {
            // Composite board mask (LAYER 3): mirror the real draw order so an edge stone
            // (A/T/1/19 lines) shows the border margin colour where its mask overhangs the
            // board frame and the board surface only over the playing area. The mask region
            // beyond the wood rect stays transparent so the pre-rendered canvas bg shows.
            targetCtx.clip();
            const borderScale = Math.min(1, parseFloat(style.border.size) / 100 || 1);
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

            const borderOverrideOn = !style.border || style.border.override !== false;
            const marginColor = borderOverrideOn ? (style.border ? style.border.color : '#dcb35c') : effectiveBoardBg;

            // Board surface area: the 19x19 grid when the border override is ON (the board image
            // is clipped to the grid so it never spills onto the margin), the whole wood rect when OFF.
            const boardAreaX = borderOverrideOn ? (isExport && fullBoardRect ? woodX + marginSize : PADDING) : woodX;
            const boardAreaY = borderOverrideOn ? (isExport && fullBoardRect ? woodY + marginSize : PADDING) : woodY;
            const boardAreaW = borderOverrideOn ? woodW - 2 * marginSize : woodW;
            const boardAreaH = borderOverrideOn ? woodH - 2 * marginSize : woodH;

            // Board surface layer: wood texture / solid colour inside the playing area.
            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.rect(boardAreaX, boardAreaY, boardAreaW, boardAreaH);
            targetCtx.clip();

            // Always fill with the effective board background color first so transparent image/texture sits on top of it, and color acts as fallback if image isn't loaded!
            targetCtx.fillStyle = effectiveBoardBg;
            targetCtx.fillRect(woodX, woodY, woodW, woodH);

            if (boardImage) {
                let imgZoom = 1.0;
                let imgOffsetX = 0;
                let imgOffsetY = 0;
                let imgOpacity = 1.0;
                let imgBlendMode = 'normal';
                if (style && style.board) {
                    if (style.board.imgZoom !== undefined) imgZoom = parseFloat(style.board.imgZoom);
                    if (style.board.imgOffsetX !== undefined) imgOffsetX = parseFloat(style.board.imgOffsetX);
                    if (style.board.imgOffsetY !== undefined) imgOffsetY = parseFloat(style.board.imgOffsetY);
                    if (style.board.imgOpacity !== undefined) {
                        const parsedOp = parseFloat(style.board.imgOpacity);
                        if (!isNaN(parsedOp)) imgOpacity = Math.max(0, Math.min(1, parsedOp));
                    }
                    if (style.board.imgBlendMode) imgBlendMode = style.board.imgBlendMode;
                }
                const compositeOp = (imgBlendMode && imgBlendMode !== 'normal') ? imgBlendMode : 'source-over';

                if (style.board.imgRepeat) {
                    try {
                        targetCtx.save();
                        targetCtx.globalAlpha = imgOpacity;
                        targetCtx.globalCompositeOperation = compositeOp;
                        targetCtx.translate(woodX, woodY);
                        const pattern = targetCtx.createPattern(boardImage, 'repeat');
                        if (pattern.setTransform) {
                            const matrix = new DOMMatrix().translate(imgOffsetX, imgOffsetY).scale(imgZoom, imgZoom);
                            pattern.setTransform(matrix);
                        }
                        targetCtx.fillStyle = pattern;
                        targetCtx.translate(-woodX, -woodY);
                        targetCtx.fill();
                        targetCtx.restore();
                    } catch (e) {
                        targetCtx.fillStyle = effectiveBoardBg;
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

                    targetCtx.save();
                    targetCtx.globalAlpha = imgOpacity;
                    targetCtx.globalCompositeOperation = compositeOp;
                    targetCtx.drawImage(boardImage, srcX, srcY, srcW, srcH, cx - currentBoardMaskRadius, cy - currentBoardMaskRadius, currentBoardMaskRadius * 2, currentBoardMaskRadius * 2);
                    targetCtx.restore();
                }
            }
            targetCtx.restore();

            // Border margin layer: if Board's Border override is ON and an edge stone's mask overhangs past the grid
            // into the border frame margin, draw the margin frame colour in the outer margin region only. Overhang is
            // tested against the actual board-area rect (grid when override ON), which matches both the on-screen
            // (PADDING-based) and export (wood rect inset by the margin) coordinate spaces.
            const isOverhangingEdge = (cx - currentBoardMaskRadius < boardAreaX || cx + currentBoardMaskRadius > boardAreaX + boardAreaW || cy - currentBoardMaskRadius < boardAreaY || cy + currentBoardMaskRadius > boardAreaY + boardAreaH);
            if (borderOverrideOn && isOverhangingEdge) {
                targetCtx.save();
                targetCtx.beginPath();
                targetCtx.rect(woodX, woodY, woodW, woodH);
                targetCtx.rect(boardAreaX + boardAreaW, boardAreaY, -boardAreaW, boardAreaH);
                targetCtx.clip('evenodd');
                targetCtx.fillStyle = marginColor;
                targetCtx.fillRect(woodX, woodY, woodW, woodH);
                targetCtx.restore();
            }

            // Boundary-line (BDL) layer: reproduce the outer grid lines (Grids & Hoshi →
            // grid.boundaryColor / grid.boundarySize) where they cross the mask, so the BM
            // is recognized as Board's Border / BG exactly like the board behind it and does
            // not erase the boundary line under an edge stone's mask. Still clipped to the
            // mask circle, so interior stones are unaffected (their BDL falls outside it).
            if (style && style.grid) {
                const bdlColor = style.grid.boundaryColor;
                const bdlSize = parseFloat(style.grid.boundarySize);
                if (bdlColor && bdlSize > 0) {
                    const gridX = isExport && fullBoardRect ? woodX + marginSize : PADDING;
                    const gridY = isExport && fullBoardRect ? woodY + marginSize : PADDING;
                    const gridW = 18 * cellSize;
                    const gridH = 18 * cellSize;
                    // Match the real renderer: initial/study draw the boundary at the raw
                    // boundarySize px; export scales it via baseLine = max(1.2, S*0.035).
                    const bdlW = isExport ? Math.max(1.2, cellSize * 0.035) * bdlSize : bdlSize;
                    targetCtx.save();
                    targetCtx.strokeStyle = bdlColor;
                    targetCtx.lineWidth = bdlW;
                    targetCtx.lineJoin = 'miter';
                    targetCtx.lineCap = 'butt';
                    // Single closed path → miter-joined true corners (a rect of separate
                    // line subpaths would overlap oddly at the corners like the old board).
                    targetCtx.beginPath();
                    targetCtx.moveTo(gridX, gridY);
                    targetCtx.lineTo(gridX, gridY + gridH);
                    targetCtx.lineTo(gridX + gridW, gridY + gridH);
                    targetCtx.lineTo(gridX + gridW, gridY);
                    targetCtx.closePath();
                    targetCtx.stroke();
                    targetCtx.restore();
                }
            }
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
    }

    if (renderPass === 'bm') {
        return;
    }

    if (cell.player && (renderPass === 'stone' || renderPass === 'all')) {
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

        // Apply the shared Stone Offset to LAYER 1 ONLY: shift the stone surface (and its
        // associated dead-cross marker). The Board Mask (LAYER 3), Border Ring (LAYER 2),
        // labels and all annotations / highlights stay on the intersection.
        const hasStoneOffset = stoneOffsetX !== 0 || stoneOffsetY !== 0;
        if (hasStoneOffset) {
            targetCtx.save();
            targetCtx.translate(stoneOffsetX, stoneOffsetY);
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
        const useGradientC = (style && style.stoneSet === 'C' && cell.player);
        if (useGradientC) {
            targetCtx.save();
            // Set C: material renderer. drawGoStone() sets its own shadow
            // internally, so this path is fully self-contained.
            const variant = getStoneVariant(r, c, cell.player);
            drawGoStone(targetCtx, cx, cy, currentStoneRadius, cell.player, variant);
            targetCtx.restore();
        } else if (useGradient || useGradientB) {
            targetCtx.save();
            // Drop shadow matching Set C (drawGoStone): a lighter 0.45-alpha blur.
            // The old 0.5-alpha / 0.25-radius shadow read as a grey hollow ring
            // around A/B stones on image-background boards (esp. on the initial
            // board) — Set C keeps the same look without that halo.
            targetCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            targetCtx.shadowBlur = Math.max(3, currentStoneRadius * 0.28);
            targetCtx.shadowOffsetX = Math.max(2, currentStoneRadius * 0.14);
            targetCtx.shadowOffsetY = Math.max(2, currentStoneRadius * 0.18);
            
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
        if (hasStoneOffset) {
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
