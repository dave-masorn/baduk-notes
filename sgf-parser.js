/**
 * SgfEngine - SGF FF[4] Parser and Serializer (Go / GM[1] focus)
 *
 * Spec: https://red-bean.com/sgf/sgf4.html
 * Go:   https://red-bean.com/sgf/go.html
 *
 * Handles nested variations, escaped property values, compressed point lists,
 * Go coordinates up to 52x52, and preserves unknown properties for round-trip.
 */

const SgfEngine = (function() {

    const MOVE_PROPS = new Set(['B', 'W', 'KO', 'MN', 'BL', 'WL', 'OB', 'OW', 'BM', 'TE', 'DO', 'IT']);
    const SETUP_PROPS = new Set(['AB', 'AW', 'AE', 'PL']);
    const ROOT_PROPS = new Set(['AP', 'CA', 'FF', 'GM', 'ST', 'SZ']);
    const GAME_INFO_PROPS = new Set([
        'AN', 'BR', 'BT', 'CP', 'DT', 'EV', 'GN', 'GC', 'ON', 'OT',
        'PB', 'PC', 'PW', 'RE', 'RO', 'RU', 'SO', 'TM', 'US', 'WR', 'WT',
        'HA', 'KM'
    ]);
    const MARKUP_POINT_PROPS = new Set(['TR', 'SQ', 'CR', 'MA', 'SL', 'TB', 'TW']);
    const STANDARD_PROPS = new Set([
        ...MOVE_PROPS, ...SETUP_PROPS, ...ROOT_PROPS, ...GAME_INFO_PROPS,
        ...MARKUP_POINT_PROPS,
        'C', 'N', 'V', 'DM', 'GB', 'GW', 'HO', 'UC',
        'AR', 'LB', 'LN', 'DD', 'VW', 'FG', 'PM'
    ]);

    function letterToIndex(ch) {
        if (!ch || ch.length !== 1) return -1;
        const code = ch.charCodeAt(0);
        if (code >= 97 && code <= 122) return code - 97;
        if (code >= 65 && code <= 90) return code - 65 + 26;
        return -1;
    }

    function indexToLetter(idx) {
        if (idx < 0 || idx > 51) return null;
        if (idx < 26) return String.fromCharCode(97 + idx);
        return String.fromCharCode(65 + (idx - 26));
    }

    function parseBoardSize(szValues) {
        const fallback = { width: 19, height: 19 };
        if (!szValues || szValues.length === 0) return fallback;
        const raw = szValues[0];
        if (raw.includes(':')) {
            const parts = raw.split(':');
            const w = parseInt(parts[0], 10);
            const h = parseInt(parts[1], 10);
            if (isNaN(w) || isNaN(h) || w < 1 || h < 1) return fallback;
            return { width: w, height: h };
        }
        const n = parseInt(raw, 10);
        if (isNaN(n) || n < 1) return fallback;
        return { width: n, height: n };
    }

    function parseGoPoint(pointStr, boardWidth, boardHeight) {
        if (pointStr === '' || pointStr == null) {
            return { c: -1, r: -1, isPass: true };
        }
        if (pointStr === 'tt' && boardWidth <= 19 && boardHeight <= 19) {
            return { c: -1, r: -1, isPass: true };
        }
        if (pointStr.length !== 2) return null;
        const c = letterToIndex(pointStr[0]);
        const r = letterToIndex(pointStr[1]);
        if (c < 0 || r < 0 || c >= boardWidth || r >= boardHeight) return null;
        return { c, r, isPass: false };
    }

    function formatGoPoint(c, r) {
        const col = indexToLetter(c);
        const row = indexToLetter(r);
        if (col == null || row == null) return null;
        return col + row;
    }

    function expandPointValue(val, boardWidth, boardHeight) {
        if (val == null || val === '') return [];
        if (val.includes(':')) {
            const parts = val.split(':');
            if (parts.length !== 2) return [];
            const ul = parseGoPoint(parts[0], boardWidth, boardHeight);
            const lr = parseGoPoint(parts[1], boardWidth, boardHeight);
            if (!ul || !lr || ul.isPass || lr.isPass) return [];
            const cMin = Math.min(ul.c, lr.c);
            const cMax = Math.max(ul.c, lr.c);
            const rMin = Math.min(ul.r, lr.r);
            const rMax = Math.max(ul.r, lr.r);
            const points = [];
            for (let r = rMin; r <= rMax; r++) {
                for (let c = cMin; c <= cMax; c++) {
                    points.push({ c, r });
                }
            }
            return points;
        }
        const pt = parseGoPoint(val, boardWidth, boardHeight);
        if (!pt || pt.isPass) return [];
        return [{ c: pt.c, r: pt.r }];
    }

    function expandPointList(values, boardWidth, boardHeight) {
        if (!values) return [];
        const seen = new Set();
        const out = [];
        values.forEach(val => {
            expandPointValue(val, boardWidth, boardHeight).forEach(pt => {
                const key = pt.c + ',' + pt.r;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(pt);
                }
            });
        });
        return out;
    }

    function validateNodeProperties(props) {
        const warnings = [];
        const hasMove = props.B || props.W;
        const setupPresent = !!(props.AB || props.AW || props.AE || props.PL);
        if (hasMove && setupPresent) {
            warnings.push('Node mixes move and setup properties (illegal in FF[4]).');
        }
        if (props.B && props.W) {
            warnings.push('Node contains both B and W properties (illegal in FF[4]).');
        }
        if (props.KO && !props.B && !props.W) {
            warnings.push('KO property without B or W move (illegal in FF[4]).');
        }
        return warnings;
    }

    class SgfLexer {
        constructor(input) {
            this.input = input;
            this.pos = 0;
            this.length = input.length;
        }

        peek() {
            return this.pos < this.length ? this.input[this.pos] : null;
        }

        next() {
            return this.pos < this.length ? this.input[this.pos++] : null;
        }

        skipWhitespace() {
            while (this.pos < this.length && /\s/.test(this.input[this.pos])) {
                this.pos++;
            }
        }
    }

    function parseProperty(lexer) {
        lexer.skipWhitespace();
        let propIdent = '';

        while (lexer.peek() && /[A-Z]/.test(lexer.peek())) {
            propIdent += lexer.next();
        }

        if (propIdent === '') return null;

        const propValues = [];
        lexer.skipWhitespace();

        while (lexer.peek() === '[') {
            lexer.next();
            let val = '';
            while (lexer.peek() !== null) {
                const c = lexer.next();
                if (c === '\\') {
                    const escaped = lexer.next();
                    if (escaped === '\n' || escaped === '\r') {
                        if (escaped === '\r' && lexer.peek() === '\n') {
                            lexer.next();
                        }
                    } else if (escaped !== null) {
                        val += escaped;
                    }
                } else if (c === ']') {
                    break;
                } else {
                    val += c;
                }
            }
            propValues.push(val);
            lexer.skipWhitespace();
        }

        if (propValues.length === 0) {
            throw new Error('SGF Parse Error: Property ' + propIdent + ' has no value.');
        }

        return { key: propIdent, values: propValues };
    }

    function parseNode(lexer) {
        lexer.skipWhitespace();
        if (lexer.peek() !== ';') return null;
        lexer.next();

        const properties = {};

        while (true) {
            lexer.skipWhitespace();
            if (!lexer.peek() || !/[A-Z]/.test(lexer.peek())) break;

            const prop = parseProperty(lexer);
            if (prop) {
                if (properties[prop.key]) {
                    console.warn('SGF Parse Warning: Duplicate property ' + prop.key + ' in node; merging values.');
                    properties[prop.key] = properties[prop.key].concat(prop.values);
                } else {
                    properties[prop.key] = prop.values;
                }
            } else {
                break;
            }
        }

        validateNodeProperties(properties).forEach(w => console.warn('SGF Parse Warning: ' + w));

        return { properties, children: [] };
    }

    function parseTree(lexer) {
        lexer.skipWhitespace();
        if (lexer.peek() !== '(') return null;
        lexer.next();

        const tree = { nodes: [], children: [] };

        while (true) {
            lexer.skipWhitespace();
            if (lexer.peek() === ';') {
                const node = parseNode(lexer);
                if (node) tree.nodes.push(node);
            } else {
                break;
            }
        }

        while (true) {
            lexer.skipWhitespace();
            if (lexer.peek() === '(') {
                const childTree = parseTree(lexer);
                if (childTree) tree.children.push(childTree);
            } else {
                break;
            }
        }

        lexer.skipWhitespace();
        if (lexer.peek() === ')') {
            lexer.next();
        } else {
            console.warn('SGF Parse Warning: Missing closing parenthesis for GameTree.');
        }

        return tree;
    }

    function parseSgfCollection(sgfStr) {
        const lexer = new SgfLexer(sgfStr);
        lexer.skipWhitespace();
        const trees = [];
        while (lexer.peek() === '(') {
            trees.push(parseTree(lexer));
        }
        return trees;
    }

    function parseSgf(sgfStr) {
        const trees = parseSgfCollection(sgfStr);
        if (trees.length === 0) return null;
        if (trees.length > 1) {
            console.warn('SGF Parse Warning: Collection contains ' + trees.length + ' game trees; using the first.');
        }
        return trees[0];
    }

    function escapePropValue(str) {
        if (typeof str !== 'string') return str;
        return str
            .replace(/\\/g, '\\\\')
            .replace(/]/g, '\\]')
            .replace(/:/g, '\\:');
    }

    function writeNode(node) {
        let out = ';';
        for (const key in node.properties) {
            out += key;
            const values = node.properties[key];
            for (const val of values) {
                out += '[' + escapePropValue(val) + ']';
            }
        }
        return out;
    }

    function writeTree(tree) {
        let out = '(';
        for (const node of tree.nodes) {
            out += writeNode(node);
        }
        for (const child of tree.children) {
            out += writeTree(child);
        }
        out += ')';
        return out;
    }

    function writeCollection(trees) {
        return trees.map(writeTree).join('');
    }

    function extractMainLine(tree) {
        const moves = [];
        let currentTree = tree;
        while (currentTree) {
            for (const node of currentTree.nodes) {
                moves.push(node.properties);
            }
            if (currentTree.children && currentTree.children.length > 0) {
                currentTree = currentTree.children[0];
            } else {
                currentTree = null;
            }
        }
        return moves;
    }

    function cloneTree(tree) {
        if (!tree) return null;
        return {
            nodes: tree.nodes.map(n => ({
                properties: JSON.parse(JSON.stringify(n.properties)),
                children: n.children || []
            })),
            children: (tree.children || []).map(cloneTree)
        };
    }

    function applySetupProperties(board, props, boardWidth, boardHeight) {
        if (props.AE) {
            expandPointList(props.AE, boardWidth, boardHeight).forEach(pt => {
                if (board[pt.r] && board[pt.r][pt.c]) {
                    board[pt.r][pt.c].player = null;
                }
            });
        }
        if (props.AB) {
            expandPointList(props.AB, boardWidth, boardHeight).forEach(pt => {
                if (board[pt.r] && board[pt.r][pt.c]) {
                    board[pt.r][pt.c].player = 'B';
                }
            });
        }
        if (props.AW) {
            expandPointList(props.AW, boardWidth, boardHeight).forEach(pt => {
                if (board[pt.r] && board[pt.r][pt.c]) {
                    board[pt.r][pt.c].player = 'W';
                }
            });
        }
    }

    function parseMarkupProperties(props, boardWidth, boardHeight) {
        const annotations = [];
        const addPoints = (tag, type) => {
            if (!props[tag]) return;
            expandPointList(props[tag], boardWidth, boardHeight).forEach(pt => {
                annotations.push({ r: pt.r, c: pt.c, type });
            });
        };
        addPoints('TR', 'triangle');
        addPoints('SQ', 'square');
        addPoints('CR', 'circle');
        addPoints('MA', 'cross');
        addPoints('SL', 'selected');
        addPoints('CXR', 'red-circle');
        addPoints('CXG', 'green-circle');

        if (props.LB) {
            props.LB.forEach(val => {
                const colonIdx = val.indexOf(':');
                if (colonIdx < 1) return;
                const coordPart = val.substring(0, colonIdx);
                const label = val.substring(colonIdx + 1);
                expandPointValue(coordPart, boardWidth, boardHeight).forEach(pt => {
                    annotations.push({ r: pt.r, c: pt.c, type: 'label', label });
                });
            });
        }

        const territory = {
            black: props.TB ? expandPointList(props.TB, boardWidth, boardHeight) : [],
            white: props.TW ? expandPointList(props.TW, boardWidth, boardHeight) : []
        };

        return { annotations, territory };
    }

    function extractUnknownProperties(props) {
        const unknown = {};
        for (const key in props) {
            if (!STANDARD_PROPS.has(key)) {
                unknown[key] = props[key].slice();
            }
        }
        return unknown;
    }

    function mergeUnknownProperties(nodeProps, unknown) {
        if (!unknown) return nodeProps;
        const merged = Object.assign({}, nodeProps);
        for (const key in unknown) {
            merged[key] = unknown[key].slice();
        }
        return merged;
    }

    function annotationsToProperties(anns) {
        const props = {};
        if (!anns || anns.length === 0) return props;
        const tr = [], sq = [], cr = [], ma = [], sl = [], lb = [], cxr = [], cxg = [];
        anns.forEach(a => {
            const coord = formatGoPoint(a.c, a.r);
            if (!coord) return;
            switch (a.type) {
                case 'triangle': tr.push(coord); break;
                case 'square': sq.push(coord); break;
                case 'circle': cr.push(coord); break;
                case 'cross': ma.push(coord); break;
                case 'selected': sl.push(coord); break;
                case 'red-circle': cxr.push(coord); break;
                case 'green-circle': cxg.push(coord); break;
                case 'label': lb.push(coord + ':' + a.label); break;
            }
        });
        if (tr.length) props.TR = tr;
        if (sq.length) props.SQ = sq;
        if (cr.length) props.CR = cr;
        if (ma.length) props.MA = ma;
        if (sl.length) props.SL = sl;
        if (lb.length) props.LB = lb;
        if (cxr.length) props.CXR = cxr;
        if (cxg.length) props.CXG = cxg;
        return props;
    }

    /** Replace main-line sequence nodes in a cloned tree (preserves variations). */
    function replaceMainLineNodes(tree, nodePropertyList) {
        let currentTree = tree;
        let nodeIndex = 0;

        while (currentTree && nodeIndex < nodePropertyList.length) {
            for (let i = 0; i < currentTree.nodes.length && nodeIndex < nodePropertyList.length; i++) {
                currentTree.nodes[i].properties = JSON.parse(JSON.stringify(nodePropertyList[nodeIndex]));
                nodeIndex++;
            }
            if (nodeIndex >= nodePropertyList.length) break;
            if (currentTree.children && currentTree.children.length > 0) {
                currentTree = currentTree.children[0];
            } else {
                while (nodeIndex < nodePropertyList.length) {
                    currentTree.nodes.push({ properties: JSON.parse(JSON.stringify(nodePropertyList[nodeIndex])), children: [] });
                    nodeIndex++;
                }
            }
        }
        return tree;
    }

    /** Replace sequence nodes along a specific branch path in a cloned tree. */
    function replaceBranchNodes(tree, branchPath, nodePropertyList) {
        let currentTree = tree;
        let nodeIndex = 0;
        let pathIdx = 0;

        while (currentTree && nodeIndex < nodePropertyList.length) {
            for (let i = 0; i < currentTree.nodes.length && nodeIndex < nodePropertyList.length; i++) {
                currentTree.nodes[i].properties = JSON.parse(JSON.stringify(nodePropertyList[nodeIndex]));
                nodeIndex++;
            }
            if (nodeIndex >= nodePropertyList.length) break;
            
            if (currentTree.children && currentTree.children.length > 0) {
                let nextChildIndex = 0;
                if (pathIdx < branchPath.length) {
                    nextChildIndex = branchPath[pathIdx];
                    pathIdx++;
                }
                if (nextChildIndex >= currentTree.children.length) {
                    nextChildIndex = 0;
                }
                currentTree = currentTree.children[nextChildIndex];
            } else {
                while (nodeIndex < nodePropertyList.length) {
                    currentTree.nodes.push({ properties: JSON.parse(JSON.stringify(nodePropertyList[nodeIndex])), children: [] });
                    nodeIndex++;
                }
            }
        }
        return tree;
    }

    return {
        parseSgf,
        parseSgfCollection,
        writeSgf: function(tree) {
            const raw = writeTree(tree);
            return SgfSanitizer.sanitize(raw) || raw;
        },
        writeCollection,
        sanitize: function(rawSgf) { return SgfSanitizer.sanitize(rawSgf); },
        extractMainLine,
        cloneTree,
        replaceMainLineNodes,
        replaceBranchNodes,
        letterToIndex,
        indexToLetter,
        parseBoardSize,
        parseGoPoint,
        formatGoPoint,
        expandPointValue,
        expandPointList,
        compressGoPoints,
        applySetupProperties,
        parseMarkupProperties,
        validateNodeProperties,
        extractUnknownProperties,
        mergeUnknownProperties,
        annotationsToProperties,
        MOVE_PROPS,
        SETUP_PROPS,
        STANDARD_PROPS
    };
})();

/**
 * The Algorithmic: SGFC-Strict SGF FF[4] Sanitizer
 * 
 * Extracts an SGF sequence from text/AST, applies strict FF[4] metadata rectification,
 * and outputs a layout matching standard SGFC formatting with 10-move line wrapping.
 */
class SgfSanitizer {
    static sanitize(rawSgf) {
        if (!rawSgf || typeof rawSgf !== 'string') return '';

        // Scan permissively to bypass markdown lists, HTML, or raw text pollution.
        const startIdx = rawSgf.indexOf('(;');
        if (startIdx === -1) return rawSgf;

        const text = rawSgf.slice(startIdx);

        // --- 1. TREE-AWARE TOKENIZER ---
        // FF[4] grammar: GameTree := "(" Sequence GameTree* ")".
        // Parse into nested containers so sibling variation subtrees survive
        // reassembly instead of being flattened into the main line.
        let currentNode = null;
        let currentProp = '';
        let currentValues = [];

        let inValue = false;
        let valueBuffer = '';
        let escape = false;

        const flushPending = () => {
            if (currentNode && currentProp && currentValues.length > 0) {
                currentNode.props.set(currentProp, currentValues);
                currentProp = ''; currentValues = [];
            }
        };

        const stack = [];   // open GameTree containers: { seq: [node], kids: [tree] }
        let rootTree = null;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];

            if (inValue) {
                if (escape) {
                    valueBuffer += c;
                    escape = false;
                } else if (c === '\\') {
                    valueBuffer += '\\'; // Preserve escape character for output
                    escape = true;
                } else if (c === ']') {
                    currentValues.push(valueBuffer);
                    valueBuffer = '';
                    inValue = false;
                } else {
                    valueBuffer += c;
                }
            } else {
                if (c === '(') {
                    flushPending();
                    stack.push({ seq: [], kids: [] });
                    currentNode = null;
                } else if (c === ')') {
                    flushPending();
                    const closed = stack.pop();
                    currentNode = null;
                    if (!closed) break; // malformed — stop gracefully
                    if (stack.length === 0) { rootTree = closed; break; } // End of primary game
                    stack[stack.length - 1].kids.push(closed);
                } else if (c === ';') {
                    flushPending();
                    currentNode = { props: new Map() };
                    if (stack.length > 0) stack[stack.length - 1].seq.push(currentNode);
                } else if (c === '[') {
                    inValue = true;
                    valueBuffer = '';
                } else if (currentNode && /[A-Z]/.test(c)) { // Only uppercase characters define FF[4] properties
                    if (currentProp !== '' && currentValues.length > 0) {
                        currentNode.props.set(currentProp, currentValues);
                        currentProp = ''; currentValues = [];
                    }
                    currentProp += c;
                }
            }
        }

        // Unbalanced input: fall back to the outermost collected container.
        if (!rootTree && stack.length > 0) rootTree = stack[0];
        if (!rootTree || rootTree.seq.length === 0) return rawSgf;

        // --- 2. GO-DOMAIN RECTIFICATIONS ---
        const root = rootTree.seq[0].props;

        // Enforce structural ingestion requirements
        root.set('FF', ['4']);
        root.set('CA', ['UTF-8']);
        root.set('GM', ['1']);
        if (!root.has('SZ')) root.set('SZ', ['19']);
        root.set('AP', ['SGFC:2.3']); // Strict formatter flag

        // Normalize Komi from zi to points if inflated.
        if (root.has('KM')) {
            const kmVal = parseFloat(root.get('KM')[0]);
            if (kmVal > 100) root.set('KM', [((kmVal / 100) * 2).toString()]);
        }

        // Strip non-standard registry violators.
        ['TC', 'TT', 'RL'].forEach(p => root.delete(p));

        // --- 3. SGFC-STRICT REASSEMBLY (structure-preserving) ---
        const formatNodeParts = (node) => {
            let nodeStr = ';';
            let markupStr = '';
            const hasComment = node.has('C');

            for (const [k, v] of node.entries()) {
                if (['DD', 'MA', 'TB', 'TW'].includes(k)) {
                    const compressed = compressGoPoints(v);
                    if (compressed.length > 0) {
                        markupStr += `\n${k}[${compressed.join('][')}]`;
                    }
                } else {
                    nodeStr += `${k}[${v.join('][')}]`;
                }
            }

            return { nodeStr, markupStr, hasComment };
        };

        let out = '(\n\n';

        // Root grouping header
        const rootHeader = ['FF', 'CA', 'GM', 'SZ', 'AP'];
        let headerStr = ';';
        rootHeader.forEach(p => {
            if (root.has(p)) headerStr += `${p}[${root.get(p).join('][')}]`;
        });
        out += headerStr + '\n\n';

        if (root.has('EV')) out += `EV[${root.get('EV').join('][')}]\n\n`;

        const playerProps = ['PB', 'BR', 'PW', 'WR', 'KM', 'DT', 'PC', 'RE'];
        playerProps.forEach(p => {
            if (root.has(p)) out += `${p}[${root.get(p).join('][')}]\n`;
        });

        const handledRootProps = new Set(['FF', 'CA', 'GM', 'SZ', 'AP', 'EV', ...playerProps]);
        for (const [k, v] of root.entries()) {
            if (!handledRootProps.has(k)) {
                out += `${k}[${v.join('][')}]\n`;
            }
        }
        out += '\n';

        // Sequence emission with 10-move line wrapping (comments/markup on own line).
        const emitSequence = (tree, skipFirst) => {
            let s = '';
            let moveCount = 0;
            tree.seq.forEach((wrapper, idx) => {
                if (skipFirst && idx === 0) return; // root already emitted as header
                const { nodeStr, markupStr, hasComment } = formatNodeParts(wrapper.props);

                if (hasComment || markupStr) {
                    if (moveCount > 0) s += '\n';
                    s += nodeStr + markupStr + '\n';
                    moveCount = 0;
                } else {
                    s += nodeStr;
                    moveCount++;
                    if (moveCount >= 10) {
                        s += '\n';
                        moveCount = 0;
                    }
                }
            });
            if (moveCount > 0) s += '\n';
            return s;
        };

        // Variation subtrees recurse as sibling GameTrees ("(…)(…)" per FF[4]).
        const emitSubtree = (tree) => {
            let s = '(' + emitSequence(tree, false);
            for (const kid of tree.kids) {
                s += '\n\n' + emitSubtree(kid);
            }
            return s + ')';
        };

        out += emitSequence(rootTree, true);
        for (const kid of rootTree.kids) {
            out += '\n\n' + emitSubtree(kid);
        }
        out += '\n)\n';

        return out;
    }
}

function compressGoPoints(pointList, boardWidth = 19, boardHeight = 19) {
    if (!pointList || pointList.length === 0) return [];

    const grid = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(false));
    let hasPoints = false;

    pointList.forEach(pt => {
        if (typeof pt === 'string' && pt.length >= 2) {
            if (pt.includes(':')) {
                const parts = pt.split(':');
                if (parts.length === 2) {
                    const c1 = parts[0].charCodeAt(0) - 97;
                    const r1 = parts[0].charCodeAt(1) - 97;
                    const c2 = parts[1].charCodeAt(0) - 97;
                    const r2 = parts[1].charCodeAt(1) - 97;
                    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
                        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
                            if (c >= 0 && c < boardWidth && r >= 0 && r < boardHeight) {
                                grid[r][c] = true;
                                hasPoints = true;
                            }
                        }
                    }
                }
                return;
            }
            const c = pt.charCodeAt(0) - 97;
            const r = pt.charCodeAt(1) - 97;
            if (c >= 0 && c < boardWidth && r >= 0 && r < boardHeight) {
                grid[r][c] = true;
                hasPoints = true;
            }
        }
    });

    if (!hasPoints) return [];

    const used = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(false));
    const rects = [];

    for (let r1 = 0; r1 < boardHeight; r1++) {
        for (let c1 = 0; c1 < boardWidth; c1++) {
            if (!grid[r1][c1] || used[r1][c1]) continue;

            let maxC2 = c1;
            while (maxC2 + 1 < boardWidth && grid[r1][maxC2 + 1] && !used[r1][maxC2 + 1]) {
                maxC2++;
            }

            let maxR2 = r1;
            for (let r = r1 + 1; r < boardHeight; r++) {
                let rowValid = true;
                for (let c = c1; c <= maxC2; c++) {
                    if (!grid[r][c] || used[r][c]) {
                        rowValid = false;
                        break;
                    }
                }
                if (rowValid) {
                    maxR2 = r;
                } else {
                    break;
                }
            }

            for (let r = r1; r <= maxR2; r++) {
                for (let c = c1; c <= maxC2; c++) {
                    used[r][c] = true;
                }
            }

            rects.push({ r1, c1, r2: maxR2, c2: maxC2 });
        }
    }

    return rects.map(({ r1, c1, r2, c2 }) => {
        const ul = String.fromCharCode(97 + c1) + String.fromCharCode(97 + r1);
        if (r1 === r2 && c1 === c2) {
            return ul;
        }
        const lr = String.fromCharCode(97 + c2) + String.fromCharCode(97 + r2);
        return `${ul}:${lr}`;
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SgfEngine;
    module.exports.SgfSanitizer = SgfSanitizer;
} else if (typeof window !== 'undefined') {
    window.SgfEngine = SgfEngine;
    window.SgfSanitizer = SgfSanitizer;
}
