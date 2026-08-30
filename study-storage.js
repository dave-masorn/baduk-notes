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
                        resolve(db);
                    } else {
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                            if (Array.isArray(getAllReq.result) && getAllReq.result.length > 0) {
                                _recordsCache = getAllReq.result;
                            }
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

    get isSupported() {
        return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
    },

    // Cross-browser fallback to <input webkitdirectory>: works even when the
    // File System Access API is disabled (e.g. Brave's default privacy setting).
    get hasFolderFallback() {
        return typeof window !== 'undefined' && document.createElement('input').webkitdirectory !== undefined;
    },

    get isConfigured() {
        return this.isSupported && !!this._dir;
    },

    get isUsingFallback() {
        return !this.isSupported && !!this._fallbackName;
    },

    getDirName() {
        if (this._dir) { try { return this._dir.name || ''; } catch (e) {} }
        if (this._fallbackName) return this._fallbackName;
        return '';
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
            input.accept = '.sgf,.json,application/x-go-sgf';
            input.addEventListener('change', async () => {
                const files = Array.from(input.files || []);
                const { records, name } = await this._recordsFromFiles(files);
                this._fallbackName = name;
                this._lastFallbackRecords = records;
                settled = true;
                resolve({ records, name });
            });
            input.addEventListener('cancel', () => {
                if (!settled) resolve({ records: [], name: '' });
            });
            document.body.appendChild(input);
            input.click();
            input.remove();
        });
    },

    // Build Rec records from a webkitdirectory FileList.
    async _recordsFromFiles(files) {
        const list = Array.isArray(files) ? files : Array.from(files || []);
        const name = (list[0] && list[0].webkitRelativePath ? list[0].webkitRelativePath.split('/')[0] : '') || 'Selected Folder';
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
        return { records, name };
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

// Rewrite the overlay title/description to match what this browser can actually do.
function _updateDirOverlayCopy() {
    const title = document.getElementById('study-dir-title');
    const sub = document.getElementById('study-dir-sub');
    const desc = document.getElementById('study-dir-desc');
    const btn = document.getElementById('btn-study-dir-pick');
    if (btn) btn.textContent = 'Choose Folder';
    if (window.StudyDirStore && !window.StudyDirStore.isSupported && window.StudyDirStore.hasFolderFallback) {
        if (title) title.textContent = 'Load Rec games from a folder';
        if (sub) sub.textContent = 'This browser cannot write .sgf files to a folder yet — Recs are saved in browser storage.';
        if (desc) desc.innerHTML = '“Choose Folder” <strong>loads</strong> existing Rec <code>.sgf</code>/<code>.json</code> files from a folder so they appear in your study list. You do not need to add anything. To auto-save future Recs into a folder, open <strong>brave://flags</strong>, set <strong>File System Access API</strong> to <strong>Enabled</strong>, and reload.';
        if (btn) btn.textContent = 'Choose Folder to Load';
        return;
    }
    if (title) title.textContent = 'Where should your Rec games be stored?';
    if (sub) sub.textContent = 'Choose a folder on your computer.';
    if (desc) desc.innerHTML = 'Baduk-notes saves every study Rec as a real <strong>.sgf</strong> file in that folder — no more losing games when browser cache is cleared. You can pick a different folder anytime.';
}

function _setDirStatus(msg) {
    const el = _dirStatusText();
    if (el) el.textContent = msg || '';
    const indicator = document.getElementById('study-dir-indicator');
    if (indicator) {
        if (window.StudyDirStore && window.StudyDirStore.isConfigured) {
            indicator.textContent = `📁 ${window.StudyDirStore.getDirName()}`;
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
    if (!window.StudyDirStore.isSupported) {
        const hasPicker = typeof window.showDirectoryPicker === 'function';
        const secure = typeof window.isSecureContext !== 'undefined' ? window.isSecureContext : null;
        const ctx = { showDirectoryPicker: hasPicker, isSecureContext: secure, href: window.location.href };
        console.warn('[StudyDirStore] local-folder storage unavailable:', ctx);
        if (window.StudyDirStore.hasFolderFallback) {
            // Fallback: read Recs from a picked folder via <input webkitdirectory>.
            _updateDirOverlayCopy();
            _setDirStatus('Opening a folder to LOAD Rec games from (your Recs stay saved in browser storage)…');
            const res = await window.StudyDirStore.importFolderViaInput();
            if (res.records && res.records.length) {
                await StudyRecordDB.mergeDirRecords(res.records);
                _setDirStatus(`Loaded ${res.records.length} Rec(s) from folder "${res.name}". Your Recs stay saved in browser storage. To auto-save future Recs into a folder, enable "File System Access API" (brave://flags → Enabled) and reload.`);
                refreshStudyListAfterDirLoad();
                return true;
            }
            if (res.name) {
                _setDirStatus(`Folder "${res.name}" has no Rec games in it — nothing was loaded. That's fine: your Recs are safe in browser storage, and you don't need to add anything to the folder. Here, Choose Folder can only LOAD existing Recs; it cannot save to a folder. To auto-save Recs into a folder, enable "File System Access API" (brave://flags → Enabled) and reload.`);
            } else {
                _setDirStatus('This browser does not expose the File System Access API (showDirectoryPicker). Recs remain in browser storage. You can still import a folder of Recs above, or enable the API in Brave for full write-back.');
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
            ok = await window.StudyDirStore.reGrantPermission();
            if (!ok) {
                // Stored handle is stale/revoked — fall back to re-picking a folder.
                _setDirStatus('Could not re-grant access to the saved folder. Choose a folder again below.');
                ok = await window.StudyDirStore.setupDirectory();
            }
        } else {
            ok = await window.StudyDirStore.setupDirectory();
        }
    } catch (err) {
        console.error('[StudyDirStore] folder selection failed:', err);
        if (err && err.name === 'AbortError') {
            _setDirStatus('Folder selection was cancelled. Recs remain in browser storage until you pick a folder.');
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
    _setDirStatus(`Rec folder: ${window.StudyDirStore.getDirName()}`);
    refreshStudyListAfterDirLoad();
    return true;
}

async function initStudyDirStorage() {
    if (!window.StudyDirStore) return;

    if (window.StudyDirStore.isSupported) {
        const st = await window.StudyDirStore.init();
        if (st.ready) {
            await StudyRecordDB.loadAllFromDir();
            _setDirStatus(`Rec folder: ${window.StudyDirStore.getDirName()}`);
            return;
        }
    }

    // Not configured yet (or permission not yet granted) — offer the setup prompt,
    // but only on startup sessions, not for ordinary record snapshots.
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
            btnPick.disabled = true;
            _setDirStatus('Opening folder picker…');
            const ok = await connectStudyDirectory();
            btnPick.disabled = false;
            if (ok) {
                // Success — the status (folder name) is shown inside the overlay for a
                // moment before closing so the user sees where their Recs will go.
                setTimeout(close, 900);
            }
            // On failure the overlay stays open with the reason visible.
        });
    }
    if (btnLater) {
        btnLater.addEventListener('click', close);
    }
    if (btnReopen) {
        btnReopen.addEventListener('click', () => {
            _updateDirOverlayCopy();
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden');
            _setDirStatus(window.StudyDirStore.getDirName()
                ? `Folder: ${window.StudyDirStore.getDirName()} — click Choose Folder to change.`
                : '');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    }
}
