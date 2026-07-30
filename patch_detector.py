import re

js_file = 'move-term-detector.js'
with open(js_file, 'r') as f:
    content = f.read()

old_detector_name = """          if (isBlack) {
              // The term was played by Black, so Black is the opponent
              studyOpponentName.textContent = bName + ':';
              studyOpponentTerm.style.backgroundColor = '#FFD101';
              studyOpponentTerm.style.color = '#000000';
              studyOpponentTerm.style.borderColor = 'transparent';
          } else {
              // The term was played by White, so White is the opponent
              studyOpponentName.textContent = wName + ':';"""

new_detector_name = """          var formatStudyPlayerName = function(name) {
              if (!name) return name;
              var parts = name.trim().split(/\\s+/);
              if (parts.length > 1) {
                  var lastWord = parts[parts.length - 1];
                  var firstLetter = parts[0].charAt(0).toUpperCase();
                  return lastWord + ', ' + firstLetter + '.';
              }
              return name;
          };
          
          if (isBlack) {
              // The term was played by Black, so Black is the opponent
              studyOpponentName.textContent = formatStudyPlayerName(bName) + ':';
              studyOpponentTerm.style.backgroundColor = '#FFD101';
              studyOpponentTerm.style.color = '#000000';
              studyOpponentTerm.style.borderColor = 'transparent';
          } else {
              // The term was played by White, so White is the opponent
              studyOpponentName.textContent = formatStudyPlayerName(wName) + ':';"""

content = content.replace(old_detector_name, new_detector_name)
with open(js_file, 'w') as f:
    f.write(content)
print("Patched detector JS")
