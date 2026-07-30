import re

js_file = 'annotation_v4.js'
with open(js_file, 'r') as f:
    content = f.read()

old_study_name = """                    const nameStr = isBlack ? bName : wName;
                    const rankStr = isBlack ? bRank : wRank;
                    
                    toPlayName.textContent = nameStr;
                    toPlayRank.textContent = rankStr;"""

new_study_name = """                    const nameStr = isBlack ? bName : wName;
                    const rankStr = isBlack ? bRank : wRank;
                    
                    let formattedNameStr = nameStr;
                    if (formattedNameStr) {
                        let parts = formattedNameStr.trim().split(/\\s+/);
                        if (parts.length > 1) {
                            let lastWord = parts[parts.length - 1];
                            let firstLetter = parts[0].charAt(0).toUpperCase();
                            formattedNameStr = `${lastWord}, ${firstLetter}.`;
                        }
                    }
                    
                    toPlayName.textContent = formattedNameStr;
                    toPlayRank.textContent = rankStr;"""

content = content.replace(old_study_name, new_study_name)
with open(js_file, 'w') as f:
    f.write(content)
print("Patched JS")
