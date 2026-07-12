# 🎲 DDODDOHOUSE — 또또하우스 보드게임 기록저장소

보드게임 플레이 기록을 저장하고 랭킹·통계를 보여주는 모바일 웹앱입니다.
원래 구글 앱스크립트(구글 시트 저장)로 배포하던 것을 **Vercel + Upstash Redis** 구조로 옮긴 버전이에요.

## 구조

```
├── index.html      # 프론트엔드 (정적 파일로 서빙)
├── api/
│   └── data.js     # 서버리스 함수: GET(불러오기) / POST(저장)
├── fonts/          # 자체 호스팅 픽셀 폰트 (Press Start 2P, 둥근모 woff2)
├── manifest.json   # PWA 매니페스트 (홈 화면 설치)
├── sw.js           # 서비스 워커 (정적 파일 캐시, 오프라인 실행)
├── icon-192.png / icon-512.png  # 앱 아이콘 (픽셀 주사위)
└── package.json    # @upstash/redis 의존성
```

- 데이터는 `{ games, players, logs }` JSON 한 덩어리를 Redis의 `ddoddohouse:db` 키에 통째로 저장합니다 (기존 구글 시트 방식과 동일한 구조).
- 서버 연결이 안 되면 기존처럼 `localStorage` 폴백으로 동작합니다 (OFFLINE 표시).

## Vercel 배포 방법

1. **Vercel에 프로젝트 import**
   - [vercel.com](https://vercel.com) 로그인 → **Add New → Project** → 이 GitHub 리포지토리 선택 → Deploy
   - 빌드 설정은 건드릴 필요 없어요 (Framework Preset: Other, 기본값 그대로).

2. **Upstash Redis 연결 (무료)**
   - Vercel 프로젝트 대시보드 → **Storage** 탭 → **Create Database** → **Upstash (Redis)** 선택
   - Free 플랜으로 생성 후 이 프로젝트에 **Connect** 하면 환경변수(`KV_REST_API_URL`, `KV_REST_API_TOKEN`)가 자동으로 주입됩니다.

3. **재배포**
   - 스토리지 연결 후 **Deployments** 탭에서 최신 배포를 **Redeploy** 하면 환경변수가 적용됩니다.
   - 앱 상단 상태 표시가 `ONLINE`(초록 불)이면 성공! 🎉

## 기존 구글 시트 데이터 옮기기

기존 GAS 웹앱을 열었던 브라우저에서 개발자 콘솔에 아래를 입력해 데이터를 복사한 뒤:

```js
copy(localStorage.getItem('ddoddohouse_db'))
```

새 Vercel 주소를 연 브라우저 콘솔에서 붙여넣어 저장하면 됩니다:

```js
await fetch('/api/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: /* 여기에 복사한 JSON 문자열 붙여넣기 */
});
location.reload();
```

## 쓰기 보호 (선택이지만 권장)

URL만 알면 누구나 기록을 저장·삭제할 수 있는 걸 막으려면 비밀 코드를 설정하세요.

1. Vercel 프로젝트 → **Settings → Environment Variables** → `APP_SECRET` 에 원하는 코드 입력 (예: `ddoddo2026`) → Redeploy
2. 친구들에게 주소를 `https://앱주소/?key=ddoddo2026` 형태로 공유 — 접속하면 코드가 폰에 자동 저장되고 주소창에서는 지워집니다
3. 또는 앱의 ⚙️ 설정에서 직접 입력할 수도 있어요

`APP_SECRET`을 설정하지 않으면 예전처럼 누구나 저장할 수 있는 상태로 동작합니다 (읽기는 항상 공개).

## 동시 저장 충돌 방지

데이터에 버전 번호(`rev`)가 있어서, 오래 열려 있던 탭이 낡은 데이터로 서버를 덮어쓰는 사고를 막습니다.

- 저장 시 서버 버전이 더 최신이면(누가 먼저 저장했으면) 서버가 거절하고 최신 데이터를 돌려줍니다
- 버전 비교와 저장은 Redis 안에서 Lua 스크립트로 원자적으로 처리 — 완전히 동시에 도착한 저장도 하나만 통과합니다
- 클라이언트는 서버 데이터와 내 데이터를 **id 기준으로 병합**한 뒤 다시 저장합니다 — 양쪽 기록이 모두 보존돼요
- 한계: 충돌 병합 과정에서 "삭제"는 되살아날 수 있습니다 (기록 유실보다 낫다는 판단). 또 같은 기록을 동시에 수정하면 나중에 저장한 쪽이 이깁니다
- 앱을 열기만 할 때는 서버에 아무것도 저장하지 않습니다 (읽기 전용)

## 오프라인 기록 보존

와이파이가 안 되는 곳에서 기록해도 사라지지 않습니다.

- 서버 저장에 실패하면 기록이 폰(localStorage)에 남고 "미전송" 표시가 붙습니다
- 다음에 온라인 상태로 앱을 열면 서버 데이터와 자동으로 병합해서 밀어올립니다

## 홈 화면에 설치 (PWA)

사파리/크롬에서 **공유 → 홈 화면에 추가**를 누르면 진짜 앱처럼 설치됩니다.

- 픽셀 주사위 아이콘 + 주소창 없는 전체 화면으로 열려요
- 서비스 워커가 페이지·폰트를 캐시해서 두 번째부터는 즉시 실행, 오프라인에서도 열립니다 (기록 API는 캐시하지 않아 항상 실시간)
- 픽셀 폰트(Press Start 2P, 둥근모)는 `/fonts/`에서 자체 호스팅 — CDN 장애나 오프라인에도 픽셀 룩이 유지돼요. 둥근모는 한글 전체를 유지한 채 woff2로 압축해서 1.6MB → 106KB

## 캐시 버전 올리기

`index.html`이나 폰트를 수정해 배포할 때, 이미 설치한 폰에 확실히 반영하려면 `sw.js`의 `CACHE` 값을 올려주세요 (예: `ddoddo-v1` → `ddoddo-v2`). 페이지는 네트워크 우선이라 대부분 자동 반영되지만, 버전을 올리면 오래된 캐시가 통째로 청소됩니다.
