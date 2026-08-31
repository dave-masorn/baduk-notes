// ==========================================================================
// Board / Stone Texture Reference Storage (board-texture.js)
// --------------------------------------------------------------------------
// Board and stone textures are usually too big to embed into every Rec's
// settings (localStorage + IndexedDB + the rec .json sidecar). Instead of a
// compressed data URL, style.imgSrc can hold a tiny reference token:
//
//     texture-ref:textures/kaya-wood.png     (relative to the study folder)
//
// The bytes live ONCE inside the user's study folder (auto-copied there when
// a writable directory is configured). On render the file is re-read from the
// folder via the File System Access directory handle and shown at full
// resolution. In browsers without FS Access (Brave default) a picked texture
// is kept in memory for the current session only and the ref still resolves
// once the folder becomes writable or the file is placed there manually.
//
// token formats:
//   texture-ref:<relPath>    reference into the study folder (no payload)
//   anything else            passed through verbatim (data URL / http / blob)
// ==========================================================================

(function () {
    'use strict';

    const REF_PREFIX = 'texture-ref:';
    const DIR_SUBDIR = 'imgs';

    const _sessionUrls = new Map();      // relPath            -> objectURL
    const _sessionFiles = new Map();     // relPath            -> File/Blob
    const _missingReported = new Set();  // relPaths we warned about once

    function _relOf(src) {
        return (typeof src === 'string' && src.indexOf(REF_PREFIX) === 0)
            ? src.slice(REF_PREFIX.length)
            : null;
    }

    function _slugName(name) {
        const base = String(name || 'texture');
        const dot = base.lastIndexOf('.');
        const nameNoExt = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : 'png';
        const safe = String(nameNoExt).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        return `${safe || 'texture'}.${ext}`;
    }

    // Read the actual file a ref points at. Priority: FS directory handle
    // (authoritative, cross-session) -> this session's picked/imported files.
    async function _readRefFile(rel) {
        if (typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
            try {
                const dir = await window.StudyDirStore.getDirHandle();
                if (dir) {
                    // Ref can be a nested path (e.g. "imgs/kaya.png"); walk each
                    // path segment via getDirectoryHandle before the final file.
                    const parts = String(rel).split('/').filter(Boolean);
                    let cur = dir;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cur = await cur.getDirectoryHandle(parts[i]);
                    }
                    const fh = await cur.getFileHandle(parts[parts.length - 1]);
                    const file = await fh.getFile();
                    return file;
                }
            } catch (e) { /* file absent or handle unavailable — fall through */ }

            // The ref names a file that isn't in the folder yet, but we have the
            // bytes for it from this session (picked before the folder was
            // writable). Persist it into the folder now if we can so the warning
            // stops and the texture survives reload.
            if (_sessionFiles.has(rel) && window.StudyDirStore.isConfigured) {
                try {
                    const ok = await window.StudyDirStore.importTexture(_sessionFiles.get(rel), rel);
                    if (ok) {
                        // Re-read from the folder so we return the real File.
                        const dir = await window.StudyDirStore.getDirHandle();
                        if (dir) {
                            const parts = String(rel).split('/').filter(Boolean);
                            let cur = dir;
                            for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
                            const fh = await cur.getFileHandle(parts[parts.length - 1]);
                            return await fh.getFile();
                        }
                    }
                } catch (e) { /* fall through to session file */ }
            }
        }
        if (_sessionFiles.has(rel)) return _sessionFiles.get(rel);
        return null;
    }

    function _notifyMissing(rel) {
        if (_missingReported.has(rel)) return;
        _missingReported.add(rel);
        // A ref that can't be resolved just falls back to the board/stone color —
        // that is self-evident visually, so log to the console only (no intrusive
        // toast on every mount / refresh, which is confusing when there are no
        // Recs or the texture file was moved).
        console.warn('[board-texture] texture not found in study folder:', rel);
    }

    // Resolve any imgSrc token into a URL an <img> or background-image can use.
    //   texture-ref:x  -> objectURL of the folder file (per-session cached)
    //   other          -> returned unchanged
    // Returns null when a ref cannot be resolved (caller shows color fallback).
    window.resolveTextureSrc = async function (src) {
        const rel = _relOf(src);
        if (rel === null) return src;
        if (_sessionUrls.has(rel)) return _sessionUrls.get(rel);
        const file = await _readRefFile(rel);
        if (!file) {
            _notifyMissing(rel);
            return null;
        }
        const url = URL.createObjectURL(file);
        _sessionUrls.set(rel, url);
        return url;
    };

    // Remember a just-picked / just-imported file for the current session so a
    // ref renders immediately even before the folder write completes (or when
    // the folder isn't writable). Returns the objectURL.
    window.setSessionTextureFile = async function (rel, file) {
        _sessionFiles.set(rel, file);
        const prev = _sessionUrls.get(rel);
        if (prev) { try { URL.revokeObjectURL(prev); } catch (e) {} }
        _missingReported.delete(rel);
        const url = URL.createObjectURL(file);
        _sessionUrls.set(rel, url);
        return url;
    };

    // Drop every cached objectURL + session file. Call when the study folder is
    // (re-)connected / imported or a texture is re-picked.
    window.invalidateTextureCache = function () {
        for (const url of _sessionUrls.values()) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
        _sessionUrls.clear();
        _sessionFiles.clear();
        _missingReported.clear();
        return true;
    };

    // Turn a picked File/Blob into study-folder reference. Writes the bytes
    // into the folder when a writable directory is configured, otherwise keeps
    // them in the session so the current view renders immediately.
    // Returns { rel, mode: 'folder'|'session', url } or null.
    window.storeTextureFile = async function (file, name, subdir) {
        if (!file) return null;
        const slug = _slugName(name || (file.name || 'texture'));
        const rel = String(subdir || DIR_SUBDIR).replace(/^\/+|\/+$/g, '') + '/' + slug;
        let mode = 'session';
        if (typeof window !== 'undefined' && window.StudyDirStore && window.StudyDirStore.isConfigured) {
            const ok = await window.StudyDirStore.importTexture(file, rel);
            mode = ok ? 'folder' : 'session';
        }
        const url = await window.setSessionTextureFile(rel, file);
        return { rel, mode, url };
    };

    // Shared image-loader for the window.*BoardBgImage / *StoneBgImage caches.
    // Starts (or continues) loading the texture for `cacheKey` from `src` and
    // returns the Image element (caller checks .complete/.naturalWidth).
    window.loadBoardTextureImage = function (cacheKey, src, onLoaded) {
        if (!cacheKey || typeof src !== 'string' || !src) return null;
        const img = window[cacheKey] || new Image();
        img.onload = () => { if (typeof onLoaded === 'function') onLoaded(); };
        if (!window[cacheKey]) window[cacheKey] = img;

        const rel = _relOf(src);
        if (rel === null) {
            if (img.src !== src) img.src = src;
            return img;
        }
        // Reference: resolve asynchronously; token guards against a stale async
        // resolve overwriting a newer texture on a re-used element.
        const tok = (window.__textureLoadTok = (window.__textureLoadTok || 0) + 1);
        img._resolveTok = tok;
        window.resolveTextureSrc(src).then(url => {
            if (img._resolveTok !== tok) return;
            if (!url) {
                if (img.src) img.removeAttribute('src');
                img.width = img.height = 0;
                return;
            }
            if (img.src !== url) img.src = url;
        });
        return img;
    };

    // Set a style-thumbnail element's background-image from an imgSrc token,
    // resolving texture-ref: asynchronously.
    window.setBgTextureThumb = function (el, src) {
        if (!el) return;
        el.style.backgroundImage = '';
        if (typeof src !== 'string' || !src) return;
        const rel = _relOf(src);
        if (rel === null) {
            el.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
            return;
        }
        window.resolveTextureSrc(src).then(url => {
            if (url) el.style.backgroundImage = `url("${url}")`;
        });
    };

    // Public token prefix for pickers / tests.
    window.TEXTURE_REF_PREFIX = REF_PREFIX;
    window.TEXTURE_DIR_SUBDIR = DIR_SUBDIR;
})();