const fs = require('fs');
const path = require('path');

const ROOT_DIR = '/Users/davemasorn/AntiGravity/baduk-notes';
const DOCS_CONTENT_DIR = path.join(ROOT_DIR, 'tech-log', 'content', 'docs');

const NAV_GROUPS = {
  'overview': {
    title: 'Overview',
    items: {
      'Project Purpose': 'project-purpose',
      'Application Files': 'application-files'
    }
  },
  'system-design': {
    title: 'System Design',
    items: {
      'Board Canvas System': 'board-canvas-system',
      'Stone Sets': 'stone-sets',
      'UI Architecture': 'ui-architecture',
      'Highlight Color System': 'highlight-color-system'
    }
  },
  'internals': {
    title: 'Internals',
    items: {
      'Architecture': 'architecture',
      'Data Flow': 'data-flow',
      'Comment Highlight Syntax': 'comment-highlight-syntax'
    }
  },
  'reference': {
    title: 'Reference',
    items: {
      'Tech Log System': 'tech-log-system',
      'Assets': 'assets',
      'Reference & Data': 'reference-data',
      'Agents & Skills': 'agents-skills',
      'Reference Tables': 'reference-tables'
    }
  }
};

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Sync the tech_log version everywhere from the SITEMAP.md frontmatter `version:` field:
//   - index.html header link label (tech_log-{version})
//   - tech-log/src/lib/version.ts (TECH_LOG_VERSION, displayed in the docs nav badge)
//   - the tech_log-{version}.html redirect file (if missing)
// Bumping only the SITEMAP.md frontmatter keeps every consumer in sync.
function syncVersion(sitemapContent) {
  const m = sitemapContent.match(/^version:\s*(v?[0-9]+\.[0-9]+\.[0-9]+)/m);
  if (!m) {
    console.warn('syncVersion: no "version:" field in SITEMAP.md frontmatter; skipping version sync.');
    return;
  }
  const ver = m[1].replace(/^v/, '');
  const label = `tech_log-${ver}`;
  let synced = 0;

  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');

    // Script cache-busters tied to the release version (SSOT): rewrite every
    // <script src="*.js?v=..."> to ?v=<version>. The old hard-coded values
    // (?v=1.0, ?v=4.3) were never bumped, so a browser HTTP cache could keep
    // serving a stale body (e.g. annotation_v4.js from before the YSE isolation
    // fix) long after the file changed. A versioned query forces a fresh fetch
    // on every release.
    const scriptTagRe = /(<script src="[^"]*?\.js)\?v=[^"]*"/g;
    const htmlAfterScripts = html.replace(scriptTagRe, `$1?v=${ver}"`);
    if (htmlAfterScripts !== html) {
      html = htmlAfterScripts;
      console.log(`Synced script cache-busters -> ?v=${ver}`);
      synced++;
    }

    const patched = html.replace(/tech_log-0\.\d+\.\d+/, label);
    if (patched !== html) {
      html = patched;
      console.log(`Synced index.html label -> ${label}`);
      synced++;
    }

    if (html !== fs.readFileSync(indexPath, 'utf8')) {
      fs.writeFileSync(indexPath, html, 'utf8');
    }
  }

  const versionTsPath = path.join(ROOT_DIR, 'tech-log', 'src', 'lib', 'version.ts');
  if (fs.existsSync(versionTsPath)) {
    const ts = fs.readFileSync(versionTsPath, 'utf8');
    const patched = ts.replace(/TECH_LOG_VERSION\s*=\s*'[^']*'/, `TECH_LOG_VERSION = '${ver}'`);
    if (patched !== ts) {
      fs.writeFileSync(versionTsPath, patched, 'utf8');
      console.log(`Synced version.ts -> ${ver}`);
      synced++;
    }
  }

  const redirectPath = path.join(ROOT_DIR, `${label}.html`);
  if (!fs.existsSync(redirectPath)) {
    fs.writeFileSync(redirectPath, `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${label}</title><script>window.location.replace("tech-log-dist/docs/");</script></head><body></body></html>\n`, 'utf8');
    console.log(`Created ${label}.html redirect`);
    synced++;
  }

  if (synced === 0) console.log(`Version ${ver} already in sync across all consumers.`);
}

function run() {
  console.log('Starting documentation sync...');
  ensureDirSync(DOCS_CONTENT_DIR);

  // Read SITEMAP.md
  const sitemapPath = path.join(ROOT_DIR, 'SITEMAP.md');
  if (!fs.existsSync(sitemapPath)) {
    console.error('SITEMAP.md not found in root!');
    return;
  }
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');

  // Keep tech_log version in sync everywhere from the SITEMAP.md frontmatter
  syncVersion(sitemapContent);

  // Split SITEMAP.md into sections
  // We can use a regex to split by H2 headers: \n## (.*?)\n
  const sections = {};
  const h2Regex = /\n## +(.*?)\n/g;
  let match;
  let lastIndex = 0;
  let lastHeader = null;

  // Extract the frontmatter and intro (before any H2)
  let introContent = '';

  while ((match = h2Regex.exec(sitemapContent)) !== null) {
    const currentIndex = match.index;
    if (lastHeader === null) {
      introContent = sitemapContent.slice(0, currentIndex);
    } else {
      sections[lastHeader] = sitemapContent.slice(lastIndex, currentIndex).trim();
    }
    lastHeader = match[1].trim();
    lastIndex = currentIndex + match[0].length;
  }
  if (lastHeader !== null) {
    sections[lastHeader] = sitemapContent.slice(lastIndex).trim();
  }

  // Create main index.mdx from introContent
  let mainIndexContent = `---
title: Project Sitemap
description: baduk-notes — Go/Weiqi board diagram annotator & SGF re-Player
---

# baduk-notes Sitemap

Welcome to the technical documentation and project sitemap for **baduk-notes**. Use the sidebar to navigate the different architectural sections and technical logs.

`;
  // Clean frontmatter from introContent
  const cleanIntro = introContent.replace(/^---[\s\S]*?---\n*/, '').trim();
  mainIndexContent += cleanIntro + '\n\n';

  const updateSection = Object.entries(sections).find(([k]) => k.toLowerCase().includes('how to update'));
  if (updateSection) {
    mainIndexContent += `## How to Update These Docs\n\n${updateSection[1]}\n\n`;
  }

  fs.writeFileSync(path.join(DOCS_CONTENT_DIR, 'index.mdx'), mainIndexContent);
  console.log('Created content/docs/index.mdx');

  // Map each section to its group and write files
  for (const [groupDir, groupInfo] of Object.entries(NAV_GROUPS)) {
    const groupPath = path.join(DOCS_CONTENT_DIR, groupDir);
    ensureDirSync(groupPath);

    const pagesList = [];

    for (const [sitemapHeaderName, fileSlug] of Object.entries(groupInfo.items)) {
      // Find matching section with standardized key normalization
      const clean = s => s.toLowerCase().replace(/[&\-#]/g, '').replace(/\s+/g, ' ').trim();
      const sectionKey = Object.keys(sections).find(k => clean(k) === clean(sitemapHeaderName));
      if (sectionKey) {
        const bodyContent = sections[sectionKey];
        const mdxContent = `---
title: ${sitemapHeaderName}
---

# ${sitemapHeaderName}

${bodyContent}
`;
        fs.writeFileSync(path.join(groupPath, `${fileSlug}.mdx`), mdxContent);
        pagesList.push(fileSlug);
        console.log(`Synced: ${groupDir}/${fileSlug}.mdx`);
      } else {
        console.warn(`Warning: Could not find section for "${sitemapHeaderName}" in SITEMAP.md`);
      }
    }

    // Write group meta.json
    fs.writeFileSync(path.join(groupPath, 'meta.json'), JSON.stringify({
      title: groupInfo.title,
      pages: pagesList
    }, null, 2));
  }

  // Process standalone files (logs/docs)
  const standaloneFiles = [
    { src: 'SGF_COMPLIANCE_UPGRADE_LOG.md', slug: 'sgf-compliance-upgrade-log', title: 'SGF FF[4] Upgrade Log' },
    { src: 'board-estimate.md', slug: 'board-estimate', title: 'Board Estimation' },
    { src: 'liberties.md', slug: 'liberties', title: 'Liberty Counting' },
    { slug: 'scoring-modal', title: 'Scoring Modal' }
  ];

  const rootPages = ['index', 'overview', 'system-design', 'internals', 'reference'];

  standaloneFiles.forEach(file => {
    if (file.src) {
      const srcPath = path.join(ROOT_DIR, file.src);
      if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf8');
        // Strip existing frontmatter if present, then add new one
        content = content.replace(/^---[\s\S]*?---\n*/, '').trim();
        const mdxContent = `---
title: ${file.title}
---

${content}
`;
        fs.writeFileSync(path.join(DOCS_CONTENT_DIR, `${file.slug}.mdx`), mdxContent);
        rootPages.push(file.slug);
        console.log(`Synced standalone: ${file.slug}.mdx`);
      } else {
        console.warn(`Warning: Standalone file ${file.src} not found`);
      }
    } else {
      rootPages.push(file.slug);
    }
  });

  // Write root meta.json
  fs.writeFileSync(path.join(DOCS_CONTENT_DIR, 'meta.json'), JSON.stringify({
    pages: rootPages
  }, null, 2));
  console.log('Created content/docs/meta.json');

  // Inject redirects to all tech_log-*.html files in the root workspace
  injectRedirects();

  console.log('Documentation sync complete.');
}

function injectRedirects() {
  console.log('Checking for tech_log-*.html files to inject redirect scripts...');
  const files = fs.readdirSync(ROOT_DIR);
  const techLogFiles = files.filter(f => f.startsWith('tech_log-') && f.endsWith('.html'));

  techLogFiles.forEach(fileName => {
    const filePath = path.join(ROOT_DIR, fileName);
    let html = fs.readFileSync(filePath, 'utf8');

    const redirectCode = `<script>\n  window.location.replace("tech-log-dist/docs/");\n</script>`;

    // If it doesn't already contain our redirect script
    if (!html.includes('tech-log-dist/docs/')) {
      const headIndex = html.indexOf('<head>');
      if (headIndex !== -1) {
        const insertionPoint = headIndex + '<head>'.length;
        html = html.slice(0, insertionPoint) + '\n' + redirectCode + html.slice(insertionPoint);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`Injected redirect script into ${fileName}`);
      } else {
        html = redirectCode + '\n' + html;
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`Prepend redirect script to ${fileName}`);
      }
    } else {
      console.log(`Redirect script already present in ${fileName}`);
    }
  });
}

run();
