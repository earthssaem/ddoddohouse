// 또또하우스 서비스 워커 — 정적 파일 캐시로 오프라인·즉시 실행 지원
const CACHE = 'ddoddo-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/fonts/press-start-2p.woff2',
  '/fonts/dunggeunmo.woff2',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // GET만 캐시 대상. API는 절대 캐시하지 않음 (기록 데이터는 항상 실시간)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    // 페이지는 네트워크 우선 — 새 버전 배포가 바로 반영되고, 오프라인이면 캐시로
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // 폰트·아이콘 등 정적 자원은 캐시 우선
  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(res => {
        const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res;
      })
    )
  );
});
