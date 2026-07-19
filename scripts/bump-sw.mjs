// 서비스 워커 캐시 버전을 1 올린다. 배포 전에 실행: npm run bump-sw
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../sw.js', import.meta.url);
const src = readFileSync(FILE, 'utf8');
const m = src.match(/ddoddo-v(\d+)/);
if (!m) {
  console.error('sw.js에서 캐시 버전(ddoddo-vN)을 찾지 못했어요');
  process.exit(1);
}
const next = `ddoddo-v${Number(m[1]) + 1}`;
writeFileSync(FILE, src.replace(/ddoddo-v\d+/, next));
console.log(`캐시 버전: ${m[0]} → ${next}`);
