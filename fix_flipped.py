import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

# Replace bGradFlipped usage
content = content.replace("metaBSection.style.background = state.isPovFlipped ? bGradFlipped : bGradNormal;", "metaBSection.style.background = bGradNormal;")

# Replace wGradFlipped usage
content = content.replace("metaWSection.style.background = state.isPovFlipped ? wGradFlipped : wGradNormal;", "metaWSection.style.background = wGradNormal;")

with open(js_file, 'w') as f:
    f.write(content)
print("Fixed flipped backgrounds")
