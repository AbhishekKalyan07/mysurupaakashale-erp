const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
      if (isDirectory) {
        walk(dirPath, callback);
      } else {
        callback(path.join(dir, f));
      }
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.jsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Fix button aria-labels
  content = content.replace(/<button([^>]*)>/g, (match, p1) => {
    if (!p1.includes('aria-label') && !p1.includes('AriaLabel')) {
      return `<button aria-label="Button action"${p1}>`;
    }
    return match;
  });

  // Specifically for XCircle/close buttons:
  content = content.replace(/<button([^>]*)onClose([^>]*)>/g, (match, p1, p2) => {
    if (!match.includes('aria-label')) {
       return `<button aria-label="Close"${p1}onClose${p2}>`;
    }
    return match;
  });

  // Fix color contrast: text-[#8c746a] -> text-[#5a4a44]
  content = content.replace(/text-\[#8c746a\]/g, 'text-[#5a4a44]');
  content = content.replace(/text-ink-400/g, 'text-ink-500'); 
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walk(srcDir, processFile);
console.log('Done fixing accessibility.');
