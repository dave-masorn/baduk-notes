// ==========================================================================
// Study Record Local Persistence Database Engine
// (Module scope — available before deferred init for tests / early use)
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
window.formatStudyAccessTime = formatStudyAccessTime;

const IDB_NAME = 'BadukNotesDB';
const IDB_STORE = 'study_records';
const IDB_VERSION = 1;

let _recordsCache = null;
let _idbPromise = null;

function _initIDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (_idbPromise) return _idbPromise;

    _idbPromise = new Promise((resolve) => {
        try {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const countReq = store.count();

                countReq.onsuccess = () => {
                    if (countReq.result === 0) {
                        try {
                            const localRaw = localStorage.getItem(STUDY_STORAGE_KEY);
                            if (localRaw) {
                                const localList = JSON.parse(localRaw);
                                if (Array.isArray(localList) && localList.length > 0) {
                                    const writeTx = db.transaction(IDB_STORE, 'readwrite');
                                    const writeStore = writeTx.objectStore(IDB_STORE);
                                    localList.forEach(r => writeStore.put(r));
                                    _recordsCache = localList;
                                }
                            }
                        } catch (migErr) {}
                        _rerenderResumeList();
                        resolve(db);
                    } else {
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                            if (Array.isArray(getAllReq.result) && getAllReq.result.length > 0) {
                                _recordsCache = getAllReq.result;
                            }
                            _rerenderResumeList();
                            resolve(db);
                        };
                        getAllReq.onerror = () => resolve(db);
                    }
                };
                countReq.onerror = () => resolve(db);
            };
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });

    return _idbPromise;
}

// The resume-study list is rendered once during app init; if records land in the
// cache later (async IDB load), re-render so the count is never stuck at 0.
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

if (typeof window !== 'undefined') {
    _initIDB();
}

window.StudyRecordDB = {
    getAllRecords() {
        try {
            const raw = localStorage.getItem(STUDY_STORAGE_KEY);
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    _recordsCache = list;
                    return _recordsCache;
                }
            }
        } catch (e) {}

        if (_recordsCache !== null) {
            return _recordsCache;
        }
        return [];
    },

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

            // 1. Immediately persist to IndexedDB (master store, unlimited quota)
            _initIDB().then(db => {
                if (!db) return;
                try {
                    const tx = db.transaction(IDB_STORE, 'readwrite');
                    tx.objectStore(IDB_STORE).put(records[idx >= 0 ? idx : 0]);
                } catch (e) {
                    console.error('Error writing record to IndexedDB:', e);
                }
            });

            // 2. Best-effort mirror to localStorage
            try {
                localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(records));
            } catch (quotaErr) {
                console.warn('localStorage quota reached for study records; safely stored in memory and IndexedDB.');
            }

            // 3. Persist the actual record as real .sgf/.json files in the user-chosen
            //    study directory (authoritative, survives cache clears). Non-blocking.
            const savedRec = records[idx >= 0 ? idx : 0];
            if (typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
                window.StudyDirStore.saveRecord(savedRec).then(ok => {
                    if (!ok) console.warn('[StudyRecordDB] directory save failed for', savedRec.id);
                });
            }

            console.log(`[StudyRecordDB] saveRecord -> ID: ${record.id}, recNo: ${record.recNo}, currentMoveIndex: ${record.currentMoveIndex}`);
            return true;
        } catch (e) {
            console.error('Failed to save study record:', e);
            return false;
        }
    },

    getRecord(id) {
        if (!id) return null;
        const records = this.getAllRecords();
        return records.find(r => r && r.id === id) || null;
    },

    // Load the authoritative record set from the user-chosen directory and sync it
    // into the in-memory cache + IndexedDB + localStorage mirror. Called after the
    // directory is configured at startup, and after the user picks/regrants it.
    async loadAllFromDir() {
        if (typeof window === 'undefined' || !window.StudyDirStore || !window.StudyDirStore.isConfigured) return [];
        const dirRecords = await window.StudyDirStore.loadAllRecords();
        if (!Array.isArray(dirRecords) || dirRecords.length === 0) return this.getAllRecords();
        return this.mergeDirRecords(dirRecords);
    },

    // Merge a set of directory-sourced records into the in-memory cache +
    // IndexedDB + localStorage mirror (dedup by id, dir records win).
    async mergeDirRecords(dirRecords) {
        if (!Array.isArray(dirRecords) || dirRecords.length === 0) return this.getAllRecords();
        const merged = dirRecords.slice();
        const byId = new Map(dirRecords.map(r => [r.id, r]));
        this.getAllRecords().forEach(r => { if (!byId.has(r.id)) merged.push(r); });
        merged.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();
        _recordsCache = merged;

        try {
            localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(merged));
        } catch (quotaErr) {
            console.warn('[StudyRecordDB] localStorage quota reached while syncing from directory.');
        }

        _initIDB().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                merged.forEach(r => store.put(r));
            } catch (e) {}
        });

        return merged;
    },

    deleteRecord(id) {
        try {
            const removed = this.getRecord(id);
            let records = this.getAllRecords();
            records = records.filter(r => r.id !== id);
            _recordsCache = records;

            _initIDB().then(db => {
                if (!db) return;
                try {
                    const tx = db.transaction(IDB_STORE, 'readwrite');
                    tx.objectStore(IDB_STORE).delete(id);
                } catch (e) {}
            });

            try {
                localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(records));
            } catch (e) {}

            if (removed && typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
                window.StudyDirStore.deleteRecord(removed);
            }

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

// ==========================================================================
// Study Record Directory Storage Engine
// (File System Access API — persists real .sgf files in a user-chosen folder)
// ==========================================================================
const DIR_IDB_NAME = 'BadukNotesDirStore';
const DIR_IDB_STORE = 'dir_handles';
const DIR_HANDLE_KEY = 'studyRecDir';
const DIR_PREFIX = 'rec-';

let _dirStoreReady = null;

function _sanitizeSlug(name) {
    return String(name || '')
        .replace(/\.(sgf|txt)$/i, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'game';
}

function _recordFileNames(rec) {
    const slug = _sanitizeSlug(rec.fileNm);
    const base = `${DIR_PREFIX}${String(rec.recNo || '000').padStart(3, '0')}-${slug}`;
    return {
        sgf: `${base}.sgf`,
        json: `${base}.json`
    };
}

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

    // Origin Private File System: a sandboxed folder owned by this app that works in
    // every browser (including Brave's default privacy settings) with no flag and no
    // dialog. Real .sgf/.json files, persisted per-origin, read back every visit.
    get hasOpfs() {
        return typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.getDirectory === 'function';
    },

    get usingOpfs() {
        return !!this._opfsDir;
    },

    // Cross-browser fallback to <input webkitdirectory>: works even when the
    // File System Access API is disabled (e.g. Brave's default privacy setting).
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

    // Open (creating if needed) the app's automatic private folder for this origin.
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

    // Show the directory picker to the user (switches off the automatic folder).
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

    // Write a texture image (or any binary file) into the study directory at relPath,
    // creating intermediate folders (e.g. "textures/") as needed. Returns true on success.
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
            await writable.write(file); // File / Blob are accepted by write()
            await writable.close();
            return true;
        } catch (e) {
            console.warn('[StudyDirStore] texture import failed:', relPath, e);
            return false;
        }
    },

    // Persist a single record to the directory (sgf + metadata json sidecar).
    async saveRecord(rec) {
        if (!this.isConfigured || !rec || !rec.id) return false;
        const names = _recordFileNames(rec);
        const meta = { ...rec };
        delete meta.workingSgf;
        meta.sgfFile = names.sgf;
        meta._dirSchema = 1;
        const okSgf = await _writeFile(this._dir, names.sgf, rec.workingSgf || rec.rawSgf || '');
        const okJson = await _writeFile(this._dir, names.json, JSON.stringify(meta, null, 2));
        return okSgf && okJson;
    },

    // Read every Rec out of a user-picked folder (for browsers with no File System
    // Access API). Uses a hidden <input webkitdirectory>. Returns { records, name }.
    async importFolderViaInput() {
        if (!this.hasFolderFallback) return { records: [], name: '' };
        return new Promise((resolve) => {
            let settled = false;
            const input = document.createElement('input');
            input.type = 'file';
            input.setAttribute('webkitdirectory', '');
            input.multiple = true;
            input.style.display = 'none';
            input.addEventListener('change', async () => {
                const files = Array.from(input.files || []);
                const { records, name, totalFiles } = await this._recordsFromFiles(files);
                this._fallbackName = name;
                this._lastFallbackRecords = records;
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
    },

    // Build Rec records from a webkitdirectory FileList. Real folder name comes
    // from the first file's relative path; stays '' when the selection was empty.
    async _recordsFromFiles(files) {
        const list = Array.isArray(files) ? files : Array.from(files || []);
        const name = (list[0] && list[0].webkitRelativePath) ? list[0].webkitRelativePath.split('/')[0] : '';
        const records = [];
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
        if (records.length === 0) {
            // No metadata sidecars — fall back to importing every .sgf as a bare rec.
            for (const sf of list.filter(f => /\.sgf$/i.test(f.name))) {
                let text = '';
                try { text = await sf.text(); } catch (e) { continue; }
                if (!text || !text.includes('(;')) continue;
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
                    _dirSchema: 1,
                    _fromFallbackFolder: name
                });
            }
        }
        records.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();
        return { records, name, totalFiles: list.length };
    },

    async loadAllRecords() {
        if (this.isUsingFallback) {
            return this._lastFallbackRecords || [];
        }
        if (!this.isConfigured) return [];
        try {
            const out = [];
            for await (const entry of this._dir.values()) {
                if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
                const meta = await _readJson(this._dir, entry.name);
                if (!meta || !meta.id || meta._dirSchema !== 1) continue;
                const sgf = meta.sgfFile ? await _readFileText(this._dir, meta.sgfFile) : null;
                if (sgf == null && !meta.rawSgf) continue;
                out.push({ ...meta, workingSgf: sgf != null ? sgf : (meta.rawSgf || '') });
            }
            out.sort((a, b) => (a.lastAccess || '').localeCompare(b.lastAccess || '')).reverse();
            return out;
        } catch (e) {
            console.warn('[StudyDirStore] loadAllRecords failed:', e);
            return [];
        }
    },

    async deleteRecord(rec) {
        if (!this.isConfigured || !rec) return;
        const names = _recordFileNames(rec);
        try {
            if (rec.id) {
                // Remove the file matching this rec's stored sgfFile, if any differ.
                if (rec._dirSchema === 1 && rec.sgfFile && rec.sgfFile !== names.sgf) {
                    try { await this._dir.removeEntry(rec.sgfFile); } catch (e) {}
                }
            }
            try { await this._dir.removeEntry(names.sgf); } catch (e) {}
            try { await this._dir.removeEntry(names.json); } catch (e) {}
        } catch (e) {}
    }
};

if (typeof window !== 'undefined') {
    window.StudyDirStore = StudyDirStore;
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

// The keep-location question is asked only once (first launch). After that,
// later visits show the current location under the SGF drop-slot instead.
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
        _setDirStatus('Rec database: ' + st.getDirName() + ' \u2014 use the buttons below to change it.');
    } else {
        _setDirStatus('');
    }
}

// The "Try dropping your SGF file" slot doubles as the Rec-database location:
// once the keep-location is decided it shows where Recs live + a Change control.
function updateDirLocationUI() {
    const el = document.getElementById('header-subtitle-text');
    if (!el) return;
    const st = window.StudyDirStore || null;
    let html;
    if (st && st.isConfigured) {
        if (st.usingOpfs) {
            const linkTxt = st.isSupported ? 'Use a folder\u2026' : 'How it works\u2026';
            const linkTitle = st.isSupported ? 'Switch to a folder you choose' : 'How the automatic Rec folder works in this browser';
            html = '\uD83D\uDCC1 Automatic folder (this device)  \u00B7  <a href="#" id="dir-change-link" title="' + linkTitle + '">' + linkTxt + '</a>';
        } else {
            const name = st.getDirName() || 'the selected folder';
            html = '\uD83D\uDCC1 ' + name + '  \u00B7  <a href="#" id="dir-change-link" title="The folder where Baduk-Notes keeps your Rec games">Change</a>';
        }
    } else if (st && st.hasOpfs) {
        html = '\uD83D\uDDC2 Recs kept in automatic storage  \u00B7  <a href="#" id="dir-change-link" title="How the automatic Rec folder works in this browser">How it works\u2026</a>';
    } else {
        html = '\uD83D\uDDC2 Recs kept in browser storage  \u00B7  <a href="#" id="dir-change-link" title="Choose where Baduk-Notes keeps your Rec games">Choose folder\u2026</a>';
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

// Rewrite the overlay title/description to match what this browser can actually do.
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
        // Brave + automatic folder: no dialog can exist, so the ask has a single answer.
        if (title) title.textContent = 'Where should Baduk-Notes keep your Rec games?';
        if (sub) sub.textContent = 'Recs live in a private folder that belongs to this app, on this device.';
        if (desc) desc.innerHTML = 'Every Rec is a real <strong>.sgf</strong> file there and is read back on every visit, so nothing is lost. To keep them in a folder you choose instead, enable \u0022File System Access API\u0022 at brave://flags once and reload.';
        resetPick(false);
        resetLater(true, 'Use automatic folder');
        return;
    }

    if (useOpfs && fsApiOn) {
        // Chrome/Edge: automatic folder by default, real folder optionally.
        if (title) title.textContent = 'Where should Baduk-Notes keep your Rec games?';
        if (sub) sub.textContent = 'Recs currently live in the private folder that belongs to this app.';
        if (desc) desc.innerHTML = 'Every Rec is a real <strong>.sgf</strong> file there and is read back on every visit. You can also keep them in a folder you choose:';
        resetPick(true, 'Use a folder I choose\u2026');
        resetLater(false, 'Keep automatic folder');
        return;
    }

    // A user folder can actually be picked (FS API on, not configured yet) or is
    // already configured and this overlay is the "Change folder" entry point.
    if (title) title.textContent = 'Where should Baduk-Notes keep your Rec games?';
    if (sub) sub.textContent = 'Pick a folder once. Every Rec is saved there as a real .sgf file and read back on your next visit.';
    if (desc) desc.innerHTML = 'The folder becomes your Rec database on this device. The keeper choice is remembered and shown under the SGF drop-slot; you can change it anytime.';
    resetPick(true, 'Choose Folder');
    resetLater(false, 'Keep in browser storage');
}

function _setDirStatus(msg) {
    const el = _dirStatusText();
    if (el) el.textContent = msg || '';
    const indicator = document.getElementById('study-dir-indicator');
    if (indicator) {
        if (window.StudyDirStore && window.StudyDirStore.isConfigured) {
            const label = window.StudyDirStore.usingOpfs ? 'Automatic folder' : window.StudyDirStore.getDirName();
            indicator.textContent = `📁 ${label}`;
            indicator.style.color = '#295D2F';
            indicator.style.fontWeight = '600';
        } else {
            indicator.textContent = '⚠️ No rec folder set';
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
            _setDirStatus('Rec database: ' + window.StudyDirStore.getDirName() + ' (real .sgf files on this device)');
            refreshStudyListAfterDirLoad();
            return true;
        }
        // OPFS init failed unexpectedly — fall through to diagnostics below.
    }
    if (!window.StudyDirStore.isSupported) {
        const hasPicker = typeof window.showDirectoryPicker === 'function';
        const secure = typeof window.isSecureContext !== 'undefined' ? window.isSecureContext : null;
        const ctx = { showDirectoryPicker: hasPicker, isSecureContext: secure, href: window.location.href };
        console.warn('[StudyDirStore] local-folder storage unavailable:', ctx);
        if (window.StudyDirStore.hasFolderFallback) {
            // Fallback: the picked folder is the keep-location. This browser cannot
            // WRITE into it yet, so Recs stay in browser storage; the folder can only
            // be read (existing Recs brought in) until folder-write is enabled.
            _updateDirOverlayCopy();
            _setDirStatus('This browser cannot write into a folder yet. You can still bring in existing Rec games from the folder now.');
            const res = await window.StudyDirStore.importFolderViaInput();
            _markDirChoiceDone();
            updateDirLocationUI();
            if (res.records && res.records.length) {
                await StudyRecordDB.mergeDirRecords(res.records);
                const dirLabel = res.name || '(that folder)';
                _setDirStatus(`Loaded ${res.records.length} Rec(s) from "${dirLabel}" into your study list. Your Recs stay saved in browser storage.`);
                refreshStudyListAfterDirLoad();
                return true;
            }
            const dirLabel = res.name || '(that folder)';
            if (res.totalFiles > 0) {
                _setDirStatus(`Scanned ${res.totalFiles} file(s) in "${dirLabel}" but found no Rec games (.sgf/.json). Nothing was loaded; Recs stay in browser storage.`);
            } else {
                _setDirStatus('That folder has no Rec files. Recs stay in browser storage.');
            }
            return false;
        }
        if (!secure) {
            _setDirStatus('Local-folder storage needs a secure context (HTTPS or http://localhost). Open the app at http://localhost:8577/ in Chrome/Edge/Brave, or Recs stay in browser storage.');
        } else if (!hasPicker) {
            _setDirStatus('This browser does not expose the File System Access API (showDirectoryPicker). Use Chrome/Edge/Brave to enable folder storage. Recs remain in browser storage for now.');
        } else {
            _setDirStatus('This browser does not support local-folder storage. Recs remain in browser storage.');
        }
        console.log('[StudyDirStore] diagnostics:', ctx);
        return false;
    }

    let ok = false;
    try {
        if (window.StudyDirStore.isConfigured) {
            if (window.StudyDirStore.usingOpfs) {
                // Switching from the automatic folder to a folder the user chooses.
                ok = await window.StudyDirStore.setupDirectory();
            } else {
                ok = await window.StudyDirStore.reGrantPermission();
                if (!ok) {
                    // Stored handle is stale/revoked — fall back to re-picking a folder.
                    _setDirStatus('Could not re-grant access to the saved folder. Choose a folder again below.');
                    ok = await window.StudyDirStore.setupDirectory();
                }
            }
        } else {
            ok = await window.StudyDirStore.setupDirectory();
        }
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
    _markDirChoiceDone();
    updateDirLocationUI();
    _setDirStatus(`Rec database: ${window.StudyDirStore.getDirName()}`);
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

    // Automatic private folder (OPFS): always available, no dialog, no flag — the
    // Rec database works in every browser (incl. Brave) right out of the box.
    if (!ready && window.StudyDirStore.hasOpfs) {
        ready = await window.StudyDirStore.initOpfs();
    }

    if (ready) {
        await StudyRecordDB.loadAllFromDir();
        _markDirChoiceDone();
        updateDirLocationUI();
        const name = window.StudyDirStore.getDirName();
        _setDirStatus(name ? 'Rec database: ' + name : '');
        // The resume-study list renders synchronously during app init, before this
        // async load finishes — re-render it now so Recs loaded from the folder
        // actually show up (and the count is not stuck at 0 RECORDED).
        refreshStudyListAfterDirLoad();
        return;
    }

    // No writable folder storage of any kind — ask once where Recs should live.
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
                // Automatic folder is the only keep-location here (no OS dialog exists).
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
                // Success — the status (folder name) is shown inside the overlay for a
                // moment before closing so the user sees where their Recs will go.
                setTimeout(close, 900);
            }
            // On failure the overlay stays open with the reason visible.
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
