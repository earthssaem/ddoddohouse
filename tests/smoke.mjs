// 또또하우스 스모크 테스트 — 정적 서버 + 가짜 API를 띄우고 실제 브라우저로 핵심 흐름 검증
// 실행: npm test  (Chromium 경로는 CHROMIUM_PATH 환경변수로 지정 가능)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

// ── 가짜 API (rev 비교 저장 포함) ─────────────────────────────
// 시드: 무승부 1판 포함 → 전적 계산에서 제외되는지 검증
// 공동 MVP: 같은 날 연경 1승 + 영식 1승
const DAY = 1770000000000;
let store = {
  rev: 1,
  players: [
    { id: 'p1', name: '연경', color: '#ff007f' },
    { id: 'p2', name: '영식', color: '#00ffff' },
  ],
  games: [{ id: 'g1', name: '카탄', icon: '🎲', cat: '전략', minP: 2, maxP: 4, time: 60 }],
  logs: [
    { id: 'l1', gameId: 'g1', players: ['p1', 'p2'], winners: ['p1'], date: DAY },
    { id: 'l2', gameId: 'g1', players: ['p1', 'p2'], winners: ['p2'], date: DAY + 3600000 },
    { id: 'l3', gameId: 'g1', players: ['p1', 'p2'], winners: [], date: DAY + 7200000 }, // 무승부
  ],
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/data') {
    if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(store)); return; }
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const body = JSON.parse(b);
      const baseRev = Number(body.rev) || 0;
      if (baseRev < store.rev) { res.statusCode = 409; res.end(JSON.stringify({ error: 'conflict', data: store })); return; }
      store = { games: body.games, players: body.players, logs: body.logs, rev: store.rev + 1 };
      res.end(JSON.stringify({ ok: true, rev: store.rev }));
    });
    return;
  }
  const fp = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const d = await readFile(path.join(ROOT, fp));
    res.setHeader('content-type', MIME[path.extname(fp)] || 'application/octet-stream');
    res.end(d);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(8990, r));

// ── 브라우저 테스트 ───────────────────────────────────────────
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 400, height: 850 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8990/');
await page.waitForTimeout(1300);

console.log('\n[기본 로드]');
check('상태 ONLINE', (await page.textContent('#syncTxt')).trim() === 'ONLINE');
const fonts = await page.evaluate(() => [...document.fonts].map(f => f.status));
check('픽셀 폰트 로드', fonts.length >= 2 && fonts.every(s => s === 'loaded'));
check('서비스 워커 등록', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));

console.log('\n[전적 계산 — 무승부 제외]');
const rows = await page.$$eval('.hs-row', els => els.map(e => e.textContent.replace(/\s+/g, '')));
check('연경 1승1패 50%', rows.some(r => r.includes('연경') && r.includes('1승1패') && r.includes('50%')), rows.join(' | '));
check('무승부 판이 판수에 안 섞임', !rows.some(r => r.includes('1승2패')));

console.log('\n[공동 MVP]');
await page.click('button[data-rt="session"]');
await page.waitForTimeout(400);
const mvpCard = await page.textContent('.s-winner');
check('공동 MVP 표시', mvpCard.includes('공동') && mvpCard.includes('연경') && mvpCard.includes('영식'), mvpCard.trim());

console.log('\n[오버레이 — ESC/뒤로가기]');
await page.click('#navNew');
await page.waitForTimeout(400);
check('NEW LOG 시트 열림', await page.$eval('#scrim', e => e.classList.contains('show')));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('ESC로 시트 닫힘', await page.$eval('#scrim', e => !e.classList.contains('show')));
await page.click('.s-winner');
await page.waitForTimeout(400);
await page.click('.sd-row');
await page.waitForTimeout(400);
check('개인 카드 열림', await page.$eval('#pcScrim', e => e.classList.contains('show')));
await page.goBack();
await page.waitForTimeout(400);
check('뒤로가기 → 개인 카드만 닫힘', await page.$eval('#pcScrim', e => !e.classList.contains('show')) && await page.$eval('#sdScrim', e => e.classList.contains('show')));
await page.goBack();
await page.waitForTimeout(400);
check('뒤로가기 → 상세 팝업 닫힘', await page.$eval('#sdScrim', e => !e.classList.contains('show')));

console.log('\n[저장 + 이스케이프]');
const revBefore = store.rev;
await page.click('#navNew');
await page.waitForTimeout(400);
await page.fill('#newP', '<img src=x onerror=window.__xss=1>');
await page.evaluate(() => addPlayerChip());
await page.waitForTimeout(300);
check('친구 추가는 즉시 저장 안 됨', store.rev === revBefore);
await page.click('#resultArea .chip-pick button'); // 승자 선택
await page.click('.action-btn'); // SAVE RESULT
await page.waitForTimeout(700);
check('기록 저장 시 서버 rev 증가', store.rev === revBefore + 1, `rev ${store.rev}`);
check('XSS 이름 무해화', (await page.evaluate(() => window.__xss)) !== 1);
check('악성 이름이 서버에 텍스트로 저장', store.players.some(p => p.name.includes('<img')));

check('콘솔 페이지 에러 없음', errors.length === 0, errors.join(' // '));

await browser.close();
server.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
