import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

# First, remove my previous bad patch:
content = content.replace("            metaContainer.style.borderColor = '#fed3ab';\n            metaContainer.style.borderWidth = '1px';\n            metaContainer.style.borderStyle = 'solid';\n", "")
content = content.replace("            metaContainer.style.borderColor = '#b3cdfc';\n            metaContainer.style.borderWidth = '1px';\n            metaContainer.style.borderStyle = 'solid';\n", "")

# Now inject the new border logic right after metaContainer check
old_code = """        if (metaContainer && capB && capW && toggleB && toggleW) {
            if (state.isPovFlipped) {"""

new_code = """        if (metaContainer && capB && capW && toggleB && toggleW) {
            // Remove container border and apply to sections
            metaContainer.style.border = 'none';
            
            const isBlackLeft = !state.isPovFlipped;
            
            if (metaBSection) {
                metaBSection.style.border = activePlayer === 'B' ? '1px solid #fed3ab' : '1px solid rgba(0,0,0,0.06)';
                if (isBlackLeft) {
                    metaBSection.style.borderRadius = '26px 0 0 26px';
                    metaBSection.style.borderRight = 'none';
                    metaBSection.style.borderLeft = '';
                } else {
                    metaBSection.style.borderRadius = '0 26px 26px 0';
                    metaBSection.style.borderLeft = 'none';
                    metaBSection.style.borderRight = '';
                }
            }
            
            if (metaWSection) {
                metaWSection.style.border = activePlayer === 'W' ? '1px solid #b3cdfc' : '1px solid rgba(0,0,0,0.06)';
                if (isBlackLeft) {
                    metaWSection.style.borderRadius = '0 26px 26px 0';
                    metaWSection.style.borderLeft = 'none';
                    metaWSection.style.borderRight = '';
                } else {
                    metaWSection.style.borderRadius = '26px 0 0 26px';
                    metaWSection.style.borderRight = 'none';
                    metaWSection.style.borderLeft = '';
                }
            }

            if (state.isPovFlipped) {"""

content = content.replace(old_code, new_code)

with open(js_file, 'w') as f:
    f.write(content)
print("Patched section borders")
