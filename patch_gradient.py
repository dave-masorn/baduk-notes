import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

# Replace bGradNormal
old_bGradNormal = "`linear-gradient(90deg, rgba(254, 211, 171, 0) 64%, #fed3ab 66%, #fdf1e7 100%), radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`"
new_bGradNormal = "`radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`"
content = content.replace(old_bGradNormal, new_bGradNormal)

# Replace bGradFlipped
old_bGradFlipped = "`linear-gradient(270deg, #fdf1e7 0%, #fed3ab 64%, rgba(254, 211, 171, 0) 66%), radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`"
new_bGradFlipped = "`radial-gradient(circle at 100% 50%, #ffffff 0%, #ffffff 14%, #fbf0e8 15%, #fbf0e8 18%, #fce9d8 19%, #fce9d8 22%, #fde4c8 23%, #fde4c8 26%, #fed3ab 27%, #fed3ab 100%)`"
content = content.replace(old_bGradFlipped, new_bGradFlipped)

# Replace wGradNormal
old_wGradNormal = "`linear-gradient(90deg, rgba(179, 205, 252, 0) 34%, #b3cdfc 36%, #f2f7ff 100%), radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #eff5ff 15%, #eff5ff 18%, #e3edff 19%, #e3edff 22%, #d6e4ff 23%, #d6e4ff 26%, #b3cdfc 27%, #b3cdfc 100%)`"
new_wGradNormal = "`radial-gradient(circle at 0% 50%, #ffffff 0%, #ffffff 14%, #eff5ff 15%, #eff5ff 18%, #e3edff 19%, #e3edff 22%, #d6e4ff 23%, #d6e4ff 26%, #b3cdfc 27%, #b3cdfc 100%)`"
content = content.replace(old_wGradNormal, new_wGradNormal)

# Replace wGradFlipped
old_wGradFlipped = "`linear-gradient(270deg, rgba(179, 205, 252, 0) 34%, #b3cdfc 36%, #f2f7ff 100%), radial-gradient(circle at 100% 50%, #ffffff 0%, #ffffff 14%, #eff5ff 15%, #eff5ff 18%, #e3edff 19%, #e3edff 22%, #d6e4ff 23%, #d6e4ff 26%, #b3cdfc 27%, #b3cdfc 100%)`"
new_wGradFlipped = "`radial-gradient(circle at 100% 50%, #ffffff 0%, #ffffff 14%, #eff5ff 15%, #eff5ff 18%, #e3edff 19%, #e3edff 22%, #d6e4ff 23%, #d6e4ff 26%, #b3cdfc 27%, #b3cdfc 100%)`"
content = content.replace(old_wGradFlipped, new_wGradFlipped)

with open(js_file, 'w') as f:
    f.write(content)
print("Updated JS")
