import re
import subprocess

def semver_key(v_str):
    m = re.search(r'v?(\d+)\.(\d+)\.(\d+)', v_str)
    if m:
        return tuple(int(x) for x in m.groups())
    return (0, 0, 0)

TITLE_OVERRIDES = {
    'v0.2.000': 'Perceived Load Speed Overhaul (Parallel Loading & Deferred Init)',
    'v0.1.095': 'Stone X/Y Offset (Layer 1 Surface Only)',
    'v0.1.094': 'Stone Set C Black Texture (Procedural fBm Noise)',
    'v0.1.093': 'Composite Board Mask Edge Stone Margin Fix',
    'v0.1.092': 'Stone Set C Slate Flow-Field Texture Upgrade',
    'v0.1.091': 'Grid Lines Restoration Under Board Mask',
    'v0.1.090': 'Stone Set A/B Drop Shadow & Halo Removal',
    'v0.1.089': 'White Stone Grey Rim Removal (BR Layer Default)',
    'v0.1.088': 'Stones Documentation & Composite Board Mask',
    'v0.1.086': 'Scoring Modal Komi & SGF Result Fixes',
    'v0.1.085': 'Stone Set C True Materials Specification (v4)',
    'v0.1.084': 'Territory Count Font Italic State on Edit/Save',
    'v0.1.083': 'Display Options Sidebar Clickability on Frozen Board',
    'v0.1.082': 'Territory Counter Figtree-SemiBold Typography',
    'v0.1.081': 'GoogleSansCode Monospace Font Family Integration',
    'v0.1.080': 'Territory Counter Pop-In Animation Replay',
    'v0.1.079': 'Continuous Crossword Shape Territory Area Merging',
    'v0.1.078': 'Per-Intersection Territory Box Union Fix',
    'v0.1.077': 'MSM Crossword-Style Territory Box',
    'v0.1.076': 'MSM Intersection-Oriented Territory Counter',
    'v0.1.075': 'MSM Group Territory Area Coverage',
    'v0.1.074': 'MSM Rounded Badge with Ease-Out-Back Animation',
    'v0.1.073': 'MSM Territory Counter Pure Pretendard Font',
    'v0.1.072': 'Custom Stones Panel Expansion for Default Sets',
    'v0.1.071': 'SGF Komi Default Tag & Canvas BG Color Picker',
    'v0.1.070': 'MSM Unsaved Scoring Changes Close Warning',
    'v0.1.069': 'MSM Saved Board Persistence & Territory Reveal',
    'v0.1.068': 'Territory Freezing After D&T Lock',
    'v0.1.067': 'Set C Physical Material Modeling (Hamaguri & Slate)',
    'v0.1.066': 'Set C Hamaguri Grain Origin Variation',
    'v0.1.065': 'Stone Set C Clam-Shell & Slate Materials',
    'v0.1.064': 'Replaced Dead Stone Removal & Prisoner Return',
    'v0.1.063': 'Re-Arranging Stones Pool Isolation',
    'v0.1.062': 'Replace Dead Stones Single-Pool Deduction',
    'v0.1.061': 'Manual Scoring 2-Step Save Ritual',
    'v0.1.060': 'Post-Lock Counting Playground & Bucket Sync',
    'v0.1.059': 'Score Freezing on D&T Lock',
    'v0.1.058': 'Manual Scoring Modal Committed Lock Stage',
    'v0.1.056': 'Manual Scoring Modal Result Display',
    'v0.1.055': 'Manual Scoring Initial Zero Dead Marks',
    'v0.1.054': 'Deterministic JTS SGF Source Attribution',
    'v0.1.053': 'Dead-Stone Gate Open Scoring Modal Shortcut',
    'v0.1.052': 'Computational Method JTS Source Indicator',
    'v0.1.051': 'Estimation Panel Close on Scoring Open',
    'v0.1.050': 'Computational Method Post-Run Scoring Button',
    'v0.1.049': 'Board Border Override & Image Clipping',
    'v0.1.048': 'Manual Stone Placement Sound Effects',
    'v0.1.047': 'Embedded Base64 Sound Effects & Autoplay Resilience',
    'v0.1.046': 'Session-Scoped Board Style Isolation',
    'v0.1.045': 'Initial Board Style Preservation on Game Select',
    'v0.1.044': 'Floating Style Palette Persistence',
    'v0.1.043': 'Dead Stone Replacement on Marked Intersection',
    'v0.1.042': 'Scoring Margin Stability During Stone Replacement',
    'v0.1.041': 'JTS Dead Stone Freed Points Double-Count Fix',
    'v0.1.040': 'Mandatory DD/MA Prerequisite for JTS Score',
    'v0.1.039': 'Endgame Markup Missing Warning & Resolution',
    'v0.1.038': 'MSM Reset Board SGF Terminal Rebuild',
    'v0.1.037': 'Komi SSOT Synchronization',
    'v0.1.036': 'Komi 0 SGF Parsing Fix',
    'v0.1.035': 'Scoring Modal Result Badge Formula Parity',
    'v0.1.034': 'Auto-Detected Dead Stones Lift Parity',
    'v0.1.033': 'Version-Driven Script Cache Busting',
    'v0.1.032': 'Scoring Modal Dead Stone Bucket Double-Count Fix',
    'v0.1.031': 'Blue Panel & Scoring Modal Synchronization',
    'v0.1.030': 'Score Estimate & Computational Method Integration',
    'v0.1.029': 'Blue Panel & Modal Capture Parity',
    'v0.1.028': 'Manual Scoring Modal Workflow',
    'v0.1.027': 'Manual Scoring Snapshot Persistence & SGF Sync',
    'v0.1.026': 'Unified Scoring Input Resolution',
    'v0.1.025': 'Algorithmic Endgame Markup Resolution'
}

def parse_and_format_block(b):
    lines = b.strip().split('\n')
    header_line = lines[0]
    
    m = re.match(r'###\s*(v[0-9\.]+)\s*(?:[—–-]\s*(.*?))?$', header_line)
    if not m:
        return None
    ver = m.group(1)
    rest = (m.group(2) or '').strip()
    
    if ':' in rest:
        t_part, b_part = rest.split(':', 1)
        t_part = t_part.strip()
        b_part = b_part.strip()
    elif ver in ['v0.1.094', 'v0.1.085', 'v0.1.088']:
        s_parts = rest.split('. ', 1)
        t_part = s_parts[0].strip()
        b_part = s_parts[1].strip() if len(s_parts) > 1 else ''
    else:
        t_part = rest
        b_part = rest
        
    title = TITLE_OVERRIDES.get(ver, t_part).strip(' —-:.')
    if title.isupper() and len(title) > 3:
        acronyms = {'BR', 'BM', 'BDL', 'SGF', 'MSM', 'JTS', 'AI', 'UI', 'DOM', 'SFX', 'SSOT', 'DD', 'MA', 'TB', 'TW', 'FAB', 'PNG', 'SVG', 'W/#', 'FBM', 'IIFE', 'BFS', 'REC'}
        words = title.split()
        title = ' '.join(w if w.upper() in acronyms else w.capitalize() for w in words)

    all_body_lines = ([b_part] if b_part else []) + lines[1:]
    body_text = '\n\n'.join([l.strip() for l in all_body_lines if l.strip()])
    
    # Separate Verification
    v_match = re.search(r'(?:\*\*Verified\.\*\*|Verified\.)\s*(.*)', body_text, re.DOTALL)
    verified = ''
    if v_match:
        verified = v_match.group(1).strip()
        body_text = body_text[:v_match.start()].strip()
        
    t_lower = (title + ' ' + body_text).lower()
    if any(w in t_lower for w in ['fix', 'bug', 'culprit', 'removed', 'no longer', 'flake', 'error', 'wrong', 'issue', 'missing', 'refuses', 'gap']):
        category = 'Bug Fixes'
        cat_type = 'fix'
    elif any(w in t_lower for w in ['speed', 'perf', 'load', 'defer', 'lazy', 'parallel', 'optim']):
        category = 'Performance Improvements'
        cat_type = 'perf'
    elif any(w in t_lower for w in ['refactor', 'rewrite', 'restructure', 'migrate', 'upgrade', 'cleanup']):
        category = 'Refactoring'
        cat_type = 'refactor'
    else:
        category = 'Features'
        cat_type = 'feat'
        
    area = 'core'
    if any(w in t_lower for w in ['stone', 'hamaguri', 'slate', 'set c', 'set a', 'set b', 'nachiguro', 'offset']):
        area = 'stones'
    elif any(w in t_lower for w in ['scoring', 'msm', 'territory', 'dead stone', 'komi', 'jts', 'd&t', 'lock', 'w/#']):
        area = 'scoring'
    elif any(w in t_lower for w in ['render', 'canvas', 'board mask', 'bm', 'bdl', 'grid', 'border', 'wood', 'drawing']):
        area = 'renderer'
    elif any(w in t_lower for w in ['audio', 'sfx', 'sound']):
        area = 'audio'
    elif any(w in t_lower for w in ['tree', 'sgf', 'parser', 'kifu', 'props']):
        area = 'sgf'
    elif any(w in t_lower for w in ['ui', 'panel', 'modal', 'toolbar', 'palette', 'button', 'badge', 'comment']):
        area = 'ui'
    elif any(w in t_lower for w in ['docs', 'sync', 'sitemap', 'version', 'font']):
        area = 'docs'
        
    out = []
    out.append(f'### {ver} — {title}')
    out.append('')
    out.append(f'#### {category}')
    out.append('')
    out.append(f'| Scope | Type | Description |')
    out.append(f'| --- | --- | --- |')
    short_desc = title.replace('|', r'\|')
    out.append(f'| **{area}** | `{cat_type}` | {short_desc} |')
    out.append('')
    
    if body_text:
        out.append('##### Details')
        out.append(body_text)
        out.append('')
        
    if verified:
        out.append('##### Verification')
        out.append(f'- {verified}')
        out.append('')
        
    return {
        'ver': ver,
        'title': title,
        'markdown': '\n'.join(out)
    }

def main():
    raw_sitemap = subprocess.check_output('HOME=/tmp git show HEAD:SITEMAP.md', shell=True, text=True)
    
    with open('/Users/davemasorn/AntiGravity/baduk-notes/SITEMAP.md', 'r', encoding='utf-8') as f:
        curr_sitemap = f.read()
        
    curr_intro_header = curr_sitemap.split('\n## Changelog')[0].split('\n### v')[0].rstrip()
    curr_rest = curr_sitemap.split('\n## Project Purpose')[1]
    
    intro_head = raw_sitemap.split('\n## ')[0]
    orig_blocks = re.split(r'\n(?=### v)', intro_head)[1:]
    
    parsed = []
    for b in orig_blocks:
        res = parse_and_format_block(b)
        if res:
            parsed.append(res)
            
    sorted_blocks = sorted(parsed, key=lambda x: semver_key(x['ver']), reverse=True)
    
    changelog_md = '\n\n---\n\n## Changelog\n\n' + '\n\n---\n\n'.join(b['markdown'] for b in sorted_blocks)
    
    new_content = curr_intro_header + '\n' + changelog_md + '\n\n## Project Purpose' + curr_rest
    
    with open('/Users/davemasorn/AntiGravity/baduk-notes/SITEMAP.md', 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f'Successfully updated SITEMAP.md with {len(sorted_blocks)} Angular-style structured changelog entries.')

if __name__ == '__main__':
    main()
