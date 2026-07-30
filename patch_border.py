import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

old_b = """        if (activePlayer === 'B') {"""
new_b = """        if (activePlayer === 'B') {
            metaContainer.style.borderColor = '#fed3ab';
            metaContainer.style.borderWidth = '1px';
            metaContainer.style.borderStyle = 'solid';"""

content = content.replace(old_b, new_b)

with open(js_file, 'w') as f:
    f.write(content)
print("Patched Black border")
