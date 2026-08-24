#!/usr/bin/env node
/**
 * SGF FF[4] Stress Test - Official ff4_ex.sgf compliance suite
 *
 * Tests every major feature of the FF[4] spec against the authoritative
 * example file from https://red-bean.com/sgf/ff4_ex.sgf
 *
 * Run: node sgf-ff4-stress-test.js
 */

const SgfEngine = require('./sgf-parser.js');
const fs = require('fs');
const sgf = fs.readFileSync('./pre_sgf/ff4_ex.sgf', 'utf8');

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log('  OK:', msg); }
    else { failed++; console.error('  FAIL:', msg); }
}

console.log('=== ff4_ex.sgf Stress Tests ===\n');

const trees = SgfEngine.parseSgfCollection(sgf);

// 1. Collection
console.log('1. Collection: two top-level game trees');
assert(trees.length === 2, 'ff4_ex.sgf contains 2 top-level game trees');
assert(trees[0].nodes[0].properties.FF?.[0] === '4', 'Game 1 root FF=4');
assert(trees[1].nodes[0].properties.FF?.[0] === '4', 'Game 2 root FF=4');

// 2. Game 1 five sub-trees
console.log('\n2. Game 1: five sub-trees (Moves, Setup, Markup, Style, Time)');
assert(trees[0].children.length === 5, 'Game 1 has 5 child game-trees');

// 3. Moves & Annotations
const movesTree = trees[0].children[0];
console.log('\n3. Moves & Annotations tree (13 nodes)');
assert(movesTree.nodes.length === 13, 'Moves tree has 13 nodes');
assert(movesTree.nodes[0].properties.B?.[0] === 'pd',  'Node 0: B[pd]');
assert(movesTree.nodes[1].properties.W?.[0] === 'dp',  'Node 1: W[dp]');
assert(movesTree.nodes[1].properties.GW?.[0] === '1',  'Node 1: GW[1]');
assert(movesTree.nodes[11].properties.W?.[0] === '', 'Node 11: W[] = pass (FF[4] empty)');
assert(movesTree.nodes[12].properties.B?.[0] === 'tt', 'Node 12: B[tt] = pass (FF[3] legacy)');
assert(movesTree.nodes[4].properties.DM?.[0] === '1', 'DM[1] (Even position)');
assert(movesTree.nodes[5].properties.UC?.[0] === '1', 'UC[1] (Unclear)');
assert(movesTree.nodes[6].properties.TE?.[0] === '1', 'TE[1] (Tesuji)');
assert(movesTree.nodes[7].properties.BM?.[0] === '2', 'BM[2] (Very bad)');
assert(Array.isArray(movesTree.nodes[8].properties.DO), 'DO[] property present (Doubtful)');
assert(movesTree.nodes[8].properties.DO?.[0] === '',   'DO[] value is empty string');
assert(Array.isArray(movesTree.nodes[9].properties.IT), 'IT[] property present (Interesting)');

// 4. Setup: compressed point lists
const setupTree = trees[0].children[1];
console.log('\n4. Setup tree: compressed point lists');
const ab0 = setupTree.nodes[0].properties.AB || [];
const aw0 = setupTree.nodes[0].properties.AW || [];
assert(ab0.includes('dd') && ab0.includes('dg'), 'AB has single-point values dd..dg');
assert(ab0.includes('do:gq'), 'AB stores raw compressed range do:gq');
const expandedAB = SgfEngine.expandPointList(ab0, 19, 19);
assert(expandedAB.length === 16, 'expandPointList(AB) = 4 singles + 12 from do:gq = 16');
const expandedAW = SgfEngine.expandPointList(aw0, 19, 19);
assert(expandedAW.length === 16, 'expandPointList(AW) = 4 singles + 8 kn:lq + 4 pn:pq = 16');
const ae1 = setupTree.nodes[1].properties.AE || [];
assert(ae1.includes('pn:pq'), 'AE stores compressed pn:pq');
const expandedAE = SgfEngine.expandPointList(ae1, 19, 19);
assert(expandedAE.length >= 9, `AE expands correctly (${expandedAE.length} >= 9)`);

// 5. Markup: TR, TW, TB, LB
const markupTree = trees[0].children[2];
console.log('\n5. Markup tree: mixed single + compressed points');
assert(markupTree.nodes.length === 4, 'Markup tree has 4 nodes');
const markupNode = markupTree.nodes[1];
const tr = markupNode.properties.TR || [];
const expandedTR = SgfEngine.expandPointList(tr, 19, 19);
assert(expandedTR.length === 9, 'TR expands to 9 points (6 singles + fd:ff=3)');
const tw = markupNode.properties.TW || [];
const expandedTW = SgfEngine.expandPointList(tw, 19, 19);
assert(expandedTW.length > 5, `TW expands to multiple territory points (${expandedTW.length})`);
const tb = markupNode.properties.TB || [];
const expandedTB = SgfEngine.expandPointList(tb, 19, 19);
assert(expandedTB.length > 5, `TB expands to multiple territory points (${expandedTB.length})`);
const lb = markupTree.nodes[2].properties.LB || [];
assert(lb.length > 0 && lb[0].includes(':'), 'LB values preserved in coord:label format');

// 6. Style & text: nested variations, soft line breaks
const styleTree = trees[0].children[3];
console.log('\n6. Style & text tree: nested variations, soft line breaks');
assert(styleTree.nodes.length === 1, 'Style tree root has 1 node');
assert(styleTree.nodes[0].properties.B?.[0] === 'qd', 'Style root: B[qd]');
assert(styleTree.children.length === 6, 'Style tree has 6 child variations');
const wddTree = styleTree.children[0];
assert(wddTree.nodes[0].properties.W?.[0] === 'dd', 'First child: W[dd]');
assert(wddTree.children.length === 4, 'W[dd] has 4 sub-variations');
assert(wddTree.children[0].nodes[0].properties.B?.[0] === 'pp', 'W[dd] sub-var 0: B[pp]');
assert(wddTree.children[1].nodes[0].properties.B?.[0] === 'dp', 'W[dd] sub-var 1: B[dp]');
assert(wddTree.children[2].nodes[0].properties.B?.[0] === 'pq', 'W[dd] sub-var 2: B[pq]');
assert(wddTree.children[3].nodes[0].properties.B?.[0] === 'oq', 'W[dd] sub-var 3: B[oq]');
assert(styleTree.children[1].nodes[0].properties.W?.[0] === 'dp', 'Style var 1: W[dp]');
assert(styleTree.children[2].nodes[0].properties.W?.[0] === 'pp', 'Style var 2: W[pp]');
assert(styleTree.children[3].nodes[0].properties.W?.[0] === 'cc', 'Style var 3: W[cc]');
assert(styleTree.children[4].nodes[0].properties.W?.[0] === 'cq', 'Style var 4: W[cq]');
assert(styleTree.children[5].nodes[0].properties.W?.[0] === 'qq', 'Style var 5: W[qq]');
const styleComment = styleTree.nodes[0].properties.C?.[0] || '';
assert(styleComment.includes('ok') && !styleComment.match(/o\\\s*[\r\n]k/),
    'Soft line breaks removed: "ok" not split in style comment');
assert(styleComment.includes('Hard line breaks'), 'Hard line breaks preserved in comment');

// 7. Time limits tree
const timeTree = trees[0].children[4];
console.log('\n7. Time limits tree (21 nodes, time props, move numbers)');
assert(timeTree.nodes.length === 21, 'Time tree has 21 nodes');
assert(timeTree.nodes[0].properties.B?.[0] === 'qr',    'B[qr] first move');
assert(timeTree.nodes[0].properties.BL?.[0] === '120.0', 'BL[120.0]');
assert(timeTree.nodes[1].properties.WL?.[0] === '300',  'WL[300]');
assert(timeTree.nodes[2].properties.OB?.[0] === '10',   'OB[10]');
assert(timeTree.nodes[3].properties.OW?.[0] === '2',    'OW[2]');
assert(timeTree.nodes[9].properties.MN?.[0] === '2',    'MN[2]');
assert(timeTree.nodes[11].properties.MN?.[0] === '112', 'MN[112]');

// 8. Game 2: merged game-info
const g2 = trees[1];
console.log('\n8. Game 2: merged game-info with child branches');
assert(g2.nodes[0].properties.FF?.[0] === '4', 'Game 2 root: FF[4]');
assert(g2.nodes[0].properties.GM?.[0] === '1', 'Game 2 root: GM[1]');
const g2comment = g2.nodes[0].properties.C?.[0] || '';
assert(g2comment.includes('game-info'), 'Game 2 root comment mentions game-info');
assert(g2comment.includes('stored in the node where'),
    'Soft line break in Game 2 comment removed correctly');
assert(g2.nodes.some(n => n.properties.B?.[0] === 'pd'), 'Game 2 has B[pd] node');
assert(g2.children.length >= 3, `Game 2 has >= 3 child variations (got ${g2.children.length})`);

// 9. Round-trip
console.log('\n9. Round-trip: serialize Game 1, re-parse, verify structure');
const g1serialized = SgfEngine.writeSgf(trees[0]);
assert(typeof g1serialized === 'string' && g1serialized.includes('(;'), 'writeSgf produces string');
const g1reparsed = SgfEngine.parseSgf(g1serialized);
assert(g1reparsed !== null, 'Re-parsed Game 1 is not null');
assert(g1reparsed.children.length === 5, `Re-parsed Game 1 still has 5 children`);
assert(g1reparsed.children[3].children.length === 6, `Re-parsed Style tree still has 6 variations`);
assert(g1reparsed.children[3].children[0].children.length === 4,
    `Re-parsed W[dd] still has 4 sub-variations`);
const reparsedSetup = g1reparsed.children[1].nodes[0].properties;
assert(Array.isArray(reparsedSetup.AB) && reparsedSetup.AB.length > 0, 'Setup AB survives round-trip');

console.log('\n--- ff4_ex Results:', passed, 'passed,', failed, 'failed ---');
process.exit(failed > 0 ? 1 : 0);
