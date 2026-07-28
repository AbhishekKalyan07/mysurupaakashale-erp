
import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (path: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

walkDir('./src', (filePath) => {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const regex = /onSuccess:\s*(?:async\s*)?(\([\w\s,]*\)|[\w\d]+)\s*=>\s*\{([\s\S]*?)\}/g;
  content = content.replace(regex, (match, args, body) => {
    if (body.includes('queryClient.invalidateQueries')) {
      let newBody = body.replace(/queryClient\.invalidateQueries/g, 'await queryClient.invalidateQueries');
      newBody = newBody.replace(/await\s+await\s+queryClient/g, 'await queryClient');
      changed = true;
      return 'onSuccess: async ' + args + ' => {' + newBody + '}';
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated ' + filePath);
  }
});

