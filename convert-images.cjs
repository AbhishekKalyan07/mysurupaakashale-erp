const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const images = [
  'auth_bg.jpg',
  'auth_bg.png',
  'Untitled design.png',
  'login-reference.jpg',
  'mobile_ui_loginbg.jpg'
];

async function convertImages() {
  for (const img of images) {
    const inputPath = path.join(publicDir, img);
    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${img} - not found`);
      continue;
    }
    
    // Create output filename (.webp)
    // For 'Untitled design.png', let's use 'Untitled_design.webp' to remove space
    let base = path.parse(img).name;
    if (base === 'Untitled design') base = 'Untitled_design';
    
    const outputPath = path.join(publicDir, `${base}.webp`);
    
    try {
      await sharp(inputPath)
        .webp({ quality: 80 })
        .toFile(outputPath);
      console.log(`Converted ${img} to ${base}.webp`);
      
      // Delete the original file to save space and ensure we don't accidentally serve it
      fs.unlinkSync(inputPath);
    } catch (err) {
      console.error(`Failed to convert ${img}:`, err);
    }
  }
}

convertImages().then(() => console.log('Image conversion complete.'));
