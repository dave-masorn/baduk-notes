#!/usr/bin/env node
/**
 * SGF FF[4] compliance smoke tests for sgf-parser.js
 * Run: node sgf-compliance-test.js
 */

const SgfEngine = require('./sgf-parser.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log('  OK: ' + msg);
    } else {
        failed++;
        console.error('  FAIL: ' + msg);
    }
}

console.log('SGF FF[4] Compliance Tests\n');

// 1. Compressed point list
console.log('1. Compressed point lists');
const pts = SgfEngine.expandPointValue('ab:ac', 19, 19);
assert(pts.length === 2, 'rectangle ab:ac expands to 2 points');
assert(pts[0].c === 0 && pts[0].r === 1, 'first point is a,b');
assert(pts[1].c === 0 && pts[1].r === 2, 'second point is a,c (column fixed, rows b–c)');

// 2. Pass moves
console.log('\n2. Pass moves');
const passEmpty = SgfEngine.parseGoPoint('', 19, 19);
const passTT = SgfEngine.parseGoPoint('tt', 19, 19);
assert(passEmpty.isPass === true, 'empty string is pass (FF[4])');
assert(passTT.isPass === true, 'tt is pass (FF[3] legacy)');

// 3. Uppercase coordinates (27-52)
console.log('\n3. Large board coordinates');
assert(SgfEngine.letterToIndex('A') === 26, 'A maps to index 26');
const bigPt = SgfEngine.parseGoPoint('AA', 52, 52);
assert(bigPt && bigPt.c === 26 && bigPt.r === 26, 'AA parses as (26,26) on 52x52 board');
assert(SgfEngine.formatGoPoint(26, 26) === 'AA', 'index 26,26 formats as AA');

// 4. Parse + serialize round-trip with escaping
console.log('\n4. Escape round-trip');
const sgfIn = '(;FF[4]GM[1]SZ[19]C[label with \\] bracket and \\: colon];B[pd])';
const tree = SgfEngine.parseSgf(sgfIn);
assert(tree !== null, 'parses escaped comment');
const sgfOut = SgfEngine.writeSgf(tree);
const tree2 = SgfEngine.parseSgf(sgfOut);
assert(tree2.nodes[0].properties.C[0] === 'label with ] bracket and : colon', 'comment survives round-trip');

// 5. Variations preserved
console.log('\n5. Variations');
const varSgf = '(;SZ[19];B[pd](;W[dp])(;W[dd]))';
const varTree = SgfEngine.parseSgf(varSgf);
assert(varTree.children.length === 2, 'two variations parsed');
const varOut = SgfEngine.writeSgf(varTree);
assert(varOut.includes('(;W[dp])') && varOut.includes('(;W[dd])'), 'variations survive serialize');

// 6. Unknown property preservation
console.log('\n6. Unknown properties');
const privSgf = '(;SZ[19]XX[private-value];B[pd])';
const privTree = SgfEngine.parseSgf(privSgf);
const unknown = SgfEngine.extractUnknownProperties(privTree.nodes[0].properties);
assert(unknown.XX && unknown.XX[0] === 'private-value', 'private property extracted');
const merged = SgfEngine.mergeUnknownProperties({ B: ['pd'] }, unknown);
assert(merged.XX[0] === 'private-value', 'private property merged on export');

// 7. Setup AE clears points
console.log('\n7. Setup properties');
const board = Array.from({ length: 19 }, () =>
    Array.from({ length: 19 }, () => ({ player: 'B' }))
);
SgfEngine.applySetupProperties(board, { AE: ['aa'] }, 19, 19);
assert(board[0][0].player === null, 'AE clears point aa');

// 8. Node validation
console.log('\n8. Node validation');
const warnings = SgfEngine.validateNodeProperties({ B: ['pd'], AB: ['dd'] });
assert(warnings.length > 0, 'move+setup mix produces warning');

// 9. Board size parsing
console.log('\n9. Board size');
const sq = SgfEngine.parseBoardSize(['19']);
const rect = SgfEngine.parseBoardSize(['19:13']);
assert(sq.width === 19 && sq.height === 19, 'SZ[19] is square');
assert(rect.width === 19 && rect.height === 13, 'SZ[19:13] is rectangular');

// 10. Main line extraction
console.log('\n10. Main line');
const linearSgf = '(;SZ[19];B[pd];W[dp])';
const linearTree = SgfEngine.parseSgf(linearSgf);
const ml = SgfEngine.extractMainLine(linearTree);
assert(ml.length === 3, 'linear game main line has root + B + W');

// 11. replaceBranchNodes
console.log('\n11. replaceBranchNodes');
const testSgf = '(;SZ[19];B[pd](;W[dp])(;W[dd]))';
const testTree = SgfEngine.parseSgf(testSgf);
const clonedTestTree = SgfEngine.cloneTree(testTree);
const replProps = [ { SZ: ['19'] }, { B: ['pd'] }, { W: ['jj'] } ];
SgfEngine.replaceBranchNodes(clonedTestTree, [1], replProps);
const serializedTestTree = SgfEngine.writeSgf(clonedTestTree);
assert(serializedTestTree.includes('(;W[dp])') && serializedTestTree.includes('(;W[jj])'), 'replaceBranchNodes modifies the correct branch and leaves other branches intact');

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
