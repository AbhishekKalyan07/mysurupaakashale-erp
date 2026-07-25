const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('d:\\mysuru-paakashale-ERP claude\\src');
let count = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  content = content.replace(/err: any/g, 'err: unknown');
  content = content.replace(/error: any/g, 'error: unknown');
  content = content.replace(/catch\s*\(\s*e:\s*any\s*\)/g, 'catch (e: unknown)');
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    count++;
  }
});

console.log(`Updated ${count} files.`);
