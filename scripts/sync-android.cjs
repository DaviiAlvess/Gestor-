const fs = require('node:fs');
const path = require('node:path');

require(path.join(__dirname, '..', 'build.cjs'));

const dist = path.join(__dirname, '..', 'dist');
const assets = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets');

function copyDirectory(directory, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const src = path.join(directory, item.name);
    const dest = path.join(target, item.name);
    if (item.isDirectory()) copyDirectory(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

fs.rmSync(assets, { recursive: true, force: true });
copyDirectory(dist, assets);
fs.writeFileSync(path.join(assets, '.gitkeep'), '');
console.log('Arquivos do aplicativo copiados para o projeto Android.');
