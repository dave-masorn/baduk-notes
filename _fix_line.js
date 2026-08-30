const fs = require('fs');
const p = 'study-storage.js';
const s = fs.readFileSync(p, 'utf8');
const bad = 'Loaded ${res.records.length} Rec(s) from "${res.name || \'folder"}"`. They';
const good = 'Loaded ${res.records.length} Rec(s) from "${res.name || \'folder\'}". They';
const i = s.indexOf(bad);
if (i < 0) { console.log('NOT FOUND'); process.exit(1); }
fs.writeFileSync(p, s.slice(0, i) + good + s.slice(i + bad.length));
console.log('fixed');
