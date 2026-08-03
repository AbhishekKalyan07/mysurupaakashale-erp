const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.css') && !filePath.endsWith('.jsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace image references
  content = content.replace(/auth_bg\.jpg/g, 'auth_bg.webp');
  content = content.replace(/auth_bg\.png/g, 'auth_bg.webp');
  content = content.replace(/Untitled\sdesign\.png/g, 'Untitled_design.webp');
  content = content.replace(/login-reference\.jpg/g, 'login-reference.webp');
  content = content.replace(/mobile_ui_loginbg\.jpg/g, 'mobile_ui_loginbg.webp');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated refs in: ${filePath}`);
  }
}

walk(srcDir, processFile);
console.log('Done updating references.');
