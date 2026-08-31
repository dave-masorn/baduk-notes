// ==========================================================================
// Study Record Storage Engine — STdB (Study Database)
// All game records live as real files in a user-chosen folder.
// No browser localStorage / IDB is used for game data — only for the
// folder handle pointer (like a bookmark to the STdB).
//
// STdB layout:
//   NNN.sgf        — the game (plain SGF text, written back on every move)
//   NNN.theme      — JSON: record metadata + board setups (initial/study/export/scoring)
//   imgs/          — board texture images assigned via Floating Panel
// ==========================================================================

// --- Format helper --------------------------------------------------------
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
window.formatStudyAccessTime = formatStudyAccessTime;

// --- In-memory record cache (populated async from STdB) -------------------
let _recordsCache = null;

// The resume-study list renders synchronously during app init; if records
// land in the cache later (async STdB load), re-render so the count is
// never stuck at 0 RECORDED.
function _rerenderResumeList() {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
        if (typeof window.renderResumeStudyTable === 'function') {
            try {
                const searchEl = document.getElementById('kifu-search-input');
                window.renderResumeStudyTable(searchEl ? searchEl.value : '');
            } catch (e) {}
        }
    });
}

// --- StudyRecordDB (public API — STdB-only) --------------------------------
// The in-memory cache is the sync layer; STdB files are the persistence.
// All callers (annotation_v4.js, scoring, tests) use this interface.
window.StudyRecordDB = {

    getAllRecords() {
        if (_recordsCache !== null) return _recordsCache;
        return [];
    },

    getRecord(id) {
        if (!id) return null;
        return this.getAllRecords().find(r => r && r.id === id) || null;
    },

    // Write a record to the in-memory cache + async flush to STdB files.
    // The in-memory update is synchronous so callers see the change immediately.
    saveRecord(record) {
        if (!record || !record.id) return false;
        try {
            const records = this.getAllRecords();
            const idx = records.findIndex(r => r.id === record.id);
            if (idx >= 0) {
                records[idx] = { ...records[idx], ...record };
            } else {
                records.unshift(record);
            }
            _recordsCache = records;

            // Flush to STdB (async, non-blocking — caller does not wait)
            if (typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
                const savedRec = records[idx >= 0 ? idx : 0];
                window.StudyDirStore.saveRecord(savedRec).then(ok => {
                    if (!ok) console.warn('[StudyRecordDB] STdB save failed for', savedRec.id);
                });
            }

            console.log(`[StudyRecordDB] saveRecord -> ID: ${record.id}, recNo: ${record.recNo}, currentMoveIndex: ${record.currentMoveIndex}`);
            return true;
        } catch (e) {
            console.error('Failed to save study record:', e);
            return false;
        }
    },

    deleteRecord(id) {
        try {
            const removed = this.getRecord(id);
            _recordsCache = this.getAllRecords().filter(r => r.id !== id);

            if (removed && typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
                window.StudyDirStore.deleteRecord(removed);
            }
            return true;
        } catch (e) {
            console.error('Failed to delete study record:', e);
            return false;
        }
    },

    // Read all records from the STdB folder and populate the in-memory cache.
    async loadAllFromDir() {
        if (typeof window === 'undefined' || !window.StudyDirStore || !window.StudyDirStore.isConfigured) {
            return this.getAllRecords();
        }
        const dirRecords = await window.StudyDirStore.loadAllRecords();
        if (Array.isArray(dirRecords) && dirRecords.length > 0) {
            _recordsCache = dirRecords;
        } else {
            _recordsCache = _recordsCache || [];
        }
        _rerenderResumeList();
        return _recordsCache;
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
        return String(maxNum + 1).padStart(3, '0');
    },

    // Compatibility: mergeDirRecords adds directory records to cache (STdB wins).
    async mergeDirRecords(dirRecords) {
        if (!Array.isArray(dirRecords) || dirRecords.length === 0) return this.getAllRecords();
        const existing = this.getAllRecords();
        const byId = new Map(existing.map(r => [r.id, r]));
        dirRecords.forEach(r => { byId.set(r.id, r); });
        _recordsCache = Array.from(byId.values());
        _recordsCache.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();
        return _recordsCache;
    }
};

// ==========================================================================
// Study Dir Store (filesystem layer — STdB)
// Handles the FS API directory handle, OPFS fallback, and all file I/O.
// IDB is used ONLY to persist the directory handle pointer (one tiny record).
// ==========================================================================

const DIR_IDB_NAME = 'BadukNotesDirStore';
const DIR_IDB_STORE = 'dir_handles';
const DIR_HANDLE_KEY = 'studyRecDir';

let _dirStoreReady = null;

function _openDirIDB() {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(DIR_IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DIR_IDB_STORE)) {
                    db.createObjectStore(DIR_IDB_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}

async function _loadDirHandle() {
    const db = await _openDirIDB();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(DIR_IDB_STORE, 'readonly');
            const get = tx.objectStore(DIR_IDB_STORE).get(DIR_HANDLE_KEY);
            get.onsuccess = () => resolve((get.result && get.result.handle) || null);
            get.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}

async function _saveDirHandle(handle) {
    const db = await _openDirIDB();
    if (!db || !handle) return;
    try {
        const tx = db.transaction(DIR_IDB_STORE, 'readwrite');
        tx.objectStore(DIR_IDB_STORE).put({ key: DIR_HANDLE_KEY, handle });
    } catch (e) {}
}

async function _clearDirHandle() {
    const db = await _openDirIDB();
    if (!db) return;
    try {
        const tx = db.transaction(DIR_IDB_STORE, 'readwrite');
        tx.objectStore(DIR_IDB_STORE).delete(DIR_HANDLE_KEY);
    } catch (e) {}
}

async function _writeFile(dirHandle, fileName, content) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (e) {
        console.warn('[StudyDirStore] write failed:', fileName, e);
        return false;
    }
}

async function _readFileText(dirHandle, fileName) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return await file.text();
    } catch (e) { return null; }
}

async function _readJson(dirHandle, fileName) {
    const text = await _readFileText(dirHandle, fileName);
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
}

const StudyDirStore = {
    _dir: null,
    _fallbackName: '',
    _lastFallbackRecords: [],
    _opfsDir: false,
    _dirLabel: '',

    get isSupported() {
        return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
    },

    get hasOpfs() {
        return typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.getDirectory === 'function';
    },

    get usingOpfs() {
        return !!this._opfsDir;
    },

    get hasFolderFallback() {
        return typeof window !== 'undefined' && document.createElement('input').webkitdirectory !== undefined;
    },

    get isConfigured() {
        return !!this._dir;
    },

    get isUsingFallback() {
        return !this.isSupported && !!this._fallbackName;
    },

    getDirName() {
        if (this._dirLabel) return this._dirLabel;
        if (this._dir) { try { return this._dir.name || ''; } catch (e) {} }
        if (this._fallbackName) return this._fallbackName;
        return '';
    },

    // Open the automatic private folder (OPFS) for this origin.
    async initOpfs() {
        if (!this.hasOpfs) return false;
        try {
            const root = await navigator.storage.getDirectory();
            const sub = await root.getDirectoryHandle('baduk-notes', { create: true });
            this._dir = sub;
            this._opfsDir = true;
            this._dirLabel = 'Automatic folder';
            return true;
        } catch (e) {
            console.warn('[StudyDirStore] OPFS init failed:', e);
            return false;
        }
    },

    // Load persisted handle and request read/write permission (required once per session).
    async init() {
        if (!this.isSupported) return { supported: false, ready: false };
        if (_dirStoreReady) return _dirStoreReady;
        _dirStoreReady = (async () => {
            const handle = await _loadDirHandle();
            if (!handle) return { supported: true, ready: false, needsSetup: true };
            try {
                let perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    perm = await handle.requestPermission({ mode: 'readwrite' });
                }
                if (perm === 'granted') {
                    this._dir = handle;
                    this._opfsDir = false;
                    this._dirLabel = '';
                    return { supported: true, ready: true, needsSetup: false };
                }
                return { supported: true, ready: false, needsSetup: true, permissionDenied: true };
            } catch (e) {
                return { supported: true, ready: false, needsSetup: true };
            }
        })();
        return _dirStoreReady;
    },

    // Show the directory picker to the user.
    async setupDirectory() {
        if (!this.isSupported) return false;
        try {
            const handle = await window.showDirectoryPicker({ id: 'baduk-rec-storage', mode: 'readwrite' });
            this._dir = handle;
            this._opfsDir = false;
            this._dirLabel = '';
            await _saveDirHandle(handle);
            return true;
        } catch (e) { return false; }
    },

    async reGrantPermission() {
        if (!this._dir) return false;
        try {
            const perm = await this._dir.requestPermission({ mode: 'readwrite' });
            return perm === 'granted';
        } catch (e) { return false; }
    },

    async clear() {
        await _clearDirHandle();
        this._dir = null;
        this._fallbackName = '';
        _dirStoreReady = null;
    },

    async getDirHandle() {
        return this._dir || null;
    },

    // Write a texture image into the STdB at relPath (e.g. "imgs/kaya.png"),
    // creating intermediate folders as needed.
    async importTexture(file, relPath) {
        if (!this.isConfigured || !file || !relPath) return false;
        try {
            const parts = String(relPath).split('/').filter(Boolean);
            const name = parts.pop();
            if (!name) return false;
            let dir = this._dir;
            for (const part of parts) {
                dir = await dir.getDirectoryHandle(part, { create: true });
            }
            const fileHandle = await dir.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
            return true;
        } catch (e) {
            console.warn('[StudyDirStore] texture import failed:', relPath, e);
            return false;
        }
    },

    // --- STdB file format ---------------------------------------------------
    // Each Rec is a pair:  NNN.sgf  (game text)  +  NNN.theme  (metadata + board setups).

    _recordFileNames(rec) {
        const no = String(rec.recNo || '000').padStart(3, '0');
        return { sgf: `${no}.sgf`, theme: `${no}.theme` };
    },

    // Write a single record to STdB as NNN.sgf + NNN.theme.
    async saveRecord(rec) {
        if (!this.isConfigured || !rec || !rec.id) return false;
        const names = this._recordFileNames(rec);

        // SGF file = working game text
        const okSgf = await _writeFile(this._dir, names.sgf, rec.workingSgf || rec.rawSgf || '');

        // Theme file = everything except the SGF text
        const theme = { ...rec };
        delete theme.workingSgf;
        delete theme.rawSgf;
        const okTheme = await _writeFile(this._dir, names.theme, JSON.stringify(theme, null, 2));

        return okSgf && okTheme;
    },

    // Read every Rec out of STdB. Handles both new (NNN.theme) and legacy
    // (rec-NNN-slug.json) formats for backward compatibility.
    async loadAllRecords() {
        if (this.isUsingFallback) {
            return this._lastFallbackRecords || [];
        }
        if (!this.isConfigured) return [];
        try {
            const out = [];
            for await (const entry of this._dir.values()) {
                if (entry.kind !== 'file') continue;

                // --- New format: *.theme ---
                if (entry.name.endsWith('.theme')) {
                    const meta = await _readJson(this._dir, entry.name);
                    if (!meta || !meta.id || !meta.recNo) continue;
                    const no = String(meta.recNo).padStart(3, '0');
                    const sgf = await _readFileText(this._dir, `${no}.sgf`);
                    if (sgf == null) continue;
                    out.push({ ...meta, workingSgf: sgf });
                    continue;
                }

                // --- Legacy format: rec-NNN-slug.json (pre-STdB) ---
                if (entry.name.endsWith('.json')) {
                    const meta = await _readJson(this._dir, entry.name);
                    if (!meta || !meta.id || meta._dirSchema !== 1) continue;
                    const sgfFile = meta.sgfFile || null;
                    const sgf = sgfFile ? await _readFileText(this._dir, sgfFile) : null;
                    if (sgf == null && !meta.rawSgf) continue;
                    const rec = { ...meta, workingSgf: sgf != null ? sgf : (meta.rawSgf || '') };
                    // Tag the physical source filename so dedupe/cleanup can remove
                    // exactly this legacy file without touching a same-numbered new file.
                    rec._legacyJsonFile = entry.name;
                    out.push(rec);
                }
            }
            out.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();

            // De-duplicate by recNo. Each Rec must have a unique number; a leftover
            // legacy file (rec-NNN-*.json) can share recNo with a newer NNN.theme if
            // the same game was re-dropped after the STdB rewrite. Keep the most
            // recently accessed one for display.
            const byNo = new Map();
            const staleFiles = [];
            for (const rec of out) {
                const no = String(rec.recNo || '').padStart(3, '0');
                if (!no || no === '000') continue;
                if (!byNo.has(no)) {
                    byNo.set(no, rec);
                } else {
                    const prev = byNo.get(no);
                    const prevTime = prev.lastAccess || '';
                    const thisTime = rec.lastAccess || '';
                    if (thisTime > prevTime) {
                        byNo.set(no, rec);
                        staleFiles.push(prev);
                    } else {
                        staleFiles.push(rec);
                    }
                }
            }
            const unique = Array.from(byNo.values());

            // Best-effort removal of stale duplicate physical files so they do not
            // keep re-appearing on every load. Never throws on failure.
            // A legacy rec (rec-NNN-*.json) stores its real sgf filename in
            // `sgfFile`, which differs from the new NNN.sgf/NNN.theme naming — so
            // only ever remove a file that genuinely belongs to the stale record.
            for (const dup of staleFiles) {
                if (dup && dup.sgfFile && dup.sgfFile !== String(dup.recNo).padStart(3, '0') + '.sgf') {
                    try { await this._dir.removeEntry(dup.sgfFile); } catch (e) {}
                    if (dup._legacyJsonFile) { try { await this._dir.removeEntry(dup._legacyJsonFile); } catch (e) {} }
                } else {
                    const no = dup && dup.recNo !== undefined ? String(dup.recNo).padStart(3, '0') : '';
                    if (no) {
                        try { await this._dir.removeEntry(no + '.sgf'); } catch (e) {}
                        try { await this._dir.removeEntry(no + '.theme'); } catch (e) {}
                    }
                }
            }
            return unique;
        } catch (e) {
            console.warn('[StudyDirStore] loadAllRecords failed:', e);
            return [];
        }
    },

    async deleteRecord(rec) {
        if (!this.isConfigured || !rec) return;
        const names = this._recordFileNames(rec);
        try { await this._dir.removeEntry(names.sgf); } catch (e) {}
        try { await this._dir.removeEntry(names.theme); } catch (e) {}
        // Also remove any legacy files that share this recNo so the deleted Rec
        // never re-appears on the next load from a leftover rec-NNN-* pair.
        const no = String(rec.recNo || '').padStart(3, '0');
        if (no && no !== '000') {
            try {
                for await (const entry of this._dir.values()) {
                    if (entry.kind !== 'file') continue;
                    if (/^rec-/.test(entry.name) && entry.name.includes(`-${no}-`)) {
                        try { await this._dir.removeEntry(entry.name); } catch (e) {}
                    }
                }
            } catch (e) {}
        }
        if (rec._dirSchema === 1 && rec.sgfFile) {
            try { await this._dir.removeEntry(rec.sgfFile); } catch (e) {}
        }
        if (rec.sgfFile && rec.sgfFile !== names.sgf) {
            try { await this._dir.removeEntry(rec.sgfFile); } catch (e) {}
        }
    }
};

if (typeof window !== 'undefined') {
    window.StudyDirStore = StudyDirStore;
}

// ==========================================================================
// Migration: carry old OPFS / localStorage records into the new STdB
// ==========================================================================

async function _migrateOldRecordsToStdB() {
    if (!window.StudyDirStore || !window.StudyDirStore.isConfigured) return;

    // One-time migration only: once we have carried legacy storage into the STdB
    // (or decided there was nothing worth carrying), never run again. Otherwise the
    // stale legacy IDB/localStorage stores keep re-seeding records on every load —
    // which resurrects records the user deliberately deleted.
    const MIG_FLAG = 'baduk_study_migration_done';
    try {
        if (localStorage.getItem(MIG_FLAG) === '1') return;
    } catch (e) { return; }

    // Only migrate if the STdB is empty (no theme files yet).
    try {
        let hasTheme = false;
        for await (const entry of window.StudyDirStore._dir.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.theme')) { hasTheme = true; break; }
        }
        if (hasTheme) {
            // STdB already populated — nothing to migrate, stop forever.
            try { localStorage.setItem(MIG_FLAG, '1'); } catch (e) {}
            return;
        }
    } catch (e) { return; }

    let oldRecords = [];
    const legacyFilesToRemove = [];

    // 1. Try the old OPFS automatic folder (baduk-notes/).
    try {
        const root = await navigator.storage.getDirectory();
        const oldDir = await root.getDirectoryHandle('baduk-notes', { create: false });
        for await (const entry of oldDir.values()) {
            if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
            const meta = await _readJson(oldDir, entry.name);
            if (!meta || !meta.id || meta._dirSchema !== 1) continue;
            const sgfFile = meta.sgfFile || null;
            const sgf = sgfFile ? await _readFileText(oldDir, sgfFile) : null;
            if (sgf == null && !meta.rawSgf) continue;
            oldRecords.push({ ...meta, workingSgf: sgf != null ? sgf : (meta.rawSgf || '') });
            legacyFilesToRemove.push({ json: entry.name, sgf: sgfFile });
        }
    } catch (e) {}

    // 2. Fallback: localStorage mirror.
    if (oldRecords.length === 0) {
        try {
            const raw = localStorage.getItem('baduk_notes_study_sessions_v1');
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list) && list.length > 0) oldRecords = list;
            }
        } catch (e) {}
    }

    // 3. Fallback: IDB record store.
    if (oldRecords.length === 0) {
        try {
            const db = await new Promise((res) => {
                const req = indexedDB.open('BadukNotesDB', 1);
                req.onsuccess = (e) => res(e.target.result);
                req.onerror = () => res(null);
            });
            if (db && db.objectStoreNames.contains('study_records')) {
                const all = await new Promise((res) => {
                    const tx = db.transaction('study_records', 'readonly');
                    const req = tx.objectStore('study_records').getAll();
                    req.onsuccess = () => res(req.result || []);
                    req.onerror = () => res([]);
                });
                if (Array.isArray(all) && all.length > 0) oldRecords = all;
            }
        } catch (e) {}
    }

    if (oldRecords.length === 0) {
        // Nothing to migrate. Mark complete so we never re-scan (and never
        // resurrect records that were never created in the STdB).
        try { localStorage.setItem(MIG_FLAG, '1'); } catch (e) {}
        return;
    }

    // Write each old record into the STdB with fresh sequential numbering.
    let nextNo = 1;
    for (const rec of oldRecords) {
        const no = String(nextNo).padStart(3, '0');
        const newRec = { ...rec, recNo: no };
        await window.StudyDirStore.saveRecord(newRec);
        nextNo++;
    }

    // Remove the legacy source files we just migrated so they do not keep
    // being read back (and de-duplicated) on every load. Only touch files that
    // came from the current STdB dir (OPFS baduk-notes/) — not other sources.
    // Remove the legacy source files we just migrated so they do not keep
    // being read back (and de-duplicated) on every load. Only safe to do when
    // the old OPFS folder IS the current STdB dir (i.e. using OPFS). If the
    // STdB is a user-picked folder, leave the OPFS legacy files in place —
    // loadAllRecords only reads from the current `_dir`, so they stay out of
    // the way.
    if (window.StudyDirStore && window.StudyDirStore.usingOpfs && window.StudyDirStore._dir) {
        for (const f of legacyFilesToRemove) {
            try { if (f.json) await window.StudyDirStore._dir.removeEntry(f.json); } catch (e) {}
            try { if (f.sgf) await window.StudyDirStore._dir.removeEntry(f.sgf); } catch (e) {}
        }
    }

    // Refresh the in-memory cache.
    await window.StudyRecordDB.loadAllFromDir();
    _rerenderResumeList();

    // Mark migration done forever and clear the legacy stores so the deleted
    // record(s) can never be resurrected by a later scan.
    try { localStorage.setItem(MIG_FLAG, '1'); } catch (e) {}
    try { localStorage.removeItem('baduk_notes_study_sessions_v1'); } catch (e) {}
    try {
        const db = await new Promise((res) => {
            const req = indexedDB.open('BadukNotesDB', 1);
            req.onsuccess = (e) => res(e.target.result);
            req.onerror = () => res(null);
        });
        if (db && db.objectStoreNames.contains('study_records')) {
            const tx = db.transaction('study_records', 'readwrite');
            tx.objectStore('study_records').clear();
        }
    } catch (e) {}

    console.log(`[StudyDirStore] Migrated ${oldRecords.length} Rec(s) into STdB`);
}

// ==========================================================================
// Directory storage bootstrapping + setup UI
// ==========================================================================

function _dirOverlay() {
    return document.getElementById('study-dir-setup-overlay');
}

function _dirStatusText() {
    return document.getElementById('study-dir-status');
}

function _dirChoiceDone() {
    try { return localStorage.getItem('baduk_dir_choice_done') === '1'; } catch (e) { return false; }
}

function _markDirChoiceDone() {
    try { localStorage.setItem('baduk_dir_choice_done', '1'); } catch (e) {}
}

function _openDirSetup() {
    const overlay = _dirOverlay();
    if (!overlay) return;
    _updateDirOverlayCopy();
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    const st = window.StudyDirStore;
    if (st && st.isConfigured) {
        _setDirStatus('Study Database: ' + st.getDirName() + '.');
    } else {
        _setDirStatus('');
    }
}

function updateDirLocationUI() {
    const el = document.getElementById('header-subtitle-text');
    if (!el) return;
    const st = window.StudyDirStore || null;
    let html;
    if (st && st.isConfigured) {
        if (st.usingOpfs) {
            const linkTxt = st.isSupported ? 'Use a folder\u2026' : 'How it works\u2026';
            const linkTitle = st.isSupported ? 'Switch to a folder you choose' : 'How the Study Database works in this browser';
            html = '\uD83D\uDCC1 Study Database (this device)  \u00B7  <a href="#" id="dir-change-link" title="' + linkTitle + '">' + linkTxt + '</a>';
        } else {
            const name = st.getDirName() || 'the selected folder';
            html = '\uD83D\uDCC1 ' + name + '  \u00B7  <a href="#" id="dir-change-link" title="The Study Database folder">Change</a>';
        }
    } else if (st && st.hasOpfs) {
        html = '\uD83D\uDDC2 Study Database in automatic storage  \u00B7  <a href="#" id="dir-change-link" title="How the Study Database works in this browser">How it works\u2026</a>';
    } else {
        html = '\uD83D\uDDC2 Study Database not set  \u00B7  <a href="#" id="dir-change-link" title="Choose where Baduk-Notes keeps your Rec games">Choose folder\u2026</a>';
    }
    el.innerHTML = html;
    const link = document.getElementById('dir-change-link');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            _openDirSetup();
        });
    }
}

function _updateDirOverlayCopy() {
    const title = document.getElementById('study-dir-title');
    const sub = document.getElementById('study-dir-sub');
    const desc = document.getElementById('study-dir-desc');
    const btn = document.getElementById('btn-study-dir-pick');
    const later = document.getElementById('btn-study-dir-later');
    const st = window.StudyDirStore || null;
    const useOpfs = st && st.usingOpfs;
    const fsApiOn = st && st.isSupported;

    const resetPick = (show, label) => {
        if (btn) { btn.style.display = show ? '' : 'none'; if (label) btn.textContent = label; }
    };
    const resetLater = (primary, label) => {
        if (!later) return;
        later.style.display = '';
        if (primary) {
            later.style.background = '#10b981';
            later.style.color = 'white';
            later.style.border = 'none';
            later.style.fontWeight = '700';
        } else {
            later.style.background = 'transparent';
            later.style.color = '#9ca3af';
            later.style.border = '1px solid rgba(255,255,255,0.15)';
            later.style.fontWeight = '600';
        }
        if (label) later.textContent = label;
    };

    if (useOpfs && !fsApiOn) {
        if (title) title.textContent = 'Where should Baduk-Notes keep your Study Database?';
        if (sub) sub.textContent = 'Recs live in a private folder that belongs to this app, on this device.';
        if (desc) desc.innerHTML = 'Every Rec is a real <strong>.sgf</strong> file there and is read back on every visit. To use a folder you choose instead, enable \u0022File System Access API\u0022 at brave://flags once and reload.';
        resetPick(false);
        resetLater(true, 'Use automatic folder');
        return;
    }

    if (useOpfs && fsApiOn) {
        if (title) title.textContent = 'Where should Baduk-Notes keep your Study Database?';
        if (sub) sub.textContent = 'Recs currently live in the private folder that belongs to this app.';
        if (desc) desc.innerHTML = 'Every Rec is a real <strong>.sgf</strong> file there and is read back on every visit. You can also keep them in a folder you choose:';
        resetPick(true, 'Use a folder I choose\u2026');
        resetLater(false, 'Keep automatic folder');
        return;
    }

    if (title) title.textContent = 'Choose your Study Database folder';
    if (sub) sub.textContent = 'Pick a folder once. Every Rec is saved there as a real .sgf file and read back on your next visit.';
    if (desc) desc.innerHTML = 'The folder becomes your Study Database on this device. The choice is remembered and shown under the drop-slot; you can change it anytime.';
    resetPick(true, 'Choose Study Database Folder');
    resetLater(false, 'Keep in browser storage');
}

function _setDirStatus(msg) {
    const el = _dirStatusText();
    if (el) el.textContent = msg || '';
    const indicator = document.getElementById('study-dir-indicator');
    if (indicator) {
        if (window.StudyDirStore && window.StudyDirStore.isConfigured) {
            const label = window.StudyDirStore.usingOpfs ? 'Automatic folder' : window.StudyDirStore.getDirName();
            indicator.textContent = `\uD83D\uDCC1 ${label}`;
            indicator.style.color = '#295D2F';
            indicator.style.fontWeight = '600';
        } else {
            indicator.textContent = '\u26A0\uFE0F No Study Database set';
            indicator.style.color = '#a16207';
        }
    }
}

function refreshStudyListAfterDirLoad() {
    if (typeof renderResumeStudyTable === 'function') {
        const searchEl = document.getElementById('kifu-search-input');
        renderResumeStudyTable(searchEl ? searchEl.value : '');
    }
    if (typeof updateSaveRecGameButton === 'function') {
        updateSaveRecGameButton();
    }
}

async function connectStudyDirectory() {
    if (!window.StudyDirStore) {
        _setDirStatus('Storage engine not initialised. Please reload the page.');
        return false;
    }
    // Browsers without an OS folder-pick dialog store into the app's automatic
    // private folder (OPFS): real .sgf files, no dialog, works everywhere.
    if (!window.StudyDirStore.isSupported && window.StudyDirStore.hasOpfs) {
        const started = await window.StudyDirStore.initOpfs();
        if (started) {
            _markDirChoiceDone();
            updateDirLocationUI();
            await StudyRecordDB.loadAllFromDir();
            await _migrateOldRecordsToStdB();
            _setDirStatus('Study Database: ' + window.StudyDirStore.getDirName() + ' (real .sgf files on this device)');
            refreshStudyListAfterDirLoad();
            return true;
        }
    }
    if (!window.StudyDirStore.isSupported) {
        const hasPicker = typeof window.showDirectoryPicker === 'function';
        const secure = typeof window.isSecureContext !== 'undefined' ? window.isSecureContext : null;
        const ctx = { showDirectoryPicker: hasPicker, isSecureContext: secure, href: window.location.href };
        console.warn('[StudyDirStore] local-folder storage unavailable:', ctx);
        if (window.StudyDirStore.hasFolderFallback) {
            _updateDirOverlayCopy();
            _setDirStatus('This browser cannot write into a folder yet. You can still bring in existing Rec games from a folder now.');
            const res = await window.StudyDirStore.importFolderViaInput();
            _markDirChoiceDone();
            updateDirLocationUI();
            if (res.records && res.records.length) {
                await StudyRecordDB.loadAllFromDir();
                _setDirStatus(`Loaded ${res.records.length} Rec(s) from "${res.name || '(that folder)'}" into your Study Database. Your Recs stay saved in browser storage.`);
                refreshStudyListAfterDirLoad();
                return true;
            }
            if (res.totalFiles > 0) {
                _setDirStatus(`Scanned ${res.totalFiles} file(s) but found no Rec games. Recs stay in browser storage.`);
            } else {
                _setDirStatus('That folder has no Rec files. Recs stay in browser storage.');
            }
            return false;
        }
        if (!secure) {
            _setDirStatus('Local-folder storage needs a secure context (HTTPS or http://localhost). Open the app at http://localhost:8577/ in Chrome/Edge/Brave.');
        } else if (!hasPicker) {
            _setDirStatus('This browser does not expose the File System Access API. Use Chrome/Edge/Brave with File System Access enabled.');
        } else {
            _setDirStatus('This browser does not support local-folder storage.');
        }
        console.log('[StudyDirStore] diagnostics:', ctx);
        return false;
    }

    let ok = false;
    try {
        // An explicit user action ("Choose folder" / "Change") should ALWAYS open
        // the directory picker. Re-granting an already-granted handle returns
        // 'granted' without showing the picker, which made "change folder" a
        // no-op (just a status blink). So bypass re-grant here and go straight
        // to showDirectoryPicker.
        ok = await window.StudyDirStore.setupDirectory();
    } catch (err) {
        console.error('[StudyDirStore] folder selection failed:', err);
        if (err && err.name === 'AbortError') {
            _setDirStatus('Folder selection was cancelled. Recs stay in browser storage until you pick a folder.');
        } else {
            _setDirStatus(`Could not open the folder picker: ${err && err.message ? err.message : err}`);
        }
        return false;
    }

    if (!ok) {
        _setDirStatus('Folder access was not granted. Pick a folder to save your Rec games.');
        return false;
    }

    await StudyRecordDB.loadAllFromDir();
    await _migrateOldRecordsToStdB();
    _markDirChoiceDone();
    updateDirLocationUI();
    _setDirStatus(`Study Database: ${window.StudyDirStore.getDirName()}`);
    refreshStudyListAfterDirLoad();
    return true;
}

async function initStudyDirStorage() {
    if (!window.StudyDirStore) return;

    let ready = false;

    if (window.StudyDirStore.isSupported) {
        const st = await window.StudyDirStore.init();
        if (st.ready) ready = true;
    }

    if (!ready && window.StudyDirStore.hasOpfs) {
        ready = await window.StudyDirStore.initOpfs();
    }

    if (ready) {
        await StudyRecordDB.loadAllFromDir();
        await _migrateOldRecordsToStdB();
        _markDirChoiceDone();
        updateDirLocationUI();
        const name = window.StudyDirStore.getDirName();
        _setDirStatus(name ? 'Study Database: ' + name : '');
        refreshStudyListAfterDirLoad();
        return;
    }

    updateDirLocationUI();
    if (_dirChoiceDone()) return;

    const overlay = _dirOverlay();
    if (!overlay) return;
    if (overlay.dataset.triggered === '1') return;
    overlay.dataset.triggered = '1';
    _updateDirOverlayCopy();
    setTimeout(() => {
        overlay.style.display = 'flex';
        overlay.classList.remove('hidden');
    }, 400);
}

// Fallback: <input webkitdirectory> import (read-only browsers).
async function _importFolderFallback() {
    if (!window.StudyDirStore || !window.StudyDirStore.hasFolderFallback) return { records: [], name: '', totalFiles: 0 };
    return new Promise((resolve) => {
        let settled = false;
        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('webkitdirectory', '');
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            const { records, name, totalFiles } = await window.StudyDirStore._recordsFromFiles(files);
            window.StudyDirStore._fallbackName = name;
            window.StudyDirStore._lastFallbackRecords = records;
            settled = true;
            resolve({ records, name, totalFiles });
        });
        input.addEventListener('cancel', () => {
            if (!settled) resolve({ records: [], name: '', totalFiles: 0 });
        });
        document.body.appendChild(input);
        input.click();
        input.remove();
    });
}

// Build records from a webkitdirectory FileList.
async function _recordsFromFiles(files) {
    const list = Array.isArray(files) ? files : Array.from(files || []);
    const name = (list[0] && list[0].webkitRelativePath) ? list[0].webkitRelativePath.split('/')[0] : '';
    const records = [];

    // New format: *.theme + *.sgf pairs
    const themeFiles = list.filter(f => /\.theme$/i.test(f.name));
    for (const tf of themeFiles) {
        let meta = null;
        try { meta = JSON.parse(await tf.text()); } catch (e) { continue; }
        if (!meta || !meta.id || !meta.recNo) continue;
        const no = String(meta.recNo).padStart(3, '0');
        const sgfFile = list.find(f => f.name === `${no}.sgf`);
        let sgf = null;
        if (sgfFile) { try { sgf = await sgfFile.text(); } catch (e) {} }
        if (sgf == null) continue;
        records.push({ ...meta, workingSgf: sgf });
    }

    // Legacy format: rec-NNN-slug.json pairs
    if (records.length === 0) {
        const jsonFiles = list.filter(f => /\.json$/i.test(f.name));
        for (const jf of jsonFiles) {
            let meta = null;
            try { meta = JSON.parse(await jf.text()); } catch (e) { continue; }
            if (!meta || !meta.id || meta._dirSchema !== 1) continue;
            let sgf = null;
            if (meta.sgfFile) {
                const sgfFile = list.find(f => f.name === meta.sgfFile);
                if (sgfFile) { try { sgf = await sgfFile.text(); } catch (e) {} }
            }
            if (sgf == null && !meta.rawSgf) continue;
            records.push({ ...meta, workingSgf: sgf != null ? sgf : (meta.rawSgf || '') });
        }
    }

    // Bare .sgf fallback
    if (records.length === 0) {
        for (const sf of list.filter(f => /\.sgf$/i.test(f.name))) {
            let text = '';
            try { text = await sf.text(); } catch (e) { continue; }
            if (!text || !text.includes(';(')) continue;
            const pb = (text.match(/PB\[([^\]]*)\]/) || [])[1] || 'Black';
            const pw = (text.match(/PW\[([^\]]*)\]/) || [])[1] || 'White';
            records.push({
                id: 'study_fallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
                recNo: String(records.length + 1).padStart(3, '0'),
                fileNm: sf.name,
                blk: pb,
                wht: pw,
                lastAccess: formatStudyAccessTime(),
                currentMoveIndex: 0,
                rawSgf: text,
                workingSgf: text,
                _fromFallbackFolder: name
            });
        }
    }

    records.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();
    return { records, name, totalFiles: list.length };
}

// Expose fallback helpers on StudyDirStore for callers.
if (typeof window !== 'undefined' && window.StudyDirStore) {
    window.StudyDirStore.importFolderViaInput = _importFolderFallback;
    window.StudyDirStore._recordsFromFiles = _recordsFromFiles;
}

function wireStudyDirSetupUI() {
    const overlay = _dirOverlay();
    if (!overlay) return;

    const btnPick = document.getElementById('btn-study-dir-pick');
    const btnLater = document.getElementById('btn-study-dir-later');
    const btnReopen = document.getElementById('btn-study-dir-open');

    const close = () => {
        overlay.style.display = 'none';
        overlay.classList.add('hidden');
    };

    if (btnPick) {
        btnPick.addEventListener('click', async () => {
            const opfsOnly = window.StudyDirStore && window.StudyDirStore.usingOpfs && !window.StudyDirStore.isSupported;
            if (opfsOnly) {
                _setDirStatus('Recs are kept in the automatic folder of this app. To use a folder you choose instead, enable \u0022File System Access API\u0022 at brave://flags and reload.');
                return;
            }
            btnPick.disabled = true;
            _setDirStatus('Opening the folder picker\u2026');
            const ok = await connectStudyDirectory();
            btnPick.disabled = false;
            if (ok) {
                _markDirChoiceDone();
                updateDirLocationUI();
                setTimeout(close, 900);
            }
        });
    }
    if (btnLater) {
        btnLater.addEventListener('click', () => {
            _markDirChoiceDone();
            updateDirLocationUI();
            close();
        });
    }
    if (btnReopen) {
        btnReopen.addEventListener('click', () => {
            _openDirSetup();
        });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    }
}
