import fs from 'fs';
import crypto from 'crypto';

const files = fs.readdirSync('public');

console.log('=== COMPARING ROOT AND PUBLIC FILES ===');

for (const file of files) {
  const pubPath = `public/${file}`;
  const rootPath = `${file}`;

  if (!fs.existsSync(rootPath)) {
    console.log(`[ONLY IN PUBLIC] ${file}`);
    continue;
  }

  const pubStat = fs.statSync(pubPath);
  if (!pubStat.isFile()) continue;

  const pubBuf = fs.readFileSync(pubPath);
  const rootBuf = fs.readFileSync(rootPath);

  const pubHash = crypto.createHash('sha256').update(pubBuf).digest('hex');
  const rootHash = crypto.createHash('sha256').update(rootBuf).digest('hex');

  if (pubHash === rootHash) {
    console.log(`[IN SYNC] ${file} (identical)`);
  } else {
    console.log(`[DIFF] ${file}: root (${rootBuf.length} bytes, hash ${rootHash.slice(0, 8)}) vs public (${pubBuf.length} bytes, hash ${pubHash.slice(0, 8)})`);
  }
}
