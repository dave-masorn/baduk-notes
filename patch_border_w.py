import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

old_w = """        } else {
            const wGradNormal"""
new_w = """        } else {
            metaContainer.style.borderColor = '#b3cdfc';
            metaContainer.style.borderWidth = '1px';
            metaContainer.style.borderStyle = 'solid';
            const wGradNormal"""

content = content.replace(old_w, new_w)

with open(js_file, 'w') as f:
    f.write(content)
print("Patched White border")
