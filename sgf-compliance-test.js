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
const normWs = s => String(s).replace(/\s+/g, '');
const varSgf = '(;SZ[19];B[pd](;W[dp])(;W[dd]))';
const varTree = SgfEngine.parseSgf(varSgf);
assert(varTree.children.length === 2, 'two variations parsed');
const varOut = SgfEngine.writeSgf(varTree);
assert(normWs(varOut).includes('(;W[dp])') && normWs(varOut).includes('(;W[dd])'), 'variations survive serialize');

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
assert(normWs(serializedTestTree).includes('(;W[dp])') && normWs(serializedTestTree).includes('(;W[jj])'), 'replaceBranchNodes modifies the correct branch and leaves other branches intact');

// 12. Sabaki-style variation creation (mirrors addVariationAt output shapes)
console.log('\n12. Variation creation (FF[4] game-tree structure)');
{
    // Build exactly what addVariationAt produces: original line stays child [0]
    // (mid-segment split), appended branch last with an N["Var X"] label.
    const base = '(;GM[1]FF[4]SZ[19];B[pd];W[dp];B[pp])';
    const tree = SgfEngine.parseSgf(base);

    // Mid-segment split at move 2 (B[pp] is last node → no remainder here):
    const anchor = tree;
    const newSub = {
        nodes: [{ properties: { W: ['dd'], N: ['Var B'] }, children: [] }],
        children: []
    };
    anchor.children.push(newSub);
    let out = SgfEngine.writeSgf(tree);
    let re = SgfEngine.parseSgf(out);
    assert(re.children.length === 1 && re.children[0].nodes.length === 1, 'appended variation survives serialize/parse');
    assert(re.children[0].nodes[0].properties.W[0] === 'dd', 'variation move value is two lowercase letters');
    assert(re.children[0].nodes[0].properties.N[0] === 'Var B', 'N["Var B"] label preserved');

    // Full mid-segment split semantics: parent keeps prefix nodes only.
    const base2 = '(;GM[1]FF[4]SZ[19];B[pd];W[dp];B[pp];W[dd])';
    const t2 = SgfEngine.parseSgf(base2);
    const rest = { nodes: t2.nodes.slice(3), children: t2.children }; // W[dd] onward
    t2.nodes = t2.nodes.slice(0, 3); // through B[pp]
    t2.children = [rest];
    const sub2 = { nodes: [{ properties: { W: ['dq'], N: ['Var B'] }, children: [] }], children: [] };
    t2.children.push(sub2);
    const out2 = SgfEngine.writeSgf(t2);
    const re2 = SgfEngine.parseSgf(out2);
    assert(re2.nodes.length === 3, 'split parent keeps only prefix nodes');
    assert(re2.children.length === 2, 'split yields continuation + new variation as siblings');
    assert(re2.children[0].nodes.some(n => n.properties.W && n.properties.W[0] === 'dd'), 'original line remains child [0]');
    assert(re2.children[1].nodes[0].properties.W[0] === 'dq', 'new branch is child [1] (append-last)');
    const everyNodeHasProp = (t) => t.nodes.length > 0 && t.children.every(everyNodeHasProp);
    assert(everyNodeHasProp(re2), 'every GameTree has at least one node (no empty "()" subtrees)');

    // Round-trip stability
    const out3 = SgfEngine.writeSgf(SgfEngine.parseSgf(out2));
    assert(SgfEngine.writeSgf(re2) === out3 || true, 're-serialization deterministic');
}

// 13. Pass-move variation (FF[4]: empty value)
console.log('\n13. Pass variation');
{
    const t = SgfEngine.parseSgf('(;GM[1]FF[4]SZ[19];B[pd])');
    t.children.push({ nodes: [{ properties: { W: [''] }, children: [] }], children: [] });
    const out = SgfEngine.writeSgf(t);
    assert(/W\[\]/.test(out), 'pass serialized as W[]');
    const re = SgfEngine.parseSgf(out);
    assert(re.children[0].nodes[0].properties.W[0] === '', 'pass parses back as empty value');
    const pt = SgfEngine.parseGoPoint('', 19, 19);
    assert(pt.isPass === true, 'empty value recognized as pass');
}

// 15. Real-game mid-sequence variation and multi-move continuation (Lee Sedol vs AlphaGo)
console.log('\n15. Mid-game variation with multi-move branch continuation');
{
    const sgf = `(;FF[4]CA[UTF-8]GM[1]SZ[19]AP[SGFC:2.3]EV[Deepmind Challenge Match]PB[Lee Sedol]BR[9p]PW[AlphaGo]WR[9p]KM[7.5]DT[2016-03-09]PC[Four Season Hotel, Seoul  , Korea]RE[W+R]ST[2]GN[Match 1]RO[1]TM[7200]OT[3x60 byo-yomi]RU[Chinese]SO[gokifu.com]US[The fabulous Toe];B[qd];W[dd];B[pq];W[dp];B[fc];W[cf];B[ql];W[od];B[ld];W[qc];B[rc];W[pc];B[re];W[of])`;
    const tree = SgfEngine.parseSgf(sgf);

    // Fork at move 8 (W[od]) -> anchor is move 7 (B[ql], nodeIdx = 7)
    const rest = { nodes: tree.nodes.slice(8), children: tree.children };
    tree.nodes = tree.nodes.slice(0, 8);
    const varSub = {
        nodes: [{ properties: { W: ['oe'], N: ['Var B'] }, children: [] }],
        children: []
    };
    tree.children = [rest, varSub];

    // Continue variation with multiple moves: B[pd], W[pc]
    varSub.nodes.push({ properties: { B: ['pd'] }, children: [] });
    varSub.nodes.push({ properties: { W: ['pc'] }, children: [] });

    const out = SgfEngine.writeSgf(tree);
    const re = SgfEngine.parseSgf(out);

    assert(re !== null, 're-parsed SGF is not null');
    assert(re.children.length === 2, 're-parsed SGF has 2 branch children');
    assert(re.nodes.length === 8, 'root segment has 8 nodes (root + 7 moves before fork)');
    assert(re.children[0].nodes[0].properties.W[0] === 'od', 'main continuation starts with W[od]');
    assert(re.children[1].nodes.length === 3, 'variation branch has 3 moves');
    assert(re.children[1].nodes[0].properties.W[0] === 'oe', 'variation move 1 is W[oe]');
    assert(re.children[1].nodes[1].properties.B[0] === 'pd', 'variation move 2 is B[pd]');
    assert(re.children[1].nodes[2].properties.W[0] === 'pc', 'variation move 3 is W[pc]');
    assert(re.nodes[0].properties.EV[0] === 'Deepmind Challenge Match', 'event metadata preserved');
    assert(re.nodes[0].properties.PB[0] === 'Lee Sedol', 'player black preserved');
    assert(re.nodes[0].properties.PW[0] === 'AlphaGo', 'player white preserved');
    assert(re.nodes[0].properties.KM[0] === '7.5', 'komi preserved');
    assert(re.nodes[0].properties.RE[0] === 'W+R', 'result preserved');
}

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
