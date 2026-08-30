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
            borderScale = Math.min(1, state.exportBoardStyle.border.size / 100);
        } else if (state.exportText.borderSize !== undefined) {
            borderScale = Math.min(1, state.exportText.borderSize / 100);
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

        // Fill canvas background using the export board style's bg color
        let canvasBgColor = '#FFFFFF';
        if (state.exportBoardStyle && state.exportBoardStyle.bg && state.exportBoardStyle.bg.color) {
            canvasBgColor = state.exportBoardStyle.bg.color;
        }
        exportCtx.fillStyle = canvasBgColor;
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
                let borderOverrideOn = true;
                let boardImage = null;
                
                if (state.exportBoardStyle) {
                    const style = state.exportBoardStyle;
                    currentBoardColor = (style.board && style.board.color) ? style.board.color : '#DCB35C';
                    currentBgColor = style.border ? style.border.color : '#DCB35C';
                    borderScale = Math.min(1, parseFloat(style.border.size) / 100 || 1);
                    borderOverrideOn = !style.border || style.border.override !== false;
                    
                    if (!style.board.useColor && style.board.imgSrc) {
                        const bgImg = window.loadBoardTextureImage('exportBoardBgImage', style.board.imgSrc, () => {
                            if (typeof updateExportPreview === 'function') updateExportPreview();
                        });
                        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                            boardImage = bgImg;
                        }
                    }
                }
                
                // Fill the whole background: the border margin color with Override ON,
                // otherwise the board bg color (image covers it below when OFF).
                exportCtx.fillStyle = borderOverrideOn ? currentBgColor : currentBoardColor;
                exportCtx.fillRect(woodLeft, woodTop, woodRight - woodLeft, woodBottom - woodTop);
                
                // Always fill the inner grid area with the Board Color first so transparent image/texture sits on top of it, and color acts as fallback if image isn't loaded!
                if (borderOverrideOn) {
                    exportCtx.fillStyle = currentBoardColor;
                    exportCtx.fillRect(gridLeft, gridTop, gridRight - gridLeft, gridBottom - gridTop);
                }

                // Then paint the board image on top if present.
                // With Override ON the image is clipped to the grid so it never covers the
                // border margin; with Override OFF it fills the whole wood area instead.
                if (boardImage) {
                    exportCtx.save();
                    let imgZoom = 1.0;
                    let imgOffsetX = 0;
                    let imgOffsetY = 0;
                    let imgOpacity = 1.0;
                    let imgBlendMode = 'normal';
                    if (state.exportBoardStyle && state.exportBoardStyle.board) {
                        const b = state.exportBoardStyle.board;
                        if (b.imgZoom !== undefined) imgZoom = parseFloat(b.imgZoom);
                        if (b.imgOffsetX !== undefined) imgOffsetX = parseFloat(b.imgOffsetX);
                        if (b.imgOffsetY !== undefined) imgOffsetY = parseFloat(b.imgOffsetY);
                        if (b.imgOpacity !== undefined) {
                            const parsedOp = parseFloat(b.imgOpacity);
                            if (!isNaN(parsedOp)) imgOpacity = Math.max(0, Math.min(1, parsedOp));
                        }
                        if (b.imgBlendMode) imgBlendMode = b.imgBlendMode;
                    }
                    exportCtx.globalAlpha = imgOpacity;
                    exportCtx.globalCompositeOperation = (imgBlendMode && imgBlendMode !== 'normal') ? imgBlendMode : 'source-over';
                    
                    const imgLeft = borderOverrideOn ? gridLeft : woodLeft;
                    const imgTop = borderOverrideOn ? gridTop : woodTop;
                    const imgRight = borderOverrideOn ? gridRight : woodRight;
                    const imgBottom = borderOverrideOn ? gridBottom : woodBottom;
                    
                    exportCtx.beginPath();
                    exportCtx.rect(imgLeft, imgTop, imgRight - imgLeft, imgBottom - imgTop);
                    exportCtx.clip();

                    if (state.exportBoardStyle.board.imgRepeat) {
                        try {
                            const pattern = exportCtx.createPattern(boardImage, 'repeat');
                            if (pattern.setTransform) {
                                pattern.setTransform(new DOMMatrix().translate(fullBoardRect.x + imgOffsetX, fullBoardRect.y + imgOffsetY).scale(imgZoom, imgZoom));
                            }
                            exportCtx.fillStyle = pattern;
                            exportCtx.fillRect(imgLeft, imgTop, imgRight - imgLeft, imgBottom - imgTop);
                        } catch (e) {
                            exportCtx.fillStyle = currentBoardColor;
                            exportCtx.fillRect(imgLeft, imgTop, imgRight - imgLeft, imgBottom - imgTop);
                        }
                    } else {
                        const scaledW = fullBoardRect.w * imgZoom;
                        const scaledH = fullBoardRect.h * imgZoom;
                        const dx = fullBoardRect.x + (fullBoardRect.w - scaledW) / 2 + imgOffsetX;
                        const dy = fullBoardRect.y + (fullBoardRect.h - scaledH) / 2 + imgOffsetY;
                        exportCtx.drawImage(boardImage, dx, dy, scaledW, scaledH);
                    }
                    exportCtx.restore();
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

                // BDL corner repair: two boundary edge strokes meeting at a corner are both
                // butt-capped, leaving a (boundaryLineWidth/2)² notch in the outer corner.
                // Fill it only where BOTH edges are boundary edges so the joint merges like a
                // strokeRect (the MSM board's approach). The grid lines above are untouched.
                if (boundaryLineWidth > 0) {
                    const half = boundaryLineWidth / 2;
                    const bdlCorners = [
                        { on: boardRowStart === 0 && boardColStart === 0, x: gridLeft - half, y: gridTop - half },
                        { on: boardRowStart === 0 && boardColEnd === 18, x: gridRight, y: gridTop - half },
                        { on: boardRowEnd === 18 && boardColEnd === 18, x: gridRight, y: gridBottom },
                        { on: boardRowEnd === 18 && boardColStart === 0, x: gridLeft - half, y: gridBottom }
                    ];
                    exportCtx.save();
                    exportCtx.fillStyle = boundaryColor;
                    for (const c of bdlCorners) {
                        if (c.on) exportCtx.fillRect(c.x, c.y, half, half);
                    }
                    exportCtx.restore();
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
                            drawCellContent(exportCtx, cell, cx, cy, S, true, clipRect, currentBoardColor, fullBoardRect, r, c, 'bm');
                        }
                    }
                }

                // Pass 2: Draw Stones, Shadows & Annotations for all cells
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
                            drawCellContent(exportCtx, cell, cx, cy, S, true, clipRect, currentBoardColor, fullBoardRect, r, c, 'stone');
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
    const exportInputCanvasBgColor = document.getElementById('export-input-canvas-bg-color');
    
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

    if (exportInputCanvasBgColor) {
        const bgColor = (state.exportBoardStyle && state.exportBoardStyle.bg && state.exportBoardStyle.bg.color) ? state.exportBoardStyle.bg.color : '#ffffff';
        exportInputCanvasBgColor.value = bgColor;
    }

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
    if (exportInputCanvasBgColor) {
        exportInputCanvasBgColor.addEventListener('input', async (e) => {
            if (!state.exportBoardStyle.bg) state.exportBoardStyle.bg = {};
            state.exportBoardStyle.bg.color = e.target.value;
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
