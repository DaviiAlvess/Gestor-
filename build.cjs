const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const source = path.join(root, 'app');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });

function copyDirectory(directory, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name === 'tests') continue;
    const src = path.join(directory, item.name);
    const dest = path.join(target, item.name);
    if (item.isDirectory()) copyDirectory(src, dest);
    else fs.copyFileSync(src, dest);
  }
}
copyDirectory(source, output);

const swPath = path.join(output, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map(match => match[1]).filter(Boolean);
const hash = crypto.createHash('sha256');
hash.update(sw);
for (const asset of [...new Set(assets)].sort()) {
  const file = path.join(output, asset);
  if (!fs.existsSync(file)) throw new Error(`Arquivo offline ausente: ${asset}`);
  hash.update(asset).update(fs.readFileSync(file));
}
const revision = hash.digest('hex').slice(0, 16);
sw = sw.replace('gestor-shell-development-v1', `gestor-shell-${revision}`);
fs.writeFileSync(swPath, sw);
console.log(`Aplicativo preparado em dist (versão offline ${revision}).`);
