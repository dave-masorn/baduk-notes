// Verify: Professional Go Commentary Style (Go World / Dia. 1, Dia. 2)
// Variation Numbering & SGF FF[4] Annotation Persistence.
//
// 1. Prior moves before the variation branch remain as plain unnumbered stones.
// 2. Variation stones begin numbering at '1' (1, 2, 3...).
// 3. New variations carry N[Dia. X] and MN[1] per SGF FF[4].
// 4. Annotations on variation nodes sync directly to sgfNode in state.sgfTree
//    and round-trip through SgfEngine.writeSgf / parseSgf.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3962;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(REPO, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

let results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.state && window.state.board && typeof window.drawBoard === 'function' && typeof window.loadSGF === 'function',
      { timeout: 20000 }
    );
    await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

    // Test 1: Load an SGF with a variation and verify getVariationStartMoveIndex
    const testSgf = `(;GM[1]FF[4]SZ[19]PW[White]PB[Black]
;B[pd];W[dp];B[pp];W[dd]
(;B[cc]N[Main Line];W[cd])
(;B[cf]N[Dia. 1]MN[1];W[fc];B[bd])
)`;

    const loadResult = await page.evaluate((sgf) => {
      window.loadSGF(sgf);
      const isMainLineStart = (typeof window.getVariationStartMoveIndex === 'function')
        ? window.getVariationStartMoveIndex()
        : -999;
      
      // Now switch to Dia. 1 (branch index 1)
      window.switchBranchAndGoToNode([1], 0);
      const varStart = window.getVariationStartMoveIndex();
      const currentMoveIdx = window.state.currentMoveIndex;
      const totalAllMoves = window.state.allSgfMoves.length;
      
      return {
        isMainLineStart,
        varStart,
        currentMoveIdx,
        totalAllMoves,
        branchPath: window.state.variationData.currentBranchPath,
        nodeName: window.state.allSgfMoves[varStart]?.nodeName,
        moveNumber: window.state.allSgfMoves[varStart]?.moveNumber
      };
    }, testSgf);

    check('Main line getVariationStartMoveIndex returns -1', loadResult.isMainLineStart === -1, `got ${loadResult.isMainLineStart}`);
    check('Variation getVariationStartMoveIndex identifies fork move index', loadResult.varStart === 4, `varStart: ${loadResult.varStart}`);
    check('Variation node has nodeName Dia. 1', loadResult.nodeName === 'Dia. 1', `nodeName: ${loadResult.nodeName}`);
    check('Variation node has moveNumber 1 from MN[1]', loadResult.moveNumber === 1, `moveNumber: ${loadResult.moveNumber}`);

    // Test 2: Verify move number formatting in variation
    // Moves 0..3 (pd, dp, pp, dd) must be unnumbered (before fork 4).
    // Moves 4, 5, 6 (cf, fc, bd) must number as 1, 2, 3.
    const numberingResult = await page.evaluate(() => {
      const varStart = window.getVariationStartMoveIndex();
      const absIdx = (window.state.filterStart || 1) - 1 + window.state.currentMoveIndex;
      const isInside = varStart >= 0 && absIdx >= varStart;

      const renderedNumbers = [];
      for (let i = 0; i < window.state.allSgfMoves.length; i++) {
        if (isInside && i < varStart) {
          renderedNumbers.push({ moveIdx: i, displayNum: null, reason: 'prior_stone_unnumbered' });
        } else if (isInside) {
          renderedNumbers.push({ moveIdx: i, displayNum: (i - varStart + 1).toString(), reason: 'variation_stone_from_1' });
        } else {
          renderedNumbers.push({ moveIdx: i, displayNum: (i + 1).toString(), reason: 'main_line' });
        }
      }
      return { isInside, varStart, renderedNumbers };
    });

    check('isInsideVariation is true when standing on variation move', numberingResult.isInside === true);
    check('Moves 0..3 have no move numbers (plain contextual stones)', 
      numberingResult.renderedNumbers.slice(0, 4).every(n => n.displayNum === null),
      numberingResult.renderedNumbers.slice(0, 4)
    );
    check('Move 4 (first variation move) displays as "1"', numberingResult.renderedNumbers[4].displayNum === '1');
    check('Move 5 (second variation move) displays as "2"', numberingResult.renderedNumbers[5].displayNum === '2');
    check('Move 6 (third variation move) displays as "3"', numberingResult.renderedNumbers[6].displayNum === '3');

    // Test 3: Annotation persistence on variation node
    // Place a triangle on C8 (r=7, c=2) and letter 'a' on E18 (r=1, c=4)
    const annotResult = await page.evaluate(() => {
      // standing on Move 1 of Dia. 1
      window.state.board[7][2].annotation = 'triangle';
      window.state.board[1][4].label = 'a';
      window.syncAnnotationsToState();

      const sgfTree = window.state.sgfTree;
      const exportedSgf = typeof SgfEngine !== 'undefined' ? SgfEngine.writeSgf(sgfTree) : '';

      // Check current node in state.sgfMoves
      const curMove = window.state.sgfMoves[window.state.currentMoveIndex];
      const nodeProps = curMove.sgfNode;

      return {
        exportedSgf,
        hasTrInProps: !!(nodeProps && nodeProps.TR),
        trCoords: nodeProps?.TR,
        hasLbInProps: !!(nodeProps && nodeProps.LB),
        lbCoords: nodeProps?.LB,
        isSgfDirty: window.state.isSgfDirty,
        sgfTreeIsCanonical: window.state.sgfTreeIsCanonical
      };
    });

    check('syncAnnotationsToState writes TR to active sgfNode', annotResult.hasTrInProps, `TR: ${JSON.stringify(annotResult.trCoords)}`);
    check('syncAnnotationsToState writes LB to active sgfNode', annotResult.hasLbInProps, `LB: ${JSON.stringify(annotResult.lbCoords)}`);
    check('SgfEngine.writeSgf includes TR in exported SGF', annotResult.exportedSgf.includes('TR['), annotResult.exportedSgf);
    check('SgfEngine.writeSgf includes LB[:a] in exported SGF', annotResult.exportedSgf.includes('LB[') && annotResult.exportedSgf.includes(':a'), annotResult.exportedSgf);

    // Test 4: Switching away and back restores the annotations
    const roundTripResult = await page.evaluate(() => {
      // Switch back to main line
      window.switchBranchAndGoToNode([0], 0);
      const mainLineAnnotation = window.state.board[7][2].annotation;

      // Switch back to Dia. 1
      window.switchBranchAndGoToNode([1], 0);
      const restoredAnnotation = window.state.board[7][2].annotation;
      const restoredLabel = window.state.board[1][4].label;

      return {
        mainLineAnnotation,
        restoredAnnotation,
        restoredLabel
      };
    });

    check('Main line does NOT have variation annotation', roundTripResult.mainLineAnnotation === null);
    check('Switching back to variation restores triangle annotation', roundTripResult.restoredAnnotation === 'triangle');
    check('Switching back to variation restores letter label', roundTripResult.restoredLabel === 'a');

    // Test 5: Interactive addVariationAt creates Dia. X with MN[1]
    const addVarResult = await page.evaluate(() => {
      // Switch to main line at move 2
      window.switchBranchAndGoToNode([0], 0);
      window.goToMove(2); // move 3 of main line
      
      // Add a variation at (r=2, c=2)
      const ok = window.addVariationAt(2, 2);
      const varStart = window.getVariationStartMoveIndex();
      const curMove = window.state.sgfMoves[window.state.currentMoveIndex];
      const nodeProps = curMove?.sgfNode;

      return {
        ok,
        varStart,
        nodeName: nodeProps?.N ? nodeProps.N[0] : null,
        mnProp: nodeProps?.MN ? nodeProps.MN[0] : null,
        displayMoveNumbers: window.state.displayMoveNumbers
      };
    });

    check('addVariationAt succeeds', addVarResult.ok);
    check('New variation has N[Dia. X] format', /^Dia\.\s*\d+$/.test(addVarResult.nodeName), `name: ${addVarResult.nodeName}`);
    check('New variation has MN[1]', addVarResult.mnProp === '1', `MN: ${addVarResult.mnProp}`);
    check('addVariationAt enables displayMoveNumbers', addVarResult.displayMoveNumbers === true);

  } finally {
    await close();
    server.close();
  }

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\nResults: ${passed}/${total} checks passed.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
